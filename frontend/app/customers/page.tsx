'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, User, Edit, X, Eye, MapPin } from 'lucide-react';
import toast from 'react-hot-toast';
import Link from 'next/link';
import api from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { INDIA_STATES, validateIndiaPincode } from '@/lib/india-states';

const EMPTY = {
  name: '', phone: '', email: '',
  address: '', city: '', state: '', pincode: '',
  creditLimit: '0',
};

export default function CustomersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editCustomer, setEditCustomer] = useState<any>(null);
  const [form, setForm] = useState(EMPTY);
  const [pincodeError, setPincodeError] = useState('');
  const [viewCustomer, setViewCustomer] = useState<any>(null);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['customers', search, page],
    queryFn: () => api.get('/customers', { params: { search, page, limit: 20 } }).then(r => r.data),
  });

  const { data: customerDetail } = useQuery({
    queryKey: ['customer-detail', viewCustomer?.id],
    queryFn: () => api.get(`/customers/${viewCustomer.id}`).then(r => r.data.data),
    enabled: !!viewCustomer?.id,
  });

  const saveMutation = useMutation({
    mutationFn: (d: any) => editCustomer
      ? api.put(`/customers/${editCustomer.id}`, d)
      : api.post('/customers', d),
    onSuccess: () => {
      toast.success(editCustomer ? 'Customer updated!' : 'Customer added!');
      qc.invalidateQueries({ queryKey: ['customers'] });
      setShowForm(false); setEditCustomer(null); setForm(EMPTY); setPincodeError('');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const customers = data?.data || [];
  const meta = data?.meta;
  const totalCredit = customers.reduce((s: number, c: any) => s + (c.currentCredit || 0), 0);

  const handlePincodeChange = (val: string) => {
    const numeric = val.replace(/\D/g, '').slice(0, 6);
    setForm(f => ({ ...f, pincode: numeric }));
    setPincodeError(validateIndiaPincode(numeric) || '');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const pinErr = validateIndiaPincode(form.pincode);
    if (pinErr) { setPincodeError(pinErr); return; }
    saveMutation.mutate({ ...form, creditLimit: parseFloat(form.creditLimit) });
  };

  const openEdit = (c: any) => {
    setEditCustomer(c);
    setForm({
      name: c.name, phone: c.phone || '', email: c.email || '',
      address: c.address || '', city: c.city || '',
      state: c.state || '', pincode: c.pincode || '',
      creditLimit: String(c.creditLimit || 0),
    });
    setPincodeError('');
    setShowForm(true);
  };

  const formatAddress = (c: any) => {
    const parts = [c.city, c.state, c.pincode].filter(Boolean);
    return parts.join(', ') || '—';
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name or phone..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="input pl-9 w-72"
          />
        </div>
        <button onClick={() => { setShowForm(true); setEditCustomer(null); setForm(EMPTY); setPincodeError(''); }} className="btn-primary">
          <Plus className="w-4 h-4" /> Add Customer
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{meta?.total || 0}</div>
          <div className="text-sm text-gray-500">Total Customers</div>
        </div>
        <div className="card p-4">
          <div className="text-2xl font-bold text-red-600">{formatCurrency(totalCredit)}</div>
          <div className="text-sm text-gray-500">Total Credit Outstanding</div>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Phone</th>
                <th>Location</th>
                <th>Bills</th>
                <th>Credit</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400">No customers found</td></tr>
              ) : customers.map((c: any) => (
                <tr key={c.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
                        <span className="text-sm font-bold text-gray-600 dark:text-gray-400">
                          {c.name[0].toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white">{c.name}</div>
                        {c.email && <div className="text-xs text-gray-400">{c.email}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="text-gray-600 dark:text-gray-400">{c.phone || '—'}</td>
                  <td>
                    <div className="flex items-start gap-1.5 text-sm">
                      {(c.city || c.state || c.pincode) ? (
                        <>
                          <MapPin className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                          <div>
                            {c.city && <div className="text-gray-700 dark:text-gray-300">{c.city}</div>}
                            <div className="text-xs text-gray-400">
                              {[c.state, c.pincode].filter(Boolean).join(' – ')}
                            </div>
                          </div>
                        </>
                      ) : <span className="text-gray-400">—</span>}
                    </div>
                  </td>
                  <td>
                    <span className="badge badge-blue">{c._count?.bills || 0} bills</span>
                  </td>
                  <td className={c.currentCredit > 0 ? 'text-red-600 font-semibold' : 'text-gray-400'}>
                    {c.currentCredit > 0 ? formatCurrency(c.currentCredit) : '—'}
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setViewCustomer(c)} className="text-gray-400 hover:text-primary-600" title="View history">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button onClick={() => openEdit(c)} className="text-gray-400 hover:text-primary-600" title="Edit">
                        <Edit className="w-4 h-4" />
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
            <span className="text-sm text-gray-400">Page {meta.page} of {meta.totalPages}</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-secondary btn-sm disabled:opacity-40">Previous</button>
              <button disabled={page >= meta.totalPages} onClick={() => setPage(p => p + 1)} className="btn-secondary btn-sm disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
              <h3 className="font-bold text-lg">{editCustomer ? 'Edit Customer' : 'Add Customer'}</h3>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
              {/* Basic info */}
              <div>
                <label className="label">Full Name *</label>
                <input required className="input" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Phone</label>
                  <input type="tel" className="input" value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Credit Limit (₹)</label>
                  <input type="number" min="0" className="input" value={form.creditLimit}
                    onChange={e => setForm(f => ({ ...f, creditLimit: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="label">Email</label>
                <input type="email" className="input" value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>

              {/* Address section */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                <div className="bg-gray-50 dark:bg-gray-800/50 px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" /> Shipping / Billing Address
                  </span>
                </div>
                <div className="p-4 space-y-3">
                  <div>
                    <label className="label">Address Line 1</label>
                    <input
                      className="input"
                      placeholder="Building, Street, Area"
                      value={form.address}
                      onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">City</label>
                      <input
                        className="input"
                        placeholder="e.g. Mumbai"
                        value={form.city}
                        onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="label">Pin Code</label>
                      <input
                        className={cn('input', pincodeError && 'border-red-400 focus:ring-red-300')}
                        placeholder="6-digit pincode"
                        value={form.pincode}
                        onChange={e => handlePincodeChange(e.target.value)}
                        maxLength={6}
                        inputMode="numeric"
                      />
                      {pincodeError && <p className="text-xs text-red-500 mt-1">{pincodeError}</p>}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">State</label>
                      <select
                        className="input"
                        value={form.state}
                        onChange={e => setForm(f => ({ ...f, state: e.target.value }))}
                      >
                        <option value="">— Select State —</option>
                        {INDIA_STATES.map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label">Country</label>
                      <input className="input bg-gray-50 dark:bg-gray-800" value="India" readOnly />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={saveMutation.isPending} className="btn-primary flex-1">
                  {saveMutation.isPending ? 'Saving...' : editCustomer ? 'Update' : 'Add Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer History Modal */}
      {viewCustomer && customerDetail && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
              <div>
                <h3 className="font-bold text-lg text-gray-900 dark:text-white">{customerDetail.name}</h3>
                <div className="flex flex-wrap gap-3 mt-1 text-sm text-gray-500">
                  {customerDetail.phone && <span>{customerDetail.phone}</span>}
                  {customerDetail.email && <span>{customerDetail.email}</span>}
                </div>
                {/* Address display */}
                {(customerDetail.address || customerDetail.city || customerDetail.state) && (
                  <div className="mt-2 flex items-start gap-1.5 text-xs text-gray-400">
                    <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-gray-400" />
                    <div>
                      {customerDetail.address && <div>{customerDetail.address}</div>}
                      <div>
                        {[customerDetail.city, customerDetail.state, customerDetail.pincode]
                          .filter(Boolean).join(', ')}
                        {(customerDetail.city || customerDetail.state) && ', India'}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <button onClick={() => setViewCustomer(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-4 grid grid-cols-3 gap-3 border-b border-gray-100 dark:border-gray-800 shrink-0">
              <div className="text-center">
                <div className="font-bold text-xl text-gray-900 dark:text-white">{customerDetail.bills?.length || 0}</div>
                <div className="text-xs text-gray-400">Total Bills</div>
              </div>
              <div className="text-center">
                <div className="font-bold text-xl text-gray-900 dark:text-white">
                  {formatCurrency(customerDetail.bills?.reduce((s: number, b: any) => s + b.netAmount, 0) || 0)}
                </div>
                <div className="text-xs text-gray-400">Total Spent</div>
              </div>
              <div className="text-center">
                <div className={`font-bold text-xl ${customerDetail.currentCredit > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {formatCurrency(customerDetail.currentCredit || 0)}
                </div>
                <div className="text-xs text-gray-400">Outstanding</div>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              <table className="table">
                <thead>
                  <tr><th>Bill No.</th><th>Date</th><th>Amount</th><th>Payment</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {customerDetail.bills?.map((b: any) => (
                    <tr key={b.id}>
                      <td className="font-mono text-xs text-primary-600">{b.billNumber}</td>
                      <td>{formatDate(b.createdAt)}</td>
                      <td className="font-semibold">{formatCurrency(b.netAmount)}</td>
                      <td><span className="badge badge-blue">{b.paymentMode}</span></td>
                      <td>
                        <span className={cn('badge', b.paymentStatus === 'PAID' ? 'badge-green' : b.paymentStatus === 'PARTIAL' ? 'badge-yellow' : 'badge-red')}>
                          {b.paymentStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
