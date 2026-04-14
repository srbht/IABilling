const express = require('express');
const { body, validationResult } = require('express-validator');
const prisma = require('../utils/prisma');
const { authenticate, authorize, auditLog } = require('../middleware/auth');
const { getPagination, paginationMeta, generateNumber } = require('../utils/helpers');
const { AppError } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const { supplierId, startDate, endDate, status } = req.query;

    const where = {};
    if (supplierId) where.supplierId = supplierId;
    if (status) where.status = status;
    if (startDate && endDate) {
      where.createdAt = { gte: new Date(startDate), lte: new Date(endDate) };
    }

    const [purchases, total] = await Promise.all([
      prisma.purchase.findMany({
        where,
        skip,
        take: limit,
        include: {
          supplier: { select: { name: true } },
          user: { select: { name: true } },
          goodsReceipt: { select: { id: true, grnNumber: true } },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.purchase.count({ where }),
    ]);

    res.json({ success: true, data: purchases, meta: paginationMeta(total, page, limit) });
  } catch (err) { next(err); }
});

/**
 * Step 3: Supplier bill from goods receipt (no stock movement — stock was added on GRN).
 * Auto purchase number; optional supplier invoice no. / date / payment.
 */
router.post('/from-grn', authorize('ADMIN', 'PHARMACIST'), [
  body('goodsReceiptId').notEmpty(),
  body('amountPaid').isFloat({ min: 0 }),
], auditLog('CREATE', 'Purchase'), async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { goodsReceiptId, invoiceNumber, invoiceDate, amountPaid, notes, itemOverrides } = req.body;

    const billed = await prisma.purchase.findUnique({ where: { goodsReceiptId } });
    if (billed) throw new AppError('This receipt is already billed', 400);

    const grn = await prisma.goodsReceipt.findUnique({
      where: { id: goodsReceiptId },
      include: {
        items: true,
        purchaseOrder: { include: { supplier: true } },
      },
    });
    if (!grn) throw new AppError('Goods receipt not found', 404);

    const itemIds = new Set(grn.items.map((i) => i.id));
    const overrideMap = new Map();
    if (Array.isArray(itemOverrides)) {
      for (const o of itemOverrides) {
        if (!o || o.goodsReceiptItemId == null || o.purchasePrice == null) continue;
        const id = String(o.goodsReceiptItemId);
        if (!itemIds.has(id)) {
          throw new AppError(`Invalid goods receipt line in itemOverrides: ${id}`, 400);
        }
        const p = parseFloat(o.purchasePrice);
        if (!Number.isFinite(p) || p < 0) {
          throw new AppError('Each override purchasePrice must be a number ≥ 0', 400);
        }
        overrideMap.set(id, p);
      }
    }

    const supplierId = grn.purchaseOrder.supplierId;
    const purchaseItems = grn.items.map((ri) => {
      const purchasePrice = overrideMap.has(ri.id)
        ? overrideMap.get(ri.id)
        : Number(ri.purchasePrice);
      const qty = ri.qtyReceived;
      const cgstR = Number(ri.cgstRate);
      const sgstR = Number(ri.sgstRate);
      const cgstAmount = parseFloat(((purchasePrice * qty * cgstR) / 100).toFixed(2));
      const sgstAmount = parseFloat(((purchasePrice * qty * sgstR) / 100).toFixed(2));
      const amount = parseFloat((purchasePrice * qty + cgstAmount + sgstAmount).toFixed(2));
      return {
        medicineId: ri.medicineId,
        medicineName: ri.medicineName,
        batchNumber: ri.batchNumber,
        expiryDate: ri.expiryDate,
        quantity: ri.qtyReceived,
        freeQuantity: ri.freeQuantity,
        purchasePrice,
        mrp: ri.mrp,
        sellingPrice: ri.sellingPrice,
        cgstRate: ri.cgstRate,
        sgstRate: ri.sgstRate,
        cgstAmount,
        sgstAmount,
        amount,
      };
    });
    const subtotal = parseFloat(purchaseItems.reduce((s, i) => s + i.amount, 0).toFixed(2));

    const cgstTotal = parseFloat(purchaseItems.reduce((s, i) => s + i.cgstAmount, 0).toFixed(2));
    const sgstTotal = parseFloat(purchaseItems.reduce((s, i) => s + i.sgstAmount, 0).toFixed(2));
    const paid = parseFloat(amountPaid || 0);
    const amountDue = parseFloat(Math.max(0, subtotal - paid).toFixed(2));
    const purchaseNumber = await generateNumber('purchase_prefix', 'PUR');
    const invTrim = invoiceNumber != null && String(invoiceNumber).trim() !== '' ? String(invoiceNumber).trim() : null;
    const resolvedInvoiceNumber = invTrim || purchaseNumber;
    const resolvedInvoiceDate = invoiceDate && String(invoiceDate).trim() !== '' ? new Date(invoiceDate) : new Date();

    const purchase = await prisma.$transaction(async (tx) => {
      const newPurchase = await tx.purchase.create({
        data: {
          purchaseNumber,
          supplierId,
          userId: req.user.id,
          goodsReceiptId,
          invoiceNumber: resolvedInvoiceNumber,
          invoiceDate: resolvedInvoiceDate,
          subtotal: parseFloat(subtotal.toFixed(2)),
          taxableAmount: parseFloat((subtotal - cgstTotal - sgstTotal).toFixed(2)),
          cgstAmount: cgstTotal,
          sgstAmount: sgstTotal,
          totalTax: cgstTotal + sgstTotal,
          totalAmount: parseFloat(subtotal.toFixed(2)),
          amountPaid: paid,
          amountDue,
          status: 'RECEIVED',
          notes: notes?.trim() || null,
          items: { create: purchaseItems },
        },
        include: { items: true, goodsReceipt: { select: { grnNumber: true } } },
      });

      await tx.supplier.update({
        where: { id: supplierId },
        data: { currentBalance: { increment: amountDue } },
      });

      return newPurchase;
    });

    res.status(201).json({ success: true, message: 'Supplier bill recorded', data: purchase });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const purchase = await prisma.purchase.findUnique({
      where: { id: req.params.id },
      include: {
        items: { include: { medicine: { select: { name: true, unit: true } } } },
        supplier: true,
        user: { select: { name: true } },
        goodsReceipt: {
          include: { purchaseOrder: { select: { id: true, poNumber: true } } },
        },
      },
    });
    if (!purchase) throw new AppError('Purchase not found', 404);
    res.json({ success: true, data: purchase });
  } catch (err) { next(err); }
});

/** Legacy: one-step purchase + stock (skip PO/GRN). Prefer POST /from-grn after receiving goods. */
router.post('/direct', authorize('ADMIN', 'PHARMACIST'), [
  body('supplierId').notEmpty(),
  body('items').isArray({ min: 1 }),
  body('items.*.medicineId').notEmpty(),
  body('items.*.quantity').isInt({ min: 1 }),
  body('items.*.purchasePrice').isFloat({ min: 0 }),
], auditLog('CREATE', 'Purchase'), async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { supplierId, items, invoiceNumber, invoiceDate, amountPaid, notes } = req.body;

    const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier) throw new AppError('Supplier not found', 404);

    let subtotal = 0;
    const purchaseItems = [];

    for (const item of items) {
      const med = await prisma.medicine.findUnique({ where: { id: item.medicineId } });
      if (!med) throw new AppError(`Medicine not found: ${item.medicineId}`, 400);

      const cgstAmount = parseFloat(((item.purchasePrice * item.quantity * (item.cgstRate || med.cgstRate)) / 100).toFixed(2));
      const sgstAmount = parseFloat(((item.purchasePrice * item.quantity * (item.sgstRate || med.sgstRate)) / 100).toFixed(2));
      const amount = parseFloat((item.purchasePrice * item.quantity + cgstAmount + sgstAmount).toFixed(2));
      subtotal += amount;

      const batchTrim = item.batchNumber != null && String(item.batchNumber).trim() !== '' ? String(item.batchNumber).trim() : null;
      const expRaw = item.expiryDate;
      const expiryDate = expRaw && String(expRaw).trim() !== '' ? new Date(expRaw) : null;

      const mrpLine = Number(item.mrp);
      const sellLine = Number(item.sellingPrice);
      const mrpVal = Number.isFinite(mrpLine) ? mrpLine : med.mrp;
      const sellVal = Number.isFinite(sellLine) ? sellLine : med.sellingPrice;

      purchaseItems.push({
        medicineId: item.medicineId,
        medicineName: med.name,
        batchNumber: batchTrim,
        expiryDate,
        quantity: item.quantity,
        freeQuantity: item.freeQuantity || 0,
        purchasePrice: item.purchasePrice,
        mrp: mrpVal,
        sellingPrice: sellVal,
        cgstRate: item.cgstRate || med.cgstRate,
        sgstRate: item.sgstRate || med.sgstRate,
        cgstAmount,
        sgstAmount,
        amount,
      });
    }

    const cgstTotal = parseFloat(purchaseItems.reduce((s, i) => s + i.cgstAmount, 0).toFixed(2));
    const sgstTotal = parseFloat(purchaseItems.reduce((s, i) => s + i.sgstAmount, 0).toFixed(2));
    const paid = parseFloat(amountPaid || 0);
    const amountDue = parseFloat(Math.max(0, subtotal - paid).toFixed(2));
    const purchaseNumber = await generateNumber('purchase_prefix', 'PUR');
    const invTrim = invoiceNumber != null && String(invoiceNumber).trim() !== '' ? String(invoiceNumber).trim() : null;
    const resolvedInvoiceNumber = invTrim || purchaseNumber;
    const resolvedInvoiceDate = invoiceDate && String(invoiceDate).trim() !== '' ? new Date(invoiceDate) : new Date();

    const purchase = await prisma.$transaction(async (tx) => {
      const newPurchase = await tx.purchase.create({
        data: {
          purchaseNumber,
          supplierId,
          userId: req.user.id,
          invoiceNumber: resolvedInvoiceNumber,
          invoiceDate: resolvedInvoiceDate,
          subtotal: parseFloat(subtotal.toFixed(2)),
          taxableAmount: parseFloat((subtotal - cgstTotal - sgstTotal).toFixed(2)),
          cgstAmount: cgstTotal,
          sgstAmount: sgstTotal,
          totalTax: cgstTotal + sgstTotal,
          totalAmount: parseFloat(subtotal.toFixed(2)),
          amountPaid: paid,
          amountDue,
          status: 'RECEIVED',
          notes: notes || null,
          items: { create: purchaseItems },
        },
        include: { items: true },
      });

      // Update stock and medicine details (batch/expiry only if provided — often unknown at order time)
      for (const item of items) {
        const totalQty = item.quantity + (item.freeQuantity || 0);
        const batchUpd = item.batchNumber != null && String(item.batchNumber).trim() !== '' ? String(item.batchNumber).trim() : null;
        const hasExpiry = item.expiryDate && String(item.expiryDate).trim() !== '';

        const spUp = Number(item.sellingPrice);
        const mpUp = Number(item.mrp);

        await tx.medicine.update({
          where: { id: item.medicineId },
          data: {
            quantity: { increment: totalQty },
            purchasePrice: item.purchasePrice,
            supplierId,
            lastPurchaseDate: new Date(),
            ...(Number.isFinite(spUp) && { sellingPrice: spUp }),
            ...(Number.isFinite(mpUp) && { mrp: mpUp }),
            ...(batchUpd && { batchNumber: batchUpd }),
            ...(hasExpiry && { expiryDate: new Date(item.expiryDate) }),
          },
        });
      }

      // Update supplier balance
      await tx.supplier.update({
        where: { id: supplierId },
        data: { currentBalance: { increment: amountDue } },
      });

      return newPurchase;
    });

    res.status(201).json({ success: true, message: 'Purchase recorded successfully', data: purchase });
  } catch (err) { next(err); }
});

/**
 * Correct supplier bill lines (rates) and/or invoice header. Quantities stay as on the bill.
 * Adjusts supplier currentBalance by (oldAmountDue - newAmountDue).
 */
router.patch('/:id', authorize('ADMIN', 'PHARMACIST'), async (req, res, next) => {
  try {
    const { invoiceNumber, invoiceDate, notes, items } = req.body;
    const id = req.params.id;

    const purchase = await prisma.purchase.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!purchase) throw new AppError('Purchase not found', 404);

    const headerOnly = !Array.isArray(items);
    if (headerOnly) {
      const data = {};
      if (invoiceNumber !== undefined) {
        const t = invoiceNumber != null && String(invoiceNumber).trim() !== '' ? String(invoiceNumber).trim() : null;
        data.invoiceNumber = t;
      }
      if (invoiceDate !== undefined) {
        data.invoiceDate = invoiceDate && String(invoiceDate).trim() !== '' ? new Date(invoiceDate) : purchase.invoiceDate;
      }
      if (notes !== undefined) {
        data.notes = notes != null && String(notes).trim() !== '' ? String(notes).trim() : null;
      }
      if (Object.keys(data).length === 0) {
        throw new AppError('Nothing to update', 400);
      }
      const updated = await prisma.purchase.update({ where: { id }, data, include: { items: true } });
      return res.json({ success: true, message: 'Bill updated', data: updated });
    }

    if (items.length !== purchase.items.length) {
      throw new AppError('Send one entry per bill line (same count as saved lines).', 400);
    }

    const byId = new Map(purchase.items.map((i) => [i.id, i]));
    const seen = new Set();
    const newRows = [];

    for (const it of items) {
      if (!it.id || seen.has(it.id)) throw new AppError('Invalid or duplicate line id', 400);
      seen.add(it.id);
      const pi = byId.get(it.id);
      if (!pi) throw new AppError(`Unknown line: ${it.id}`, 400);

      const purchasePrice = parseFloat(it.purchasePrice);
      if (!Number.isFinite(purchasePrice) || purchasePrice < 0) throw new AppError('Invalid purchase price', 400);

      const mrpLine = it.mrp != null && it.mrp !== '' ? Number(it.mrp) : pi.mrp;
      const sellLine = it.sellingPrice != null && it.sellingPrice !== '' ? Number(it.sellingPrice) : pi.sellingPrice;
      const mrpVal = Number.isFinite(mrpLine) ? mrpLine : pi.mrp;
      const sellVal = Number.isFinite(sellLine) ? sellLine : pi.sellingPrice;

      const qty = pi.quantity;
      const cgstAmount = parseFloat(((purchasePrice * qty * pi.cgstRate) / 100).toFixed(2));
      const sgstAmount = parseFloat(((purchasePrice * qty * pi.sgstRate) / 100).toFixed(2));
      const amount = parseFloat((purchasePrice * qty + cgstAmount + sgstAmount).toFixed(2));

      newRows.push({
        medicineId: pi.medicineId,
        medicineName: pi.medicineName,
        batchNumber: pi.batchNumber,
        expiryDate: pi.expiryDate,
        quantity: pi.quantity,
        freeQuantity: pi.freeQuantity,
        purchasePrice,
        mrp: mrpVal,
        sellingPrice: sellVal,
        cgstRate: pi.cgstRate,
        sgstRate: pi.sgstRate,
        cgstAmount,
        sgstAmount,
        amount,
      });
    }

    if (seen.size !== purchase.items.length) throw new AppError('Each line must be included once.', 400);

    const cgstTotal = parseFloat(newRows.reduce((s, i) => s + i.cgstAmount, 0).toFixed(2));
    const sgstTotal = parseFloat(newRows.reduce((s, i) => s + i.sgstAmount, 0).toFixed(2));
    const totalAmount = parseFloat(newRows.reduce((s, i) => s + i.amount, 0).toFixed(2));
    const taxableAmount = parseFloat((totalAmount - cgstTotal - sgstTotal).toFixed(2));
    const oldAmountDue = purchase.amountDue;
    const newAmountDue = parseFloat(Math.max(0, totalAmount - purchase.amountPaid).toFixed(2));
    const dueDelta = parseFloat((oldAmountDue - newAmountDue).toFixed(2));

    let invResolved = purchase.invoiceNumber;
    let dateResolved = purchase.invoiceDate;
    if (invoiceNumber !== undefined) {
      invResolved = invoiceNumber != null && String(invoiceNumber).trim() !== '' ? String(invoiceNumber).trim() : null;
    }
    if (invoiceDate !== undefined) {
      dateResolved = invoiceDate && String(invoiceDate).trim() !== '' ? new Date(invoiceDate) : purchase.invoiceDate;
    }
    let notesResolved = purchase.notes;
    if (notes !== undefined) {
      notesResolved = notes != null && String(notes).trim() !== '' ? String(notes).trim() : null;
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.purchaseItem.deleteMany({ where: { purchaseId: id } });
      await tx.purchaseItem.createMany({ data: newRows.map((r) => ({ ...r, purchaseId: id })) });

      const p = await tx.purchase.update({
        where: { id },
        data: {
          invoiceNumber: invResolved,
          invoiceDate: dateResolved,
          notes: notesResolved,
          subtotal: totalAmount,
          taxableAmount,
          cgstAmount: cgstTotal,
          sgstAmount: sgstTotal,
          totalTax: cgstTotal + sgstTotal,
          totalAmount,
          amountDue: newAmountDue,
        },
        include: {
          items: { include: { medicine: { select: { name: true, unit: true } } } },
          supplier: true,
          goodsReceipt: { include: { purchaseOrder: { select: { id: true, poNumber: true } } } },
        },
      });

      if (dueDelta !== 0) {
        await tx.supplier.update({
          where: { id: purchase.supplierId },
          data: { currentBalance: { decrement: dueDelta } },
        });
      }

      return p;
    });

    res.json({ success: true, message: 'Supplier bill updated', data: updated });
  } catch (err) { next(err); }
});

// PATCH payment
router.patch('/:id/payment', authorize('ADMIN', 'ACCOUNTANT'), async (req, res, next) => {
  try {
    const { amountPaid } = req.body;
    const purchase = await prisma.purchase.findUnique({ where: { id: req.params.id } });
    if (!purchase) throw new AppError('Purchase not found', 404);

    const totalPaid = purchase.amountPaid + parseFloat(amountPaid);
    const amountDue = Math.max(0, purchase.totalAmount - totalPaid);

    const [updated] = await prisma.$transaction([
      prisma.purchase.update({
        where: { id: req.params.id },
        data: { amountPaid: totalPaid, amountDue },
      }),
      prisma.supplier.update({
        where: { id: purchase.supplierId },
        data: { currentBalance: { decrement: parseFloat(amountPaid) } },
      }),
    ]);

    res.json({ success: true, message: 'Payment updated', data: updated });
  } catch (err) { next(err); }
});

module.exports = router;
