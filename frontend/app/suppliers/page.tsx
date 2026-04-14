'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit, Truck, X, Phone, Mail, MapPin } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { INDIA_STATES, validateIndiaPincode } from '@/lib/india-states';

const EMPTY = {
  name: '', contactPerson: '', phone: '', email: '',
  address: '', city: '', state: '', pincode: '',
  gstin: '', drugLicense: '', openingBalance: '0',
};

export default function SuppliersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editSupplier, setEditSupplier] = useState<any>(null);
  const [form, setForm] = useState(EMPTY);
  const [pincodeError, setPincodeError] = useState('');
  const [viewSupplier, setViewSupplier] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['suppliers', search],
    queryFn: () => api.get('/suppliers', { params: { search, limit: 50 } }).then(r => r.data),
  });

  const { data: supplierDetail } = useQuery({
    queryKey: ['supplier-detail', viewSupplier?.id],
    queryFn: () => api.get(`/suppliers/${viewSupplier.id}`).then(r => r.data.data),
    enabled: !!viewSupplier?.id,
  });

  const saveMutation = useMutation({
    mutationFn: (d: any) => editSupplier
      ? api.put(`/suppliers/${editSupplier.id}`, d)
      : api.post('/suppliers', d),
    onSuccess: () => {
      toast.success(editSupplier ? 'Supplier updated!' : 'Supplier added!');
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      setShowForm(false);
      setEditSupplier(null);
      setForm(EMPTY);
      setPincodeError('');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const suppliers = data?.data || [];

  const handlePincodeChange = (val: string) => {
    const numeric = val.replace(/\D/g, '').slice(0, 6);
    setForm(f => ({ ...f, pincode: numeric }));
    setPincodeError(validateIndiaPincode(numeric) || '');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const pinErr = validateIndiaPincode(form.pincode);
    if (pinErr) { setPincodeError(pinErr); return; }
    saveMutation.mutate({ ...form, openingBalance: parseFloat(form.openingBalance) });
  };

  const openEdit = (sup: any) => {
    setEditSupplier(sup);
    setForm({
      name: sup.name, contactPerson: sup.contactPerson || '',
      phone: sup.phone, email: sup.email || '',
      address: sup.address || '', city: sup.city || '',
      state: sup.state || '', pincode: sup.pincode || '',
      gstin: sup.gstin || '', drugLicense: sup.drugLicense || '',
      openingBalance: String(sup.openingBalance || 0),
    });
    setPincodeError('');
    setShowForm(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search suppliers..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input pl-9"
          />
        </div>
        <button onClick={() => { setShowForm(true); setEditSupplier(null); setForm(EMPTY); setPincodeError(''); }} className="btn-primary">
          <Plus className="w-4 h-4" /> Add Supplier
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{suppliers.length}</div>
          <div className="text-sm text-gray-500">Total Suppliers</div>
        </div>
        <div className="card p-4">
          <div className="text-2xl font-bold text-red-600">
            {formatCurrency(suppliers.reduce((s: number, sup: any) => s + (sup.currentBalance || 0), 0))}
          </div>
          <div className="text-sm text-gray-500">Total Outstanding</div>
        </div>
      </div>

      {/* Suppliers grid */}
      {isLoading ? (
        <div className="text-center py-8 text-gray-400">Loading...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {suppliers.map((sup: any) => (
            <div key={sup.id} className="card p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                    <Truck className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">{sup.name}</h3>
                    {sup.contactPerson && <p className="text-xs text-gray-400">{sup.contactPerson}</p>}
                  </div>
                </div>
                <button onClick={() => openEdit(sup)} className="text-gray-400 hover:text-primary-600">
                  <Edit className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-1.5 text-sm">
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <Phone className="w-3.5 h-3.5 text-gray-400" />
                  {sup.phone}
                </div>
                {sup.email && (
                  <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                    <Mail className="w-3.5 h-3.5 text-gray-400" />
                    {sup.email}
                  </div>
                )}
                {(sup.address || sup.city || sup.state) && (
                  <div className="flex items-start gap-2 text-gray-600 dark:text-gray-400">
                    <MapPin className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                    <div>
                      {sup.address && <div className="text-xs">{sup.address}</div>}
                      <div className="text-xs">
                        {[sup.city, sup.state].filter(Boolean).join(', ')}
                        {sup.pincode && ` – ${sup.pincode}`}
                        {(sup.city || sup.state) && ', India'}
                      </div>
                    </div>
                  </div>
                )}
                {sup.gstin && (
                  <div className="text-xs text-gray-400 font-mono">GSTIN: {sup.gstin}</div>
                )}
              </div>

              <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <div>
                  <div className="text-xs text-gray-400">Outstanding</div>
                  <div className={`font-semibold ${sup.currentBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {formatCurrency(sup.currentBalance || 0)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-400">Purchases</div>
                  <div className="font-semibold text-gray-900 dark:text-white">{sup._count?.purchases || 0}</div>
                </div>
                <button onClick={() => setViewSupplier(sup)} className="text-xs text-primary-600 hover:underline">
                  View History →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
              <h3 className="font-bold text-lg">{editSupplier ? 'Edit Supplier' : 'Add Supplier'}</h3>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">

              {/* Basic info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="label">Supplier Name *</label>
                  <input required className="input" value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Contact Person</label>
                  <input className="input" value={form.contactPerson}
                    onChange={e => setForm(f => ({ ...f, contactPerson: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Phone *</label>
                  <input required type="tel" className="input" value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Email</label>
                  <input type="email" className="input" value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div>
                  <label className="label">GSTIN</label>
                  <input className="input" placeholder="e.g. 27AABCU9603R1ZX" value={form.gstin}
                    onChange={e => setForm(f => ({ ...f, gstin: e.target.value.toUpperCase() }))} />
                </div>
                <div className="col-span-2">
                  <label className="label">Drug License No.</label>
                  <input className="input" value={form.drugLicense}
                    onChange={e => setForm(f => ({ ...f, drugLicense: e.target.value }))} />
                </div>
              </div>

              {/* Address section */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                <div className="bg-gray-50 dark:bg-gray-800/50 px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" /> Supplier Address
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
                  {saveMutation.isPending ? 'Saving...' : editSupplier ? 'Update' : 'Add Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Purchase history modal */}
      {viewSupplier && supplierDetail && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
              <div>
                <h3 className="font-bold text-lg">{supplierDetail.name} — Purchase History</h3>
                {(supplierDetail.address || supplierDetail.city || supplierDetail.state) && (
                  <div className="flex items-start gap-1.5 mt-1 text-xs text-gray-400">
                    <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>
                      {supplierDetail.address && `${supplierDetail.address}, `}
                      {[supplierDetail.city, supplierDetail.state, supplierDetail.pincode].filter(Boolean).join(', ')}
                      {(supplierDetail.city || supplierDetail.state) && ', India'}
                    </span>
                  </div>
                )}
              </div>
              <button onClick={() => setViewSupplier(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              {supplierDetail.purchases?.length === 0 ? (
                <p className="text-center text-gray-400 py-8">No purchases yet</p>
              ) : (
                <table className="table">
                  <thead>
                    <tr><th>Purchase No.</th><th>Date</th><th>Amount</th><th>Paid</th><th>Due</th></tr>
                  </thead>
                  <tbody>
                    {supplierDetail.purchases?.map((p: any) => (
                      <tr key={p.id}>
                        <td className="font-mono text-xs">{p.purchaseNumber}</td>
                        <td>{formatDate(p.createdAt)}</td>
                        <td className="font-semibold">{formatCurrency(p.totalAmount)}</td>
                        <td className="text-green-600">{formatCurrency(p.amountPaid)}</td>
                        <td className={p.amountDue > 0 ? 'text-red-600 font-semibold' : 'text-gray-400'}>
                          {formatCurrency(p.amountDue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
