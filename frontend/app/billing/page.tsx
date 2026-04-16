'use client';
import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search, Plus, Minus, Trash2, ShoppingCart, Printer, User,
  CreditCard, Banknote, Smartphone, CheckCircle, X,
  ChevronDown, Receipt, ScanBarcode, Pill, Sparkles
} from 'lucide-react';
import toast from 'react-hot-toast';
import Link from 'next/link';
import api, { openAuthenticatedPdf } from '@/lib/api';
import { useCartStore } from '@/lib/store';
import { formatCurrency, calculateBillTotals, formatExpiry, formatStrength } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { INDIA_STATES, validateIndiaPincode } from '@/lib/india-states';

const PAYMENT_MODES = [
  { id: 'CASH', label: 'Cash', icon: Banknote },
  { id: 'UPI', label: 'UPI', icon: Smartphone },
  { id: 'CARD', label: 'Card', icon: CreditCard },
  { id: 'CREDIT', label: 'Credit', icon: Receipt },
];

export default function BillingPage() {
  const qc = useQueryClient();
  const {
    items, customerName, customerPhone, customerId,
    customerAddress, customerCity, customerPincode, customerState,
    patientName, patientAge, referredByDoctor, doctorRegNo, rxReference,
    paymentMode, discountType, discountValue, notes,
    addItem, updateItem, removeItem, clearCart, setCustomer, setCustomerAddress, setPatientReferral,
    setPaymentMode, setDiscount, setNotes,
  } = useCartStore();

  const [search, setSearch] = useState('');
  const [amountPaid, setAmountPaid] = useState('');
  const [successBill, setSuccessBill] = useState<any>(null);
  const [showCustomer, setShowCustomer] = useState(true);
  const [showPatientReferral, setShowPatientReferral] = useState(false);
  const [customerLookup, setCustomerLookup] = useState('');
  const [pincodeError, setPincodeError] = useState('');
  const [customerCredit, setCustomerCredit] = useState<{ limit: number; used: number } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { searchRef.current?.focus(); }, []);

  const { data: searchResults, isLoading: searching } = useQuery({
    queryKey: ['med-search', search],
    queryFn: () => api.get('/medicines', { params: { search, limit: 10 } }).then(r => r.data.data),
    enabled: search.length >= 2,
    staleTime: 10_000,
  });

  const { data: customers } = useQuery({
    queryKey: ['customers-search', customerLookup],
    queryFn: () => api.get('/customers', { params: { search: customerLookup, limit: 10 } }).then(r => r.data.data),
    enabled: customerLookup.trim().length >= 2,
  });

  const totals = calculateBillTotals(items, discountType, discountValue);
  const change = parseFloat(amountPaid || '0') - totals.netAmount;

  const createBill = useMutation({
    mutationFn: (data: any) => api.post('/billing', data),
    onSuccess: (res) => {
      setSuccessBill(res.data.data);
      clearCart();
      setAmountPaid('');
      setCustomerLookup('');
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['medicines'] });
      qc.invalidateQueries({ queryKey: ['med-search'] });
      toast.success('Bill saved — stock updated');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to create bill');
    },
  });

  const handleAddMedicine = (med: any) => {
    if (med.quantity <= 0) {
      toast.error(`${med.name} is out of stock`);
      return;
    }
    const strengthLine = formatStrength(med);
    addItem({
      medicineId: med.id,
      name: med.name,
      sku: med.sku,
      genericName: med.genericName,
      strengthLine: strengthLine || undefined,
      hsnCode: med.hsnCode,
      packSize: med.packSize,
      dosageForm: med.dosageForm,
      batchNumber: med.batchNumber,
      expiryDate: med.expiryDate,
      mrp: med.mrp,
      sellingPrice: med.sellingPrice,
      quantity: 1,
      discount: med.defaultDiscountPct ?? 0,
      cgstRate: med.cgstRate,
      sgstRate: med.sgstRate,
      unit: med.unit,
      maxQty: med.quantity,
      rackLocation: med.location || undefined,
    });
    setSearch('');
    searchRef.current?.focus();
    toast.success(`Added: ${med.name}`, { duration: 1200 });
  };

  const handleSubmitBill = () => {
    if (items.length === 0) {
      toast.error('Add at least one medicine');
      return;
    }
    const paid = parseFloat(amountPaid || '0');
    if (paymentMode !== 'CREDIT' && paid < totals.netAmount) {
      toast.error('Amount received is less than bill total');
      return;
    }

    createBill.mutate({
      items: items.map(i => ({
        medicineId: i.medicineId,
        quantity: i.quantity,
        discount: i.discount,
        sellingPrice: i.sellingPrice,
        cgstRate: i.cgstRate,
        sgstRate: i.sgstRate,
      })),
      customerId,
      customerName: customerName.trim() || null,
      customerPhone: customerPhone.trim() || null,
      customerAddress: customerAddress.trim() || null,
      customerCity: customerCity.trim() || null,
      customerPincode: customerPincode.trim() || null,
      customerState: customerState.trim() || null,
      patientName: patientName.trim() || null,
      patientAge: patientAge.trim() || null,
      referredByDoctor: referredByDoctor.trim() || null,
      doctorRegNo: doctorRegNo.trim() || null,
      rxReference: rxReference.trim() || null,
      paymentMode,
      amountPaid: paymentMode === 'CREDIT' ? 0 : paid,
      discountType: discountType || null,
      discountValue: discountValue || 0,
      notes: notes || null,
    });
  };

  if (successBill) {
    return (
      <div className="max-w-md mx-auto py-10 px-4">
        <div className="receipt-panel p-8 text-center">
          <div className="w-16 h-16 bg-primary-100 dark:bg-primary-900/40 rounded-2xl flex items-center justify-center mx-auto mb-4 ring-4 ring-primary-50 dark:ring-primary-950">
            <CheckCircle className="w-9 h-9 text-primary-600 dark:text-primary-400" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary-600 dark:text-primary-400 mb-1">Bill saved</p>
          <h2 className="font-display text-2xl font-bold text-gray-900 dark:text-white mb-1">Thank you</h2>
          <p className="text-sm text-gray-500 mb-1">
            Invoice <span className="font-mono font-bold text-gray-800 dark:text-gray-200">{successBill.billNumber}</span>
          </p>
          <p className="text-3xl font-bold text-gray-900 dark:text-white tabular-nums mb-8">{formatCurrency(successBill.netAmount)}</p>
          <div className="flex gap-3">
            <button
              type="button"
              className="btn-primary flex-1 rounded-xl py-3"
              onClick={async () => {
                try {
                  await openAuthenticatedPdf(`billing/${successBill.id}/pdf`);
                } catch (e: any) {
                  toast.error(e?.message || 'Could not open invoice PDF');
                }
              }}
            >
              <Printer className="w-4 h-4" /> Print GST invoice
            </button>
            <button onClick={() => setSuccessBill(null)} className="btn-secondary flex-1 rounded-xl py-3">
              Next bill
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row min-h-[calc(100vh-5rem)] -m-4 md:-m-6 lg:m-0 rounded-2xl overflow-hidden border border-stone-200/80 dark:border-gray-800 bg-stone-100/80 dark:bg-gray-950">
      {/* —— Main POS —— */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <header className="pos-header shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center backdrop-blur">
                  <Pill className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="font-display text-lg font-bold tracking-tight">Retail POS</h1>
                  <p className="text-xs text-white/75">Search by name, SKU, barcode, HSN, or salt</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-white/80">
              <Sparkles className="w-3.5 h-3.5" />
              <span>GST-ready · Batch &amp; expiry on invoice</span>
            </div>
          </div>
        </header>

        <div className="p-4 flex flex-col gap-4 flex-1 min-h-0">
          {/* Product search */}
          <div className="relative shrink-0">
            <ScanBarcode className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-primary-600 dark:text-primary-400" />
            <input
              ref={searchRef}
              type="text"
              className="pos-search"
              placeholder="Scan barcode or type medicine / SKU / generic name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoComplete="off"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Live results */}
          {search.length >= 2 && (
            <div className="rounded-2xl border border-stone-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden shrink-0 max-h-64 overflow-y-auto">
              {searching ? (
                <div className="p-4 text-center text-sm text-gray-400">Searching inventory…</div>
              ) : searchResults?.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-400">No match — try SKU, HSN, or composition</div>
              ) : (
                <ul className="divide-y divide-stone-100 dark:divide-gray-800">
                  {searchResults?.map((med: any) => {
                    const str = formatStrength(med);
                    return (
                      <li key={med.id}>
                        <button
                          type="button"
                          disabled={med.quantity === 0}
                          onClick={() => handleAddMedicine(med)}
                          className={cn(
                            'w-full text-left px-4 py-3 hover:bg-primary-50/80 dark:hover:bg-primary-950/30 transition-colors flex gap-4',
                            med.quantity === 0 && 'opacity-45 cursor-not-allowed'
                          )}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-0.5">
                              <span className="font-semibold text-gray-900 dark:text-white truncate">{med.name}</span>
                              {med.sku && (
                                <span className="text-[10px] font-mono uppercase tracking-wide px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                  {med.sku}
                                </span>
                              )}
                              {med.schedule && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                                  {med.schedule}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                              {med.genericName && <span className="text-gray-600 dark:text-gray-300">{med.genericName}</span>}
                              {str && <span className="mx-1">·</span>}
                              {str && <span className="font-medium text-primary-700 dark:text-primary-400">{str}</span>}
                              {med.packSize && <span className="mx-1">·</span>}
                              {med.packSize}
                              {med.hsnCode && <span className="ml-2 font-mono text-[10px]">HSN {med.hsnCode}</span>}
                            </div>
                            <div className="text-[11px] text-gray-400 mt-1">
                              {med.manufacturer} · Batch {med.batchNumber} · Exp {formatExpiry(med.expiryDate)}
                              {med.location && (
                                <span className="ml-2 text-amber-700 dark:text-amber-400 font-medium">Rack {med.location}</span>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-lg font-bold tabular-nums text-gray-900 dark:text-white">{formatCurrency(med.sellingPrice)}</div>
                            <div className={cn('text-xs font-medium', med.quantity <= med.minStockLevel ? 'text-amber-600' : 'text-primary-600')}>
                              Stock: {med.quantity} {med.unit}
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {/* Line items */}
          <div className="flex-1 flex flex-col min-h-0 rounded-2xl border border-stone-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100 dark:border-gray-800 bg-stone-50/50 dark:bg-gray-800/30">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-primary-600" />
                <span className="font-display font-semibold text-gray-900 dark:text-white">Current bill</span>
                <span className="text-xs text-gray-500 bg-white dark:bg-gray-900 px-2 py-0.5 rounded-full border border-stone-200 dark:border-gray-700">
                  {items.length} line{items.length !== 1 ? 's' : ''}
                </span>
              </div>
              {items.length > 0 && (
                <button type="button" onClick={clearCart} className="text-xs font-medium text-red-600 hover:text-red-700 flex items-center gap-1">
                  <Trash2 className="w-3.5 h-3.5" /> Clear
                </button>
              )}
            </div>

            {items.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-400 py-16 px-4">
                <div className="w-16 h-16 rounded-2xl bg-stone-100 dark:bg-gray-800 flex items-center justify-center mb-3">
                  <Search className="w-8 h-8 opacity-40" />
                </div>
                <p className="text-sm font-medium text-gray-500">No items yet</p>
                <p className="text-xs text-center max-w-xs mt-1">Use search above — same flow as leading pharmacy billing software (quick add, batch on print).</p>
              </div>
            ) : (
              <div className="flex-1 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-white dark:bg-gray-900 shadow-sm">
                    <tr className="text-left text-[10px] uppercase tracking-wider text-gray-500 border-b border-stone-100 dark:border-gray-800">
                      <th className="px-2 py-2 w-7">#</th>
                      <th className="px-2 py-2">Product</th>
                      <th className="px-2 py-2 w-20">Batch</th>
                      <th className="px-2 py-2 w-12">Exp</th>
                      <th className="px-2 py-2 text-right w-20">MRP</th>
                      <th className="px-2 py-2 text-right w-20">Rate</th>
                      <th className="px-2 py-2 text-center w-12">Disc%</th>
                      <th className="px-2 py-2 text-center w-24">Qty</th>
                      <th className="px-2 py-2 text-right w-24">Amount</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-50 dark:divide-gray-800/80">
                    {items.map((item, idx) => {
                      const base = item.quantity * item.sellingPrice;
                      const disc = (base * item.discount) / 100;
                      const taxable = base - disc;
                      const gstRate = item.cgstRate + item.sgstRate;
                      const tax = (taxable * gstRate) / 100;
                      const amount = taxable + tax;
                      const gstIsZeroed = item.cgstRate === 0 && item.sgstRate === 0 &&
                        (item.originalCgstRate > 0 || item.originalSgstRate > 0);
                      const origGstRate = item.originalCgstRate + item.originalSgstRate;
                      return (
                        <tr key={item.medicineId} className="hover:bg-primary-50/30 dark:hover:bg-primary-950/10">
                          <td className="px-2 py-2.5 text-gray-400 text-xs align-top">{idx + 1}</td>
                          <td className="px-2 py-2.5 align-top">
                            <div className="font-semibold text-gray-900 dark:text-white leading-snug text-sm">{item.name}</div>
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {item.strengthLine && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary-100 dark:bg-primary-900/40 text-primary-800 dark:text-primary-300 font-medium">{item.strengthLine}</span>
                              )}
                              {item.hsnCode && (
                                <span className="text-[10px] text-gray-500">HSN {item.hsnCode}</span>
                              )}
                            </div>
                            {item.rackLocation && (
                              <div className="text-[10px] text-amber-700 dark:text-amber-400 font-medium mt-0.5">Rack {item.rackLocation}</div>
                            )}
                            {/* GST line-level toggle */}
                            <div className="flex items-center gap-1.5 mt-1.5">
                              {gstIsZeroed ? (
                                <>
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 font-semibold">
                                    GST: 0% (exempt)
                                  </span>
                                  <button
                                    type="button"
                                    title={`Restore GST ${origGstRate}%`}
                                    onClick={() => updateItem(item.medicineId, {
                                      cgstRate: item.originalCgstRate,
                                      sgstRate: item.originalSgstRate,
                                    })}
                                    className="text-[10px] text-primary-600 hover:underline font-medium"
                                  >
                                    ↩ Restore {origGstRate}%
                                  </button>
                                </>
                              ) : (
                                <>
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 font-medium">
                                    GST: {gstRate}%
                                    {gstRate > 0 && (
                                      <span className="ml-1 text-gray-400">
                                        ({item.cgstRate}+{item.sgstRate})
                                      </span>
                                    )}
                                  </span>
                                  {gstRate > 0 && (
                                    <button
                                      type="button"
                                      title="Set GST to 0% for this line"
                                      onClick={() => updateItem(item.medicineId, { cgstRate: 0, sgstRate: 0 })}
                                      className="text-[10px] text-orange-600 hover:underline font-medium"
                                    >
                                      × Zero GST
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                          {/* Batch */}
                          <td className="px-2 py-2.5 align-top">
                            <div className="text-xs font-mono text-gray-700 dark:text-gray-300">{item.batchNumber}</div>
                          </td>
                          {/* Exp */}
                          <td className="px-2 py-2.5 align-top">
                            <div className="text-xs text-gray-600 dark:text-gray-400">{formatExpiry(item.expiryDate)}</div>
                          </td>
                          {/* MRP */}
                          <td className="px-2 py-2.5 text-right align-top">
                            <div className="text-xs text-gray-600 dark:text-gray-400 tabular-nums">{formatCurrency(item.mrp)}</div>
                          </td>
                          {/* Rate (read-only) */}
                          <td className="px-2 py-2.5 text-right align-top">
                            <div className="text-sm font-semibold tabular-nums text-gray-900 dark:text-white">
                              {formatCurrency(item.sellingPrice)}
                            </div>
                          </td>
                          {/* Disc% */}
                          <td className="px-2 py-2.5 align-top">
                            <input
                              type="number"
                              value={item.discount}
                              min={0}
                              max={100}
                              onChange={(e) => updateItem(item.medicineId, { discount: parseFloat(e.target.value) || 0 })}
                              className="w-full max-w-[3rem] mx-auto block text-center border border-stone-200 dark:border-gray-600 rounded-lg py-1 text-sm bg-white dark:bg-gray-900"
                            />
                          </td>
                          {/* Qty */}
                          <td className="px-2 py-2.5 align-top">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  if (item.quantity > 1) updateItem(item.medicineId, { quantity: item.quantity - 1 });
                                  else removeItem(item.medicineId);
                                }}
                                className="w-7 h-7 rounded-lg border border-stone-200 dark:border-gray-600 hover:bg-stone-50 dark:hover:bg-gray-800 flex items-center justify-center"
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <input
                                type="number"
                                value={item.quantity}
                                min={1}
                                max={item.maxQty}
                                onChange={(e) => {
                                  const q = Math.min(item.maxQty, Math.max(1, parseInt(e.target.value) || 1));
                                  updateItem(item.medicineId, { quantity: q });
                                }}
                                className="w-10 text-center border border-stone-200 dark:border-gray-600 rounded-lg py-1 text-sm font-semibold bg-white dark:bg-gray-900"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  if (item.quantity < item.maxQty) updateItem(item.medicineId, { quantity: item.quantity + 1 });
                                }}
                                className="w-7 h-7 rounded-lg border border-stone-200 dark:border-gray-600 hover:bg-stone-50 dark:hover:bg-gray-800 flex items-center justify-center"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                          {/* Amount */}
                          <td className="px-2 py-2.5 text-right font-bold tabular-nums text-gray-900 dark:text-white align-top">
                            {formatCurrency(amount)}
                            {gstRate > 0 && (
                              <div className="text-[10px] font-normal text-gray-400 mt-0.5">
                                +{formatCurrency(tax)} GST
                              </div>
                            )}
                          </td>
                          <td className="px-1 py-2.5 align-top">
                            <button type="button" onClick={() => removeItem(item.medicineId)} className="p-1 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* —— Receipt / payment column —— */}
      <aside className="w-full lg:w-[400px] shrink-0 border-t lg:border-t-0 lg:border-l border-stone-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex flex-col gap-4">
        <div className="receipt-panel p-4 space-y-3">
          <button
            type="button"
            onClick={() => setShowCustomer(!showCustomer)}
            className="w-full flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-primary-600" />
              <div>
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 block">
                  Invoice to
                </span>
                <span className="text-xs text-gray-500">
                  {customerId ? 'Saved customer' : customerName ? 'Walk-in' : 'Walk-in (optional)'}
                </span>
              </div>
            </div>
            <ChevronDown className={cn('w-4 h-4 text-gray-400 transition-transform', showCustomer && 'rotate-180')} />
          </button>
          {showCustomer && (
            <div className="space-y-2 pt-1 border-t border-dashed border-stone-200 dark:border-gray-700">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Find customer</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Type name or mobile — pick to autofill address"
                  value={customerLookup}
                  onChange={(e) => setCustomerLookup(e.target.value)}
                  className="input rounded-xl text-sm"
                />
                {customers && customers.length > 0 && (
                  <div className="absolute z-20 top-full left-0 right-0 mt-1 rounded-xl border border-stone-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg max-h-44 overflow-auto">
                    {customers.map((c: any) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setCustomer(c.name || '', c.phone || '', c.id, {
                            address: c.address || '',
                            city: c.city || '',
                            pincode: c.pincode || '',
                            state: c.state || '',
                          });
                          setCustomerCredit({ limit: c.creditLimit || 0, used: c.currentCredit || 0 });
                          setCustomerLookup('');
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-stone-50 dark:hover:bg-gray-800 border-b border-stone-100 dark:border-gray-800 last:border-0"
                      >
                        <span className="font-medium">{c.name}</span>
                        {c.phone && <span className="text-gray-400 ml-2">{c.phone}</span>}
                        <div className="flex items-center gap-3 mt-0.5 text-[11px]">
                          {c.city && <span className="text-gray-500">{c.city}</span>}
                          {(c.creditLimit > 0) && (
                            <span className={cn(
                              'font-medium',
                              (c.creditLimit - c.currentCredit) > 0 ? 'text-green-600' : 'text-red-600'
                            )}>
                              Credit avail: {formatCurrency(Math.max(0, c.creditLimit - c.currentCredit))}
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input
                type="text"
                placeholder="Patient / customer name (on invoice)"
                value={customerName}
                onChange={(e) => {
                  setCustomer(e.target.value, customerPhone, undefined, {
                    address: customerAddress,
                    city: customerCity,
                    pincode: customerPincode,
                    state: customerState,
                  });
                  setCustomerCredit(null);
                }}
                className="input rounded-xl"
              />
              <input
                type="tel"
                placeholder="Mobile (on invoice)"
                value={customerPhone}
                onChange={(e) => setCustomer(customerName, e.target.value, customerId || undefined, {
                  address: customerAddress,
                  city: customerCity,
                  pincode: customerPincode,
                  state: customerState,
                })}
                className="input rounded-xl"
              />
              {/* Credit availability panel — shown when a saved customer is selected */}
              {customerId && customerCredit && customerCredit.limit > 0 && (() => {
                const avail = customerCredit.limit - customerCredit.used;
                return (
                  <div className={cn(
                    'rounded-xl border p-3 text-xs',
                    avail > 0
                      ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                      : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                  )}>
                    <div className="font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Credit Account</div>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Limit</span>
                        <span className="font-medium">{formatCurrency(customerCredit.limit)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Used</span>
                        <span className="font-medium text-red-600">{formatCurrency(customerCredit.used)}</span>
                      </div>
                      <div className={cn(
                        'flex justify-between font-semibold pt-1 border-t',
                        avail > 0
                          ? 'text-green-700 dark:text-green-400 border-green-200 dark:border-green-700'
                          : 'text-red-600 border-red-200 dark:border-red-700'
                      )}>
                        <span>Available</span>
                        <span>{formatCurrency(Math.max(0, avail))}</span>
                      </div>
                    </div>
                    {avail <= 0 && (
                      <p className="text-red-600 text-[10px] mt-1.5 font-medium">
                        Credit limit reached — cannot use CREDIT payment
                      </p>
                    )}
                  </div>
                );
              })()}
              <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Billing / Shipping Address (printed on GST invoice)</label>
              <input
                type="text"
                placeholder="Address Line 1 — Building, Street, Area"
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value, customerCity, customerPincode, customerState)}
                className="input rounded-xl text-sm"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="City"
                  value={customerCity}
                  onChange={(e) => setCustomerAddress(customerAddress, e.target.value, customerPincode, customerState)}
                  className="input rounded-xl text-sm"
                />
                <div>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="Pin Code (6 digits)"
                    value={customerPincode}
                    maxLength={6}
                    onChange={(e) => {
                      const numeric = e.target.value.replace(/\D/g, '').slice(0, 6);
                      setCustomerAddress(customerAddress, customerCity, numeric, customerState);
                      setPincodeError(validateIndiaPincode(numeric) || '');
                    }}
                    className={cn('input rounded-xl text-sm', pincodeError && 'border-red-400')}
                  />
                  {pincodeError && <p className="text-[10px] text-red-500 mt-0.5 px-1">{pincodeError}</p>}
                </div>
              </div>
              <select
                value={customerState}
                onChange={(e) => setCustomerAddress(customerAddress, customerCity, customerPincode, e.target.value)}
                className="input rounded-xl text-sm"
              >
                <option value="">— State / Place of Supply —</option>
                {INDIA_STATES.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <div className="flex items-center gap-2 px-1">
                <span className="text-[10px] text-gray-400">Country:</span>
                <span className="text-[10px] font-semibold text-gray-600 dark:text-gray-400">India</span>
              </div>
              <button
                type="button"
                onClick={() => setShowPatientReferral(!showPatientReferral)}
                className="w-full flex items-center justify-between text-left text-xs font-semibold uppercase tracking-wide text-gray-500 pt-1"
              >
                Patient &amp; doctor (India)
                <ChevronDown className={cn('w-4 h-4 transition-transform', showPatientReferral && 'rotate-180')} />
              </button>
              {showPatientReferral && (
                <div className="space-y-2 pl-0.5 border-l-2 border-primary-200 dark:border-primary-800 pl-3">
                  <input
                    type="text"
                    placeholder="Patient name (if different from billing name)"
                    value={patientName}
                    onChange={(e) => setPatientReferral({ patientName: e.target.value })}
                    className="input rounded-xl text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Patient age (e.g. 42 or 2 yrs)"
                    value={patientAge}
                    onChange={(e) => setPatientReferral({ patientAge: e.target.value })}
                    className="input rounded-xl text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Referred by — doctor name"
                    value={referredByDoctor}
                    onChange={(e) => setPatientReferral({ referredByDoctor: e.target.value })}
                    className="input rounded-xl text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Doctor reg. no. (optional)"
                    value={doctorRegNo}
                    onChange={(e) => setPatientReferral({ doctorRegNo: e.target.value })}
                    className="input rounded-xl text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Rx / prescription reference"
                    value={rxReference}
                    onChange={(e) => setPatientReferral({ rxReference: e.target.value })}
                    className="input rounded-xl text-sm"
                  />
                </div>
              )}
              {customerId && (
                <button
                  type="button"
                  className="text-xs text-primary-600 hover:underline"
                  onClick={() => {
                    setCustomer('', '', null);
                    setPatientReferral({
                      patientName: '',
                      patientAge: '',
                      referredByDoctor: '',
                      doctorRegNo: '',
                      rxReference: '',
                    });
                    setCustomerLookup('');
                  }}
                >
                  Clear customer (walk-in)
                </button>
              )}
            </div>
          )}
        </div>

        <div className="receipt-panel p-4 flex-1 flex flex-col">
          <h3 className="font-display text-sm font-bold text-gray-900 dark:text-white mb-3 uppercase tracking-wide">Totals</h3>
          <div className="space-y-2 text-sm flex-1">
            <div className="flex justify-between text-gray-600 dark:text-gray-400">
              <span>Taxable + GST</span>
              <span className="tabular-nums">{formatCurrency(totals.subtotal)}</span>
            </div>
            {totals.discountAmount > 0 && (
              <div className="flex justify-between text-primary-700 dark:text-primary-400">
                <span>Bill discount</span>
                <span className="tabular-nums">−{formatCurrency(totals.discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-gray-500 text-xs">
              <span>CGST</span>
              <span className="tabular-nums">{formatCurrency(totals.cgstTotal)}</span>
            </div>
            <div className="flex justify-between text-gray-500 text-xs">
              <span>SGST</span>
              <span className="tabular-nums">{formatCurrency(totals.sgstTotal)}</span>
            </div>
            {totals.roundOff !== 0 && (
              <div className="flex justify-between text-gray-400 text-xs">
                <span>Round off</span>
                <span className="tabular-nums">{totals.roundOff > 0 ? '+' : ''}{formatCurrency(totals.roundOff)}</span>
              </div>
            )}
            <div className="border-t border-dashed border-stone-300 dark:border-gray-600 pt-3 mt-2 flex justify-between items-baseline">
              <span className="font-display font-bold text-gray-900 dark:text-white">Net payable</span>
              <span className="font-display text-2xl font-bold text-primary-700 dark:text-primary-400 tabular-nums">{formatCurrency(totals.netAmount)}</span>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <label className="label text-xs">Bill discount</label>
              <div className="flex gap-2">
                <select
                  value={discountType}
                  onChange={(e) => setDiscount(e.target.value, discountValue)}
                  className="input rounded-xl flex-1 text-sm"
                >
                  <option value="">None</option>
                  <option value="percentage">Percent %</option>
                  <option value="flat">Flat ₹</option>
                </select>
                <input
                  type="number"
                  value={discountValue || ''}
                  onChange={(e) => setDiscount(discountType, parseFloat(e.target.value) || 0)}
                  disabled={!discountType}
                  className="input rounded-xl w-24 text-sm"
                  placeholder="0"
                  min={0}
                />
              </div>
            </div>

            <div>
              <label className="label text-xs">Payment</label>
              <div className="grid grid-cols-2 gap-2">
                {PAYMENT_MODES.map((mode) => {
                  const Icon = mode.icon;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setPaymentMode(mode.id)}
                      className={cn(
                        'flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all',
                        paymentMode === mode.id
                          ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/50 text-primary-800 dark:text-primary-200 shadow-sm'
                          : 'border-stone-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-stone-300'
                      )}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      {mode.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {paymentMode !== 'CREDIT' && (
              <div>
                <label className="label text-xs">Amount received</label>
                <input
                  type="number"
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                  className="input rounded-xl text-xl font-bold tabular-nums py-3"
                  placeholder={totals.netAmount.toFixed(2)}
                />
                {parseFloat(amountPaid) > totals.netAmount && (
                  <p className="text-sm text-primary-700 dark:text-primary-400 mt-1 font-medium">
                    Change: {formatCurrency(change)}
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="label text-xs">Notes</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="input rounded-xl text-sm"
                placeholder="Rx no., doctor, remarks…"
              />
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSubmitBill}
          disabled={items.length === 0 || createBill.isPending}
          className="w-full rounded-2xl py-4 font-display font-bold text-base bg-gradient-to-r from-primary-600 to-teal-600 hover:from-primary-700 hover:to-teal-700 text-white shadow-lg shadow-primary-600/25 disabled:opacity-50 disabled:shadow-none transition-all flex items-center justify-center gap-2"
        >
          {createBill.isPending ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <CheckCircle className="w-5 h-5" />
              Save bill — {formatCurrency(totals.netAmount)}
            </>
          )}
        </button>

        <Link href="/billing/history" className="btn-outline rounded-xl py-3 text-center text-sm font-medium border-stone-300 dark:border-gray-600">
          View bill history
        </Link>
      </aside>
    </div>
  );
}
