'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Receipt, Package, IndianRupee, Pencil, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { cn, formatCurrency, formatDate } from '@/lib/utils';

function lineAmount(purchasePrice: number, qty: number, cgst: number, sgst: number) {
  const base = purchasePrice * qty;
  const cg = (base * Number(cgst)) / 100;
  const sg = (base * Number(sgst)) / 100;
  return base + cg + sg;
}

export default function SupplierBillDetailPage() {
  const params = useParams();
  const purchaseId = String(params.purchaseId || '');
  const qc = useQueryClient();
  const [payAmount, setPayAmount] = useState('');
  const [editing, setEditing] = useState(false);
  const [invNo, setInvNo] = useState('');
  const [invDate, setInvDate] = useState('');
  const [notesEdit, setNotesEdit] = useState('');
  const [lineEdits, setLineEdits] = useState<{ id: string; purchasePrice: string; mrp: string; sellingPrice: string }[]>([]);

  const { data: bill, isLoading, isError, refetch } = useQuery({
    queryKey: ['purchase', purchaseId],
    queryFn: () => api.get(`/purchases/${purchaseId}`).then(r => r.data.data),
    enabled: !!purchaseId,
  });

  const payMutation = useMutation({
    mutationFn: (amount: number) => api.patch(`/purchases/${purchaseId}/payment`, { amountPaid: amount }),
    onSuccess: () => {
      toast.success('Payment recorded');
      setPayAmount('');
      qc.invalidateQueries({ queryKey: ['purchase', purchaseId] });
      qc.invalidateQueries({ queryKey: ['purchases'] });
      refetch();
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Could not update payment'),
  });

  const updateBillMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch(`/purchases/${purchaseId}`, body),
    onSuccess: () => {
      toast.success('Supplier bill updated');
      setEditing(false);
      qc.invalidateQueries({ queryKey: ['purchase', purchaseId] });
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['suppliers-list'] });
      refetch();
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Could not update bill'),
  });

  const startEdit = () => {
    if (!bill?.items) return;
    setInvNo(bill.invoiceNumber || '');
    setInvDate(bill.invoiceDate ? String(bill.invoiceDate).split('T')[0] : '');
    setNotesEdit(bill.notes || '');
    setLineEdits(
      bill.items.map((it: any) => ({
        id: it.id,
        purchasePrice: String(it.purchasePrice),
        mrp: String(it.mrp),
        sellingPrice: String(it.sellingPrice),
      })),
    );
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
  };

  const previewTotal = useMemo(() => {
    if (!bill?.items || !editing || lineEdits.length !== bill.items.length) return null;
    let s = 0;
    bill.items.forEach((it: any, idx: number) => {
      const le = lineEdits[idx];
      if (!le || le.id !== it.id) return;
      const p = parseFloat(le.purchasePrice);
      if (!Number.isFinite(p)) return;
      s += lineAmount(p, it.quantity, it.cgstRate, it.sgstRate);
    });
    return parseFloat(s.toFixed(2));
  }, [bill, editing, lineEdits]);

  const previewDue = useMemo(() => {
    if (previewTotal == null || !bill) return null;
    return Math.max(0, parseFloat((previewTotal - bill.amountPaid).toFixed(2)));
  }, [previewTotal, bill]);

  const submitBillEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bill?.items) return;
    const items = lineEdits.map((le) => ({
      id: le.id,
      purchasePrice: parseFloat(le.purchasePrice),
      mrp: parseFloat(le.mrp),
      sellingPrice: parseFloat(le.sellingPrice),
    }));
    for (const it of items) {
      if (!Number.isFinite(it.purchasePrice) || it.purchasePrice < 0) {
        toast.error('Invalid purchase price on a line');
        return;
      }
    }
    updateBillMutation.mutate({
      invoiceNumber: invNo.trim() || null,
      invoiceDate: invDate || null,
      notes: notesEdit.trim() || null,
      items,
    });
  };

  const grnId = bill?.goodsReceipt?.id;
  const poId = bill?.goodsReceipt?.purchaseOrder?.id;
  const poNumber = bill?.goodsReceipt?.purchaseOrder?.poNumber;
  const grnNumber = bill?.goodsReceipt?.grnNumber;

  const onPaySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = parseFloat(payAmount);
    if (!Number.isFinite(v) || v <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    payMutation.mutate(v);
  };

  if (isLoading) {
    return <div className="py-16 text-center text-gray-500">Loading bill…</div>;
  }

  if (isError || !bill) {
    return (
      <div className="card p-10 text-center space-y-4">
        <p className="text-gray-600 dark:text-gray-300">Bill not found.</p>
        <Link href="/purchases" className="btn-primary inline-flex">Back to purchases</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link href="/purchases" className="inline-flex items-center gap-1.5 text-gray-600 dark:text-gray-400 hover:text-primary-600">
          <ArrowLeft className="w-4 h-4" />
          All purchase orders
        </Link>
        {poId && (
          <>
            <span className="text-gray-300">/</span>
            <Link href={`/purchases/${poId}`} className="text-primary-600 hover:underline font-medium">
              PO {poNumber}
            </Link>
          </>
        )}
      </div>

      <div className="rounded-2xl border border-emerald-200/70 dark:border-emerald-900/50 bg-gradient-to-br from-emerald-50 via-white to-slate-50 dark:from-emerald-950/30 dark:via-gray-900 dark:to-gray-950 p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-emerald-600 text-white p-3 shadow-md">
              <Receipt className="w-7 h-7" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">Supplier bill</p>
              <h1 className="text-2xl font-bold font-mono text-gray-900 dark:text-white mt-1">{bill.purchaseNumber}</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {bill.supplier?.name}
                <span className="mx-2 text-gray-300">·</span>
                {formatDate(bill.invoiceDate || bill.createdAt)}
              </p>
              {!editing && bill.invoiceNumber && (
                <p className="text-xs text-gray-500 mt-1">Invoice ref: <span className="font-mono">{bill.invoiceNumber}</span></p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {!editing && (
              <button type="button" onClick={startEdit} className="btn-outline text-sm inline-flex items-center gap-2">
                <Pencil className="w-4 h-4" />
                Edit bill
              </button>
            )}
            {editing && (
              <button type="button" onClick={cancelEdit} className="btn-outline text-sm inline-flex items-center gap-2">
                <X className="w-4 h-4" />
                Cancel edit
              </button>
            )}
            {grnId && (
              <Link
                href={`/purchases/receipt/${grnId}`}
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-primary-400"
              >
                <Package className="w-4 h-4" />
                Open receipt {grnNumber ? `(${grnNumber})` : ''}
              </Link>
            )}
          </div>
        </div>

        {grnId && (
          <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
            Quantities on this bill match the goods receipt. To fix wrong <strong>quantities</strong>, edit the receipt first (if not billed), then adjust this bill’s rates here.
          </p>
        )}

        <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="rounded-xl bg-white/80 dark:bg-gray-900/60 border border-gray-100 dark:border-gray-800 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total</p>
            <p className="text-lg font-bold tabular-nums mt-1">
              {editing && previewTotal != null ? formatCurrency(previewTotal) : formatCurrency(bill.totalAmount)}
            </p>
          </div>
          <div className="rounded-xl bg-white/80 dark:bg-gray-900/60 border border-gray-100 dark:border-gray-800 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Paid</p>
            <p className="text-lg font-bold tabular-nums text-emerald-600 mt-1">{formatCurrency(bill.amountPaid)}</p>
          </div>
          <div className="rounded-xl bg-white/80 dark:bg-gray-900/60 border border-gray-100 dark:border-gray-800 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Due</p>
            <p className={cn(
              'text-lg font-bold tabular-nums mt-1',
              (editing ? previewDue : bill.amountDue) > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-gray-400',
            )}>
              {editing && previewDue != null ? formatCurrency(previewDue) : formatCurrency(bill.amountDue)}
            </p>
          </div>
          <div className="rounded-xl bg-white/80 dark:bg-gray-900/60 border border-gray-100 dark:border-gray-800 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Tax</p>
            <p className="text-lg font-bold tabular-nums mt-1">{formatCurrency(bill.totalTax || 0)}</p>
          </div>
        </div>
      </div>

      {bill.amountDue > 0 && !editing && (
        <div className="card p-5 border-amber-200/80 dark:border-amber-900/40 bg-amber-50/30 dark:bg-amber-950/10">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <IndianRupee className="w-4 h-4" />
            Record payment
          </h3>
          <p className="text-xs text-gray-500 mt-1">Adds to amount paid and reduces supplier balance due.</p>
          <form onSubmit={onPaySubmit} className="mt-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="label">Amount (₹)</label>
              <input
                type="number"
                step="0.01"
                min={0.01}
                max={bill.amountDue}
                className="input w-40"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <button type="submit" disabled={payMutation.isPending} className="btn-primary">
              {payMutation.isPending ? 'Saving…' : 'Apply payment'}
            </button>
          </form>
        </div>
      )}

      {!editing && bill.notes && (
        <p className="text-sm text-gray-600 dark:text-gray-400"><strong>Notes:</strong> {bill.notes}</p>
      )}

      <div className="card overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900/50">
          <h2 className="font-semibold text-gray-900 dark:text-white">Bill lines</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {editing ? 'Change purchase ₹ / MRP / sell to match the supplier invoice. Qty is fixed.' : 'Line amounts include GST.'}
          </p>
        </div>

        {editing ? (
          <form onSubmit={submitBillEdit} className="p-4 space-y-4">
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label className="label">Supplier invoice no.</label>
                <input className="input" value={invNo} onChange={(e) => setInvNo(e.target.value)} />
              </div>
              <div>
                <label className="label">Bill date</label>
                <input type="date" className="input" value={invDate} onChange={(e) => setInvDate(e.target.value)} />
              </div>
              <div className="sm:col-span-3">
                <label className="label">Notes</label>
                <input className="input" value={notesEdit} onChange={(e) => setNotesEdit(e.target.value)} />
              </div>
            </div>
            <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-xl">
              <table className="table text-sm">
                <thead>
                  <tr>
                    <th>Medicine</th>
                    <th>Qty</th>
                    <th>Purchase ₹</th>
                    <th>MRP</th>
                    <th>Sell ₹</th>
                    <th>GST</th>
                    <th className="text-right">Line (preview)</th>
                  </tr>
                </thead>
                <tbody>
                  {(bill.items || []).map((it: any, idx: number) => {
                    const le = lineEdits[idx];
                    const p = le ? parseFloat(le.purchasePrice) : it.purchasePrice;
                    const prev = Number.isFinite(p)
                      ? lineAmount(p, it.quantity, it.cgstRate, it.sgstRate)
                      : 0;
                    return (
                      <tr key={it.id}>
                        <td className="font-medium">{it.medicineName}</td>
                        <td>{it.quantity}</td>
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            min={0}
                            className="input py-1.5 w-28 tabular-nums"
                            value={le?.purchasePrice ?? ''}
                            onChange={(e) => setLineEdits((prev) => prev.map((x, i) => i === idx ? { ...x, purchasePrice: e.target.value } : x))}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            min={0}
                            className="input py-1.5 w-24"
                            value={le?.mrp ?? ''}
                            onChange={(e) => setLineEdits((prev) => prev.map((x, i) => i === idx ? { ...x, mrp: e.target.value } : x))}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            min={0}
                            className="input py-1.5 w-24"
                            value={le?.sellingPrice ?? ''}
                            onChange={(e) => setLineEdits((prev) => prev.map((x, i) => i === idx ? { ...x, sellingPrice: e.target.value } : x))}
                          />
                        </td>
                        <td className="text-xs text-gray-500">{Number(it.cgstRate) + Number(it.sgstRate)}%</td>
                        <td className="text-right font-medium tabular-nums">{formatCurrency(prev)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button type="submit" disabled={updateBillMutation.isPending} className="btn-primary">
              {updateBillMutation.isPending ? 'Saving…' : 'Save bill changes'}
            </button>
          </form>
        ) : (
          <div className="overflow-x-auto">
            <table className="table text-sm">
              <thead>
                <tr>
                  <th>Medicine</th>
                  <th>Qty</th>
                  <th>Purchase ₹</th>
                  <th>GST</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {(bill.items || []).map((it: any) => (
                  <tr key={it.id}>
                    <td className="font-medium">{it.medicineName}</td>
                    <td>{it.quantity}</td>
                    <td className="tabular-nums">{formatCurrency(Number(it.purchasePrice))}</td>
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
