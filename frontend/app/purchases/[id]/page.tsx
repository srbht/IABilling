'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Package, Receipt, XCircle, FileStack, Sparkles, ExternalLink,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { PurchaseListPagination, PURCHASE_PAGE_SIZE, type PurchaseListMeta } from '../_components/PurchaseListPagination';

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

type Panel = 'summary' | 'receive' | 'bill';

function poStatusClass(status: string) {
  return cn(
    'text-xs font-semibold px-2.5 py-1 rounded-full',
    status === 'COMPLETED' && 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100',
    status === 'PARTIAL' && 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100',
    status === 'OPEN' && 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
    status === 'CANCELLED' && 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  );
}

function billLineTotal(price: number, qty: number, cgst: number, sgst: number) {
  const base = price * qty;
  const cg = (base * Number(cgst)) / 100;
  const sg = (base * Number(sgst)) / 100;
  return base + cg + sg;
}

function PurchaseOrderDetailContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const poId = String(params.id || '');
  const qc = useQueryClient();

  const [panel, setPanel] = useState<Panel>('summary');
  const [grnsPage, setGrnsPage] = useState(1);
  const [recvNotes, setRecvNotes] = useState('');
  const [recvLines, setRecvLines] = useState<any[]>([]);

  const [billGrnId, setBillGrnId] = useState('');
  const [billPrices, setBillPrices] = useState<Record<string, number>>({});
  const [billForm, setBillForm] = useState({
    supplierInvoiceNo: '',
    invoiceDate: todayISO(),
    amountPaid: '0',
    notes: '',
  });

  const { data: po, isLoading: poLoading, isError: poError } = useQuery({
    queryKey: ['purchase-order', poId],
    queryFn: () => api.get(`/purchase-orders/${poId}`).then(r => r.data.data),
    enabled: !!poId,
  });

  const { data: grnsResp, isLoading: grnsLoading } = useQuery({
    queryKey: ['goods-receipts', 'po', poId, grnsPage],
    queryFn: () => api.get('/goods-receipts', {
      params: { purchaseOrderId: poId, page: grnsPage, limit: PURCHASE_PAGE_SIZE },
    }).then(r => r.data),
    enabled: !!poId,
  });

  const { data: grnsForBillPack } = useQuery({
    queryKey: ['goods-receipts', 'po', poId, 'bill-picker'],
    queryFn: () => api.get('/goods-receipts', {
      params: { purchaseOrderId: poId, page: 1, limit: 100 },
    }).then(r => r.data),
    enabled: !!poId,
  });

  const grnRows = grnsResp?.data || [];
  const grnMeta = grnsResp?.meta as PurchaseListMeta | undefined;

  const unbilledForBill = useMemo(
    () => (grnsForBillPack?.data || []).filter((g: any) => !g.purchaseBill),
    [grnsForBillPack],
  );

  const { data: billGrnDetail, isLoading: billGrnLoading } = useQuery({
    queryKey: ['goods-receipt', billGrnId],
    queryFn: () => api.get(`/goods-receipts/${billGrnId}`).then(r => r.data.data),
    enabled: !!billGrnId && panel === 'bill',
  });

  useEffect(() => {
    if (!po?.items) {
      setRecvLines([]);
      return;
    }
    setRecvLines(
      po.items
        .filter((it: any) => it.qtyReceived < it.qtyOrdered)
        .map((it: any) => {
          const rem = it.qtyOrdered - it.qtyReceived;
          const m = it.medicine;
          const poRate = it.expectedPurchasePrice != null && Number.isFinite(Number(it.expectedPurchasePrice))
            ? Number(it.expectedPurchasePrice)
            : Number(m.purchasePrice) || 0;
          return {
            purchaseOrderItemId: it.id,
            medicineName: m.name,
            remaining: rem,
            qtyReceived: rem,
            freeQuantity: 0,
            poRate,
            purchasePrice: poRate,
            mrp: m.mrp,
            sellingPrice: m.sellingPrice,
            batchNumber: '',
            expiryDate: '',
          };
        }),
    );
  }, [po]);

  const billFromUrl = searchParams.get('bill');
  useEffect(() => {
    if (!billFromUrl) return;
    setBillGrnId(billFromUrl);
    setPanel('bill');
  }, [billFromUrl]);

  useEffect(() => {
    if (panel !== 'bill' || !billGrnDetail?.items) return;
    const next: Record<string, number> = {};
    for (const it of billGrnDetail.items as any[]) {
      const poLine = it.purchaseOrderItem;
      const poRate = poLine?.expectedPurchasePrice != null && Number.isFinite(Number(poLine.expectedPurchasePrice))
        ? Number(poLine.expectedPurchasePrice)
        : Number(it.purchasePrice) || 0;
      next[it.id] = poRate;
    }
    setBillPrices(next);
  }, [billGrnDetail, panel]);

  useEffect(() => {
    if (panel !== 'bill') return;
    if (billGrnId) return;
    const first = unbilledForBill[0];
    if (first) setBillGrnId(first.id);
  }, [panel, billGrnId, unbilledForBill]);

  const createGRN = useMutation({
    mutationFn: (d: any) => api.post('/goods-receipts', d),
    onSuccess: () => {
      toast.success('Goods received — stock updated');
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      qc.invalidateQueries({ queryKey: ['purchase-order', poId] });
      qc.invalidateQueries({ queryKey: ['goods-receipts', 'po', poId] });
      qc.invalidateQueries({ queryKey: ['goods-receipts-unbilled'] });
      qc.invalidateQueries({ queryKey: ['medicines'] });
      setRecvNotes('');
      setPanel('summary');
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const createBill = useMutation({
    mutationFn: (d: any) => api.post('/purchases/from-grn', d),
    onSuccess: () => {
      toast.success('Supplier bill saved');
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['goods-receipts-unbilled'] });
      qc.invalidateQueries({ queryKey: ['goods-receipts'] });
      qc.invalidateQueries({ queryKey: ['goods-receipt', billGrnId] });
      qc.invalidateQueries({ queryKey: ['purchase-order', poId] });
      setBillForm({ supplierInvoiceNo: '', invoiceDate: todayISO(), amountPaid: '0', notes: '' });
      setBillGrnId('');
      setPanel('summary');
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const submitGRN = (e: React.FormEvent) => {
    e.preventDefault();
    const lines = recvLines
      .filter((l) => l.qtyReceived > 0)
      .map((l) => ({
        purchaseOrderItemId: l.purchaseOrderItemId,
        qtyReceived: parseInt(String(l.qtyReceived), 10),
        freeQuantity: parseInt(String(l.freeQuantity), 10) || 0,
        purchasePrice: parseFloat(String(l.purchasePrice)),
        mrp: parseFloat(String(l.mrp)),
        sellingPrice: parseFloat(String(l.sellingPrice)),
        ...(l.batchNumber?.trim() ? { batchNumber: l.batchNumber.trim() } : {}),
        ...(l.expiryDate ? { expiryDate: l.expiryDate } : {}),
      }));
    if (!poId || lines.length === 0) {
      toast.error('Enter quantity to receive');
      return;
    }
    for (const l of recvLines) {
      if (l.qtyReceived > l.remaining) {
        toast.error(`Qty exceeds remaining for ${l.medicineName}`);
        return;
      }
    }
    createGRN.mutate({ purchaseOrderId: poId, notes: recvNotes || null, items: lines });
  };

  const billPreviewTotal = useMemo(() => {
    if (!billGrnDetail?.items) return 0;
    let s = 0;
    for (const it of billGrnDetail.items as any[]) {
      const p = billPrices[it.id];
      const price = Number.isFinite(p) ? p : Number(it.purchasePrice);
      s += billLineTotal(price, it.qtyReceived, it.cgstRate, it.sgstRate);
    }
    return parseFloat(s.toFixed(2));
  }, [billGrnDetail, billPrices]);

  const submitBill = (e: React.FormEvent) => {
    e.preventDefault();
    if (!billGrnId || !billGrnDetail?.items) {
      toast.error('Select a goods receipt');
      return;
    }
    if (billGrnDetail.purchaseBill) {
      toast.error('This receipt is already billed');
      return;
    }
    const itemOverrides = (billGrnDetail.items as any[]).map((it) => ({
      goodsReceiptItemId: it.id,
      purchasePrice: billPrices[it.id] ?? it.purchasePrice,
    }));
    createBill.mutate({
      goodsReceiptId: billGrnId,
      invoiceNumber: billForm.supplierInvoiceNo.trim() || undefined,
      invoiceDate: billForm.invoiceDate || undefined,
      amountPaid: parseFloat(billForm.amountPaid || '0'),
      notes: billForm.notes || null,
      itemOverrides,
    });
  };

  const goBill = useCallback(() => {
    setBillGrnId('');
    setPanel('bill');
  }, []);

  if (poLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-gray-500">
        Loading purchase order…
      </div>
    );
  }

  if (poError || !po) {
    return (
      <div className="card p-10 text-center space-y-4">
        <p className="text-gray-600 dark:text-gray-300">This purchase order could not be loaded.</p>
        <Link href="/purchases" className="btn-primary inline-flex">Back to purchase orders</Link>
      </div>
    );
  }

  const canReceive = po.status === 'OPEN' || po.status === 'PARTIAL';
  const hasUnbilled = unbilledForBill.length > 0;

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link
          href="/purchases"
          className="inline-flex items-center gap-1.5 text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
        >
          <ArrowLeft className="w-4 h-4" />
          All purchase orders
        </Link>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-emerald-200/60 bg-gradient-to-br from-emerald-50 via-white to-slate-50 dark:from-emerald-950/40 dark:via-gray-900 dark:to-gray-950 dark:border-emerald-900/40 shadow-sm">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-400/10 blur-3xl" aria-hidden />
        <div className="relative p-6 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 text-xs font-semibold uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5" />
                Purchase order
              </div>
              <h1 className="mt-2 text-2xl sm:text-3xl font-bold font-mono text-gray-900 dark:text-white tracking-tight">
                {po.poNumber}
              </h1>
              <p className="mt-2 text-gray-600 dark:text-gray-300">
                <span className="font-medium text-gray-900 dark:text-white">{po.supplier?.name}</span>
                <span className="mx-2 text-gray-300 dark:text-gray-600">·</span>
                <span className={poStatusClass(po.status)}>{po.status}</span>
              </p>
              {po.notes && <p className="mt-3 text-sm text-gray-500 max-w-xl">{po.notes}</p>}
              <p className="mt-2 text-xs text-gray-400">Created {formatDate(po.createdAt)}</p>
            </div>

            <div className="flex flex-col sm:flex-row flex-wrap gap-3 lg:shrink-0">
              <button
                type="button"
                onClick={() => setPanel('receive')}
                disabled={!canReceive}
                className={cn(
                  'inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold shadow-sm transition-all',
                  panel === 'receive'
                    ? 'bg-emerald-600 text-white ring-2 ring-emerald-400 ring-offset-2 dark:ring-offset-gray-900'
                    : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-gray-700 hover:border-emerald-300 dark:hover:border-emerald-700',
                  !canReceive && 'opacity-50 cursor-not-allowed',
                )}
              >
                <Package className="w-4 h-4" />
                Receive
              </button>
              <button
                type="button"
                onClick={goBill}
                className={cn(
                  'inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold shadow-sm transition-all',
                  panel === 'bill'
                    ? 'bg-emerald-600 text-white ring-2 ring-emerald-400 ring-offset-2 dark:ring-offset-gray-900'
                    : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-gray-700 hover:border-emerald-300 dark:hover:border-emerald-700',
                )}
              >
                <Receipt className="w-4 h-4" />
                Bill
              </button>
              <Link
                href="/purchases"
                className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                <XCircle className="w-4 h-4" />
                Close
              </Link>
            </div>
          </div>
        </div>
      </div>

      {panel === 'summary' && (
        <div className="grid gap-6 lg:grid-cols-1">
          <div className="card overflow-hidden shadow-sm">
            <div className="flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 px-5 py-4 bg-gray-50/80 dark:bg-gray-900/50">
              <FileStack className="w-5 h-5 text-primary-600" />
              <h2 className="font-semibold text-gray-900 dark:text-white">Line items</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="table text-sm">
                <thead>
                  <tr>
                    <th>Medicine</th>
                    <th>Ordered</th>
                    <th>Received</th>
                    <th>PO rate</th>
                  </tr>
                </thead>
                <tbody>
                  {(po.items || []).map((it: any) => (
                    <tr key={it.id}>
                      <td className="font-medium">{it.medicine?.name}</td>
                      <td>{it.qtyOrdered}</td>
                      <td>{it.qtyReceived ?? 0}</td>
                      <td className="tabular-nums">{formatCurrency(Number(it.expectedPurchasePrice) || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card overflow-hidden shadow-sm">
            <div className="flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 px-5 py-4 bg-gray-50/80 dark:bg-gray-900/50">
              <Package className="w-5 h-5 text-primary-600" />
              <h2 className="font-semibold text-gray-900 dark:text-white">Goods receipts</h2>
            </div>
            {grnsLoading ? (
              <p className="p-6 text-sm text-gray-500">Loading…</p>
            ) : grnMeta?.total === 0 ? (
              <p className="p-6 text-sm text-gray-500">No receipts yet — use <strong>Receive</strong> to record stock.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="table text-sm">
                    <thead>
                      <tr>
                        <th>GRN</th>
                        <th>Date</th>
                        <th>Lines</th>
                        <th>Receipt</th>
                        <th>Supplier bill</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grnRows.map((g: any) => (
                        <tr key={g.id}>
                          <td className="font-mono text-xs font-medium">{g.grnNumber}</td>
                          <td className="text-xs text-gray-500">{formatDate(g.createdAt)}</td>
                          <td>{g._count?.items ?? '—'}</td>
                          <td>
                            <Link
                              href={`/purchases/receipt/${g.id}`}
                              className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-400"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              Open
                            </Link>
                          </td>
                          <td>
                            {g.purchaseBill?.id ? (
                              <Link
                                href={`/purchases/bill/${g.purchaseBill.id}`}
                                className="inline-flex items-center gap-1.5 text-sm font-mono font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
                              >
                                <Receipt className="w-3.5 h-3.5" />
                                {g.purchaseBill.purchaseNumber}
                              </Link>
                            ) : (
                              <button
                                type="button"
                                className="text-xs font-semibold text-emerald-600 hover:underline"
                                onClick={() => {
                                  setBillGrnId(g.id);
                                  setPanel('bill');
                                }}
                              >
                                Create bill
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 pb-4 bg-gray-50/50 dark:bg-gray-900/30 border-t border-gray-100 dark:border-gray-800">
                  <PurchaseListPagination meta={grnMeta} page={grnsPage} onPageChange={setGrnsPage} compact />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {panel === 'receive' && (
        <div className="card p-6 sm:p-8 shadow-sm border-emerald-100 dark:border-emerald-900/30">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Package className="w-5 h-5 text-emerald-600" />
                Receive goods (GRN)
              </h2>
              <p className="text-sm text-gray-500 mt-1 max-w-2xl">
                GRN number is assigned on save. Stock increases here — not when you record the supplier bill.
              </p>
            </div>
            <button type="button" className="btn-outline text-sm" onClick={() => setPanel('summary')}>
              Back to summary
            </button>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 bg-stone-50 dark:bg-gray-800/60 rounded-xl px-4 py-3 border border-stone-200/80 dark:border-gray-700 mb-6">
            <strong className="text-gray-700 dark:text-gray-300">PO ₹</strong> is from the purchase order.
            <strong className="text-gray-700 dark:text-gray-300"> Purchase ₹</strong> is prefilled the same — change if the supplier’s invoice rate differs.
          </p>
          <div className="mb-6">
            <label className="label">Notes (optional)</label>
            <input
              className="input max-w-xl"
              value={recvNotes}
              onChange={(e) => setRecvNotes(e.target.value)}
              placeholder="Delivery note, vehicle…"
            />
          </div>
          {recvLines.length === 0 && canReceive && (
            <p className="text-sm text-amber-600 mb-4">Nothing left to receive — all lines are fully received.</p>
          )}
          {!canReceive && (
            <p className="text-sm text-gray-500 mb-4">This PO cannot receive more goods.</p>
          )}
          {recvLines.length > 0 && (
            <form onSubmit={submitGRN} className="space-y-6">
              <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
                <table className="table text-xs sm:text-sm">
                  <thead>
                    <tr>
                      <th>Medicine</th>
                      <th>Remaining</th>
                      <th>Receive now</th>
                      <th>Free</th>
                      <th>PO ₹</th>
                      <th>Purchase ₹</th>
                      <th>MRP</th>
                      <th>Sell</th>
                      <th>Batch</th>
                      <th>Expiry</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recvLines.map((l, idx) => (
                      <tr key={l.purchaseOrderItemId}>
                        <td className="font-medium whitespace-nowrap">{l.medicineName}</td>
                        <td>{l.remaining}</td>
                        <td>
                          <input
                            type="number"
                            min={0}
                            max={l.remaining}
                            className="w-16 input py-1.5"
                            value={l.qtyReceived}
                            onChange={(e) => {
                              const v = parseInt(e.target.value, 10) || 0;
                              setRecvLines((prev) => prev.map((x, i) => i === idx ? { ...x, qtyReceived: Math.min(l.remaining, Math.max(0, v)) } : x));
                            }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min={0}
                            className="w-14 input py-1.5"
                            value={l.freeQuantity}
                            onChange={(e) => setRecvLines((prev) => prev.map((x, i) => i === idx ? { ...x, freeQuantity: parseInt(e.target.value, 10) || 0 } : x))}
                          />
                        </td>
                        <td className="tabular-nums text-gray-500">{formatCurrency(l.poRate)}</td>
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            className="w-24 input py-1.5 tabular-nums"
                            value={l.purchasePrice}
                            onChange={(e) => setRecvLines((prev) => prev.map((x, i) => i === idx ? { ...x, purchasePrice: parseFloat(e.target.value) || 0 } : x))}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            className="w-24 input py-1.5"
                            value={l.mrp}
                            onChange={(e) => setRecvLines((prev) => prev.map((x, i) => i === idx ? { ...x, mrp: parseFloat(e.target.value) || 0 } : x))}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            className="w-24 input py-1.5"
                            value={l.sellingPrice}
                            onChange={(e) => setRecvLines((prev) => prev.map((x, i) => i === idx ? { ...x, sellingPrice: parseFloat(e.target.value) || 0 } : x))}
                          />
                        </td>
                        <td>
                          <input
                            className="w-24 input py-1.5"
                            placeholder="—"
                            value={l.batchNumber}
                            onChange={(e) => setRecvLines((prev) => prev.map((x, i) => i === idx ? { ...x, batchNumber: e.target.value } : x))}
                          />
                        </td>
                        <td>
                          <input
                            type="date"
                            className="input py-1.5 w-36"
                            value={l.expiryDate}
                            onChange={(e) => setRecvLines((prev) => prev.map((x, i) => i === idx ? { ...x, expiryDate: e.target.value } : x))}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="submit" disabled={createGRN.isPending} className="btn-primary">
                <Package className="w-4 h-4 inline mr-2" />
                {createGRN.isPending ? 'Saving…' : 'Save GRN & update stock'}
              </button>
            </form>
          )}
        </div>
      )}

      {panel === 'bill' && (
        <div className="card p-6 sm:p-8 shadow-sm border-emerald-100 dark:border-emerald-900/30">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Receipt className="w-5 h-5 text-emerald-600" />
                Supplier bill from receipt
              </h2>
              <p className="text-sm text-gray-500 mt-1 max-w-2xl">
                Rates default to the <strong>PO line</strong> price. Adjust <strong>Bill ₹</strong> to match the supplier’s invoice before saving.
              </p>
            </div>
            <button type="button" className="btn-outline text-sm" onClick={() => setPanel('summary')}>
              Back to summary
            </button>
          </div>

          {!hasUnbilled && !grnsLoading && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 dark:bg-amber-950/20 dark:border-amber-900/50 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
              There is no unbilled goods receipt for this PO yet. Receive stock first, then return here to bill.
            </div>
          )}

          {hasUnbilled && (
            <form onSubmit={submitBill} className="space-y-6">
              <div>
                <label className="label">Goods receipt *</label>
                <select
                  className="input max-w-xl"
                  value={billGrnId}
                  onChange={(e) => setBillGrnId(e.target.value)}
                  required
                >
                  <option value="">Select GRN…</option>
                  {unbilledForBill.map((g: any) => (
                    <option key={g.id} value={g.id}>{g.grnNumber} · {formatDate(g.createdAt)}</option>
                  ))}
                </select>
                {unbilledForBill.length >= 100 && (
                  <p className="text-xs text-amber-600 mt-2">Showing first 100 receipts — contact support if you need more in the list.</p>
                )}
              </div>

              {billGrnLoading && <p className="text-sm text-gray-500">Loading receipt lines…</p>}

              {billGrnDetail?.purchaseBill && (
                <p className="text-sm text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/30 rounded-lg px-4 py-3 border border-amber-200/80 dark:border-amber-900/50">
                  Already billed as <span className="font-mono font-semibold">{billGrnDetail.purchaseBill.purchaseNumber}</span>. Choose another GRN.
                </p>
              )}

              {billGrnDetail && !billGrnDetail.purchaseBill && billGrnDetail.items?.length > 0 && (
                <>
                  <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
                    <table className="table text-sm">
                      <thead>
                        <tr>
                          <th>Medicine</th>
                          <th>Qty</th>
                          <th>PO ₹</th>
                          <th>Bill ₹</th>
                          <th>GST</th>
                          <th className="text-right">Line (incl. GST)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(billGrnDetail.items as any[]).map((it) => {
                          const poLine = it.purchaseOrderItem;
                          const poRate = poLine?.expectedPurchasePrice != null && Number.isFinite(Number(poLine.expectedPurchasePrice))
                            ? Number(poLine.expectedPurchasePrice)
                            : Number(it.purchasePrice) || 0;
                          const price = billPrices[it.id] ?? poRate;
                          const lineTot = billLineTotal(price, it.qtyReceived, it.cgstRate, it.sgstRate);
                          return (
                            <tr key={it.id}>
                              <td className="font-medium">{it.medicineName}</td>
                              <td>{it.qtyReceived}</td>
                              <td className="tabular-nums text-gray-500">{formatCurrency(poRate)}</td>
                              <td>
                                <input
                                  type="number"
                                  step="0.01"
                                  min={0}
                                  className="input py-1.5 w-28 tabular-nums"
                                  value={billPrices[it.id] ?? poRate}
                                  onChange={(e) => {
                                    const v = parseFloat(e.target.value);
                                    setBillPrices((prev) => ({ ...prev, [it.id]: Number.isFinite(v) ? v : 0 }));
                                  }}
                                />
                              </td>
                              <td className="text-xs text-gray-500">
                                {Number(it.cgstRate) + Number(it.sgstRate)}%
                              </td>
                              <td className="text-right font-semibold tabular-nums">{formatCurrency(lineTot)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-wrap justify-between gap-4 items-center rounded-xl bg-gray-50 dark:bg-gray-900/50 px-4 py-3 border border-gray-200 dark:border-gray-700">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Bill total (incl. GST)</span>
                    <span className="text-xl font-bold tabular-nums text-gray-900 dark:text-white">{formatCurrency(billPreviewTotal)}</span>
                  </div>
                </>
              )}

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Bill date</label>
                  <input
                    type="date"
                    className="input"
                    value={billForm.invoiceDate}
                    onChange={(e) => setBillForm((f) => ({ ...f, invoiceDate: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label">Supplier invoice no. (optional)</label>
                  <input
                    className="input"
                    value={billForm.supplierInvoiceNo}
                    onChange={(e) => setBillForm((f) => ({ ...f, supplierInvoiceNo: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label">Amount paid (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    className="input"
                    value={billForm.amountPaid}
                    onChange={(e) => setBillForm((f) => ({ ...f, amountPaid: e.target.value }))}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Notes</label>
                  <input
                    className="input"
                    value={billForm.notes}
                    onChange={(e) => setBillForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={
                  createBill.isPending
                  || !billGrnId
                  || !billGrnDetail
                  || !!billGrnDetail.purchaseBill
                  || billGrnLoading
                }
                className="btn-primary"
              >
                {createBill.isPending ? 'Saving…' : 'Create supplier bill (PUR)'}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

export default function PurchaseOrderDetailPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-gray-500">Loading…</div>}>
      <PurchaseOrderDetailContent />
    </Suspense>
  );
}
