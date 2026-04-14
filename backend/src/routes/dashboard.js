const express = require('express');
const prisma = require('../utils/prisma');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const yesterday = new Date(todayStart);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayEnd = new Date(yesterday);
    yesterdayEnd.setHours(23, 59, 59, 999);

    const expiryAlert = new Date();
    expiryAlert.setDate(expiryAlert.getDate() + 90);

    const [
      todayBills, todaySalesAgg, monthSalesAgg, yesterdaySalesAgg,
      totalMedicines, expiringCount,
      recentBills, topMedicines,
      pendingCreditAgg, pendingPurchaseAgg,
      monthBillCount,
    ] = await Promise.all([
      prisma.bill.count({ where: { createdAt: { gte: todayStart, lte: todayEnd } } }),
      prisma.bill.aggregate({
        where: { createdAt: { gte: todayStart, lte: todayEnd } },
        _sum: { netAmount: true },
      }),
      prisma.bill.aggregate({
        where: { createdAt: { gte: monthStart } },
        _sum: { netAmount: true },
      }),
      prisma.bill.aggregate({
        where: { createdAt: { gte: yesterday, lte: yesterdayEnd } },
        _sum: { netAmount: true },
      }),
      prisma.medicine.count({ where: { isActive: true } }),
      prisma.medicine.count({
        where: { expiryDate: { lte: expiryAlert, gte: now }, isActive: true },
      }),
      prisma.bill.findMany({
        take: 8,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, billNumber: true, customerName: true,
          netAmount: true, paymentMode: true, paymentStatus: true, createdAt: true,
        },
      }),
      prisma.billItem.groupBy({
        by: ['medicineName'],
        where: { bill: { createdAt: { gte: monthStart } } },
        _sum: { quantity: true, amount: true },
        orderBy: { _sum: { amount: 'desc' } },
        take: 5,
      }),
      prisma.customer.aggregate({
        where: { currentCredit: { gt: 0 } },
        _sum: { currentCredit: true },
        _count: true,
      }),
      prisma.purchase.aggregate({
        where: { amountDue: { gt: 0 } },
        _sum: { amountDue: true },
        _count: true,
      }),
      prisma.bill.count({ where: { createdAt: { gte: monthStart } } }),
    ]);

    const lowStockResult = await prisma.$queryRaw`
      SELECT COUNT(*) as cnt FROM Medicine WHERE quantity <= minStockLevel AND isActive = 1
    `;
    const lowStockCount = Number(lowStockResult[0].cnt);

    const trend = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const de = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
      const agg = await prisma.bill.aggregate({
        where: { createdAt: { gte: ds, lte: de } },
        _sum: { netAmount: true },
        _count: true,
      });
      trend.push({
        date: ds.toISOString().split('T')[0],
        sales: agg._sum.netAmount || 0,
        bills: agg._count,
      });
    }

    const todaySales = todaySalesAgg._sum.netAmount || 0;
    const yesterdaySales = yesterdaySalesAgg._sum.netAmount || 0;
    const salesGrowth = yesterdaySales > 0
      ? Math.round(((todaySales - yesterdaySales) / yesterdaySales) * 100)
      : todaySales > 0 ? 100 : 0;

    res.json({
      success: true,
      data: {
        stats: {
          todayBills,
          todaySales,
          yesterdaySales,
          salesGrowth,
          monthSales: monthSalesAgg._sum.netAmount || 0,
          monthBills: monthBillCount,
          totalMedicines,
          lowStockCount,
          expiringCount,
          pendingCredit: pendingCreditAgg._sum.currentCredit || 0,
          pendingCreditCustomers: pendingCreditAgg._count || 0,
          pendingPurchasePayments: pendingPurchaseAgg._sum.amountDue || 0,
          pendingPurchaseCount: pendingPurchaseAgg._count || 0,
        },
        recentBills,
        topMedicines,
        salesTrend: trend,
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
