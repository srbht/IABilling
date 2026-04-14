const prisma = require('./prisma');

/** Maps settings key → Prisma model + number field for sequential document IDs */
const PREFIX_CONFIG = {
  bill_prefix: { model: 'bill', field: 'billNumber' },
  purchase_prefix: { model: 'purchase', field: 'purchaseNumber' },
  po_prefix: { model: 'purchaseOrder', field: 'poNumber' },
  grn_prefix: { model: 'goodsReceipt', field: 'grnNumber' },
};

const DEFAULT_PREFIX = {
  bill_prefix: 'INV',
  purchase_prefix: 'PUR',
  po_prefix: 'PO',
  grn_prefix: 'GRN',
};

/**
 * Generate next sequential number with prefix (YYYYMM + 4-digit seq)
 */
async function generateNumber(settingKey, defaultPrefix) {
  const cfg = PREFIX_CONFIG[settingKey];
  if (!cfg) {
    throw new Error(`Unknown document prefix setting: ${settingKey}`);
  }

  const setting = await prisma.settings.findUnique({ where: { key: settingKey } });
  const prefix = setting?.value || defaultPrefix || DEFAULT_PREFIX[settingKey] || 'DOC';

  const today = new Date();
  const yearMonth = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}`;
  const pattern = `${prefix}-${yearMonth}`;

  const delegate = prisma[cfg.model];
  if (!delegate || typeof delegate.findFirst !== 'function') {
    const err = new Error(
      `Prisma Client has no model "${cfg.model}". Stop the API, run: cd backend && npx prisma generate && npm run dev`,
    );
    err.code = 'PRISMA_CLIENT_STALE';
    throw err;
  }

  const last = await delegate.findFirst({
    where: { [cfg.field]: { startsWith: pattern } },
    orderBy: { createdAt: 'desc' },
  });

  let sequence = 1;
  if (last) {
    const parts = last[cfg.field].split('-');
    sequence = parseInt(parts[parts.length - 1], 10) + 1;
  }

  return `${pattern}-${String(sequence).padStart(4, '0')}`;
}

/**
 * Paginate query results
 */
function getPagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function paginationMeta(total, page, limit) {
  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    hasNext: page < Math.ceil(total / limit),
    hasPrev: page > 1,
  };
}

/**
 * Calculate GST amounts for an item
 */
function calculateItemTax(amount, cgstRate, sgstRate) {
  const cgstAmount = parseFloat(((amount * cgstRate) / 100).toFixed(2));
  const sgstAmount = parseFloat(((amount * sgstRate) / 100).toFixed(2));
  return { cgstAmount, sgstAmount, totalTax: cgstAmount + sgstAmount };
}

/**
 * Date range helpers
 */
function getDateRange(period) {
  const now = new Date();
  let startDate;
  let endDate;

  switch (period) {
    case 'today':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      break;
    case 'week': {
      const day = now.getDay();
      startDate = new Date(now);
      startDate.setDate(now.getDate() - day);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(now);
      endDate.setHours(23, 59, 59, 999);
      break;
    }
    case 'month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      break;
    case 'year':
      startDate = new Date(now.getFullYear(), 0, 1);
      endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
      break;
    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  }

  return { startDate, endDate };
}

module.exports = {
  generateNumber, getPagination, paginationMeta, calculateItemTax, getDateRange,
};
