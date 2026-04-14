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
    const { supplierId, status } = req.query;
    const where = {};
    if (supplierId) where.supplierId = supplierId;
    if (status) where.status = status;

    const [rows, total] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where,
        skip,
        take: limit,
        include: {
          supplier: { select: { id: true, name: true } },
          user: { select: { name: true } },
          _count: { select: { items: true, goodsReceipts: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.purchaseOrder.count({ where }),
    ]);
    res.json({ success: true, data: rows, meta: paginationMeta(total, page, limit) });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const row = await prisma.purchaseOrder.findUnique({
      where: { id: req.params.id },
      include: {
        supplier: true,
        user: { select: { name: true } },
        items: {
          include: {
            medicine: {
              select: {
                id: true, name: true, unit: true, cgstRate: true, sgstRate: true,
                purchasePrice: true, mrp: true, sellingPrice: true,
              },
            },
          },
        },
        goodsReceipts: { orderBy: { createdAt: 'desc' }, select: { id: true, grnNumber: true, createdAt: true } },
      },
    });
    if (!row) throw new AppError('Purchase order not found', 404);
    res.json({ success: true, data: row });
  } catch (err) { next(err); }
});

router.post('/', authorize('ADMIN', 'PHARMACIST'), [
  body('supplierId').notEmpty().withMessage('Supplier is required'),
  body('items').isArray({ min: 1 }).withMessage('Add at least one line item'),
  body('items.*.medicineId').notEmpty().withMessage('Each line needs a medicine'),
  body('items.*.qtyOrdered').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('items.*.expectedPurchasePrice').optional().isFloat({ min: 0 }),
], auditLog('CREATE', 'PurchaseOrder'), async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const arr = errors.array();
      return res.status(400).json({
        success: false,
        message: arr.map((e) => e.msg || `${e.path}: invalid`).join(' · '),
        errors: arr,
      });
    }

    const { supplierId, items, notes, expectedDate } = req.body;
    const sup = await prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!sup) throw new AppError('Supplier not found', 404);

    const lineCreates = [];
    for (const it of items) {
      const med = await prisma.medicine.findFirst({
        where: { id: it.medicineId, isActive: true },
      });
      if (!med) throw new AppError(`Medicine not found or inactive: ${it.medicineId}`, 400);
      const qtyOrdered = parseInt(String(it.qtyOrdered), 10);
      if (!Number.isFinite(qtyOrdered) || qtyOrdered < 1) {
        throw new AppError('Each line must have quantity ≥ 1', 400);
      }
      const epRaw = it.expectedPurchasePrice;
      let expectedPurchasePrice = epRaw != null && epRaw !== '' && Number.isFinite(Number(epRaw))
        ? Number(epRaw)
        : med.purchasePrice;
      if (!Number.isFinite(Number(expectedPurchasePrice))) {
        expectedPurchasePrice = 0;
      }
      const lineNotes = it.notes?.trim();
      lineCreates.push({
        medicineId: it.medicineId,
        qtyOrdered,
        expectedPurchasePrice,
        notes: lineNotes && lineNotes.length <= 500 ? lineNotes : (lineNotes ? lineNotes.slice(0, 500) : null),
      });
    }

    const poNumber = await generateNumber('po_prefix', 'PO');

    let expectedDateValue = null;
    if (expectedDate) {
      const d = new Date(expectedDate);
      if (!Number.isNaN(d.getTime())) expectedDateValue = d;
    }

    const created = await prisma.purchaseOrder.create({
      data: {
        poNumber,
        supplierId,
        userId: req.user.id,
        notes: notes?.trim() || null,
        expectedDate: expectedDateValue,
        items: { create: lineCreates },
      },
      include: {
        items: { include: { medicine: { select: { name: true, unit: true } } } },
        supplier: { select: { name: true } },
      },
    });

    res.status(201).json({ success: true, message: 'Purchase order created', data: created });
  } catch (err) { next(err); }
});

module.exports = router;
