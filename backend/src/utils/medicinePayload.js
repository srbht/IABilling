const { Prisma } = require('@prisma/client');

const KEYS = new Set([
  'sku', 'name', 'brandName', 'genericName', 'category', 'manufacturer',
  'batchNumber', 'barcode', 'hsnCode', 'schedule', 'unit',
  'strengthMg', 'strengthUnit', 'strengthLabel', 'composition', 'packSize', 'dosageForm',
  'purchasePrice', 'sellingPrice', 'mrp', 'defaultDiscountPct', 'taxInclusive',
  'quantity', 'minStockLevel', 'expiryDate', 'manufactureDate',
  'gstRate', 'cgstRate', 'sgstRate',
  'requiresPrescription', 'notes', 'substituteMedicineIds', 'supplierId',
  'lastPurchaseDate', 'isActive', 'location', 'description',
]);

function has(raw, key) {
  return Object.prototype.hasOwnProperty.call(raw, key);
}

/**
 * Prisma-safe Medicine input — strips unknown keys (e.g. substituteIds from forms).
 * Use Prisma.JsonNull to clear JSON substitute list in MySQL.
 */
function normalizeMedicinePayload(raw) {
  if (!raw || typeof raw !== 'object') return {};

  const out = {};

  for (const key of KEYS) {
    if (!has(raw, key)) continue;
    const v = raw[key];

    switch (key) {
      case 'sku':
        out[key] = v === '' || v == null ? null : String(v).trim().slice(0, 64);
        break;
      case 'barcode':
        out[key] = v === '' || v == null ? null : String(v).trim().slice(0, 100);
        break;
      case 'name':
      case 'category':
      case 'batchNumber':
      case 'unit':
        out[key] = String(v ?? '').trim();
        break;
      case 'brandName':
      case 'genericName':
      case 'manufacturer':
      case 'hsnCode':
      case 'schedule':
      case 'strengthUnit':
      case 'strengthLabel':
      case 'composition':
      case 'packSize':
      case 'dosageForm':
      case 'location':
      case 'description':
      case 'notes':
        out[key] = v === '' || v == null ? null : String(v).trim();
        break;
      case 'supplierId':
        out[key] = v === '' || v == null ? null : String(v).trim();
        break;
      case 'strengthMg':
        if (v === '' || v === null || v === undefined) {
          out[key] = null;
        } else {
          const n = parseFloat(v);
          if (!Number.isNaN(n)) out[key] = n;
        }
        break;
      case 'purchasePrice':
      case 'sellingPrice':
      case 'mrp':
      case 'defaultDiscountPct':
      case 'gstRate':
      case 'cgstRate':
      case 'sgstRate': {
        const n = parseFloat(v);
        if (!Number.isNaN(n)) out[key] = n;
        break;
      }
      case 'quantity':
      case 'minStockLevel': {
        const n = parseInt(v, 10);
        if (!Number.isNaN(n)) out[key] = n;
        break;
      }
      case 'requiresPrescription':
      case 'taxInclusive':
      case 'isActive':
        out[key] = v === true || v === 'true' || v === 1 || v === '1';
        break;
      case 'expiryDate':
      case 'manufactureDate':
      case 'lastPurchaseDate':
        if (v === '' || v == null) break;
        {
          const d = new Date(v);
          if (!Number.isNaN(d.getTime())) out[key] = d;
        }
        break;
      case 'substituteMedicineIds':
        if (v === null || v === undefined || v === '') {
          out[key] = Prisma.JsonNull;
        } else if (Array.isArray(v)) {
          out[key] = v.length ? v : Prisma.JsonNull;
        }
        break;
      default:
        break;
    }
  }

  return out;
}

module.exports = { normalizeMedicinePayload, KEYS };
