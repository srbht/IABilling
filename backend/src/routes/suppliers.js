const express = require('express');
const { body, validationResult } = require('express-validator');
const prisma = require('../utils/prisma');
const { authenticate, authorize, auditLog } = require('../middleware/auth');
const { getPagination, paginationMeta } = require('../utils/helpers');
const { AppError } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const { search, isActive } = req.query;

    const where = {};
    if (isActive !== 'all') where.isActive = isActive !== 'false';
    if (search) {
      // MySQL is case-insensitive — no mode needed
      where.OR = [
        { name: { contains: search } },
        { phone: { contains: search } },
        { gstin: { contains: search } },
        { contactPerson: { contains: search } },
      ];
    }

    const [suppliers, total] = await Promise.all([
      prisma.supplier.findMany({
        where,
        skip,
        take: limit,
        include: { _count: { select: { purchases: true } } },
        orderBy: { name: 'asc' },
      }),
      prisma.supplier.count({ where }),
    ]);

    res.json({ success: true, data: suppliers, meta: paginationMeta(total, page, limit) });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const supplier = await prisma.supplier.findUnique({
      where: { id: req.params.id },
      include: {
        purchases: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: { user: { select: { name: true } } },
        },
      },
    });
    if (!supplier) throw new AppError('Supplier not found', 404);
    res.json({ success: true, data: supplier });
  } catch (err) { next(err); }
});

router.post('/', authorize('ADMIN', 'ACCOUNTANT'), [
  body('name').trim().notEmpty(),
  body('phone').trim().notEmpty(),
], auditLog('CREATE', 'Supplier'), async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const supplier = await prisma.supplier.create({ data: req.body });
    res.status(201).json({ success: true, message: 'Supplier created', data: supplier });
  } catch (err) { next(err); }
});

router.put('/:id', authorize('ADMIN', 'ACCOUNTANT'), auditLog('UPDATE', 'Supplier'), async (req, res, next) => {
  try {
    const supplier = await prisma.supplier.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json({ success: true, message: 'Supplier updated', data: supplier });
  } catch (err) { next(err); }
});

router.delete('/:id', authorize('ADMIN'), auditLog('DELETE', 'Supplier'), async (req, res, next) => {
  try {
    await prisma.supplier.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ success: true, message: 'Supplier deactivated' });
  } catch (err) { next(err); }
});

module.exports = router;
