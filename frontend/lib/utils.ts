import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, formatDistanceToNow, differenceInDays } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(amount);
};

export const formatDate = (date: string | Date): string => {
  return format(new Date(date), 'dd MMM yyyy');
};

export const formatDateTime = (date: string | Date): string => {
  return format(new Date(date), 'dd MMM yyyy, hh:mm a');
};

export const formatExpiry = (date: string | Date): string => {
  return format(new Date(date), 'MM/yy');
};

export const daysUntilExpiry = (date: string | Date): number => {
  return differenceInDays(new Date(date), new Date());
};

export const getExpiryStatus = (date: string | Date): 'expired' | 'critical' | 'warning' | 'good' => {
  const days = daysUntilExpiry(date);
  if (days < 0) return 'expired';
  if (days <= 30) return 'critical';
  if (days <= 90) return 'warning';
  return 'good';
};

export const getStockStatus = (quantity: number, minLevel: number): 'out' | 'low' | 'ok' => {
  if (quantity === 0) return 'out';
  if (quantity <= minLevel) return 'low';
  return 'ok';
};

/** Display strength from MG + unit or custom label (pharmacy SKU cards) */
export function formatStrength(med: {
  strengthLabel?: string | null;
  strengthMg?: number | null;
  strengthUnit?: string | null;
}): string {
  if (med.strengthLabel) return med.strengthLabel;
  if (med.strengthMg != null && med.strengthMg !== undefined) {
    return `${med.strengthMg} ${med.strengthUnit || 'mg'}`;
  }
  return '';
}

export const calculateBillTotals = (items: any[], discountType: string, discountValue: number) => {
  let subtotal = 0;

  for (const item of items) {
    const base = item.quantity * item.sellingPrice;
    const disc = (base * (item.discount || 0)) / 100;
    const taxable = base - disc;
    const cgst = (taxable * item.cgstRate) / 100;
    const sgst = (taxable * item.sgstRate) / 100;
    subtotal += taxable + cgst + sgst;
  }

  let discountAmount = 0;
  if (discountType === 'percentage' && discountValue > 0) {
    discountAmount = (subtotal * discountValue) / 100;
  } else if (discountType === 'flat' && discountValue > 0) {
    discountAmount = discountValue;
  }

  const afterDiscount = subtotal - discountAmount;
  const cgstTotal = items.reduce((s, i) => {
    const base = i.quantity * i.sellingPrice;
    const disc = (base * (i.discount || 0)) / 100;
    return s + ((base - disc) * i.cgstRate) / 100;
  }, 0);
  const sgstTotal = items.reduce((s, i) => {
    const base = i.quantity * i.sellingPrice;
    const disc = (base * (i.discount || 0)) / 100;
    return s + ((base - disc) * i.sgstRate) / 100;
  }, 0);

  const roundOff = Math.round(afterDiscount) - afterDiscount;
  const netAmount = afterDiscount + roundOff;

  return {
    subtotal: parseFloat(subtotal.toFixed(2)),
    discountAmount: parseFloat(discountAmount.toFixed(2)),
    cgstTotal: parseFloat(cgstTotal.toFixed(2)),
    sgstTotal: parseFloat(sgstTotal.toFixed(2)),
    totalTax: parseFloat((cgstTotal + sgstTotal).toFixed(2)),
    roundOff: parseFloat(roundOff.toFixed(2)),
    netAmount: parseFloat(netAmount.toFixed(2)),
  };
};
