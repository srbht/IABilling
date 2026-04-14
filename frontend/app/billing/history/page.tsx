'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Printer, Search, IndianRupee, X, CreditCard } from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import api, { openAuthenticatedPdf } from '@/lib/api';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { cn } from '@/lib/utils';

export default function BillHistoryPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [paymentMode, setPaymentMode] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');

  // Record payment modal state
  const [payBill, setPayBill] = useState<any>(null);
  const [payAmount, setPayAmount] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['bills', search, page, paymentMode, paymentStatus],
    queryFn: () => api.get('/billing', {
      params: { search, page, limit: 20, paymentMode: paymentMode || undefined, paymentStatus: paymentStatus || undefined },
    }).then(r => r.data),
  });

  const recordPaymentMutation = useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: number }) =>
      api.patch(`/billing/${id}/payment`, { amountPaid: amount }),
    onSuccess: (res) => {
      const updated = res.data.data;
      toast.success(
        updated.paymentStatus === 'PAID'
          ? 'Bill fully paid — customer credit updated'
          : `Payment recorded. Remaining due: ${formatCurrency(updated.amountDue)}`
      );
      qc.invalidateQueries({ queryKey: ['bills'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['customer-detail'] });
      setPayBill(null);
      setPayAmount('');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to record payment'),
  });

  const bills = data?.data || [];
  const meta = data?.meta;

  const openPayModal = (bill: any) => {
    setPayBill(bill);
    setPayAmount(bill.amountDue.toFixed(2));
  };

  const handleRecordPayment = () => {
    const amount = parseFloat(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (amount > payBill.amountDue + 0.01) {
      toast.error(`Amount cannot exceed due amount of ${formatCurrency(payBill.amountDue)}`);
      return;
    }
    recordPaymentMutation.mutate({ id: payBill.id, amount });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search bill no. or customer..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="input pl-9"
          />
        </div>
        <select value={paymentMode} onChange={e => setPaymentMode(e.target.value)} className="input w-36">
          <option value="">All Modes</option>
          {['CASH', 'UPI', 'CARD', 'CREDIT'].map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)} className="input w-36">
          <option value="">All Status</option>
          {['PAID', 'PARTIAL', 'PENDING'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <Link href="/billing" className="btn-primary">+ New Bill</Link>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Bill No.</th>
                <th>Customer</th>
                <th>Items</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Due</th>
                <th>Payment</th>
                <th>Status</th>
                <th>Date</th>
                <th>By</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {bills.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-8 text-gray-400">No bills found</td></tr>
              ) : bills.map((bill: any) => (
                <tr key={bill.id} className={cn(
                  bill.paymentStatus === 'PENDING' && bill.paymentMode === 'CREDIT' && 'bg-red-50/40 dark:bg-red-900/10',
                  bill.paymentStatus === 'PARTIAL' && 'bg-yellow-50/40 dark:bg-yellow-900/10',
                )}>
                  <td className="font-mono text-xs font-medium text-primary-600 dark:text-primary-400">{bill.billNumber}</td>
                  <td>
                    <div>{bill.customerName || <span className="text-gray-400 italic">Walk-in</span>}</div>
                    {bill.customerPhone && <div className="text-xs text-gray-400">{bill.customerPhone}</div>}
                  </td>
                  <td className="text-gray-500">{bill._count?.items}</td>
                  <td className="font-semibold">{formatCurrency(bill.netAmount)}</td>
                  <td className="text-green-600 font-medium">
                    {bill.amountPaid > 0 ? formatCurrency(bill.amountPaid) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className={bill.amountDue > 0 ? 'text-red-600 font-semibold' : 'text-gray-300'}>
                    {bill.amountDue > 0 ? formatCurrency(bill.amountDue) : '—'}
                  </td>
                  <td>
                    <span className={cn(
                      'badge',
                      bill.paymentMode === 'CASH' && 'badge-green',
                      bill.paymentMode === 'UPI' && 'badge-blue',
                      bill.paymentMode === 'CARD' && 'badge-blue',
                      bill.paymentMode === 'CREDIT' && 'badge-yellow',
                    )}>{bill.paymentMode}</span>
                  </td>
                  <td>
                    <span className={cn(
                      'badge',
                      bill.paymentStatus === 'PAID' && 'badge-green',
                      bill.paymentStatus === 'PARTIAL' && 'badge-yellow',
                      bill.paymentStatus === 'PENDING' && 'badge-red',
                    )}>{bill.paymentStatus}</span>
                  </td>
                  <td className="text-xs text-gray-400">{formatDateTime(bill.createdAt)}</td>
                  <td className="text-xs text-gray-400">{bill.user?.name}</td>
                  <td>
                    <div className="flex items-center gap-1.5">
                      {/* Record Payment — shown for unpaid/partial credit bills */}
                      {bill.amountDue > 0 && (
                        <button
                          type="button"
                          onClick={() => openPayModal(bill)}
                          className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40 border border-green-200 dark:border-green-800 transition-colors"
                          title="Record payment"
                        >
                          <IndianRupee className="w-3 h-3" /> Pay
                        </button>
                      )}
                      <button
                        type="button"
                        className="text-gray-400 hover:text-primary-600 p-1 rounded"
                        title="Print Invoice"
                        onClick={async () => {
                          try {
                            await openAuthenticatedPdf(`billing/${bill.id}/pdf`);
                          } catch (e: any) {
                            toast.error(e?.message || 'Could not open PDF');
                          }
                        }}
                      >
                        <Printer className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-800">
            <span className="text-sm text-gray-400">
              Showing {bills.length} of {meta.total} bills | Page {meta.page} of {meta.totalPages}
            </span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-secondary btn-sm disabled:opacity-40">Previous</button>
              <button disabled={page >= meta.totalPages} onClick={() => setPage(p => p + 1)} className="btn-secondary btn-sm disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* ─── Record Payment Modal ──────────────────────────────────── */}
      {payBill && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center">
                  <CreditCard className="w-4 h-4 text-green-600" />
                </div>
                <div>
                  <h3 className="font-bold text-base">Record Payment</h3>
                  <p className="text-xs text-gray-400">Bill {payBill.billNumber}</p>
                </div>
              </div>
              <button onClick={() => { setPayBill(null); setPayAmount(''); }}>
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Bill summary */}
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 space-y-2 text-sm">
                {payBill.customerName && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Customer</span>
                    <span className="font-medium">{payBill.customerName}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-500">Bill Total</span>
                  <span className="font-medium">{formatCurrency(payBill.netAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Already Paid</span>
                  <span className="font-medium text-green-600">{formatCurrency(payBill.amountPaid)}</span>
                </div>
                <div className="flex justify-between border-t border-gray-200 dark:border-gray-700 pt-2 font-semibold">
                  <span className="text-red-600">Outstanding Due</span>
                  <span className="text-red-600">{formatCurrency(payBill.amountDue)}</span>
                </div>
              </div>

              {/* Amount input */}
              <div>
                <label className="label">Amount Being Paid (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={payBill.amountDue}
                  className="input text-lg font-semibold"
                  value={payAmount}
                  onChange={e => setPayAmount(e.target.value)}
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') handleRecordPayment(); }}
                  placeholder={`Max: ${payBill.amountDue.toFixed(2)}`}
                />
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => setPayAmount(payBill.amountDue.toFixed(2))}
                    className="text-xs text-primary-600 hover:underline font-medium"
                  >
                    Pay full amount ({formatCurrency(payBill.amountDue)})
                  </button>
                </div>
              </div>

              {/* After-payment preview */}
              {(() => {
                const entered = parseFloat(payAmount || '0');
                if (!Number.isFinite(entered) || entered <= 0) return null;
                const remaining = Math.max(0, payBill.amountDue - entered);
                return (
                  <div className={cn(
                    'rounded-xl p-3 text-sm',
                    remaining <= 0
                      ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                      : 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'
                  )}>
                    {remaining <= 0 ? (
                      <p className="text-green-700 dark:text-green-400 font-semibold">
                        ✓ Bill will be fully settled
                        {payBill.paymentMode === 'CREDIT' && ' — customer credit balance will be updated'}
                      </p>
                    ) : (
                      <p className="text-yellow-700 dark:text-yellow-400">
                        Remaining due after this payment: <strong>{formatCurrency(remaining)}</strong>
                      </p>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Footer */}
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-800">
              <button
                type="button"
                onClick={() => { setPayBill(null); setPayAmount(''); }}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRecordPayment}
                disabled={recordPaymentMutation.isPending || !payAmount || parseFloat(payAmount) <= 0}
                className="btn-primary flex-1"
              >
                {recordPaymentMutation.isPending ? 'Recording…' : 'Record Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
