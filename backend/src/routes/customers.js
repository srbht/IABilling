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
    const { search } = req.query;

    const where = { isActive: true };
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { phone: { contains: search } },
        { email: { contains: search } },
      ];
    }

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        skip,
        take: limit,
        include: { _count: { select: { bills: true } } },
        orderBy: { name: 'asc' },
      }),
      prisma.customer.count({ where }),
    ]);

    res.json({ success: true, data: customers, meta: paginationMeta(total, page, limit) });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: req.params.id },
      include: {
        bills: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { _count: { select: { items: true } } },
        },
      },
    });
    if (!customer) throw new AppError('Customer not found', 404);
    res.json({ success: true, data: customer });
  } catch (err) { next(err); }
});

router.post('/', [
  body('name').trim().notEmpty(),
  body('phone').optional().trim(),
], auditLog('CREATE', 'Customer'), async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const customer = await prisma.customer.create({ data: req.body });
    res.status(201).json({ success: true, message: 'Customer created', data: customer });
  } catch (err) { next(err); }
});

router.put('/:id', auditLog('UPDATE', 'Customer'), async (req, res, next) => {
  try {
    const customer = await prisma.customer.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json({ success: true, message: 'Customer updated', data: customer });
  } catch (err) { next(err); }
});

router.delete('/:id', authorize('ADMIN'), auditLog('DELETE', 'Customer'), async (req, res, next) => {
  try {
    await prisma.customer.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ success: true, message: 'Customer deactivated' });
  } catch (err) { next(err); }
});

module.exports = router;
