'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ArrowLeft, Package, Receipt, ExternalLink, Pencil, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';

type LineForm = {
  id: string;
  medicineName: string;
  qtyReceived: string;
  freeQuantity: string;
  purchasePrice: string;
  mrp: string;
  sellingPrice: string;
  batchNumber: string;
  expiryDate: string;
};

function toDateInput(d: string | null | undefined) {
  if (!d) return '';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  return x.toISOString().split('T')[0];
}

export default function GoodsReceiptDetailPage() {
  const params = useParams();
  const grnId = String(params.grnId || '');
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [notesEdit, setNotesEdit] = useState('');
  const [lines, setLines] = useState<LineForm[]>([]);

  const { data: grn, isLoading, isError, refetch } = useQuery({
    queryKey: ['goods-receipt', grnId],
    queryFn: () => api.get(`/goods-receipts/${grnId}`).then(r => r.data.data),
    enabled: !!grnId,
  });

  const syncFormFromGrn = () => {
    if (!grn?.items) return;
    setNotesEdit(grn.notes || '');
    setLines(
      (grn.items as any[]).map((it) => ({
        id: it.id,
        medicineName: it.medicineName,
        qtyReceived: String(it.qtyReceived),
        freeQuantity: String(it.freeQuantity ?? 0),
        purchasePrice: String(it.purchasePrice),
        mrp: String(it.mrp),
        sellingPrice: String(it.sellingPrice),
        batchNumber: it.batchNumber || '',
        expiryDate: toDateInput(it.expiryDate),
      })),
    );
  };

  const saveMutation = useMutation({
    mutationFn: (payload: { notes: string | null; items: any[] }) => api.patch(`/goods-receipts/${grnId}`, payload),
    onSuccess: () => {
      toast.success('Receipt updated — stock and PO quantities adjusted');
      setEditing(false);
      qc.invalidateQueries({ queryKey: ['goods-receipt', grnId] });
      qc.invalidateQueries({ queryKey: ['goods-receipts'] });
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      qc.invalidateQueries({ queryKey: ['purchase-order'] });
      qc.invalidateQueries({ queryKey: ['medicines'] });
      refetch();
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Could not update receipt'),
  });

  const poId = grn?.purchaseOrder?.id;
  const poNumber = grn?.purchaseOrder?.poNumber;
  const bill = grn?.purchaseBill;
  const canEdit = grn && !bill?.id;

  const startEdit = () => {
    syncFormFromGrn();
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    syncFormFromGrn();
  };

  const submitEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!grn?.items?.length) return;
    const items = lines.map((l) => ({
      id: l.id,
      qtyReceived: parseInt(l.qtyReceived, 10),
      freeQuantity: parseInt(l.freeQuantity, 10) || 0,
      purchasePrice: parseFloat(l.purchasePrice),
      mrp: parseFloat(l.mrp),
      sellingPrice: parseFloat(l.sellingPrice),
      batchNumber: l.batchNumber?.trim() || undefined,
      expiryDate: l.expiryDate || undefined,
    }));
    for (const l of items) {
      if (!Number.isFinite(l.qtyReceived) || l.qtyReceived < 1) {
        toast.error('Each line needs qty ≥ 1');
        return;
      }
      if (!Number.isFinite(l.purchasePrice) || l.purchasePrice < 0) {
        toast.error('Invalid purchase price');
        return;
      }
    }
    saveMutation.mutate({
      notes: notesEdit.trim() || null,
      items,
    });
  };

  if (isLoading) {
    return <div className="py-16 text-center text-gray-500">Loading receipt…</div>;
  }

  if (isError || !grn) {
    return (
      <div className="card p-10 text-center space-y-4">
        <p className="text-gray-600 dark:text-gray-300">Receipt not found.</p>
        <Link href="/purchases" className="btn-primary inline-flex">Back to purchases</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {poId ? (
          <Link
            href={`/purchases/${poId}`}
            className="inline-flex items-center gap-1.5 text-gray-600 dark:text-gray-400 hover:text-primary-600"
          >
            <ArrowLeft className="w-4 h-4" />
            PO {poNumber || 'detail'}
          </Link>
        ) : (
          <Link href="/purchases" className="inline-flex items-center gap-1.5 text-gray-600 hover:text-primary-600">
            <ArrowLeft className="w-4 h-4" />
            All purchase orders
          </Link>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-slate-50 to-white dark:from-slate-900/50 dark:to-gray-900 p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary-100 dark:bg-primary-900/40 p-3 text-primary-700 dark:text-primary-300">
              <Package className="w-7 h-7" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Goods receipt</p>
              <h1 className="text-2xl font-bold font-mono text-gray-900 dark:text-white mt-1">{grn.grnNumber}</h1>
              <p className="text-sm text-gray-500 mt-1">{formatDate(grn.createdAt)}</p>
              {!editing && grn.notes && <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">{grn.notes}</p>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canEdit && !editing && (
              <button type="button" onClick={startEdit} className="btn-outline text-sm inline-flex items-center gap-2">
                <Pencil className="w-4 h-4" />
                Edit receipt
              </button>
            )}
            {editing && (
              <>
                <button type="button" onClick={cancelEdit} className="btn-outline text-sm inline-flex items-center gap-2">
                  <X className="w-4 h-4" />
                  Cancel
                </button>
              </>
            )}
            {bill?.id ? (
              <Link
                href={`/purchases/bill/${bill.id}`}
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
              >
                <Receipt className="w-4 h-4" />
                Open supplier bill
                <ExternalLink className="w-3.5 h-3.5 opacity-80" />
              </Link>
            ) : (
              poId && (
                <Link
                  href={`/purchases/${poId}?bill=${grnId}`}
                  className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                >
                  <Receipt className="w-4 h-4" />
                  Create bill from this receipt
                </Link>
              )
            )}
          </div>
        </div>
        {bill?.id && (
          <p className="mt-4 text-sm text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/25 rounded-lg px-3 py-2 border border-amber-200/80 dark:border-amber-900/40">
            This receipt is billed (<span className="font-mono font-semibold">{bill.purchaseNumber}</span>). Edit or void the bill first, then you can correct the receipt.
          </p>
        )}
      </div>

      <div className="card overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900/50">
          <h2 className="font-semibold text-gray-900 dark:text-white">Receipt lines</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {editing
              ? 'Fix wrong qty, rate, batch, or expiry. Stock and PO received qty will be adjusted.'
              : 'Quantities and rates as recorded when stock was received.'}
          </p>
        </div>

        {editing ? (
          <form onSubmit={submitEdit} className="p-4 space-y-4">
            <div>
              <label className="label">Notes</label>
              <input className="input" value={notesEdit} onChange={(e) => setNotesEdit(e.target.value)} placeholder="Optional" />
            </div>
            <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-xl">
              <table className="table text-sm">
                <thead>
                  <tr>
                    <th>Medicine</th>
                    <th>Qty</th>
                    <th>Free</th>
                    <th>Purchase ₹</th>
                    <th>MRP</th>
                    <th>Sell ₹</th>
                    <th>Batch</th>
                    <th>Expiry</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, idx) => (
                    <tr key={l.id}>
                      <td className="font-medium whitespace-nowrap">{l.medicineName}</td>
                      <td>
                        <input
                          type="number"
                          min={1}
                          className="input py-1.5 w-20"
                          value={l.qtyReceived}
                          onChange={(e) => setLines((prev) => prev.map((x, i) => i === idx ? { ...x, qtyReceived: e.target.value } : x))}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          className="input py-1.5 w-16"
                          value={l.freeQuantity}
                          onChange={(e) => setLines((prev) => prev.map((x, i) => i === idx ? { ...x, freeQuantity: e.target.value } : x))}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          className="input py-1.5 w-24 tabular-nums"
                          value={l.purchasePrice}
                          onChange={(e) => setLines((prev) => prev.map((x, i) => i === idx ? { ...x, purchasePrice: e.target.value } : x))}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          className="input py-1.5 w-24"
                          value={l.mrp}
                          onChange={(e) => setLines((prev) => prev.map((x, i) => i === idx ? { ...x, mrp: e.target.value } : x))}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          className="input py-1.5 w-24"
                          value={l.sellingPrice}
                          onChange={(e) => setLines((prev) => prev.map((x, i) => i === idx ? { ...x, sellingPrice: e.target.value } : x))}
                        />
                      </td>
                      <td>
                        <input
                          className="input py-1.5 w-24"
                          value={l.batchNumber}
                          onChange={(e) => setLines((prev) => prev.map((x, i) => i === idx ? { ...x, batchNumber: e.target.value } : x))}
                        />
                      </td>
                      <td>
                        <input
                          type="date"
                          className="input py-1.5 w-36"
                          value={l.expiryDate}
                          onChange={(e) => setLines((prev) => prev.map((x, i) => i === idx ? { ...x, expiryDate: e.target.value } : x))}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="submit" disabled={saveMutation.isPending} className="btn-primary">
              {saveMutation.isPending ? 'Saving…' : 'Save receipt corrections'}
            </button>
          </form>
        ) : (
          <div className="overflow-x-auto">
            <table className="table text-sm">
              <thead>
                <tr>
                  <th>Medicine</th>
                  <th>Qty</th>
                  <th>Free</th>
                  <th>Purchase ₹</th>
                  <th>MRP</th>
                  <th>GST</th>
                  <th className="text-right">Line (incl. GST)</th>
                </tr>
              </thead>
              <tbody>
                {(grn.items || []).map((it: any) => (
                  <tr key={it.id}>
                    <td className="font-medium">{it.medicineName}</td>
                    <td>{it.qtyReceived}</td>
                    <td>{it.freeQuantity ?? 0}</td>
                    <td className="tabular-nums">{formatCurrency(Number(it.purchasePrice))}</td>
                    <td className="tabular-nums">{formatCurrency(Number(it.mrp))}</td>
                    <td className="text-xs text-gray-500">{Number(it.cgstRate) + Number(it.sgstRate)}%</td>
                    <td className="text-right font-medium tabular-nums">{formatCurrency(Number(it.amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
