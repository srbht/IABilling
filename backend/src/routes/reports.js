const express = require('express');
const prisma = require('../utils/prisma');
const { authenticate } = require('../middleware/auth');
const { getDateRange } = require('../utils/helpers');

const router = express.Router();
router.use(authenticate);

// GET /api/reports/sales
router.get('/sales', async (req, res, next) => {
  try {
    const { period, startDate, endDate } = req.query;
    let start, end;

    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
    } else {
      const range = getDateRange(period || 'month');
      start = range.startDate;
      end = range.endDate;
    }

    const bills = await prisma.bill.findMany({
      where: { createdAt: { gte: start, lte: end } },
      include: { items: true },
      orderBy: { createdAt: 'asc' },
    });

    const dailySales = {};
    for (const bill of bills) {
      const dateKey = bill.createdAt.toISOString().split('T')[0];
      if (!dailySales[dateKey]) {
        dailySales[dateKey] = { date: dateKey, totalBills: 0, totalSales: 0, totalTax: 0, totalDiscount: 0 };
      }
      dailySales[dateKey].totalBills += 1;
      dailySales[dateKey].totalSales += bill.netAmount;
      dailySales[dateKey].totalTax += bill.totalTax;
      dailySales[dateKey].totalDiscount += bill.discountAmount;
    }

    const summary = {
      totalBills: bills.length,
      totalSales: bills.reduce((s, b) => s + b.netAmount, 0),
      totalTax: bills.reduce((s, b) => s + b.totalTax, 0),
      totalDiscount: bills.reduce((s, b) => s + b.discountAmount, 0),
      cashSales: bills.filter(b => b.paymentMode === 'CASH').reduce((s, b) => s + b.netAmount, 0),
      upiSales: bills.filter(b => b.paymentMode === 'UPI').reduce((s, b) => s + b.netAmount, 0),
      cardSales: bills.filter(b => b.paymentMode === 'CARD').reduce((s, b) => s + b.netAmount, 0),
      creditSales: bills.filter(b => b.paymentMode === 'CREDIT').reduce((s, b) => s + b.netAmount, 0),
    };

    res.json({ success: true, data: { summary, dailySales: Object.values(dailySales) } });
  } catch (err) { next(err); }
});

// GET /api/reports/purchases
router.get('/purchases', async (req, res, next) => {
  try {
    const { period, startDate, endDate } = req.query;
    let start, end;

    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
    } else {
      const range = getDateRange(period || 'month');
      start = range.startDate;
      end = range.endDate;
    }

    const purchases = await prisma.purchase.findMany({
      where: { createdAt: { gte: start, lte: end } },
      include: { supplier: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const summary = {
      totalPurchases: purchases.length,
      totalAmount: purchases.reduce((s, p) => s + p.totalAmount, 0),
      totalTax: purchases.reduce((s, p) => s + p.totalTax, 0),
      totalDue: purchases.reduce((s, p) => s + p.amountDue, 0),
    };

    res.json({ success: true, data: { summary, purchases } });
  } catch (err) { next(err); }
});

// GET /api/reports/profit-loss
router.get('/profit-loss', async (req, res, next) => {
  try {
    const { period, startDate, endDate } = req.query;
    let start, end;

    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
    } else {
      const range = getDateRange(period || 'month');
      start = range.startDate;
      end = range.endDate;
    }

    const [billItems, purchaseItems] = await Promise.all([
      prisma.billItem.findMany({
        where: { bill: { createdAt: { gte: start, lte: end } } },
        include: { medicine: { select: { purchasePrice: true } } },
      }),
      prisma.purchaseItem.findMany({
        where: { purchase: { createdAt: { gte: start, lte: end } } },
      }),
    ]);

    const revenue = billItems.reduce((s, i) => s + i.amount, 0);
    const cogs = billItems.reduce((s, i) => s + (i.medicine.purchasePrice * i.quantity), 0);
    const grossProfit = revenue - cogs;
    const purchaseCost = purchaseItems.reduce((s, i) => s + i.amount, 0);

    res.json({
      success: true,
      data: {
        revenue: parseFloat(revenue.toFixed(2)),
        cogs: parseFloat(cogs.toFixed(2)),
        grossProfit: parseFloat(grossProfit.toFixed(2)),
        grossMargin: revenue > 0 ? parseFloat(((grossProfit / revenue) * 100).toFixed(2)) : 0,
        purchaseCost: parseFloat(purchaseCost.toFixed(2)),
      },
    });
  } catch (err) { next(err); }
});

// GET /api/reports/top-medicines
router.get('/top-medicines', async (req, res, next) => {
  try {
    const { period, limit } = req.query;
    const range = getDateRange(period || 'month');
    const take = parseInt(limit) || 10;

    const result = await prisma.billItem.groupBy({
      by: ['medicineId', 'medicineName'],
      where: { bill: { createdAt: { gte: range.startDate, lte: range.endDate } } },
      _sum: { quantity: true, amount: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take,
    });

    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// GET /api/reports/expiry
router.get('/expiry', async (req, res, next) => {
  try {
    const days = parseInt(req.query.days) || 90;
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + days);

    const [expiring, expired] = await Promise.all([
      prisma.medicine.findMany({
        where: { expiryDate: { lte: targetDate, gte: new Date() }, isActive: true },
        orderBy: { expiryDate: 'asc' },
      }),
      prisma.medicine.findMany({
        where: { expiryDate: { lt: new Date() }, isActive: true },
        orderBy: { expiryDate: 'asc' },
      }),
    ]);

    res.json({ success: true, data: { expiring, expired } });
  } catch (err) { next(err); }
});

// GET /api/reports/stock
router.get('/stock', async (req, res, next) => {
  try {
    // MySQL raw SQL with backtick identifiers
    const [lowStock, allMeds] = await Promise.all([
      prisma.$queryRaw`
        SELECT * FROM Medicine WHERE quantity <= minStockLevel AND isActive = 1 ORDER BY quantity ASC
      `,
      prisma.medicine.findMany({
        where: { isActive: true },
        select: { quantity: true, purchasePrice: true, sellingPrice: true },
      }),
    ]);

    const stockValue = allMeds.reduce((s, m) => s + (m.quantity * m.purchasePrice), 0);
    const retailValue = allMeds.reduce((s, m) => s + (m.quantity * m.sellingPrice), 0);

    res.json({
      success: true,
      data: {
        lowStock,
        stockValue: parseFloat(stockValue.toFixed(2)),
        retailValue: parseFloat(retailValue.toFixed(2)),
        totalSkus: allMeds.length,
      },
    });
  } catch (err) { next(err); }
});

// GET /api/reports/gst
router.get('/gst', async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);

    const [salesGst, purchaseGst] = await Promise.all([
      prisma.bill.findMany({
        where: { createdAt: { gte: start, lte: end } },
        select: {
          billNumber: true, createdAt: true,
          taxableAmount: true, cgstAmount: true, sgstAmount: true, totalTax: true, netAmount: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.purchase.findMany({
        where: { createdAt: { gte: start, lte: end } },
        select: {
          purchaseNumber: true, createdAt: true,
          taxableAmount: true, cgstAmount: true, sgstAmount: true, totalTax: true, totalAmount: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const salesSummary = {
      taxableAmount: salesGst.reduce((s, b) => s + b.taxableAmount, 0),
      cgst: salesGst.reduce((s, b) => s + b.cgstAmount, 0),
      sgst: salesGst.reduce((s, b) => s + b.sgstAmount, 0),
      totalTax: salesGst.reduce((s, b) => s + b.totalTax, 0),
    };

    const purchaseSummary = {
      taxableAmount: purchaseGst.reduce((s, p) => s + p.taxableAmount, 0),
      cgst: purchaseGst.reduce((s, p) => s + p.cgstAmount, 0),
      sgst: purchaseGst.reduce((s, p) => s + p.sgstAmount, 0),
      totalTax: purchaseGst.reduce((s, p) => s + p.totalTax, 0),
    };

    res.json({
      success: true,
      data: {
        salesGst, purchaseGst,
        salesSummary, purchaseSummary,
        netTaxLiability: salesSummary.totalTax - purchaseSummary.totalTax,
      },
    });
  } catch (err) { next(err); }
});

// GET /api/reports/by-item â€” item-wise sales breakdown with margin
router.get('/by-item', async (req, res, next) => {
  try {
    const { period, startDate, endDate, limit } = req.query;
    let start, end;
    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
    } else {
      const range = getDateRange(period || 'month');
      start = range.startDate; end = range.endDate;
    }
    const take = parseInt(limit) || 100;

    const result = await prisma.billItem.groupBy({
      by: ['medicineId', 'medicineName'],
      where: { bill: { createdAt: { gte: start, lte: end } } },
      _sum: { quantity: true, amount: true, cgstAmount: true, sgstAmount: true, discount: true },
      _count: { id: true },
      orderBy: { _sum: { amount: 'desc' } },
      take,
    });

    const medicineIds = result.map(r => r.medicineId).filter(Boolean);
    const medicines = await prisma.medicine.findMany({
      where: { id: { in: medicineIds } },
      select: { id: true, purchasePrice: true, category: true },
    });
    const medMap = Object.fromEntries(medicines.map(m => [m.id, m]));

    const items = result.map(r => {
      const med = medMap[r.medicineId];
      const revenue = r._sum.amount || 0;
      const cost = med ? (med.purchasePrice * (r._sum.quantity || 0)) : 0;
      const profit = revenue - cost;
      const taxAmount = (r._sum.cgstAmount || 0) + (r._sum.sgstAmount || 0);
      return {
        medicineId: r.medicineId,
        medicineName: r.medicineName,
        category: med?.category || 'â€”',
        quantity: r._sum.quantity || 0,
        revenue: parseFloat(revenue.toFixed(2)),
        cost: parseFloat(cost.toFixed(2)),
        profit: parseFloat(profit.toFixed(2)),
        margin: revenue > 0 ? parseFloat(((profit / revenue) * 100).toFixed(1)) : 0,
        taxAmount: parseFloat(taxAmount.toFixed(2)),
        discount: parseFloat((r._sum.discount || 0).toFixed(2)),
        bills: r._count.id,
      };
    });

    const totals = {
      totalItems: items.length,
      totalQty: items.reduce((s, r) => s + r.quantity, 0),
      totalRevenue: parseFloat(items.reduce((s, r) => s + r.revenue, 0).toFixed(2)),
      totalCost: parseFloat(items.reduce((s, r) => s + r.cost, 0).toFixed(2)),
      totalProfit: parseFloat(items.reduce((s, r) => s + r.profit, 0).toFixed(2)),
    };

    res.json({ success: true, data: { items, totals } });
  } catch (err) { next(err); }
});

// GET /api/reports/by-customer â€” customer-wise sales summary
router.get('/by-customer', async (req, res, next) => {
  try {
    const { period, startDate, endDate, limit } = req.query;
    let start, end;
    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
    } else {
      const range = getDateRange(period || 'month');
      start = range.startDate; end = range.endDate;
    }
    const take = parseInt(limit) || 100;

    const result = await prisma.bill.groupBy({
      by: ['customerId', 'customerName'],
      where: { createdAt: { gte: start, lte: end } },
      _sum: { netAmount: true, discountAmount: true, totalTax: true },
      _count: { id: true },
      orderBy: { _sum: { netAmount: 'desc' } },
      take,
    });

    const customerIds = result.map(r => r.customerId).filter(Boolean);
    const customers = await prisma.customer.findMany({
      where: { id: { in: customerIds } },
      select: { id: true, phone: true, currentCredit: true },
    });
    const custMap = Object.fromEntries(customers.map(c => [c.id, c]));

    const rows = result.map(r => {
      const cust = custMap[r.customerId];
      return {
        customerId: r.customerId,
        customerName: r.customerName || 'Walk-in Customer',
        phone: cust?.phone || 'â€”',
        totalBills: r._count.id,
        totalAmount: parseFloat((r._sum.netAmount || 0).toFixed(2)),
        totalDiscount: parseFloat((r._sum.discountAmount || 0).toFixed(2)),
        totalTax: parseFloat((r._sum.totalTax || 0).toFixed(2)),
        outstandingCredit: parseFloat((cust?.currentCredit || 0).toFixed(2)),
      };
    });

    const totals = {
      namedCustomers: rows.filter(r => r.customerId).length,
      walkIns: rows.filter(r => !r.customerId).length,
      totalRevenue: parseFloat(rows.reduce((s, r) => s + r.totalAmount, 0).toFixed(2)),
      totalDiscount: parseFloat(rows.reduce((s, r) => s + r.totalDiscount, 0).toFixed(2)),
      totalOutstanding: parseFloat(rows.reduce((s, r) => s + r.outstandingCredit, 0).toFixed(2)),
    };

    res.json({ success: true, data: { customers: rows, totals } });
  } catch (err) { next(err); }
});

// GET /api/reports/by-category â€” category-wise revenue breakdown
router.get('/by-category', async (req, res, next) => {
  try {
    const { period, startDate, endDate } = req.query;
    let start, end;
    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
    } else {
      const range = getDateRange(period || 'month');
      start = range.startDate; end = range.endDate;
    }

    const rows = await prisma.$queryRaw`
      SELECT m.category, 
        SUM(bi.quantity) as totalQty,
        SUM(bi.amount) as totalRevenue,
        SUM(bi.quantity * m.purchasePrice) as totalCost,
        COUNT(DISTINCT bi.billId) as totalBills
      FROM BillItem bi
      JOIN Medicine m ON bi.medicineId = m.id
      JOIN Bill b ON bi.billId = b.id
      WHERE b.createdAt BETWEEN ${start} AND ${end}
      GROUP BY m.category
      ORDER BY totalRevenue DESC
    `;

    const categories = rows.map((r) => ({
      category: r.category || 'Uncategorized',
      totalQty: Number(r.totalQty) || 0,
      totalRevenue: parseFloat(Number(r.totalRevenue || 0).toFixed(2)),
      totalCost: parseFloat(Number(r.totalCost || 0).toFixed(2)),
      totalBills: Number(r.totalBills) || 0,
      profit: parseFloat((Number(r.totalRevenue || 0) - Number(r.totalCost || 0)).toFixed(2)),
    }));

    res.json({ success: true, data: categories });
  } catch (err) { next(err); }
});

module.exports = router;
