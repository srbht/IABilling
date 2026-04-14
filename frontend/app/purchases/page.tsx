'use client';
import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, X, Trash2, Receipt, Eye, Package,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { PurchaseListPagination, PURCHASE_PAGE_SIZE, type PurchaseListMeta } from './_components/PurchaseListPagination';

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

interface PoLineRow {
  medicineId: string;
  medicineName: string;
  qtyOrdered: number;
  expectedPurchasePrice: number;
  mrp: number;
  /** Combined GST % (0, 5, 12, 18, 28) — for line total estimate only; PO lines do not store tax in DB */
  gstRate: number;
}

const PO_GST_SLABS = [0, 5, 12, 18, 28] as const;

function medicineToPoGstRate(med: { cgstRate?: number | string | null; sgstRate?: number | string | null }) {
  const cg = med.cgstRate != null && med.cgstRate !== '' ? Number(med.cgstRate) : NaN;
  const sg = med.sgstRate != null && med.sgstRate !== '' ? Number(med.sgstRate) : NaN;
  if (Number.isFinite(cg) && Number.isFinite(sg)) {
    const sum = cg + sg;
    if ((PO_GST_SLABS as readonly number[]).includes(sum)) return sum;
  }
  return 12;
}

function estimatePOLineTotal(l: PoLineRow) {
  const base = l.qtyOrdered * l.expectedPurchasePrice;
  const tax = base * (l.gstRate / 100);
  return base + tax;
}

export default function PurchasesPage() {
  const qc = useQueryClient();
  const [poPage, setPoPage] = useState(1);
  const [billsPage, setBillsPage] = useState(1);
  const [unbilledPage, setUnbilledPage] = useState(1);
  const [supplierPage, setSupplierPage] = useState(1);

  /* —— Purchase orders —— */
  const [showPO, setShowPO] = useState(false);
  const [poForm, setPoForm] = useState({ supplierId: '', notes: '', expectedDate: '' });
  const [poLines, setPoLines] = useState<PoLineRow[]>([]);
  const [poMedSearch, setPoMedSearch] = useState('');

  /* —— Supplier bill from GRN —— */
  const [showBill, setShowBill] = useState(false);
  const [billGrnId, setBillGrnId] = useState('');
  const [billForm, setBillForm] = useState({
    supplierInvoiceNo: '', invoiceDate: todayISO(), amountPaid: '0', notes: '',
  });

  /* —— Legacy direct (optional) —— */
  const [showLegacy, setShowLegacy] = useState(false);
  const [legacyForm, setLegacyForm] = useState({
    supplierId: '', supplierInvoiceNo: '', invoiceDate: todayISO(), amountPaid: '0', notes: '',
  });
  const [legacyItems, setLegacyItems] = useState<any[]>([]);
  const [legacyMedSearch, setLegacyMedSearch] = useState('');
  const [legacyShowLots, setLegacyShowLots] = useState(false);

  const { data: poList } = useQuery({
    queryKey: ['purchase-orders', poPage, PURCHASE_PAGE_SIZE],
    queryFn: () => api.get('/purchase-orders', { params: { page: poPage, limit: PURCHASE_PAGE_SIZE } }).then(r => r.data),
  });

  const { data: purchasesData } = useQuery({
    queryKey: ['purchases', billsPage, PURCHASE_PAGE_SIZE],
    queryFn: () => api.get('/purchases', { params: { page: billsPage, limit: PURCHASE_PAGE_SIZE } }).then(r => r.data),
  });

  const { data: unbilledResp } = useQuery({
    queryKey: ['goods-receipts-unbilled', unbilledPage],
    queryFn: () => api.get('/goods-receipts/unbilled', { params: { page: unbilledPage, limit: PURCHASE_PAGE_SIZE } }).then(r => r.data),
    enabled: showBill,
  });
  const unbilledGrns = unbilledResp?.data || [];
  const unbilledMeta = unbilledResp?.meta as PurchaseListMeta | undefined;

  const { data: billGrnDetail } = useQuery({
    queryKey: ['goods-receipt', billGrnId],
    queryFn: () => api.get(`/goods-receipts/${billGrnId}`).then(r => r.data.data),
    enabled: showBill && !!billGrnId,
  });

  const { data: suppliersResp } = useQuery({
    queryKey: ['suppliers-list', supplierPage],
    queryFn: () => api.get('/suppliers', { params: { page: supplierPage, limit: PURCHASE_PAGE_SIZE } }).then(r => r.data),
    enabled: showPO || showLegacy,
  });
  const suppliers = suppliersResp?.data || [];
  const supplierMeta = suppliersResp?.meta as PurchaseListMeta | undefined;

  const { data: poMedResults } = useQuery({
    queryKey: ['med-po', poMedSearch],
    queryFn: () => api.get('/medicines', { params: { search: poMedSearch, limit: 8 } }).then(r => r.data.data),
    enabled: poMedSearch.length >= 2 && showPO,
  });

  const { data: legacyMedResults } = useQuery({
    queryKey: ['med-legacy', legacyMedSearch],
    queryFn: () => api.get('/medicines', { params: { search: legacyMedSearch, limit: 8 } }).then(r => r.data.data),
    enabled: legacyMedSearch.length >= 2 && showLegacy,
  });

  const createPO = useMutation({
    mutationFn: (d: any) => api.post('/purchase-orders', d),
    onSuccess: () => {
      toast.success('Purchase order placed — PO number assigned');
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      setPoPage(1);
      setShowPO(false);
      setPoForm({ supplierId: '', notes: '', expectedDate: '' });
      setPoLines([]);
    },
    onError: (e: any) => {
      const d = e.response?.data;
      let msg = typeof d?.message === 'string' ? d.message : '';
      if (!msg && Array.isArray(d?.errors) && d.errors.length) {
        msg = d.errors.map((x: { msg?: string; path?: string }) => x.msg || x.path || '').filter(Boolean).join(' · ');
      }
      toast.error(msg || e.message || 'Could not create purchase order');
    },
  });

  const createBill = useMutation({
    mutationFn: (d: any) => api.post('/purchases/from-grn', d),
    onSuccess: () => {
      toast.success('Supplier bill saved');
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['goods-receipts-unbilled'] });
      qc.invalidateQueries({ queryKey: ['goods-receipts'] });
      qc.invalidateQueries({ queryKey: ['goods-receipt', billGrnId] });
      qc.invalidateQueries({ queryKey: ['suppliers-list'] });
      setShowBill(false);
      setBillGrnId('');
      setBillForm({ supplierInvoiceNo: '', invoiceDate: todayISO(), amountPaid: '0', notes: '' });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const legacySave = useMutation({
    mutationFn: (d: any) => api.post('/purchases/direct', d),
    onSuccess: () => {
      toast.success('Purchase recorded (legacy)');
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['medicines'] });
      setShowLegacy(false);
      setLegacyItems([]);
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const selectedGrn = useMemo(() => {
    if (!billGrnId) return undefined;
    if (billGrnDetail?.id === billGrnId) return billGrnDetail;
    return (unbilledGrns || []).find((g: any) => g.id === billGrnId);
  }, [billGrnDetail, billGrnId, unbilledGrns]);

  /** Keep pre-selected GRN visible in the dropdown when it is not on the current unbilled page */
  const unbilledSelectOptions = useMemo(() => {
    const list = [...unbilledGrns];
    if (
      billGrnId
      && billGrnDetail?.id === billGrnId
      && !billGrnDetail.purchaseBill
      && !list.some((g: any) => g.id === billGrnId)
    ) {
      list.unshift(billGrnDetail as any);
    }
    return list;
  }, [unbilledGrns, billGrnId, billGrnDetail]);

  const grnTotal = selectedGrn?.items?.reduce((s: number, i: any) => s + i.amount, 0) || 0;

  const addPoLine = (med: any) => {
    if (poLines.find(l => l.medicineId === med.id)) {
      toast.error('Already on order');
      return;
    }
    setPoLines(prev => [...prev, {
      medicineId: med.id,
      medicineName: med.name,
      qtyOrdered: 1,
      expectedPurchasePrice: Number(med.purchasePrice) || 0,
      mrp: Number(med.mrp) || 0,
      gstRate: medicineToPoGstRate(med),
    }]);
    setPoMedSearch('');
  };

  const poOrderTotal = useMemo(
    () => poLines.reduce((s, l) => s + estimatePOLineTotal(l), 0),
    [poLines],
  );

  const submitPO = (e: React.FormEvent) => {
    e.preventDefault();
    if (!poForm.supplierId || poLines.length === 0) {
      toast.error('Supplier and at least one line required');
      return;
    }
    createPO.mutate({
      supplierId: poForm.supplierId,
      notes: poForm.notes || null,
      expectedDate: poForm.expectedDate || null,
      items: poLines.map(l => ({
        medicineId: l.medicineId,
        qtyOrdered: Math.max(1, parseInt(String(l.qtyOrdered), 10) || 1),
        expectedPurchasePrice: l.expectedPurchasePrice,
      })),
    });
  };

  const submitBill = (e: React.FormEvent) => {
    e.preventDefault();
    if (!billGrnId) {
      toast.error('Select a goods receipt');
      return;
    }
    createBill.mutate({
      goodsReceiptId: billGrnId,
      invoiceNumber: billForm.supplierInvoiceNo.trim() || undefined,
      invoiceDate: billForm.invoiceDate || undefined,
      amountPaid: parseFloat(billForm.amountPaid || '0'),
      notes: billForm.notes || null,
    });
  };

  const purchases = purchasesData?.data || [];
  const poMeta = poList?.meta as PurchaseListMeta | undefined;
  const billMeta = purchasesData?.meta as PurchaseListMeta | undefined;

  const openBillModal = (grnId?: string) => {
    setUnbilledPage(1);
    setBillGrnId(grnId || '');
    setShowBill(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-2xl">
          <strong className="text-gray-700 dark:text-gray-300">1.</strong> Create a PO (PO# auto)
          → <strong className="text-gray-700 dark:text-gray-300">2.</strong> Open a PO with <strong className="text-gray-700 dark:text-gray-300">View</strong>, receive goods (GRN), then bill (PUR#) with editable rates.
        </p>
        <div className="flex flex-wrap gap-2 shrink-0">
          <button type="button" onClick={() => { setSupplierPage(1); setShowPO(true); }} className="btn-primary">
            <Plus className="w-4 h-4" /> New purchase order
          </button>
          <button type="button" onClick={() => openBillModal()} className="btn-outline text-sm">
            <Receipt className="w-4 h-4" /> Bill any GRN
          </button>
          <button type="button" onClick={() => { setSupplierPage(1); setShowLegacy(true); }} className="btn-outline text-sm">
            Legacy: direct purchase
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300">
            {poMeta?.total ?? 0} purchase orders
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 hidden sm:block">Use the view icon to open a PO — receive, bill, and close from there.</p>
        </div>
        <div className="card overflow-hidden">
          <table className="table">
            <thead>
              <tr>
                <th className="w-14 text-center">View</th>
                <th>PO No.</th>
                <th>Supplier</th>
                <th>Status</th>
                <th>Lines</th>
                <th>GRNs</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {(poList?.data || []).length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">No purchase orders</td></tr>
              ) : (poList?.data || []).map((p: any) => (
                <tr key={p.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/40">
                  <td className="text-center">
                    <Link
                      href={`/purchases/${p.id}`}
                      className="inline-flex items-center justify-center rounded-lg p-2 text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-950/40 transition-colors"
                      aria-label={`View ${p.poNumber}`}
                      title="View details"
                    >
                      <Eye className="w-4 h-4" />
                    </Link>
                  </td>
                  <td className="font-mono text-xs font-medium text-primary-600">{p.poNumber}</td>
                  <td>{p.supplier?.name}</td>
                  <td>
                    <span className={cn(
                      'text-xs font-semibold px-2 py-0.5 rounded-full',
                      p.status === 'COMPLETED' && 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
                      p.status === 'PARTIAL' && 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
                      p.status === 'OPEN' && 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
                      p.status === 'CANCELLED' && 'bg-gray-200 text-gray-600',
                    )}>
                      {p.status}
                    </span>
                  </td>
                  <td>{p._count?.items}</td>
                  <td>{p._count?.goodsReceipts}</td>
                  <td className="text-xs text-gray-400">{formatDate(p.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <PurchaseListPagination meta={poMeta} page={poPage} onPageChange={setPoPage} />
        </div>
      </div>

      <div className="space-y-3 pt-2 border-t border-gray-200 dark:border-gray-800">
        <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300">
          All supplier bills <span className="text-sm font-normal text-gray-500">({billMeta?.total ?? 0})</span>
        </h2>
        <div className="card overflow-hidden">
          <table className="table">
            <thead>
              <tr>
                <th className="w-24 text-center">Open</th>
                <th>Bill No.</th>
                <th>GRN</th>
                <th>Supplier</th>
                <th>Invoice</th>
                <th>Items</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Due</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {purchases.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-8 text-gray-400">No bills yet</td></tr>
              ) : purchases.map((p: any) => (
                <tr key={p.id}>
                  <td className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Link
                        href={`/purchases/bill/${p.id}`}
                        className="inline-flex p-2 rounded-lg text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-950/40"
                        title="Open supplier bill"
                        aria-label={`Open bill ${p.purchaseNumber}`}
                      >
                        <Eye className="w-4 h-4" />
                      </Link>
                      {p.goodsReceipt?.id ? (
                        <Link
                          href={`/purchases/receipt/${p.goodsReceipt.id}`}
                          className="inline-flex p-2 rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                          title="Open goods receipt"
                          aria-label="Open GRN"
                        >
                          <Package className="w-4 h-4" />
                        </Link>
                      ) : null}
                    </div>
                  </td>
                  <td className="font-mono text-xs font-medium text-primary-600">{p.purchaseNumber}</td>
                  <td className="text-xs text-gray-500">{p.goodsReceipt?.grnNumber || '—'}</td>
                  <td className="font-medium">{p.supplier?.name}</td>
                  <td className="text-xs text-gray-400">{p.invoiceNumber || '—'}</td>
                  <td>{p._count?.items}</td>
                  <td className="font-semibold">{formatCurrency(p.totalAmount)}</td>
                  <td className="text-green-600">{formatCurrency(p.amountPaid)}</td>
                  <td className={p.amountDue > 0 ? 'text-red-600 font-semibold' : 'text-gray-400'}>
                    {formatCurrency(p.amountDue)}
                  </td>
                  <td className="text-xs text-gray-400">{formatDate(p.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <PurchaseListPagination meta={billMeta} page={billsPage} onPageChange={setBillsPage} />
        </div>
      </div>

      {/* Modal: New PO */}
      {showPO && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-5xl max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-center px-6 py-4 border-b dark:border-gray-800">
              <div>
                <h3 className="font-bold text-lg">New purchase order</h3>
                <p className="text-xs text-gray-500 mt-1">PO number is generated on save. Purchase ₹ defaults from inventory — edit as needed.</p>
              </div>
              <button type="button" onClick={() => setShowPO(false)} aria-label="Close"><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <form onSubmit={submitPO} className="p-6 space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="label">Supplier *</label>
                  <select required className="input" value={poForm.supplierId} onChange={(e) => setPoForm(f => ({ ...f, supplierId: e.target.value }))}>
                    <option value="">Select…</option>
                    {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <PurchaseListPagination meta={supplierMeta} page={supplierPage} onPageChange={setSupplierPage} compact />
                </div>
                <div>
                  <label className="label">Expected date (optional)</label>
                  <input type="date" className="input" value={poForm.expectedDate} onChange={(e) => setPoForm(f => ({ ...f, expectedDate: e.target.value }))} />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Notes</label>
                  <input className="input" value={poForm.notes} onChange={(e) => setPoForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="label">Search &amp; add medicines</label>
                <input className="input" placeholder="Type name, SKU…" value={poMedSearch} onChange={(e) => setPoMedSearch(e.target.value)} />
                {poMedSearch.length >= 2 && poMedResults && (
                  <div className="mt-1 border border-gray-200 dark:border-gray-700 rounded-xl max-h-40 overflow-auto shadow-sm">
                    {poMedResults.map((m: any) => (
                      <button key={m.id} type="button" className="w-full text-left px-4 py-2.5 text-sm hover:bg-primary-50/80 dark:hover:bg-primary-950/30 border-b border-gray-100 dark:border-gray-800 last:border-0" onClick={() => addPoLine(m)}>
                        <span className="font-medium text-gray-900 dark:text-white">{m.name}</span>
                        <span className="text-xs text-gray-500 ml-2">Pur. {formatCurrency(m.purchasePrice)} · MRP {formatCurrency(m.mrp)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {poLines.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
                  <table className="table text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                        <th className="py-2 px-3">#</th>
                        <th className="py-2 px-3">Medicine</th>
                        <th className="py-2 px-3 w-24">Qty</th>
                        <th className="py-2 px-3 w-28">Purchase ₹</th>
                        <th className="py-2 px-3 w-28">MRP ₹</th>
                        <th className="py-2 px-3 w-36">GST %</th>
                        <th className="py-2 px-3 w-32 text-right">Line (incl. GST)</th>
                        <th className="w-12" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {poLines.map((l, idx) => (
                        <tr key={l.medicineId}>
                          <td className="py-2 px-3 text-gray-400 text-xs">{idx + 1}</td>
                          <td className="py-2 px-3 font-medium text-gray-900 dark:text-white">{l.medicineName}</td>
                          <td className="py-2 px-3">
                            <input type="number" min={1} className="input py-1.5 text-sm w-full" value={l.qtyOrdered}
                              onChange={(e) => setPoLines(prev => prev.map(x => x.medicineId === l.medicineId ? { ...x, qtyOrdered: parseInt(e.target.value, 10) || 1 } : x))} />
                          </td>
                          <td className="py-2 px-3">
                            <input type="number" step="0.01" min={0} className="input py-1.5 text-sm w-full tabular-nums" value={l.expectedPurchasePrice}
                              onChange={(e) => setPoLines(prev => prev.map(x => x.medicineId === l.medicineId ? { ...x, expectedPurchasePrice: parseFloat(e.target.value) || 0 } : x))} />
                          </td>
                          <td className="py-2 px-3">
                            <input type="number" step="0.01" min={0} className="input py-1.5 text-sm w-full tabular-nums" value={l.mrp}
                              onChange={(e) => setPoLines(prev => prev.map(x => x.medicineId === l.medicineId ? { ...x, mrp: parseFloat(e.target.value) || 0 } : x))} />
                          </td>
                          <td className="py-2 px-3">
                            <select
                              className="input py-1.5 text-sm w-full"
                              value={l.gstRate}
                              onChange={(e) => {
                                const gstRate = parseFloat(e.target.value);
                                setPoLines(prev => prev.map(x => x.medicineId === l.medicineId ? { ...x, gstRate: Number.isFinite(gstRate) ? gstRate : 0 } : x));
                              }}
                            >
                              <option value={0}>0% — No GST</option>
                              {PO_GST_SLABS.filter((r) => r > 0).map((r) => (
                                <option key={r} value={r}>{r}%</option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 px-3 text-right font-semibold tabular-nums">{formatCurrency(estimatePOLineTotal(l))}</td>
                          <td className="py-2 px-1">
                            <button type="button" className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg" onClick={() => setPoLines(prev => prev.filter(x => x.medicineId !== l.medicineId))}>
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {poLines.length > 0 && (
                <div className="flex justify-end text-sm">
                  <span className="text-gray-500 mr-2">Estimated order total (incl. GST):</span>
                  <span className="font-bold text-lg tabular-nums text-gray-900 dark:text-white">{formatCurrency(poOrderTotal)}</span>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <button type="button" className="btn-secondary flex-1" onClick={() => setShowPO(false)}>Cancel</button>
                <button type="submit" disabled={createPO.isPending || poLines.length === 0} className="btn-primary flex-1">
                  {createPO.isPending ? 'Saving…' : 'Create PO'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Bill from GRN */}
      {showBill && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex justify-between items-center px-6 py-4 border-b dark:border-gray-800">
              <h3 className="font-bold">Supplier bill from GRN</h3>
              <button type="button" onClick={() => setShowBill(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <form onSubmit={submitBill} className="p-6 space-y-4">
              <p className="text-xs text-gray-500">Purchase bill number (PUR-…) is auto. Supplier invoice no. is optional until you have it.</p>
              <div>
                <label className="label">Goods receipt *</label>
                <select required className="input" value={billGrnId} onChange={(e) => setBillGrnId(e.target.value)}>
                  <option value="">Select GRN…</option>
                  {unbilledSelectOptions.map((g: any) => (
                    <option key={g.id} value={g.id}>
                      {g.grnNumber} — {g.purchaseOrder?.supplier?.name} ({formatCurrency(g.items?.reduce((s: number, i: any) => s + i.amount, 0) || 0)})
                    </option>
                  ))}
                </select>
                <PurchaseListPagination meta={unbilledMeta} page={unbilledPage} onPageChange={setUnbilledPage} compact />
              </div>
              {selectedGrn?.purchaseBill && (
                <p className="text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 rounded-lg px-3 py-2 border border-amber-200/80 dark:border-amber-900/50">
                  This receipt is already billed as <strong className="font-mono">{selectedGrn.purchaseBill.purchaseNumber}</strong>. Pick another GRN or go to the next page.
                </p>
              )}
              {selectedGrn && !selectedGrn.purchaseBill && (
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Total: <strong>{formatCurrency(grnTotal)}</strong>
                </div>
              )}
              <div>
                <label className="label">Bill date</label>
                <input type="date" className="input" value={billForm.invoiceDate} onChange={(e) => setBillForm(f => ({ ...f, invoiceDate: e.target.value }))} />
              </div>
              <div>
                <label className="label">Supplier invoice no. (optional)</label>
                <input className="input" value={billForm.supplierInvoiceNo} onChange={(e) => setBillForm(f => ({ ...f, supplierInvoiceNo: e.target.value }))} />
              </div>
              <div>
                <label className="label">Amount paid (₹)</label>
                <input type="number" step="0.01" min={0} className="input" value={billForm.amountPaid} onChange={(e) => setBillForm(f => ({ ...f, amountPaid: e.target.value }))} />
              </div>
              <div>
                <label className="label">Notes</label>
                <input className="input" value={billForm.notes} onChange={(e) => setBillForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn-secondary flex-1" onClick={() => setShowBill(false)}>Cancel</button>
                <button
                  type="submit"
                  disabled={createBill.isPending || !billGrnId || !!selectedGrn?.purchaseBill}
                  className="btn-primary flex-1"
                >
                  {createBill.isPending ? 'Saving…' : 'Create bill'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Legacy modal - abbreviated: reuse old direct flow */}
      {showLegacy && (
        <LegacyDirectModal
          onClose={() => { setShowLegacy(false); setLegacyItems([]); }}
          suppliers={suppliers}
          supplierMeta={supplierMeta}
          supplierPage={supplierPage}
          onSupplierPageChange={setSupplierPage}
          legacyForm={legacyForm}
          setLegacyForm={setLegacyForm}
          legacyItems={legacyItems}
          setLegacyItems={setLegacyItems}
          legacyMedSearch={legacyMedSearch}
          setLegacyMedSearch={setLegacyMedSearch}
          legacyMedResults={legacyMedResults}
          legacyShowLots={legacyShowLots}
          setLegacyShowLots={setLegacyShowLots}
          onSubmit={() => {
            if (legacyItems.length === 0 || !legacyForm.supplierId) {
              toast.error('Add lines and supplier');
              return;
            }
            legacySave.mutate({
              supplierId: legacyForm.supplierId,
              invoiceNumber: legacyForm.supplierInvoiceNo.trim() || undefined,
              invoiceDate: legacyForm.invoiceDate || undefined,
              amountPaid: parseFloat(legacyForm.amountPaid || '0'),
              notes: legacyForm.notes || null,
              items: legacyItems.map((i: any) => ({
                medicineId: i.medicineId,
                quantity: i.quantity,
                freeQuantity: i.freeQuantity || 0,
                purchasePrice: i.purchasePrice,
                mrp: i.mrp,
                sellingPrice: i.sellingPrice,
                ...(legacyShowLots && i.batchNumber?.trim() ? { batchNumber: i.batchNumber.trim() } : {}),
                ...(legacyShowLots && i.expiryDate ? { expiryDate: i.expiryDate } : {}),
              })),
            });
          }}
          saving={legacySave.isPending}
        />
      )}
    </div>
  );
}

function LegacyDirectModal({
  onClose, suppliers, supplierMeta, supplierPage, onSupplierPageChange,
  legacyForm, setLegacyForm, legacyItems, setLegacyItems,
  legacyMedSearch, setLegacyMedSearch, legacyMedResults, legacyShowLots, setLegacyShowLots,
  onSubmit, saving,
}: any) {
  const add = (med: any) => {
    if (legacyItems.find((i: any) => i.medicineId === med.id)) return;
    setLegacyItems((prev: any[]) => [...prev, {
      medicineId: med.id, medicineName: med.name, quantity: 1, freeQuantity: 0,
      purchasePrice: med.purchasePrice, mrp: med.mrp, sellingPrice: med.sellingPrice,
      batchNumber: '', expiryDate: '',
    }]);
    setLegacyMedSearch('');
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-4xl my-4">
        <div className="flex justify-between px-6 py-4 border-b dark:border-gray-800">
          <div>
            <h3 className="font-bold">Legacy: direct purchase</h3>
            <p className="text-xs text-gray-500 mt-1">Skips PO/GRN — stock updates immediately. Use only if you must.</p>
          </div>
          <button type="button" onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="md:col-span-3">
              <label className="label">Supplier *</label>
              <select className="input" value={legacyForm.supplierId} onChange={(e) => setLegacyForm((f: any) => ({ ...f, supplierId: e.target.value }))}>
                <option value="">Select…</option>
                {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <PurchaseListPagination meta={supplierMeta} page={supplierPage} onPageChange={onSupplierPageChange} compact />
            </div>
            <div>
              <label className="label">Bill date</label>
              <input type="date" className="input" value={legacyForm.invoiceDate} onChange={(e) => setLegacyForm((f: any) => ({ ...f, invoiceDate: e.target.value }))} />
            </div>
            <div>
              <label className="label">Supplier inv. (opt.)</label>
              <input className="input" value={legacyForm.supplierInvoiceNo} onChange={(e) => setLegacyForm((f: any) => ({ ...f, supplierInvoiceNo: e.target.value }))} />
            </div>
          </div>
          <input className="input" placeholder="Search medicine…" value={legacyMedSearch} onChange={(e) => setLegacyMedSearch(e.target.value)} />
          {legacyMedSearch.length >= 2 && legacyMedResults && (
            <div className="border rounded-lg max-h-32 overflow-auto">
              {legacyMedResults.map((m: any) => (
                <button key={m.id} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800" onClick={() => add(m)}>{m.name}</button>
              ))}
            </div>
          )}
          <button type="button" className="text-sm text-primary-600" onClick={() => setLegacyShowLots((v: boolean) => !v)}>
            {legacyShowLots ? 'Hide' : 'Show'} batch / expiry
          </button>
          {legacyItems.length > 0 && (
            <table className="table text-xs">
              <thead>
                <tr>
                  <th>Medicine</th>
                  <th>Qty</th>
                  <th>Free</th>
                  <th>Pur</th>
                  <th>MRP</th>
                  <th>Sell</th>
                  {legacyShowLots && <th>Batch</th>}
                  {legacyShowLots && <th>Exp</th>}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {legacyItems.map((it: any, idx: number) => (
                  <tr key={it.medicineId}>
                    <td>{it.medicineName}</td>
                    <td><input type="number" min={1} className="w-14 input py-1" value={it.quantity} onChange={(e) => setLegacyItems((prev: any[]) => prev.map((x, i) => i === idx ? { ...x, quantity: parseInt(e.target.value, 10) || 1 } : x))} /></td>
                    <td><input type="number" min={0} className="w-12 input py-1" value={it.freeQuantity} onChange={(e) => setLegacyItems((prev: any[]) => prev.map((x, i) => i === idx ? { ...x, freeQuantity: parseInt(e.target.value, 10) || 0 } : x))} /></td>
                    <td><input type="number" step="0.01" className="w-16 input py-1" value={it.purchasePrice} onChange={(e) => setLegacyItems((prev: any[]) => prev.map((x, i) => i === idx ? { ...x, purchasePrice: parseFloat(e.target.value) || 0 } : x))} /></td>
                    <td><input type="number" step="0.01" className="w-16 input py-1" value={it.mrp} onChange={(e) => setLegacyItems((prev: any[]) => prev.map((x, i) => i === idx ? { ...x, mrp: parseFloat(e.target.value) || 0 } : x))} /></td>
                    <td><input type="number" step="0.01" className="w-16 input py-1" value={it.sellingPrice} onChange={(e) => setLegacyItems((prev: any[]) => prev.map((x, i) => i === idx ? { ...x, sellingPrice: parseFloat(e.target.value) || 0 } : x))} /></td>
                    {legacyShowLots && <td><input className="w-16 input py-1" value={it.batchNumber} onChange={(e) => setLegacyItems((prev: any[]) => prev.map((x, i) => i === idx ? { ...x, batchNumber: e.target.value } : x))} /></td>}
                    {legacyShowLots && <td><input type="date" className="input py-1 w-28" value={it.expiryDate} onChange={(e) => setLegacyItems((prev: any[]) => prev.map((x, i) => i === idx ? { ...x, expiryDate: e.target.value } : x))} /></td>}
                    <td><button type="button" className="text-red-500" onClick={() => setLegacyItems((prev: any[]) => prev.filter((_, i) => i !== idx))}><Trash2 className="w-3 h-3" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div>
            <label className="label">Amount paid</label>
            <input type="number" step="0.01" className="input w-40" value={legacyForm.amountPaid} onChange={(e) => setLegacyForm((f: any) => ({ ...f, amountPaid: e.target.value }))} />
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
            <button type="button" disabled={saving} className="btn-primary flex-1" onClick={onSubmit}>Save direct purchase</button>
          </div>
        </div>
      </div>
    </div>
  );
}
