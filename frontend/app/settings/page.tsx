'use client';
import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Store, Shield, ImageIcon, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { getBackendOrigin } from '@/lib/api';

export default function SettingsPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<Record<string, string>>({});
  const logoInputRef = useRef<HTMLInputElement>(null);

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get('/settings').then(r => r.data.data),
  });

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: (d: any) => api.put('/settings', d),
    onSuccess: () => {
      toast.success('Settings saved!');
      qc.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: () => toast.error('Failed to save settings'),
  });

  const [logoUploading, setLogoUploading] = useState(false);
  const [logoRev, setLogoRev] = useState(0);

  async function handleLogoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLogoUploading(true);
    try {
      const fd = new FormData();
      fd.append('logo', file);
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const res = await fetch(`${window.location.origin}/api/settings/logo`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message || 'Upload failed');
      toast.success('Logo updated — will appear on printed invoices');
      qc.invalidateQueries({ queryKey: ['settings'] });
      if (j.data?.store_logo_url) setForm((f) => ({ ...f, store_logo_url: j.data.store_logo_url }));
      setLogoRev((r) => r + 1);
    } catch (err: any) {
      toast.error(err?.message || 'Logo upload failed');
    } finally {
      setLogoUploading(false);
    }
  }

  if (isLoading) return <div className="text-center py-8 text-gray-400">Loading...</div>;

  const set = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }));

  return (
    <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(form); }} className="max-w-2xl space-y-6">
      {/* Store Info */}
      <div className="card p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Store className="w-5 h-5 text-primary-600" />
          <h3 className="font-semibold text-gray-900 dark:text-white">Store Information</h3>
        </div>
        <div>
          <label className="label">Store Name</label>
          <input className="input" value={form.store_name || ''} onChange={e => set('store_name', e.target.value)} />
        </div>
        <div>
          <label className="label">Address</label>
          <textarea rows={2} className="input resize-none" value={form.store_address || ''} onChange={e => set('store_address', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Phone</label>
            <input className="input" value={form.store_phone || ''} onChange={e => set('store_phone', e.target.value)} />
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" className="input" value={form.store_email || ''} onChange={e => set('store_email', e.target.value)} />
          </div>
          <div>
            <label className="label">GSTIN</label>
            <input className="input" value={form.store_gstin || ''} onChange={e => set('store_gstin', e.target.value)} />
          </div>
          <div>
            <label className="label">Drug License No.</label>
            <input className="input" value={form.store_drug_license || ''} onChange={e => set('store_drug_license', e.target.value)} />
          </div>
          <div>
            <label className="label">Shop state (default place of supply)</label>
            <input className="input" value={form.store_state || ''} onChange={e => set('store_state', e.target.value)} placeholder="e.g. Maharashtra" />
          </div>
          <div>
            <label className="label">PAN (optional on invoice)</label>
            <input className="input" value={form.store_pan || ''} onChange={e => set('store_pan', e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="label">FSSAI licence (optional)</label>
            <input className="input" value={form.store_fssai || ''} onChange={e => set('store_fssai', e.target.value)} />
          </div>
        </div>

        <div className="pt-2 border-t border-stone-100 dark:border-gray-800">
          <div className="flex items-center gap-2 mb-2">
            <ImageIcon className="w-4 h-4 text-primary-600" />
            <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Invoice logo</span>
          </div>
          <p className="text-xs text-gray-500 mb-3">PNG or JPEG, max 2 MB. Shown on GST tax invoice PDF (top-left).</p>
          <div className="flex flex-wrap items-center gap-4">
            <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={handleLogoSelect} />
            <button
              type="button"
              disabled={logoUploading}
              onClick={() => logoInputRef.current?.click()}
              className="btn-outline inline-flex items-center gap-2 text-sm"
            >
              <Upload className="w-4 h-4" />
              {logoUploading ? 'Uploading…' : 'Upload logo'}
            </button>
            {form.store_logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`${getBackendOrigin()}${form.store_logo_url}?v=${logoRev}`}
                alt="Store logo"
                className="h-16 w-auto max-w-[200px] object-contain rounded border border-stone-200 dark:border-gray-700 bg-white"
              />
            ) : (
              <span className="text-xs text-gray-400">No logo yet</span>
            )}
          </div>
        </div>

        <div>
          <label className="label">Invoice legal footer (Schedule H / H1)</label>
          <textarea
            rows={3}
            className="input resize-y text-sm"
            value={form.bill_footer_legal || ''}
            onChange={e => set('bill_footer_legal', e.target.value)}
            placeholder="Printed at bottom of every tax invoice"
          />
        </div>
      </div>

      {/* Billing settings */}
      <div className="card p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="w-5 h-5 text-primary-600" />
          <h3 className="font-semibold text-gray-900 dark:text-white">Billing & Alerts</h3>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Bill Number Prefix</label>
            <input className="input" value={form.bill_prefix || ''} onChange={e => set('bill_prefix', e.target.value)} />
          </div>
          <div>
            <label className="label">Supplier bill prefix (PUR)</label>
            <input className="input" value={form.purchase_prefix || ''} onChange={e => set('purchase_prefix', e.target.value)} />
          </div>
          <div>
            <label className="label">Purchase order prefix (PO)</label>
            <input className="input" value={form.po_prefix || ''} onChange={e => set('po_prefix', e.target.value)} />
          </div>
          <div>
            <label className="label">Goods receipt prefix (GRN)</label>
            <input className="input" value={form.grn_prefix || ''} onChange={e => set('grn_prefix', e.target.value)} />
          </div>
          <div>
            <label className="label">Low Stock Alert Quantity</label>
            <input type="number" min="1" className="input" value={form.low_stock_alert_days || ''} onChange={e => set('low_stock_alert_days', e.target.value)} />
          </div>
          <div>
            <label className="label">Expiry Alert (days before)</label>
            <input type="number" min="1" className="input" value={form.expiry_alert_days || ''} onChange={e => set('expiry_alert_days', e.target.value)} />
          </div>
        </div>
      </div>

      <button type="submit" disabled={saveMutation.isPending} className="btn-primary btn-lg">
        <Save className="w-5 h-5" />
        {saveMutation.isPending ? 'Saving...' : 'Save Settings'}
      </button>
    </form>
  );
}
