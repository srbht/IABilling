const express = require('express');
const { body, validationResult } = require('express-validator');
const prisma = require('../utils/prisma');
const { authenticate, authorize, auditLog } = require('../middleware/auth');
const { getPagination, paginationMeta } = require('../utils/helpers');
const { AppError } = require('../middleware/errorHandler');
const { normalizeMedicinePayload } = require('../utils/medicinePayload');

const router = express.Router();
router.use(authenticate);

/** Every product must have a distinct SKU (DB unique index + explicit check for clear errors). */
async function assertUniqueSkuAndBarcode(prismaClient, { sku, barcode }, excludeId) {
  const skuNorm = sku != null ? String(sku).trim() : '';
  if (!skuNorm) {
    throw new AppError('SKU is required and must be unique for every product (use a short code, e.g. MED-PARA-500).', 400);
  }
  const skuRow = await prismaClient.medicine.findFirst({
    where: {
      sku: skuNorm,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true, name: true },
  });
  if (skuRow) {
    throw new AppError(`SKU "${skuNorm}" is already used by "${skuRow.name}". Each product needs its own SKU.`, 409);
  }

  const bc = barcode != null ? String(barcode).trim() : '';
  if (!bc) return;
  const bcRow = await prismaClient.medicine.findFirst({
    where: {
      barcode: bc,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { name: true },
  });
  if (bcRow) {
    throw new AppError(`Barcode "${bc}" is already used by "${bcRow.name}".`, 409);
  }
}

function buildMedicineWhere(req) {
  const { search, category, expiringSoon, isActive, supplierId, brand, manufacturer } = req.query;

  const where = {};
  if (isActive !== 'all') where.isActive = isActive !== 'false';

  const and = [];

  if (search) {
    and.push({
      OR: [
        { name: { contains: search } },
        { brandName: { contains: search } },
        { genericName: { contains: search } },
        { sku: { contains: search } },
        { barcode: { contains: search } },
        { batchNumber: { contains: search } },
        { manufacturer: { contains: search } },
        { composition: { contains: search } },
        { hsnCode: { contains: search } },
        { location: { contains: search } },
      ],
    });
  }

  if (category) and.push({ category: { contains: category } });
  if (supplierId) and.push({ supplierId: String(supplierId) });
  if (brand) and.push({ brandName: { contains: String(brand) } });
  if (manufacturer) and.push({ manufacturer: { contains: String(manufacturer) } });

  if (expiringSoon) {
    const days = parseInt(expiringSoon, 10) || 90;
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + days);
    and.push({ expiryDate: { lte: targetDate, gte: new Date() } });
  }

  if (and.length) where.AND = and;
  return where;
}

// GET /api/medicines/filter-options (before /:id)
router.get('/filter-options', async (req, res, next) => {
  try {
    const [brandRows, mfgRows] = await Promise.all([
      prisma.medicine.findMany({
        where: { isActive: true, brandName: { not: null } },
        select: { brandName: true },
        distinct: ['brandName'],
        orderBy: { brandName: 'asc' },
      }),
      prisma.medicine.findMany({
        where: { isActive: true, manufacturer: { not: null } },
        select: { manufacturer: true },
        distinct: ['manufacturer'],
        orderBy: { manufacturer: 'asc' },
      }),
    ]);
    const suppliers = await prisma.supplier.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    res.json({
      success: true,
      data: {
        brands: brandRows.map((r) => r.brandName).filter(Boolean),
        manufacturers: mfgRows.map((r) => r.manufacturer).filter(Boolean),
        suppliers,
      },
    });
  } catch (err) { next(err); }
});

// GET /api/medicines
router.get('/', async (req, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const { lowStock } = req.query;
    const supplierId = req.query.supplierId ? String(req.query.supplierId).trim() : '';
    const brand = req.query.brand ? String(req.query.brand).trim() : '';

    if (lowStock === 'true') {
      const brandPat = brand ? `%${brand}%` : null;
      let meds;
      let totalResult;
      if (supplierId && brandPat) {
        meds = await prisma.$queryRaw`
          SELECT * FROM Medicine
          WHERE quantity <= minStockLevel AND isActive = 1
            AND supplierId = ${supplierId}
            AND brandName LIKE ${brandPat}
          ORDER BY quantity ASC
          LIMIT ${limit} OFFSET ${skip}
        `;
        totalResult = await prisma.$queryRaw`
          SELECT COUNT(*) as cnt FROM Medicine
          WHERE quantity <= minStockLevel AND isActive = 1
            AND supplierId = ${supplierId}
            AND brandName LIKE ${brandPat}
        `;
      } else if (supplierId) {
        meds = await prisma.$queryRaw`
          SELECT * FROM Medicine
          WHERE quantity <= minStockLevel AND isActive = 1 AND supplierId = ${supplierId}
          ORDER BY quantity ASC
          LIMIT ${limit} OFFSET ${skip}
        `;
        totalResult = await prisma.$queryRaw`
          SELECT COUNT(*) as cnt FROM Medicine
          WHERE quantity <= minStockLevel AND isActive = 1 AND supplierId = ${supplierId}
        `;
      } else if (brandPat) {
        meds = await prisma.$queryRaw`
          SELECT * FROM Medicine
          WHERE quantity <= minStockLevel AND isActive = 1 AND brandName LIKE ${brandPat}
          ORDER BY quantity ASC
          LIMIT ${limit} OFFSET ${skip}
        `;
        totalResult = await prisma.$queryRaw`
          SELECT COUNT(*) as cnt FROM Medicine
          WHERE quantity <= minStockLevel AND isActive = 1 AND brandName LIKE ${brandPat}
        `;
      } else {
        meds = await prisma.$queryRaw`
          SELECT * FROM Medicine
          WHERE quantity <= minStockLevel AND isActive = 1
          ORDER BY quantity ASC
          LIMIT ${limit} OFFSET ${skip}
        `;
        totalResult = await prisma.$queryRaw`
          SELECT COUNT(*) as cnt FROM Medicine WHERE quantity <= minStockLevel AND isActive = 1
        `;
      }
      return res.json({
        success: true,
        data: meds,
        meta: paginationMeta(Number(totalResult[0].cnt), page, limit),
      });
    }

    const where = buildMedicineWhere(req);

    const [medicines, total] = await Promise.all([
      prisma.medicine.findMany({
        where,
        skip,
        take: limit,
        orderBy: req.query.sortBy
          ? { [req.query.sortBy]: req.query.sortOrder || 'asc' }
          : { name: 'asc' },
      }),
      prisma.medicine.count({ where }),
    ]);

    res.json({ success: true, data: medicines, meta: paginationMeta(total, page, limit) });
  } catch (err) { next(err); }
});

// GET /api/medicines/categories
router.get('/categories', async (req, res, next) => {
  try {
    const cats = await prisma.medicine.groupBy({
      by: ['category'],
      where: { isActive: true },
      _count: true,
      orderBy: { category: 'asc' },
    });
    res.json({ success: true, data: cats });
  } catch (err) { next(err); }
});

// GET /api/medicines/alerts
router.get('/alerts', async (req, res, next) => {
  try {
    const expirySetting = await prisma.settings.findUnique({ where: { key: 'expiry_alert_days' } });
    const expiryDays = parseInt(expirySetting?.value || '90');

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + expiryDays);

    const [lowStock, expiring, expired] = await Promise.all([
      prisma.$queryRaw`
        SELECT * FROM Medicine WHERE quantity <= minStockLevel AND isActive = 1 ORDER BY quantity ASC
      `,
      prisma.medicine.findMany({
        where: { expiryDate: { lte: expiryDate, gt: new Date() }, isActive: true },
        orderBy: { expiryDate: 'asc' },
      }),
      prisma.medicine.findMany({
        where: { expiryDate: { lt: new Date() }, isActive: true },
        orderBy: { expiryDate: 'asc' },
      }),
    ]);

    res.json({
      success: true,
      data: { lowStock, expiring, expired },
      counts: { lowStock: lowStock.length, expiring: expiring.length, expired: expired.length },
    });
  } catch (err) { next(err); }
});

// GET /api/medicines/stats — inventory summary for dashboard cards
router.get('/stats', async (req, res, next) => {
  try {
    const [total, outOfStockCount, valueResult, lowStockResult] = await Promise.all([
      prisma.medicine.count({ where: { isActive: true } }),
      prisma.medicine.count({ where: { isActive: true, quantity: 0 } }),
      prisma.$queryRaw`SELECT COALESCE(SUM(quantity * purchasePrice),0) as stockValue, COALESCE(SUM(quantity * mrp),0) as mrpValue FROM Medicine WHERE isActive = 1`,
      prisma.$queryRaw`SELECT COUNT(*) as cnt FROM Medicine WHERE quantity <= minStockLevel AND quantity > 0 AND isActive = 1`,
    ]);
    res.json({
      success: true,
      data: {
        totalItems: total,
        lowStockCount: Number(lowStockResult[0].cnt),
        outOfStockCount,
        stockValue: Number(valueResult[0].stockValue) || 0,
        mrpValue: Number(valueResult[0].mrpValue) || 0,
      },
    });
  } catch (err) { next(err); }
});

// GET /api/medicines/export — download current inventory as CSV
router.get('/export', async (req, res, next) => {
  try {
    const where = buildMedicineWhere(req);
    const medicines = await prisma.medicine.findMany({ where, orderBy: { name: 'asc' } });

    const fields = [
      'sku', 'name', 'brandName', 'genericName', 'category', 'manufacturer',
      'batchNumber', 'hsnCode', 'dosageForm', 'packSize', 'composition',
      'strengthMg', 'strengthUnit', 'unit', 'purchasePrice', 'sellingPrice',
      'mrp', 'quantity', 'minStockLevel', 'expiryDate', 'gstRate', 'cgstRate', 'sgstRate',
      'defaultDiscountPct', 'taxInclusive', 'requiresPrescription', 'location', 'notes',
    ];

    const esc = (v) => {
      if (v == null) return '';
      const s = v instanceof Date ? v.toISOString().split('T')[0] : String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const header = fields.join(',');
    const rows = medicines.map(m => fields.map(f => esc(m[f])).join(','));
    const csv = [header, ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="inventory-${Date.now()}.csv"`);
    res.send(csv);
  } catch (err) { next(err); }
});

// POST /api/medicines/bulk-stock — update stock for multiple items at once
router.post('/bulk-stock', authorize('ADMIN', 'PHARMACIST'), async (req, res, next) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || !items.length) throw new AppError('items array is required', 400);

    const results = [];
    const errors = [];

    for (const item of items) {
      const { id, type, quantity, reason } = item;
      if (!id || !type || quantity == null || quantity === '') continue;
      try {
        const medicine = await prisma.medicine.findUnique({ where: { id } });
        if (!medicine) { errors.push({ id, error: 'Not found' }); continue; }

        const qty = parseInt(quantity, 10);
        if (isNaN(qty) || qty < 0) { errors.push({ id, name: medicine.name, error: 'Invalid quantity' }); continue; }

        let newQty;
        if (type === 'CORRECTION') newQty = qty;
        else if (['ADDITION', 'RETURN'].includes(type)) newQty = medicine.quantity + qty;
        else newQty = Math.max(0, medicine.quantity - qty);

        await prisma.$transaction([
          prisma.medicine.update({ where: { id }, data: { quantity: newQty } }),
          prisma.stockAdjustment.create({
            data: { medicineId: id, userId: req.user.id, type, quantity: qty, reason: reason || 'Bulk update' },
          }),
        ]);
        results.push({ id, name: medicine.name, oldQty: medicine.quantity, newQty });
      } catch (e) { errors.push({ id, error: e.message }); }
    }

    res.json({
      success: true,
      message: `Updated ${results.length} items${errors.length ? `, ${errors.length} errors` : ''}`,
      data: { results, errors },
    });
  } catch (err) { next(err); }
});

// POST /api/medicines/bulk-price — update prices for multiple items at once
router.post('/bulk-price', authorize('ADMIN', 'PHARMACIST'), async (req, res, next) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || !items.length) throw new AppError('items array is required', 400);

    const results = [];
    const errors = [];

    for (const item of items) {
      const { id, purchasePrice, sellingPrice, mrp } = item;
      if (!id) continue;
      try {
        const updateData = {};
        if (purchasePrice !== '' && purchasePrice != null) { const v = parseFloat(purchasePrice); if (!isNaN(v) && v >= 0) updateData.purchasePrice = v; }
        if (sellingPrice !== '' && sellingPrice != null) { const v = parseFloat(sellingPrice); if (!isNaN(v) && v >= 0) updateData.sellingPrice = v; }
        if (mrp !== '' && mrp != null) { const v = parseFloat(mrp); if (!isNaN(v) && v >= 0) updateData.mrp = v; }
        if (!Object.keys(updateData).length) continue;
        const updated = await prisma.medicine.update({ where: { id }, data: updateData });
        results.push({ id, name: updated.name });
      } catch (e) { errors.push({ id, error: e.message }); }
    }

    res.json({
      success: true,
      message: `Prices updated for ${results.length} items${errors.length ? `, ${errors.length} errors` : ''}`,
      data: { results, errors },
    });
  } catch (err) { next(err); }
});

// POST /api/medicines/import — bulk create/update from parsed CSV rows
router.post('/import', authorize('ADMIN', 'PHARMACIST'), async (req, res, next) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || !items.length) throw new AppError('items array is required', 400);

    const results = { created: 0, updated: 0, errors: [] };

    for (const raw of items) {
      try {
        if (!raw.name || !raw.category) {
          results.errors.push({ name: raw.name || '(blank)', error: 'name and category are required' });
          continue;
        }
        if (!raw.expiryDate) { results.errors.push({ name: raw.name, error: 'expiryDate is required (YYYY-MM-DD)' }); continue; }
        if (!raw.batchNumber) raw.batchNumber = `IMP-${Date.now()}`;
        if (!raw.unit) raw.unit = 'strip';

        const data = normalizeMedicinePayload(raw);
        if (data.sellingPrice == null && data.mrp != null) data.sellingPrice = data.mrp;
        if (data.sellingPrice == null && data.purchasePrice != null) data.sellingPrice = data.purchasePrice;

        if (data.sku) {
          const existing = await prisma.medicine.findFirst({ where: { sku: String(data.sku) } });
          if (existing) {
            const safeData = { ...data };
            delete safeData.sku;
            await prisma.medicine.update({ where: { id: existing.id }, data: safeData });
            results.updated++;
            continue;
          }
        }
        await prisma.medicine.create({ data });
        results.created++;
      } catch (e) {
        results.errors.push({ name: raw.name || '(unknown)', error: e.message });
      }
    }

    res.json({
      success: true,
      message: `Import done: ${results.created} created, ${results.updated} updated, ${results.errors.length} errors`,
      data: results,
    });
  } catch (err) { next(err); }
});

// GET /api/medicines/:id
router.get('/:id', async (req, res, next) => {
  try {
    const medicine = await prisma.medicine.findUnique({
      where: { id: req.params.id },
      include: {
        stockAdjustments: {
          include: { user: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });
    if (!medicine) throw new AppError('Medicine not found', 404);
    res.json({ success: true, data: medicine });
  } catch (err) { next(err); }
});

// POST /api/medicines
router.post('/', authorize('ADMIN', 'PHARMACIST'), [
  body('sku').trim().notEmpty().isLength({ min: 1, max: 64 }).withMessage('SKU is required (max 64 chars), must be unique'),
  body('name').trim().notEmpty(),
  body('category').trim().notEmpty(),
  body('batchNumber').trim().notEmpty(),
  body('purchasePrice').isFloat({ min: 0 }),
  body('sellingPrice').isFloat({ min: 0 }),
  body('mrp').isFloat({ min: 0 }),
  body('quantity').isInt({ min: 0 }),
  body('expiryDate').isISO8601(),
], auditLog('CREATE', 'Medicine'), async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const data = normalizeMedicinePayload(req.body);
    if (!data.name || !data.category || !data.batchNumber) {
      throw new AppError('name, category, and batch number are required', 400);
    }
    if (data.purchasePrice == null || data.sellingPrice == null || data.mrp == null) {
      throw new AppError('purchase price, selling price, and MRP are required', 400);
    }
    if (data.quantity == null || data.expiryDate == null) {
      throw new AppError('quantity and expiry date are required', 400);
    }
    await assertUniqueSkuAndBarcode(prisma, { sku: data.sku, barcode: data.barcode }, null);
    const medicine = await prisma.medicine.create({ data });
    res.status(201).json({ success: true, message: 'Medicine added successfully', data: medicine });
  } catch (err) { next(err); }
});

// PUT /api/medicines/:id
router.put('/:id', authorize('ADMIN', 'PHARMACIST'), auditLog('UPDATE', 'Medicine'), async (req, res, next) => {
  try {
    const existing = await prisma.medicine.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError('Medicine not found', 404);

    const data = normalizeMedicinePayload(req.body);
    if (data.sku === null || (typeof data.sku === 'string' && !data.sku.trim())) {
      delete data.sku;
    }
    const skuForUnique = data.sku != null && String(data.sku).trim()
      ? String(data.sku).trim()
      : existing.sku;
    if (!skuForUnique) {
      throw new AppError('SKU is required — set a unique code for this product (e.g. MED-PARA-500).', 400);
    }
    const barcodeForUnique = Object.prototype.hasOwnProperty.call(data, 'barcode')
      ? data.barcode
      : existing.barcode;
    await assertUniqueSkuAndBarcode(prisma, { sku: skuForUnique, barcode: barcodeForUnique }, req.params.id);
    const medicine = await prisma.medicine.update({
      where: { id: req.params.id },
      data,
    });
    res.json({ success: true, message: 'Medicine updated successfully', data: medicine });
  } catch (err) { next(err); }
});

// DELETE /api/medicines/:id (soft delete)
router.delete('/:id', authorize('ADMIN'), auditLog('DELETE', 'Medicine'), async (req, res, next) => {
  try {
    await prisma.medicine.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });
    res.json({ success: true, message: 'Medicine deactivated successfully' });
  } catch (err) { next(err); }
});

// POST /api/medicines/:id/adjust-stock
router.post('/:id/adjust-stock', authorize('ADMIN', 'PHARMACIST'), [
  body('type').isIn(['ADDITION', 'SUBTRACTION', 'CORRECTION', 'DAMAGE', 'RETURN']),
  body('quantity').isInt({ min: 1 }),
  body('reason').optional().trim(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { type, quantity, reason } = req.body;
    const medicine = await prisma.medicine.findUnique({ where: { id: req.params.id } });
    if (!medicine) throw new AppError('Medicine not found', 404);

    let newQty;
    if (type === 'CORRECTION') {
      newQty = quantity;
    } else if (['ADDITION', 'RETURN'].includes(type)) {
      newQty = medicine.quantity + quantity;
    } else {
      newQty = Math.max(0, medicine.quantity - quantity);
    }

    const [updated] = await prisma.$transaction([
      prisma.medicine.update({
        where: { id: req.params.id },
        data: { quantity: newQty },
      }),
      prisma.stockAdjustment.create({
        data: { medicineId: req.params.id, userId: req.user.id, type, quantity, reason },
      }),
    ]);

    res.json({ success: true, message: 'Stock adjusted successfully', data: updated });
  } catch (err) { next(err); }
});

module.exports = router;
