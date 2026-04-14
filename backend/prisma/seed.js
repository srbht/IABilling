const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create admin user
  const hashedPassword = await bcrypt.hash('Admin@123', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@iabilling.com' },
    update: {},
    create: {
      name: 'System Admin',
      email: 'admin@iabilling.com',
      password: hashedPassword,
      role: 'ADMIN',
      phone: '9999999999',
    },
  });

  // Create pharmacist user
  const pharmPassword = await bcrypt.hash('Pharm@123', 12);
  await prisma.user.upsert({
    where: { email: 'pharmacist@iabilling.com' },
    update: {},
    create: {
      name: 'John Pharmacist',
      email: 'pharmacist@iabilling.com',
      password: pharmPassword,
      role: 'PHARMACIST',
      phone: '8888888888',
    },
  });

  // Default settings
  const settings = [
    { key: 'store_name', value: 'IA Medical Store', description: 'Store name' },
    { key: 'store_address', value: '123, Main Street, City - 400001', description: 'Store address' },
    { key: 'store_phone', value: '022-12345678', description: 'Store phone' },
    { key: 'store_email', value: 'store@iabilling.com', description: 'Store email' },
    { key: 'store_gstin', value: '27AABCU9603R1ZX', description: 'GSTIN' },
    { key: 'store_drug_license', value: 'MH-MUM-123456', description: 'Drug license number' },
    { key: 'store_state', value: 'Maharashtra', description: 'Shop state (place of supply default)' },
    { key: 'store_pan', value: '', description: 'PAN (optional on invoice)' },
    { key: 'store_fssai', value: '', description: 'FSSAI licence if applicable' },
    {
      key: 'bill_footer_legal',
      value: 'Medicines under Schedule H / H1: Not to be sold without a valid prescription from a Registered Medical Practitioner.',
      description: 'Legal footer on printed tax invoice',
    },
    { key: 'currency', value: 'INR', description: 'Currency' },
    { key: 'currency_symbol', value: '₹', description: 'Currency symbol' },
    { key: 'low_stock_alert_days', value: '10', description: 'Low stock threshold quantity' },
    { key: 'expiry_alert_days', value: '90', description: 'Days before expiry to alert' },
    { key: 'bill_prefix', value: 'INV', description: 'Bill number prefix' },
    { key: 'purchase_prefix', value: 'PUR', description: 'Supplier bill / purchase voucher prefix' },
    { key: 'po_prefix', value: 'PO', description: 'Purchase order number prefix' },
    { key: 'grn_prefix', value: 'GRN', description: 'Goods receipt (GRN) number prefix' },
    { key: 'tax_type', value: 'GST', description: 'Tax type (GST/VAT)' },
  ];

  for (const setting of settings) {
    await prisma.settings.upsert({
      where: { key: setting.key },
      update: {},
      create: setting,
    });
  }

  // Sample supplier
  await prisma.supplier.upsert({
    where: { id: 'sample-supplier-001' },
    update: {},
    create: {
      id: 'sample-supplier-001',
      name: 'MedPlus Distributors',
      contactPerson: 'Rajesh Kumar',
      phone: '9876543210',
      email: 'rajesh@medplus.com',
      address: '45, Industrial Area, Andheri',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400053',
      gstin: '27BBBCS1234A1Z5',
      drugLicense: 'MH-DL-098765',
    },
  });

  const supplierId = 'sample-supplier-001';

  // Sample medicines — stable SKU codes, brand, linked supplier
  const medicines = [
    {
      sku: 'MED-PARA-500',
      name: 'Paracetamol 500mg',
      brandName: 'Calpol',
      genericName: 'Acetaminophen',
      category: 'Analgesic / Antipyretic',
      manufacturer: 'Sun Pharma',
      supplierId,
      batchNumber: 'BT2024001',
      barcode: '890IAMEDPARA500',
      hsnCode: '30049099',
      unit: 'strip',
      strengthMg: 500,
      strengthUnit: 'mg',
      composition: 'Paracetamol IP 500mg',
      packSize: '10 tablets / strip',
      dosageForm: 'Tablet',
      purchasePrice: 12.5,
      sellingPrice: 18.0,
      mrp: 20.0,
      quantity: 150,
      minStockLevel: 20,
      expiryDate: new Date('2026-06-30'),
      gstRate: 12,
      cgstRate: 6,
      sgstRate: 6,
      location: 'A1-R01',
    },
    {
      sku: 'MED-AMOX-500',
      name: 'Amoxicillin 500mg',
      brandName: 'Amoxyl',
      genericName: 'Amoxicillin',
      category: 'Antibiotic',
      manufacturer: 'Cipla',
      supplierId,
      batchNumber: 'BT2024002',
      barcode: '890IAMEDAMOX500',
      hsnCode: '30041010',
      unit: 'strip',
      schedule: 'Schedule H',
      strengthMg: 500,
      strengthUnit: 'mg',
      composition: 'Amoxicillin Trihydrate IP eq. to Amoxicillin 500mg',
      packSize: '10 capsules / strip',
      dosageForm: 'Capsule',
      purchasePrice: 45.0,
      sellingPrice: 65.0,
      mrp: 72.0,
      quantity: 80,
      minStockLevel: 15,
      expiryDate: new Date('2025-12-31'),
      gstRate: 12,
      cgstRate: 6,
      sgstRate: 6,
      location: 'B2-R05',
      requiresPrescription: true,
    },
    {
      sku: 'MED-MET-500',
      name: 'Metformin 500mg',
      brandName: 'Glycomet',
      genericName: 'Metformin Hydrochloride',
      category: 'Antidiabetic',
      manufacturer: 'Dr. Reddys',
      supplierId,
      batchNumber: 'BT2024003',
      barcode: '890IAMEDMET500',
      hsnCode: '30049099',
      unit: 'strip',
      strengthMg: 500,
      strengthUnit: 'mg',
      composition: 'Metformin Hydrochloride IP 500mg',
      packSize: '10 tablets / strip',
      dosageForm: 'Tablet',
      purchasePrice: 35.0,
      sellingPrice: 52.0,
      mrp: 58.0,
      quantity: 8,
      minStockLevel: 20,
      expiryDate: new Date('2026-03-31'),
      gstRate: 12,
      cgstRate: 6,
      sgstRate: 6,
      location: 'A1-R03',
    },
    {
      sku: 'MED-ATOR-10',
      name: 'Atorvastatin 10mg',
      brandName: 'Atorva',
      genericName: 'Atorvastatin',
      category: 'Cardiac',
      manufacturer: 'Lupin',
      supplierId,
      batchNumber: 'BT2024004',
      barcode: '890IAMEDATOR10',
      hsnCode: '30049099',
      unit: 'strip',
      strengthMg: 10,
      strengthUnit: 'mg',
      composition: 'Atorvastatin Calcium IP eq. to Atorvastatin 10mg',
      packSize: '10 tablets / strip',
      dosageForm: 'Tablet',
      purchasePrice: 88.0,
      sellingPrice: 125.0,
      mrp: 140.0,
      quantity: 60,
      minStockLevel: 10,
      expiryDate: new Date('2026-09-30'),
      gstRate: 12,
      cgstRate: 6,
      sgstRate: 6,
      location: 'C1-R02',
    },
    {
      sku: 'MED-AZI-500',
      name: 'Azithromycin 500mg',
      brandName: 'Azithral',
      genericName: 'Azithromycin',
      category: 'Antibiotic',
      manufacturer: 'Mankind',
      supplierId,
      batchNumber: 'BT2024005',
      barcode: '890IAMEDAZI500',
      hsnCode: '30041010',
      schedule: 'Schedule H',
      unit: 'strip',
      strengthMg: 500,
      strengthUnit: 'mg',
      composition: 'Azithromycin IP 500mg',
      packSize: '3 tablets / strip',
      dosageForm: 'Tablet',
      purchasePrice: 55.0,
      sellingPrice: 82.0,
      mrp: 95.0,
      quantity: 5,
      minStockLevel: 10,
      expiryDate: new Date('2025-08-31'),
      gstRate: 12,
      cgstRate: 6,
      sgstRate: 6,
      location: 'B2-R08',
      requiresPrescription: true,
    },
  ];

  /** 45 demo lines + 5 originals = 50 medicines */
  const demoRows = [
    { name: 'Levocetirizine 5mg', brand: 'Xyzal', generic: 'Levocetirizine', cat: 'Antiallergic', mfg: 'Cipla', mg: 5, form: 'Tablet', hsn: '30049099', loc: 'A2-R01', rx: false },
    { name: 'Montelukast 10mg', brand: 'Montair', generic: 'Montelukast', cat: 'Respiratory', mfg: 'Cipla', mg: 10, form: 'Tablet', hsn: '30049099', loc: 'A2-R02', rx: false },
    { name: 'Amlodipine 5mg', brand: 'Amlovas', generic: 'Amlodipine', cat: 'Cardiac', mfg: 'Micro Labs', mg: 5, form: 'Tablet', hsn: '30049099', loc: 'C1-R03', rx: false },
    { name: 'Telmisartan 40mg', brand: 'Telma', generic: 'Telmisartan', cat: 'Cardiac', mfg: 'Glenmark', mg: 40, form: 'Tablet', hsn: '30049099', loc: 'C1-R04', rx: false },
    { name: 'Losartan 50mg', brand: 'Losar', generic: 'Losartan Potassium', cat: 'Cardiac', mfg: 'Torrent', mg: 50, form: 'Tablet', hsn: '30049099', loc: 'C1-R05', rx: false },
    { name: 'Rosuvastatin 10mg', brand: 'Rozavel', generic: 'Rosuvastatin', cat: 'Cardiac', mfg: 'Sun Pharma', mg: 10, form: 'Tablet', hsn: '30049099', loc: 'C1-R06', rx: false },
    { name: 'Pantoprazole 40mg', brand: 'Pan', generic: 'Pantoprazole', cat: 'Gastro', mfg: 'Alkem', mg: 40, form: 'Tablet', hsn: '30049099', loc: 'D1-R01', rx: false },
    { name: 'Omeprazole 20mg', brand: 'Omez', generic: 'Omeprazole', cat: 'Gastro', mfg: 'Dr Reddys', mg: 20, form: 'Capsule', hsn: '30049099', loc: 'D1-R02', rx: false },
    { name: 'Ranitidine 150mg', brand: 'Rantac', generic: 'Ranitidine', cat: 'Gastro', mfg: 'J B Chemicals', mg: 150, form: 'Tablet', hsn: '30049099', loc: 'D1-R03', rx: false },
    { name: 'Domperidone 10mg', brand: 'Domstal', generic: 'Domperidone', cat: 'Gastro', mfg: 'Torrent', mg: 10, form: 'Tablet', hsn: '30049099', loc: 'D1-R04', rx: false },
    { name: 'Ondansetron 4mg', brand: 'Emeset', generic: 'Ondansetron', cat: 'Gastro', mfg: 'Cipla', mg: 4, form: 'Tablet', hsn: '30049099', loc: 'D1-R05', rx: false },
    { name: 'Diclofenac 50mg', brand: 'Voveran', generic: 'Diclofenac Sodium', cat: 'Analgesic / Antipyretic', mfg: 'Novartis', mg: 50, form: 'Tablet', hsn: '30049099', loc: 'A1-R10', rx: false },
    { name: 'Aceclofenac 100mg', brand: 'Zerodol', generic: 'Aceclofenac', cat: 'Analgesic / Antipyretic', mfg: 'Ipca', mg: 100, form: 'Tablet', hsn: '30049099', loc: 'A1-R11', rx: false },
    { name: 'Ibuprofen 400mg', brand: 'Brufen', generic: 'Ibuprofen', cat: 'Analgesic / Antipyretic', mfg: 'Abbott', mg: 400, form: 'Tablet', hsn: '30049099', loc: 'A1-R12', rx: false },
    { name: 'Cefixime 200mg', brand: 'Taxim-O', generic: 'Cefixime', cat: 'Antibiotic', mfg: 'Alkem', mg: 200, form: 'Tablet', hsn: '30041010', loc: 'B2-R10', rx: true },
    { name: 'Ciprofloxacin 500mg', brand: 'Ciplox', generic: 'Ciprofloxacin', cat: 'Antibiotic', mfg: 'Cipla', mg: 500, form: 'Tablet', hsn: '30041010', loc: 'B2-R11', rx: true },
    { name: 'Doxycycline 100mg', brand: 'Doxicip', generic: 'Doxycycline', cat: 'Antibiotic', mfg: 'Cipla', mg: 100, form: 'Capsule', hsn: '30041010', loc: 'B2-R12', rx: true },
    { name: 'Metronidazole 400mg', brand: 'Flagyl', generic: 'Metronidazole', cat: 'Antibiotic', mfg: 'Abbott', mg: 400, form: 'Tablet', hsn: '30041010', loc: 'B2-R13', rx: true },
    { name: 'Amoxicillin + Clav 625mg', brand: 'Augmentin', generic: 'Amoxiclav', cat: 'Antibiotic', mfg: 'GSK', mg: 625, form: 'Tablet', hsn: '30041010', loc: 'B2-R14', rx: true },
    { name: 'Fluconazole 150mg', brand: 'Forcan', generic: 'Fluconazole', cat: 'Antifungal', mfg: 'Cipla', mg: 150, form: 'Tablet', hsn: '30049099', loc: 'B3-R01', rx: true },
    { name: 'Clotrimazole Cream 1%', brand: 'Candid', generic: 'Clotrimazole', cat: 'Dermatology', mfg: 'Glenmark', mg: null, form: 'Cream', hsn: '30049099', loc: 'E1-R01', rx: false },
    { name: 'Fusidic Acid Cream', brand: 'Fucidin', generic: 'Fusidic Acid', cat: 'Dermatology', mfg: 'Sun Pharma', mg: null, form: 'Cream', hsn: '30049099', loc: 'E1-R02', rx: false },
    { name: 'Multivitamin Capsule', brand: 'Becosules', generic: 'Multivitamin', cat: 'Nutritional', mfg: 'Pfizer', mg: null, form: 'Capsule', hsn: '30049099', loc: 'F1-R01', rx: false },
    { name: 'Calcium + Vitamin D3', brand: 'Shelcal', generic: 'Calcium Carbonate + D3', cat: 'Nutritional', mfg: 'Torrent', mg: null, form: 'Tablet', hsn: '30049099', loc: 'F1-R02', rx: false },
    { name: 'Iron + Folic Acid', brand: 'Autrin', generic: 'Ferrous Fumarate + FA', cat: 'Nutritional', mfg: 'Pfizer', mg: null, form: 'Capsule', hsn: '30049099', loc: 'F1-R03', rx: false },
    { name: 'ORS Powder Lemon', brand: 'Electral', generic: 'Oral Rehydration Salts', cat: 'Gastro', mfg: 'FDC', mg: null, form: 'Powder', hsn: '30049099', loc: 'F2-R01', rx: false },
    { name: 'ORS Liquid 200ml', brand: 'Electral', generic: 'ORS Solution', cat: 'Gastro', mfg: 'FDC', mg: null, form: 'Syrup', hsn: '30049099', loc: 'F2-R02', rx: false },
    { name: 'Glimepiride 2mg', brand: 'Amaryl', generic: 'Glimepiride', cat: 'Antidiabetic', mfg: 'Sanofi', mg: 2, form: 'Tablet', hsn: '30049099', loc: 'A3-R01', rx: false },
    { name: 'Gliclazide 80mg', brand: 'Diamicron', generic: 'Gliclazide', cat: 'Antidiabetic', mfg: 'Servier', mg: 80, form: 'Tablet', hsn: '30049099', loc: 'A3-R02', rx: false },
    { name: 'Sitagliptin 50mg', brand: 'Januvia', generic: 'Sitagliptin', cat: 'Antidiabetic', mfg: 'MSD', mg: 50, form: 'Tablet', hsn: '30049099', loc: 'A3-R03', rx: true },
    { name: 'Levothyroxine 50mcg', brand: 'Thyronorm', generic: 'Levothyroxine', cat: 'Hormone', mfg: 'Abbott', mg: 50, strengthUnit: 'mcg', form: 'Tablet', hsn: '30049099', loc: 'A4-R01', rx: true },
    { name: 'Propranolol 40mg', brand: 'Inderal', generic: 'Propranolol', cat: 'Cardiac', mfg: 'Abbott', mg: 40, form: 'Tablet', hsn: '30049099', loc: 'C2-R01', rx: false },
    { name: 'Atenolol 50mg', brand: 'Tenormin', generic: 'Atenolol', cat: 'Cardiac', mfg: 'Abbott', mg: 50, form: 'Tablet', hsn: '30049099', loc: 'C2-R02', rx: false },
    { name: 'Furosemide 40mg', brand: 'Lasix', generic: 'Furosemide', cat: 'Cardiac', mfg: 'Sanofi', mg: 40, form: 'Tablet', hsn: '30049099', loc: 'C2-R03', rx: true },
    { name: 'Spironolactone 25mg', brand: 'Aldactone', generic: 'Spironolactone', cat: 'Cardiac', mfg: 'Pfizer', mg: 25, form: 'Tablet', hsn: '30049099', loc: 'C2-R04', rx: true },
    { name: 'Hydrochlorothiazide 12.5mg', brand: 'Hydride', generic: 'HCTZ', cat: 'Cardiac', mfg: 'Micro Labs', mg: 12.5, form: 'Tablet', hsn: '30049099', loc: 'C2-R05', rx: false },
    { name: 'Betahistine 16mg', brand: 'Vertin', generic: 'Betahistine', cat: 'Neurology', mfg: 'Abbott', mg: 16, form: 'Tablet', hsn: '30049099', loc: 'A5-R01', rx: false },
    { name: 'Albendazole 400mg', brand: 'Zentel', generic: 'Albendazole', cat: 'Anthelmintic', mfg: 'GSK', mg: 400, form: 'Tablet', hsn: '30049099', loc: 'B4-R01', rx: false },
    { name: 'Mebendazole 100mg', brand: 'Mebex', generic: 'Mebendazole', cat: 'Anthelmintic', mfg: 'Cipla', mg: 100, form: 'Tablet', hsn: '30049099', loc: 'B4-R02', rx: false },
    { name: 'Salbutamol 4mg', brand: 'Asthalin', generic: 'Salbutamol', cat: 'Respiratory', mfg: 'Cipla', mg: 4, form: 'Tablet', hsn: '30049099', loc: 'A2-R10', rx: false },
    { name: 'Budesonide Nasal Spray', brand: 'Rhinocort', generic: 'Budesonide', cat: 'Respiratory', mfg: 'AstraZeneca', mg: null, form: 'Spray', hsn: '30049099', loc: 'A2-R11', rx: false },
    { name: 'Paracetamol 650mg', brand: 'Dolo 650', generic: 'Paracetamol', cat: 'Analgesic / Antipyretic', mfg: 'Micro Labs', mg: 650, form: 'Tablet', hsn: '30049099', loc: 'A1-R20', rx: false },
    { name: 'Vitamin C 500mg', brand: 'Celin', generic: 'Ascorbic Acid', cat: 'Nutritional', mfg: 'Glaxo', mg: 500, form: 'Tablet', hsn: '30049099', loc: 'F1-R10', rx: false },
    { name: 'Zinc Tablets 20mg', brand: 'Zincovit', generic: 'Zinc Sulphate', cat: 'Nutritional', mfg: 'Apex', mg: 20, form: 'Tablet', hsn: '30049099', loc: 'F1-R11', rx: false },
    { name: 'Loperamide 2mg', brand: 'Imodium', generic: 'Loperamide', cat: 'Gastro', mfg: 'Janssen', mg: 2, form: 'Capsule', hsn: '30049099', loc: 'D2-R01', rx: false },
  ];

  const monthsAhead = [2, 4, 6, 8, 10, 12, 14, 16, 18];
  for (let i = 0; i < demoRows.length; i += 1) {
    const r = demoRows[i];
    const idx = i + 1;
    const sku = `IA-DEMO-${String(idx).padStart(3, '0')}`;
    const purchase = Math.round((8 + (i % 40) + (r.mg != null ? Number(r.mg) % 30 : 15)) * 10) / 10;
    const sellingPrice = Math.round(purchase * 1.38 * 10) / 10;
    const mrp = Math.round(sellingPrice * 1.15 * 10) / 10;
    const qty = 15 + ((i * 7) % 120);
    const minStock = 8 + (i % 15);
    const mo = monthsAhead[i % monthsAhead.length];
    const exp = new Date();
    exp.setMonth(exp.getMonth() + mo);
    const gst = 12;
    const su = r.strengthUnit || 'mg';
    const med = {
      sku,
      name: r.name,
      brandName: r.brand,
      genericName: r.generic,
      category: r.cat,
      manufacturer: r.mfg,
      supplierId,
      batchNumber: `BD26${String(idx).padStart(4, '0')}`,
      barcode: `890IA${sku.replace(/-/g, '')}`,
      hsnCode: r.hsn,
      unit: ['Syrup', 'Spray', 'Powder'].includes(r.form) ? 'bottle' : 'strip',
      schedule: r.rx ? 'Schedule H' : null,
      strengthMg: r.mg != null ? r.mg : null,
      strengthUnit: r.mg != null ? su : 'mg',
      strengthLabel: null,
      composition: r.generic,
      packSize: ['Syrup', 'Spray'].includes(r.form) ? '1 unit' : r.form === 'Powder' ? '1 sachet' : '10 tablets / strip',
      dosageForm: r.form,
      purchasePrice: purchase,
      sellingPrice,
      mrp,
      quantity: qty,
      minStockLevel: minStock,
      expiryDate: exp,
      gstRate: gst,
      cgstRate: gst / 2,
      sgstRate: gst / 2,
      location: r.loc,
      requiresPrescription: r.rx,
    };
    medicines.push(med);
  }

  for (const med of medicines) {
    await prisma.medicine.upsert({
      where: { sku: med.sku },
      update: med,
      create: med,
    });
  }

  console.log(`📦 Seeded ${medicines.length} medicines.`);

  // Sample customer
  await prisma.customer.upsert({
    where: { phone: '9123456789' },
    update: {
      address: '12, Rose Garden, Andheri West',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400058',
    },
    create: {
      name: 'Priya Sharma',
      phone: '9123456789',
      email: 'priya@email.com',
      address: '12, Rose Garden, Andheri West',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400058',
      creditLimit: 2000,
    },
  });

  console.log('✅ Seed completed successfully');
  console.log('\nDefault Login Credentials:');
  console.log('Admin:       admin@iabilling.com     / Admin@123');
  console.log('Pharmacist:  pharmacist@iabilling.com / Pharm@123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
