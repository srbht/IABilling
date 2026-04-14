const express = require('express');
const fs = require('fs');
const path = require('path');
const { body, validationResult } = require('express-validator');
const PDFDocument = require('pdfkit');
const prisma = require('../utils/prisma');
const { authenticate, authorize, auditLog } = require('../middleware/auth');
const { getPagination, paginationMeta, generateNumber } = require('../utils/helpers');
const { AppError } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authenticate);

function medStrengthLine(med) {
  if (med.strengthLabel) return med.strengthLabel;
  if (med.strengthMg != null && med.strengthMg !== undefined) {
    return `${med.strengthMg} ${med.strengthUnit || 'mg'}`;
  }
  return null;
}

function resolveLogoPath(storeLogoUrl) {
  if (!storeLogoUrl || typeof storeLogoUrl !== 'string') return null;
  const clean = storeLogoUrl.replace(/^\/+/, '');
  const full = path.join(__dirname, '../..', clean);
  return fs.existsSync(full) ? full : null;
}

// GET /api/billing
router.get('/', async (req, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const { search, startDate, endDate, paymentMode, paymentStatus } = req.query;

    const where = {};
    if (search) {
      where.OR = [
        { billNumber: { contains: search } },
        { customerName: { contains: search } },
        { customerPhone: { contains: search } },
        { patientName: { contains: search } },
        { referredByDoctor: { contains: search } },
        { rxReference: { contains: search } },
      ];
    }
    if (startDate && endDate) {
      where.createdAt = { gte: new Date(startDate), lte: new Date(endDate) };
    }
    if (paymentMode) where.paymentMode = paymentMode;
    if (paymentStatus) where.paymentStatus = paymentStatus;

    const [bills, total] = await Promise.all([
      prisma.bill.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: { select: { name: true } },
          customer: { select: { name: true, phone: true } },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.bill.count({ where }),
    ]);

    res.json({ success: true, data: bills, meta: paginationMeta(total, page, limit) });
  } catch (err) { next(err); }
});

// GET /api/billing/summary
router.get('/summary', async (req, res, next) => {
  try {
    const date = req.query.date ? new Date(req.query.date) : new Date();
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const end = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);

    const bills = await prisma.bill.findMany({
      where: { createdAt: { gte: start, lte: end } },
    });

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

    res.json({ success: true, data: summary });
  } catch (err) { next(err); }
});

// GET /api/billing/:id/pdf (before /:id — avoids treating "pdf" as bill id)
router.get('/:id/pdf', async (req, res, next) => {
  try {
    const bill = await prisma.bill.findUnique({
      where: { id: req.params.id },
      include: { items: true, customer: true, user: { select: { name: true } } },
    });
    if (!bill) throw new AppError('Bill not found', 404);

    const settings = await prisma.settings.findMany();
    const s = Object.fromEntries(settings.map(x => [x.key, x.value]));

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="invoice-${bill.billNumber}.pdf"`);
    doc.pipe(res);

    // Use ASCII-safe currency prefix — PDFKit's built-in Helvetica (WinAnsi) cannot render ₹ (U+20B9)
    const sym = 'Rs.';
    const headerTop = doc.y;
    const logoFile = resolveLogoPath(s.store_logo_url);

    if (logoFile) {
      try {
        doc.image(logoFile, 40, headerTop, { width: 64 });
      } catch {
        /* ignore bad image */
      }
    }

    const textLeft = logoFile ? 120 : 40;
    const textWidth = logoFile ? 435 : 515;
    doc.fontSize(16).font('Helvetica-Bold').text(s.store_name || 'Medical Store', textLeft, headerTop, { width: textWidth });
    let hy = headerTop + 20;
    doc.fontSize(8).font('Helvetica').text(s.store_address || '', textLeft, hy, { width: textWidth });
    hy = doc.y;
    doc.text(`Phone: ${s.store_phone || '—'}  ·  Email: ${s.store_email || '—'}`, textLeft, hy, { width: textWidth });
    hy = doc.y;
    const regLine = [
      s.store_gstin ? `GSTIN: ${s.store_gstin}` : null,
      s.store_drug_license ? `Drug Lic.: ${s.store_drug_license}` : null,
      s.store_pan ? `PAN: ${s.store_pan}` : null,
      s.store_fssai ? `FSSAI: ${s.store_fssai}` : null,
    ].filter(Boolean).join('  ·  ');
    if (regLine) doc.text(regLine, textLeft, hy, { width: textWidth });
    hy = doc.y;
    if (s.store_state) doc.text(`State: ${s.store_state}`, textLeft, hy, { width: textWidth });
    doc.y = Math.max(headerTop + 68, doc.y);
    doc.moveDown(0.4);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
    doc.moveDown(0.35);

    doc.fontSize(12).font('Helvetica-Bold').text('TAX INVOICE (Retail — India)', { align: 'center' });
    doc.moveDown(0.35);

    const infoY = doc.y;
    doc.fontSize(9).font('Helvetica');
    doc.text(`Invoice No: ${bill.billNumber}`, 40, infoY);
    doc.text(`Date: ${new Date(bill.createdAt).toLocaleDateString('en-IN')}`, 300, infoY);
    doc.text(`Time: ${new Date(bill.createdAt).toLocaleTimeString('en-IN')}`, 420, infoY);
    doc.text(`Cashier: ${bill.user?.name || '—'}`, 40, infoY + 12);

    const billAddr = bill.customerAddress || bill.customer?.address;
    const billCity = bill.customerCity || bill.customer?.city;
    const billPin = bill.customerPincode || bill.customer?.pincode;
    const billStateCust = bill.customerState || bill.customer?.state;
    const placeOfSupply = billStateCust || s.store_state || '—';

    doc.moveDown(1.2);
    if (bill.patientName || bill.patientAge || bill.referredByDoctor || bill.rxReference || bill.doctorRegNo) {
      doc.font('Helvetica-Bold').text('Patient & prescription (India)', 40);
      doc.font('Helvetica').fontSize(8);
      if (bill.patientName) doc.text(`Patient: ${bill.patientName}${bill.patientAge ? `  ·  Age: ${bill.patientAge}` : ''}`, 40);
      else if (bill.patientAge) doc.text(`Patient age: ${bill.patientAge}`, 40);
      if (bill.referredByDoctor) doc.text(`Referred by: Dr. ${bill.referredByDoctor}${bill.doctorRegNo ? `  (Reg. ${bill.doctorRegNo})` : ''}`, 40);
      if (bill.rxReference) doc.text(`Rx / Prescription ref.: ${bill.rxReference}`, 40);
      doc.moveDown(0.35);
    }

    if (bill.customerName || billAddr || billCity) {
      doc.font('Helvetica-Bold').fontSize(9).text('Bill to:', 40);
      doc.font('Helvetica').fontSize(8);
      if (bill.customerName) doc.text(`Customer: ${bill.customerName}`, 40);
      if (bill.customerPhone) doc.text(`Mobile: ${bill.customerPhone}`, 40);
      if (billAddr) doc.text(billAddr, 40, doc.y, { width: 400 });
      const cityLine = [billCity, billStateCust, billPin].filter(Boolean).join(', ');
      if (cityLine) doc.text(cityLine, 40);
    }

    doc.font('Helvetica').fontSize(8).text(`Place of supply (State): ${placeOfSupply}`, 40);
    doc.moveDown(0.45);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
    doc.moveDown(0.3);

    const c0 = 40;
    const c1 = 248;
    const c2 = 298;
    const c3 = 338;
    const c4 = 378;
    const c5 = 418;
    const c6 = 448;
    const c7 = 488;
    const headers = ['Item', 'Batch', 'Exp', 'MRP', 'Rate', 'Disc%', 'Qty', 'Amount'];

    doc.font('Helvetica-Bold').fontSize(7);
    const tableHeaderY = doc.y;
    doc.text(headers[0], c0, tableHeaderY);
    doc.text(headers[1], c1, tableHeaderY);
    doc.text(headers[2], c2, tableHeaderY);
    doc.text(headers[3], c3, tableHeaderY);
    doc.text(headers[4], c4, tableHeaderY);
    doc.text(headers[5], c5, tableHeaderY);
    doc.text(headers[6], c6, tableHeaderY);
    doc.text(headers[7], c7, tableHeaderY);
    doc.moveDown(0.2);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
    doc.moveDown(0.2);

    for (const item of bill.items) {
      const y0 = doc.y;

      const genLine = item.itemGeneric ? `Gen: ${item.itemGeneric}` : '';
      const metaLine = [
        item.itemSku ? `SKU ${item.itemSku}` : null,
        item.itemHsn ? `HSN ${item.itemHsn}` : null,
        item.itemSchedule || null,
        item.itemStrength || null,
        item.itemPack || null,
        item.itemRackLocation ? `Rack ${item.itemRackLocation}` : null,
      ].filter(Boolean).join(' · ');

      // Pre-calculate actual text heights (accounts for wrapping) to prevent row overlap
      doc.font('Helvetica-Bold').fontSize(7);
      const nameH = doc.heightOfString(item.medicineName, { width: 200 });
      doc.font('Helvetica').fontSize(6);
      const genH = genLine ? doc.heightOfString(genLine, { width: 200 }) + 1 : 0;
      const metaH = metaLine ? doc.heightOfString(metaLine, { width: 200 }) + 1 : 0;
      const rowHeight = Math.max(nameH + genH + metaH + 4, 14);

      // Render item name + metadata in item column
      doc.font('Helvetica-Bold').fontSize(7).text(item.medicineName, c0, y0, { width: 200 });
      let yMeta = y0 + nameH + 1;
      if (genLine) {
        doc.font('Helvetica').fontSize(6).text(genLine, c0, yMeta, { width: 200 });
        yMeta += genH;
      }
      if (metaLine) {
        doc.font('Helvetica').fontSize(6).text(metaLine, c0, yMeta, { width: 200 });
      }

      // Render column cells — all anchored at y0 so they don't shift row height
      const exp = new Date(item.expiryDate).toLocaleDateString('en-IN', { month: '2-digit', year: '2-digit' });
      doc.font('Helvetica').fontSize(7);
      doc.text(item.batchNumber, c1, y0, { lineBreak: false });
      doc.text(exp, c2, y0, { lineBreak: false });
      doc.text(`${sym}${item.mrp.toFixed(2)}`, c3, y0, { lineBreak: false });
      doc.text(`${sym}${item.sellingPrice.toFixed(2)}`, c4, y0, { lineBreak: false });
      doc.text(`${item.discount}%`, c5, y0, { lineBreak: false });
      doc.text(String(item.quantity), c6, y0, { lineBreak: false });
      doc.text(`${sym}${item.amount.toFixed(2)}`, c7, y0, { lineBreak: false });

      // Advance past the full row height
      doc.y = y0 + rowHeight;
      doc.moveDown(0.1);
    }

    doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
    doc.moveDown(0.35);

    const hsnMap = new Map();
    for (const item of bill.items) {
      const code = item.itemHsn || '—';
      if (!hsnMap.has(code)) hsnMap.set(code, { taxable: 0, cgst: 0, sgst: 0 });
      const row = hsnMap.get(code);
      const lineTaxable = item.amount - item.cgstAmount - item.sgstAmount;
      row.taxable += lineTaxable;
      row.cgst += item.cgstAmount;
      row.sgst += item.sgstAmount;
    }
    if (hsnMap.size > 0) {
      doc.font('Helvetica-Bold').fontSize(8).text('HSN/SAC summary (GST)', 40);
      doc.moveDown(0.2);
      doc.font('Helvetica-Bold').fontSize(7);
      const hx0 = 40;
      const hx1 = 200;
      const hx2 = 300;
      const hx3 = 380;
      const hx4 = 460;
      const hhy = doc.y;
      doc.text('HSN', hx0, hhy);
      doc.text('Taxable', hx1, hhy, { width: 70, align: 'right' });
      doc.text('CGST', hx2, hhy, { width: 60, align: 'right' });
      doc.text('SGST', hx3, hhy, { width: 60, align: 'right' });
      doc.text('Total', hx4, hhy, { width: 60, align: 'right' });
      doc.moveDown(0.15);
      doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
      doc.font('Helvetica').fontSize(7);
      for (const [code, row] of hsnMap) {
        const yy = doc.y;
        const tot = row.taxable + row.cgst + row.sgst;
        doc.text(code, hx0, yy);
        doc.text(`${sym}${row.taxable.toFixed(2)}`, hx1, yy, { width: 70, align: 'right' });
        doc.text(`${sym}${row.cgst.toFixed(2)}`, hx2, yy, { width: 60, align: 'right' });
        doc.text(`${sym}${row.sgst.toFixed(2)}`, hx3, yy, { width: 60, align: 'right' });
        doc.text(`${sym}${tot.toFixed(2)}`, hx4, yy, { width: 60, align: 'right' });
        doc.moveDown(0.35);
      }
      doc.moveDown(0.2);
    }

    doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
    doc.moveDown(0.3);

    const totals = [
      ['Subtotal:', `${sym}${bill.subtotal.toFixed(2)}`],
      bill.discountAmount > 0 ? [`Discount:`, `-${sym}${bill.discountAmount.toFixed(2)}`] : null,
      ['CGST:', `${sym}${bill.cgstAmount.toFixed(2)}`],
      ['SGST:', `${sym}${bill.sgstAmount.toFixed(2)}`],
      bill.roundOff !== 0 ? ['Round Off:', `${sym}${bill.roundOff.toFixed(2)}`] : null,
    ].filter(Boolean);

    doc.fontSize(9);
    for (const [label, val] of totals) {
      const lineY = doc.y;
      doc.text(label, 380, lineY, { width: 120 });
      doc.text(val, 500, lineY, { width: 55, align: 'right' });
      doc.moveDown(0.4);
    }

    doc.font('Helvetica-Bold').fontSize(11);
    const totalY = doc.y;
    doc.text('TOTAL:', 380, totalY);
    doc.text(`${sym}${bill.netAmount.toFixed(2)}`, 500, totalY, { width: 55, align: 'right' });
    doc.moveDown(0.4);

    doc.font('Helvetica').fontSize(9);
    doc.text(`Payment: ${bill.paymentMode} | Paid: ${sym}${bill.amountPaid.toFixed(2)}`, 380);
    if (bill.amountDue > 0) doc.text(`Due: ${sym}${bill.amountDue.toFixed(2)}`, 380);

    doc.moveDown(0.8);
    const schedItems = bill.items.filter((i) => i.itemSchedule);
    if (schedItems.length > 0) {
      doc.font('Helvetica-Bold').fontSize(7).text('Scheduled medicines on this bill:', 40);
      doc.font('Helvetica').fontSize(7);
      const names = [...new Set(schedItems.map((i) => `${i.medicineName} (${i.itemSchedule})`))];
      doc.text(names.join('; '), 40, doc.y, { width: 515, align: 'left' });
      doc.moveDown(0.35);
    }

    const legal =
      s.bill_footer_legal
      || 'Medicines under Schedule H / H1: Not to be sold without a valid prescription from a Registered Medical Practitioner.';
    doc.font('Helvetica').fontSize(7).text(legal, 40, doc.y, { width: 515, align: 'left' });
    doc.moveDown(0.35);

    if (bill.notes) {
      doc.font('Helvetica-Bold').fontSize(7).text('Remarks:', 40);
      doc.font('Helvetica').fontSize(7).text(bill.notes, 40, doc.y, { width: 515 });
      doc.moveDown(0.35);
    }

    doc.fontSize(8).text('Thank you for your purchase!', { align: 'center' });
    doc.text('* Computer generated tax invoice *', { align: 'center' });

    doc.end();
  } catch (err) { next(err); }
});

// GET /api/billing/:id
router.get('/:id', async (req, res, next) => {
  try {
    const bill = await prisma.bill.findUnique({
      where: { id: req.params.id },
      include: {
        items: true,
        user: { select: { name: true } },
        customer: true,
      },
    });
    if (!bill) throw new AppError('Bill not found', 404);
    res.json({ success: true, data: bill });
  } catch (err) { next(err); }
});

// POST /api/billing
router.post('/', [
  body('items').isArray({ min: 1 }),
  body('items.*.medicineId').notEmpty(),
  body('items.*.quantity').isInt({ min: 1 }),
  body('paymentMode').isIn(['CASH', 'UPI', 'CARD', 'CREDIT']),
  body('amountPaid').isFloat({ min: 0 }),
], auditLog('CREATE', 'Bill'), async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const {
      items, customerId, customerName, customerPhone,
      customerAddress, customerCity, customerPincode, customerState,
      patientName, patientAge, referredByDoctor, doctorRegNo, rxReference,
      paymentMode, amountPaid,
      discountType, discountValue, notes, prescriptionUrl,
    } = req.body;

    const trim = (v) => (v != null && String(v).trim() !== '' ? String(v).trim() : null);

    if (paymentMode === 'CREDIT' && !customerId) {
      throw new AppError('Credit sale requires selecting a saved customer from the list', 400);
    }

    let snapAddress = (customerAddress && String(customerAddress).trim()) || null;
    let snapCity = (customerCity && String(customerCity).trim()) || null;
    let snapPincode = (customerPincode && String(customerPincode).trim()) || null;
    let snapState = trim(customerState);
    if (customerId && !snapAddress && !snapCity) {
      const cust = await prisma.customer.findUnique({ where: { id: customerId } });
      if (cust) {
        snapAddress = cust.address || null;
        snapCity = cust.city || null;
        snapPincode = cust.pincode || null;
        if (!snapState) snapState = cust.state || null;
      }
    }

    const medicineIds = items.map(i => i.medicineId);
    const medicines = await prisma.medicine.findMany({
      where: { id: { in: medicineIds }, isActive: true },
    });

    const medMap = new Map(medicines.map(m => [m.id, m]));

    for (const item of items) {
      const med = medMap.get(item.medicineId);
      if (!med) throw new AppError(`Medicine not found: ${item.medicineId}`, 400);
      if (med.quantity < item.quantity) {
        throw new AppError(`Insufficient stock for ${med.name}. Available: ${med.quantity}`, 400);
      }
    }

    let subtotal = 0;
    const billItems = [];

    for (const item of items) {
      const med = medMap.get(item.medicineId);
      let lineRate = med.sellingPrice;
      if (item.sellingPrice != null && item.sellingPrice !== '') {
        const r = parseFloat(item.sellingPrice);
        if (!Number.isFinite(r) || r <= 0) {
          throw new AppError(`Invalid rate for ${med.name}`, 400);
        }
        if (r > med.mrp * 1.05 + 0.01) {
          throw new AppError(`Rate for ${med.name} cannot exceed MRP by more than 5%`, 400);
        }
        lineRate = r;
      }
      const itemDiscount = item.discount != null ? item.discount : (med.defaultDiscountPct || 0);
      // Use per-line GST override if sent from frontend (e.g. GST-exempt line), else use medicine master
      const cgstRateUsed = (item.cgstRate != null && item.cgstRate !== '') ? parseFloat(item.cgstRate) : med.cgstRate;
      const sgstRateUsed = (item.sgstRate != null && item.sgstRate !== '') ? parseFloat(item.sgstRate) : med.sgstRate;

      const baseAmount = item.quantity * lineRate;
      const discountAmt = (baseAmount * itemDiscount) / 100;
      const taxableAmount = baseAmount - discountAmt;
      const cgstAmount = parseFloat(((taxableAmount * cgstRateUsed) / 100).toFixed(2));
      const sgstAmount = parseFloat(((taxableAmount * sgstRateUsed) / 100).toFixed(2));
      const amount = taxableAmount + cgstAmount + sgstAmount;

      subtotal += amount;
      const strLine = medStrengthLine(med);
      billItems.push({
        medicineId: med.id,
        medicineName: med.name,
        itemSku: med.sku || null,
        itemHsn: med.hsnCode || null,
        itemStrength: strLine,
        itemPack: med.packSize || null,
        itemGeneric: med.genericName || null,
        itemRackLocation: med.location || null,
        itemSchedule: med.schedule || null,
        batchNumber: med.batchNumber,
        expiryDate: med.expiryDate,
        quantity: item.quantity,
        unit: med.unit,
        mrp: med.mrp,
        sellingPrice: lineRate,
        discount: itemDiscount,
        cgstRate: cgstRateUsed,
        sgstRate: sgstRateUsed,
        cgstAmount,
        sgstAmount,
        amount: parseFloat(amount.toFixed(2)),
      });
    }

    let discountAmount = 0;
    if (discountType === 'percentage' && discountValue > 0) {
      discountAmount = parseFloat(((subtotal * discountValue) / 100).toFixed(2));
    } else if (discountType === 'flat' && discountValue > 0) {
      discountAmount = parseFloat(Number(discountValue).toFixed(2));
    }

    const taxableAmount = subtotal - discountAmount;
    const cgstAmount = parseFloat(billItems.reduce((s, i) => s + i.cgstAmount, 0).toFixed(2));
    const sgstAmount = parseFloat(billItems.reduce((s, i) => s + i.sgstAmount, 0).toFixed(2));
    const totalTax = cgstAmount + sgstAmount;
    const totalAmount = taxableAmount;
    const roundOff = parseFloat((Math.round(totalAmount) - totalAmount).toFixed(2));
    const netAmount = parseFloat((totalAmount + roundOff).toFixed(2));
    const amountDue = parseFloat(Math.max(0, netAmount - amountPaid).toFixed(2));
    const paymentStatus = amountDue <= 0 ? 'PAID' : amountPaid > 0 ? 'PARTIAL' : 'PENDING';

    // Credit limit check — ensure customer has enough available credit
    if (paymentMode === 'CREDIT' && customerId) {
      const cust = await prisma.customer.findUnique({ where: { id: customerId } });
      if (!cust) throw new AppError('Customer not found', 404);
      const available = parseFloat((cust.creditLimit - cust.currentCredit).toFixed(2));
      if (netAmount > available + 0.01) {
        throw new AppError(
          `Insufficient credit limit. Available: Rs.${available.toFixed(2)}, Bill total: Rs.${netAmount.toFixed(2)}`,
          400
        );
      }
    }

    const billNumber = await generateNumber('bill_prefix', 'INV');

    const bill = await prisma.$transaction(async (tx) => {
      const newBill = await tx.bill.create({
        data: {
          billNumber,
          customerId: customerId || null,
          customerName: customerName || null,
          customerPhone: customerPhone || null,
          customerAddress: snapAddress,
          customerCity: snapCity,
          customerPincode: snapPincode,
          customerState: snapState,
          patientName: trim(patientName),
          patientAge: trim(patientAge),
          referredByDoctor: trim(referredByDoctor),
          doctorRegNo: trim(doctorRegNo),
          rxReference: trim(rxReference),
          userId: req.user.id,
          subtotal: parseFloat(subtotal.toFixed(2)),
          discountType: discountType || null,
          discountValue: discountValue || 0,
          discountAmount,
          taxableAmount: parseFloat(taxableAmount.toFixed(2)),
          cgstAmount,
          sgstAmount,
          totalTax,
          totalAmount: parseFloat(totalAmount.toFixed(2)),
          roundOff,
          netAmount,
          paymentMode,
          paymentStatus,
          amountPaid: parseFloat(Number(amountPaid).toFixed(2)),
          amountDue,
          notes: notes || null,
          prescriptionUrl: prescriptionUrl || null,
          items: { create: billItems },
        },
        include: { items: true },
      });

      for (const item of items) {
        const updated = await tx.medicine.updateMany({
          where: { id: item.medicineId, quantity: { gte: item.quantity } },
          data: { quantity: { decrement: item.quantity } },
        });
        if (updated.count !== 1) {
          throw new AppError('Insufficient stock (another sale may have used this batch). Refresh and try again.', 400);
        }
      }

      if (paymentMode === 'CREDIT' && customerId) {
        await tx.customer.update({
          where: { id: customerId },
          data: { currentCredit: { increment: amountDue } },
        });
      }

      return newBill;
    });

    res.status(201).json({ success: true, message: 'Bill created successfully', data: bill });
  } catch (err) { next(err); }
});

// PATCH /api/billing/:id/payment
router.patch('/:id/payment', authorize('ADMIN', 'ACCOUNTANT'), auditLog('PAYMENT', 'Bill'), async (req, res, next) => {
  try {
    const incoming = parseFloat(req.body.amountPaid);
    if (!Number.isFinite(incoming) || incoming <= 0) {
      throw new AppError('Amount must be a positive number', 400);
    }

    const bill = await prisma.bill.findUnique({ where: { id: req.params.id } });
    if (!bill) throw new AppError('Bill not found', 404);
    if (bill.amountDue <= 0) throw new AppError('This bill is already fully paid', 400);

    const prevAmountDue = bill.amountDue;
    const totalPaid = parseFloat((bill.amountPaid + incoming).toFixed(2));
    const newAmountDue = parseFloat(Math.max(0, bill.netAmount - totalPaid).toFixed(2));
    const amountCleared = parseFloat((prevAmountDue - newAmountDue).toFixed(2));
    const paymentStatus = newAmountDue <= 0 ? 'PAID' : 'PARTIAL';

    const updated = await prisma.$transaction(async (tx) => {
      const updatedBill = await tx.bill.update({
        where: { id: req.params.id },
        data: { amountPaid: totalPaid, amountDue: newAmountDue, paymentStatus },
      });

      // Reduce customer's outstanding credit balance by the amount just cleared
      if (bill.paymentMode === 'CREDIT' && bill.customerId && amountCleared > 0) {
        await tx.customer.update({
          where: { id: bill.customerId },
          data: { currentCredit: { decrement: amountCleared } },
        });
      }

      return updatedBill;
    });

    res.json({ success: true, message: 'Payment recorded successfully', data: updated });
  } catch (err) { next(err); }
});

module.exports = router;
