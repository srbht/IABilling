const express = require('express');
const { body, validationResult } = require('express-validator');
const prisma = require('../utils/prisma');
const { authenticate, authorize, auditLog } = require('../middleware/auth');
const { getPagination, paginationMeta, generateNumber } = require('../utils/helpers');
const { AppError } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authenticate);

async function recomputePOStatus(tx, purchaseOrderId) {
  const po = await tx.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    include: { items: true },
  });
  if (!po) return;
  let allDone = true;
  let anyRecv = false;
  for (const it of po.items) {
    if (it.qtyReceived < it.qtyOrdered) allDone = false;
    if (it.qtyReceived > 0) anyRecv = true;
  }
  const status = allDone ? 'COMPLETED' : (anyRecv ? 'PARTIAL' : 'OPEN');
  await tx.purchaseOrder.update({ where: { id: purchaseOrderId }, data: { status } });
}

/** GRNs that are not linked to a supplier bill yet */
router.get('/unbilled', async (req, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const where = { purchaseBill: null };
    const [rows, total] = await Promise.all([
      prisma.goodsReceipt.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          purchaseOrder: { select: { poNumber: true, supplier: { select: { id: true, name: true } } } },
          items: true,
        },
      }),
      prisma.goodsReceipt.count({ where }),
    ]);
    res.json({ success: true, data: rows, meta: paginationMeta(total, page, limit) });
  } catch (err) { next(err); }
});

router.get('/', async (req, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const { purchaseOrderId } = req.query;
    const where = {};
    if (purchaseOrderId) where.purchaseOrderId = purchaseOrderId;

    const [rows, total] = await Promise.all([
      prisma.goodsReceipt.findMany({
        where,
        skip,
        take: limit,
        include: {
          purchaseOrder: { select: { poNumber: true, supplier: { select: { name: true } } } },
          user: { select: { name: true } },
          purchaseBill: { select: { id: true, purchaseNumber: true } },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.goodsReceipt.count({ where }),
    ]);
    res.json({ success: true, data: rows, meta: paginationMeta(total, page, limit) });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const row = await prisma.goodsReceipt.findUnique({
      where: { id: req.params.id },
      include: {
        items: { include: { purchaseOrderItem: true } },
        purchaseOrder: { include: { supplier: true } },
        user: { select: { name: true } },
        purchaseBill: { select: { id: true, purchaseNumber: true, totalAmount: true } },
      },
    });
    if (!row) throw new AppError('Goods receipt not found', 404);
    res.json({ success: true, data: row });
  } catch (err) { next(err); }
});

router.post('/', authorize('ADMIN', 'PHARMACIST'), [
  body('purchaseOrderId').notEmpty(),
  body('items').isArray({ min: 1 }),
  body('items.*.purchaseOrderItemId').notEmpty(),
  body('items.*.qtyReceived').isInt({ min: 1 }),
  body('items.*.purchasePrice').isFloat({ min: 0 }),
], auditLog('CREATE', 'GoodsReceipt'), async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { purchaseOrderId, items, notes } = req.body;

    const po = await prisma.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      include: { items: true },
    });
    if (!po) throw new AppError('Purchase order not found', 404);
    if (po.status === 'CANCELLED') throw new AppError('Purchase order is cancelled', 400);
    if (po.status === 'COMPLETED') throw new AppError('Purchase order is already fully received', 400);

    const poItemMap = new Map(po.items.map((i) => [i.id, i]));

    for (const it of items) {
      const pol = poItemMap.get(it.purchaseOrderItemId);
      if (!pol) throw new AppError(`Invalid PO line: ${it.purchaseOrderItemId}`, 400);
      const remaining = pol.qtyOrdered - pol.qtyReceived;
      if (it.qtyReceived > remaining) {
        throw new AppError(
          `Qty too high for line (${pol.medicineId}): max remaining ${remaining}`,
          400,
        );
      }
    }

    const grnNumber = await generateNumber('grn_prefix', 'GRN');

    const builtLines = [];
    for (const it of items) {
      const pol = poItemMap.get(it.purchaseOrderItemId);
      const med = await prisma.medicine.findUnique({ where: { id: pol.medicineId } });
      if (!med) throw new AppError('Medicine missing', 400);

      const freeQty = parseInt(it.freeQuantity, 10) || 0;
      const mrpLine = Number(it.mrp);
      const sellLine = Number(it.sellingPrice);
      const mrpVal = Number.isFinite(mrpLine) ? mrpLine : med.mrp;
      const sellVal = Number.isFinite(sellLine) ? sellLine : med.sellingPrice;

      const cgstAmount = parseFloat(((it.purchasePrice * it.qtyReceived * (it.cgstRate ?? med.cgstRate)) / 100).toFixed(2));
      const sgstAmount = parseFloat(((it.purchasePrice * it.qtyReceived * (it.sgstRate ?? med.sgstRate)) / 100).toFixed(2));
      const amount = parseFloat((it.purchasePrice * it.qtyReceived + cgstAmount + sgstAmount).toFixed(2));

      const batchTrim = it.batchNumber != null && String(it.batchNumber).trim() !== '' ? String(it.batchNumber).trim() : null;
      const expRaw = it.expiryDate;
      const expiryDate = expRaw && String(expRaw).trim() !== '' ? new Date(expRaw) : null;

      builtLines.push({
        purchaseOrderItemId: it.purchaseOrderItemId,
        medicineId: pol.medicineId,
        medicineName: med.name,
        qtyReceived: it.qtyReceived,
        freeQuantity: freeQty,
        batchNumber: batchTrim,
        expiryDate,
        purchasePrice: it.purchasePrice,
        mrp: mrpVal,
        sellingPrice: sellVal,
        cgstRate: it.cgstRate ?? med.cgstRate,
        sgstRate: it.sgstRate ?? med.sgstRate,
        cgstAmount,
        sgstAmount,
        amount,
        _pol: pol,
        _raw: it,
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const grn = await tx.goodsReceipt.create({
        data: {
          grnNumber,
          purchaseOrderId,
          userId: req.user.id,
          notes: notes?.trim() || null,
          items: {
            create: builtLines.map((b) => ({
              purchaseOrderItemId: b.purchaseOrderItemId,
              medicineId: b.medicineId,
              medicineName: b.medicineName,
              qtyReceived: b.qtyReceived,
              freeQuantity: b.freeQuantity,
              batchNumber: b.batchNumber,
              expiryDate: b.expiryDate,
              purchasePrice: b.purchasePrice,
              mrp: b.mrp,
              sellingPrice: b.sellingPrice,
              cgstRate: b.cgstRate,
              sgstRate: b.sgstRate,
              cgstAmount: b.cgstAmount,
              sgstAmount: b.sgstAmount,
              amount: b.amount,
            })),
          },
        },
        include: { items: true },
      });

      for (const b of builtLines) {
        await tx.purchaseOrderItem.update({
          where: { id: b.purchaseOrderItemId },
          data: { qtyReceived: { increment: b.qtyReceived } },
        });
      }

      await recomputePOStatus(tx, purchaseOrderId);

      for (const b of builtLines) {
        const totalQty = b.qtyReceived + b.freeQuantity;
        const spUp = Number(b.sellingPrice);
        const mpUp = Number(b.mrp);
        await tx.medicine.update({
          where: { id: b.medicineId },
          data: {
            quantity: { increment: totalQty },
            purchasePrice: b.purchasePrice,
            supplierId: po.supplierId,
            lastPurchaseDate: new Date(),
            ...(Number.isFinite(spUp) && { sellingPrice: spUp }),
            ...(Number.isFinite(mpUp) && { mrp: mpUp }),
            ...(b.batchNumber && { batchNumber: b.batchNumber }),
            ...(b.expiryDate && { expiryDate: b.expiryDate }),
          },
        });
      }

      return tx.goodsReceipt.findUnique({
        where: { id: grn.id },
        include: {
          items: true,
          purchaseOrder: { select: { poNumber: true, status: true, supplier: { select: { name: true } } } },
        },
      });
    });

    res.status(201).json({ success: true, message: 'Goods received — stock updated', data: result });
  } catch (err) { next(err); }
});

/**
 * Correct an unbilled goods receipt (wrong qty/rate/batch). Blocked if a supplier bill exists.
 */
router.patch('/:id', authorize('ADMIN', 'PHARMACIST'), [
  body('items').isArray({ min: 1 }),
  body('items.*.id').notEmpty(),
  body('items.*.qtyReceived').isInt({ min: 1 }),
  body('items.*.purchasePrice').isFloat({ min: 0 }),
], auditLog('UPDATE', 'GoodsReceipt'), async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { id } = req.params;
    const { items, notes } = req.body;

    const result = await prisma.$transaction(async (tx) => {
      const grn = await tx.goodsReceipt.findUnique({
        where: { id },
        include: {
          items: true,
          purchaseBill: true,
          purchaseOrder: { include: { items: true } },
        },
      });
      if (!grn) throw new AppError('Goods receipt not found', 404);
      if (grn.purchaseBill) {
        throw new AppError(
          'This receipt is billed. Edit or remove the supplier bill first, then you can correct the receipt.',
          400,
        );
      }
      if (items.length !== grn.items.length) {
        throw new AppError('Send exactly one update object per receipt line (same count as saved lines).', 400);
      }

      const oldById = new Map(grn.items.map((i) => [i.id, i]));
      const seen = new Set();
      const parsed = [];

      for (const it of items) {
        if (seen.has(it.id)) throw new AppError('Duplicate line id', 400);
        seen.add(it.id);
        const old = oldById.get(it.id);
        if (!old) throw new AppError(`Unknown receipt line: ${it.id}`, 400);
        if (it.purchaseOrderItemId && it.purchaseOrderItemId !== old.purchaseOrderItemId) {
          throw new AppError('Cannot change which PO line a receipt row belongs to.', 400);
        }

        const qtyReceived = parseInt(String(it.qtyReceived), 10);
        const freeQuantity = parseInt(String(it.freeQuantity), 10) || 0;
        const purchasePrice = parseFloat(it.purchasePrice);
        if (!Number.isFinite(qtyReceived) || qtyReceived < 1) throw new AppError('Invalid qty received', 400);
        if (!Number.isFinite(purchasePrice) || purchasePrice < 0) throw new AppError('Invalid purchase price', 400);

        const med = await tx.medicine.findUnique({ where: { id: old.medicineId } });
        if (!med) throw new AppError('Medicine missing', 400);

        const mrpLine = Number(it.mrp);
        const sellLine = Number(it.sellingPrice);
        const mrpVal = Number.isFinite(mrpLine) ? mrpLine : old.mrp;
        const sellVal = Number.isFinite(sellLine) ? sellLine : old.sellingPrice;

        const cgstR = Number.isFinite(Number(it.cgstRate)) ? Number(it.cgstRate) : old.cgstRate;
        const sgstR = Number.isFinite(Number(it.sgstRate)) ? Number(it.sgstRate) : old.sgstRate;
        const cgstAmount = parseFloat(((purchasePrice * qtyReceived * cgstR) / 100).toFixed(2));
        const sgstAmount = parseFloat(((purchasePrice * qtyReceived * sgstR) / 100).toFixed(2));
        const amount = parseFloat((purchasePrice * qtyReceived + cgstAmount + sgstAmount).toFixed(2));

        const batchTrim = it.batchNumber != null && String(it.batchNumber).trim() !== '' ? String(it.batchNumber).trim() : null;
        const expRaw = it.expiryDate;
        const expiryDate = expRaw && String(expRaw).trim() !== '' ? new Date(expRaw) : null;

        parsed.push({
          old,
          qtyReceived,
          freeQuantity,
          purchasePrice,
          mrp: mrpVal,
          sellingPrice: sellVal,
          cgstRate: cgstR,
          sgstRate: sgstR,
          cgstAmount,
          sgstAmount,
          amount,
          batchNumber: batchTrim,
          expiryDate,
        });
      }

      if (seen.size !== grn.items.length) throw new AppError('Each existing line must be included exactly once.', 400);

      const poItemMap = new Map(grn.purchaseOrder.items.map((i) => [i.id, i]));
      const deltaByPol = new Map();
      for (const row of parsed) {
        const polId = row.old.purchaseOrderItemId;
        const dq = row.qtyReceived - row.old.qtyReceived;
        deltaByPol.set(polId, (deltaByPol.get(polId) || 0) + dq);
      }

      for (const [polId, delta] of deltaByPol) {
        const pol = poItemMap.get(polId);
        if (!pol) throw new AppError('Invalid PO line reference', 400);
        const newRecv = pol.qtyReceived + delta;
        if (newRecv < 0) throw new AppError('PO received quantity cannot go negative after this change.', 400);
        if (newRecv > pol.qtyOrdered) {
          throw new AppError(
            `Qty exceeds PO order for a line (ordered ${pol.qtyOrdered}, would become ${newRecv}).`,
            400,
          );
        }
      }

      for (const row of parsed) {
        const oldT = row.old.qtyReceived + row.old.freeQuantity;
        const newT = row.qtyReceived + row.freeQuantity;
        const d = newT - oldT;
        const medRow = await tx.medicine.findUnique({ where: { id: row.old.medicineId } });
        if (medRow.quantity + d < 0) {
          throw new AppError(
            `Not enough stock on hand to reduce ${row.old.medicineName} (current ${medRow.quantity}, change ${d}).`,
            400,
          );
        }
      }

      for (const [polId, delta] of deltaByPol) {
        if (delta === 0) continue;
        await tx.purchaseOrderItem.update({
          where: { id: polId },
          data: { qtyReceived: { increment: delta } },
        });
      }

      for (const row of parsed) {
        const oldT = row.old.qtyReceived + row.old.freeQuantity;
        const newT = row.qtyReceived + row.freeQuantity;
        const d = newT - oldT;
        await tx.medicine.update({
          where: { id: row.old.medicineId },
          data: { quantity: { increment: d } },
        });
      }

      for (const row of parsed) {
        await tx.goodsReceiptItem.update({
          where: { id: row.old.id },
          data: {
            qtyReceived: row.qtyReceived,
            freeQuantity: row.freeQuantity,
            purchasePrice: row.purchasePrice,
            mrp: row.mrp,
            sellingPrice: row.sellingPrice,
            cgstRate: row.cgstRate,
            sgstRate: row.sgstRate,
            cgstAmount: row.cgstAmount,
            sgstAmount: row.sgstAmount,
            amount: row.amount,
            batchNumber: row.batchNumber,
            expiryDate: row.expiryDate,
          },
        });
      }

      const notesTrim = notes !== undefined ? (notes != null && String(notes).trim() !== '' ? String(notes).trim() : null) : undefined;
      if (notesTrim !== undefined) {
        await tx.goodsReceipt.update({ where: { id }, data: { notes: notesTrim } });
      }

      const po = grn.purchaseOrder;
      for (const row of parsed) {
        const totalQty = row.qtyReceived + row.freeQuantity;
        const spUp = Number(row.sellingPrice);
        const mpUp = Number(row.mrp);
        await tx.medicine.update({
          where: { id: row.old.medicineId },
          data: {
            purchasePrice: row.purchasePrice,
            supplierId: po.supplierId,
            lastPurchaseDate: new Date(),
            ...(Number.isFinite(spUp) && { sellingPrice: spUp }),
            ...(Number.isFinite(mpUp) && { mrp: mpUp }),
            ...(row.batchNumber && { batchNumber: row.batchNumber }),
            ...(row.expiryDate && { expiryDate: row.expiryDate }),
          },
        });
      }

      await recomputePOStatus(tx, grn.purchaseOrderId);

      return tx.goodsReceipt.findUnique({
        where: { id },
        include: {
          items: { include: { purchaseOrderItem: true } },
          purchaseOrder: { include: { supplier: true } },
          user: { select: { name: true } },
          purchaseBill: { select: { id: true, purchaseNumber: true, totalAmount: true } },
        },
      });
    });

    res.json({ success: true, message: 'Goods receipt updated', data: result });
  } catch (err) { next(err); }
});

module.exports = router;
