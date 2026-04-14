'use client';
import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Search, Edit, Trash2, Package, Filter, Download, Upload,
  X, ChevronDown, DollarSign, BarChart2, ArrowUp, ArrowDown,
  ArrowUpDown, TrendingUp, TrendingDown, RefreshCw, FileText,
  CheckSquare, AlertTriangle, ShoppingBag,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { cn, formatCurrency, formatDate, formatStrength, getExpiryStatus, getStockStatus } from '@/lib/utils';

/* ─── Interfaces ─────────────────────────────────────────────────── */
interface Medicine {
  id: string;
  sku?: string | null;
  name: string;
  brandName?: string | null;
  genericName?: string | null;
  category: string;
  manufacturer?: string | null;
  batchNumber: string;
  barcode?: string | null;
  hsnCode?: string | null;
  strengthMg?: number | null;
  strengthUnit?: string | null;
  strengthLabel?: string | null;
  composition?: string | null;
  packSize?: string | null;
  dosageForm?: string | null;
  purchasePrice: number;
  sellingPrice: number;
  mrp: number;
  defaultDiscountPct?: number | null;
  taxInclusive?: boolean | null;
  quantity: number;
  minStockLevel: number;
  expiryDate: string;
  gstRate: number;
  cgstRate: number;
  sgstRate: number;
  unit: string;
  schedule?: string | null;
  requiresPrescription?: boolean | null;
  notes?: string | null;
  supplierId?: string | null;
  location?: string | null;
  description?: string | null;
  isActive: boolean;
  substituteMedicineIds?: unknown;
  lastPurchaseDate?: string | null;
}

interface BulkStockRow {
  id: string; name: string; sku: string; currentQty: number;
  type: string; quantity: string; reason: string;
}

interface BulkPriceRow {
  id: string; name: string; sku: string;
  purchasePrice: string; sellingPrice: string; mrp: string;
  origPP: number; origSP: number; origMRP: number;
}

interface InventoryStats {
  totalItems: number; lowStockCount: number; outOfStockCount: number;
  stockValue: number; mrpValue: number;
}

/* ─── Constants ─────────────────────────────────────────────────── */
const EMPTY_FORM = {
  sku: '', name: '', brandName: '', genericName: '', category: '', manufacturer: '', batchNumber: '',
  barcode: '', hsnCode: '', schedule: '', unit: 'strip',
  composition: '', packSize: '', dosageForm: '',
  strengthMg: '', strengthUnit: 'mg', strengthLabel: '',
  defaultDiscountPct: '0', requiresPrescription: 'false', taxInclusive: 'false',
  supplierId: '', substituteIds: '', notes: '',
  purchasePrice: '', sellingPrice: '', mrp: '', quantity: '',
  minStockLevel: '10', expiryDate: '', gstRate: '12', cgstRate: '6', sgstRate: '6',
  location: '', description: '',
};

const TABS = [
  { id: 'all', label: 'All Items' },
  { id: 'lowStock', label: '⚠️ Low Stock' },
  { id: 'expiring', label: '🕐 Expiring Soon' },
  { id: 'expired', label: '❌ Expired' },
];

const CSV_HEADERS = [
  'sku', 'name', 'brandName', 'genericName', 'category', 'manufacturer',
  'batchNumber', 'hsnCode', 'dosageForm', 'packSize', 'composition',
  'strengthMg', 'strengthUnit', 'unit', 'purchasePrice', 'sellingPrice',
  'mrp', 'quantity', 'minStockLevel', 'expiryDate', 'gstRate', 'location', 'notes',
];

/* ─── CSV Utilities ─────────────────────────────────────────────── */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (line[i] === ',' && !inQuotes) {
      result.push(current); current = '';
    } else { current += line[i]; }
  }
  result.push(current);
  return result;
}

/* ─── Component ─────────────────────────────────────────────────── */
export default function InventoryPage() {
  const qc = useQueryClient();

  /* existing state */
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [filterBrand, setFilterBrand] = useState('');
  const [filterSupplierId, setFilterSupplierId] = useState('');
  const [filterManufacturer, setFilterManufacturer] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editMed, setEditMed] = useState<Medicine | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [adjustModal, setAdjustModal] = useState<Medicine | null>(null);
  const [adjustForm, setAdjustForm] = useState({ type: 'ADDITION', quantity: '', reason: '' });

  /* new state */
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [showBulkStock, setShowBulkStock] = useState(false);
  const [showBulkPrice, setShowBulkPrice] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [bulkStockRows, setBulkStockRows] = useState<BulkStockRow[]>([]);
  const [bulkPriceRows, setBulkPriceRows] = useState<BulkPriceRow[]>([]);
  const [bulkStockSearch, setBulkStockSearch] = useState('');
  const [bulkPriceSearch, setBulkPriceSearch] = useState('');
  const [importRows, setImportRows] = useState<Record<string, string>[]>([]);
  const [importResult, setImportResult] = useState<{ created: number; updated: number; errors: { name: string; error: string }[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bulkActionsRef = useRef<HTMLDivElement>(null);

  /* rack management */
  const [showRackManager, setShowRackManager] = useState(false);
  const [newRackName, setNewRackName] = useState('');
  const [showRackDropdown, setShowRackDropdown] = useState(false);
  const rackInputRef = useRef<HTMLInputElement>(null);

  /* inline stock / price quick-edit */
  const [inlineStockRow, setInlineStockRow] = useState<string | null>(null);
  const [inlineStockQty, setInlineStockQty] = useState('');
  const [inlineStockType, setInlineStockType] = useState('ADDITION');
  const [quickPriceMed, setQuickPriceMed] = useState<Medicine | null>(null);
  const [quickPriceForm, setQuickPriceForm] = useState({ purchasePrice: '', sellingPrice: '', mrp: '' });

  /* close bulk actions dropdown on outside click */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (bulkActionsRef.current && !bulkActionsRef.current.contains(e.target as Node)) {
        setShowBulkActions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  /* ─── Query params ─── */
  const params: Record<string, string | number> = { page, limit: 15, search, sortBy, sortOrder };
  if (tab === 'lowStock') params.lowStock = 'true';
  if (tab === 'expiring') params.expiringSoon = '90';
  if (tab === 'expired') params.expiringSoon = '0';
  if (filterBrand.trim()) params.brand = filterBrand.trim();
  if (filterSupplierId) params.supplierId = filterSupplierId;
  if (filterManufacturer.trim()) params.manufacturer = filterManufacturer.trim();
  if (filterCategory.trim()) params.category = filterCategory.trim();

  /* ─── Queries ─── */
  const { data, isLoading } = useQuery({
    queryKey: ['medicines', tab, search, page, filterBrand, filterSupplierId, filterManufacturer, filterCategory, sortBy, sortOrder],
    queryFn: () => {
      if (tab === 'expired') {
        return api.get('/medicines/alerts').then(r => ({
          data: r.data.data.expired,
          meta: { total: r.data.data.expired.length, page: 1, totalPages: 1 },
        }));
      }
      if (tab === 'expiring') {
        return api.get('/medicines', { params: { ...params, expiringSoon: 90 } }).then(r => r.data);
      }
      return api.get('/medicines', { params }).then(r => r.data);
    },
    staleTime: 30_000,
  });

  const { data: stats, refetch: refetchStats } = useQuery<InventoryStats>({
    queryKey: ['medicine-stats'],
    queryFn: () => api.get('/medicines/stats').then(r => r.data.data),
    staleTime: 30_000,
  });

  const { data: categories } = useQuery({
    queryKey: ['medicine-categories'],
    queryFn: () => api.get('/medicines/categories').then(r => r.data.data),
  });

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers-dd'],
    queryFn: () => api.get('/suppliers', { params: { limit: 500, page: 1 } }).then(r => r.data.data),
  });

  const { data: racksRaw = [], refetch: refetchRacks } = useQuery<{ name: string; description: string }[]>({
    queryKey: ['racks'],
    queryFn: () => api.get('/racks').then(r => r.data.data),
    staleTime: 60_000,
  });
  const racks: string[] = racksRaw.map(r => r.name);

  const addRackMutation = useMutation({
    mutationFn: (name: string) => api.post('/racks', { name }),
    onSuccess: () => { toast.success('Rack added'); setNewRackName(''); refetchRacks(); },
    onError: (err: { response?: { data?: { message?: string } } }) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const deleteRackMutation = useMutation({
    mutationFn: (name: string) => api.delete(`/racks/${encodeURIComponent(name)}`),
    onSuccess: () => { toast.success('Rack removed'); refetchRacks(); },
    onError: () => toast.error('Failed to remove rack'),
  });

  const { data: filterOptions } = useQuery({
    queryKey: ['medicine-filter-options'],
    queryFn: () => api.get('/medicines/filter-options').then(r => r.data.data),
    staleTime: 60_000,
  });

  /* ─── Mutations ─── */
  const saveMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => editMed
      ? api.put(`/medicines/${editMed.id}`, data)
      : api.post('/medicines', data),
    onSuccess: () => {
      toast.success(editMed ? 'Medicine updated!' : 'Medicine added!');
      qc.invalidateQueries({ queryKey: ['medicines'] });
      qc.invalidateQueries({ queryKey: ['medicine-filter-options'] });
      qc.invalidateQueries({ queryKey: ['medicine-stats'] });
      setShowForm(false); setEditMed(null); setForm(EMPTY_FORM);
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err.response?.data?.message || 'Save failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/medicines/${id}`),
    onSuccess: () => {
      toast.success('Medicine removed');
      qc.invalidateQueries({ queryKey: ['medicines'] });
      qc.invalidateQueries({ queryKey: ['medicine-stats'] });
    },
    onError: () => toast.error('Delete failed'),
  });

  const adjustMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.post(`/medicines/${id}/adjust-stock`, data),
    onSuccess: () => {
      toast.success('Stock adjusted');
      qc.invalidateQueries({ queryKey: ['medicines'] });
      qc.invalidateQueries({ queryKey: ['medicine-stats'] });
      setAdjustModal(null);
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err.response?.data?.message || 'Adjustment failed'),
  });

  const quickPriceMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, number> }) =>
      api.put(`/medicines/${id}`, data),
    onSuccess: () => {
      toast.success('Prices updated');
      qc.invalidateQueries({ queryKey: ['medicines'] });
      qc.invalidateQueries({ queryKey: ['medicine-stats'] });
      setQuickPriceMed(null);
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err.response?.data?.message || 'Price update failed'),
  });

  const inlineStockMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.post(`/medicines/${id}/adjust-stock`, data),
    onSuccess: () => {
      toast.success('Stock updated');
      qc.invalidateQueries({ queryKey: ['medicines'] });
      qc.invalidateQueries({ queryKey: ['medicine-stats'] });
      setInlineStockRow(null);
      setInlineStockQty('');
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err.response?.data?.message || 'Stock update failed'),
  });

  const bulkStockMutation = useMutation({
    mutationFn: (items: BulkStockRow[]) => api.post('/medicines/bulk-stock', { items }).then(r => r.data),
    onSuccess: (res) => {
      toast.success(res.message);
      qc.invalidateQueries({ queryKey: ['medicines'] });
      qc.invalidateQueries({ queryKey: ['medicine-stats'] });
      setShowBulkStock(false);
      setSelectedIds(new Set());
    },
    onError: () => toast.error('Bulk stock update failed'),
  });

  const bulkPriceMutation = useMutation({
    mutationFn: (items: BulkPriceRow[]) => api.post('/medicines/bulk-price', { items }).then(r => r.data),
    onSuccess: (res) => {
      toast.success(res.message);
      qc.invalidateQueries({ queryKey: ['medicines'] });
      qc.invalidateQueries({ queryKey: ['medicine-stats'] });
      setShowBulkPrice(false);
      setSelectedIds(new Set());
    },
    onError: () => toast.error('Bulk price update failed'),
  });

  const importMutation = useMutation({
    mutationFn: (items: Record<string, string>[]) =>
      api.post('/medicines/import', { items }).then(r => r.data),
    onSuccess: (res) => {
      toast.success(res.message);
      qc.invalidateQueries({ queryKey: ['medicines'] });
      qc.invalidateQueries({ queryKey: ['medicine-stats'] });
      setImportResult(res.data);
    },
    onError: () => toast.error('Import failed'),
  });

  /* ─── Handlers ─── */
  const medicines: Medicine[] = data?.data || [];
  const meta = data?.meta;

  const openEdit = (med: Medicine) => {
    setEditMed(med);
    const subIds = Array.isArray(med.substituteMedicineIds)
      ? (med.substituteMedicineIds as string[]).join(', ') : '';
    setForm({
      sku: med.sku || '', name: med.name, brandName: med.brandName || '',
      genericName: med.genericName || '', category: med.category,
      manufacturer: med.manufacturer || '', batchNumber: med.batchNumber,
      barcode: med.barcode || '', hsnCode: med.hsnCode || '',
      schedule: med.schedule || '', unit: med.unit,
      composition: med.composition || '', packSize: med.packSize || '',
      dosageForm: med.dosageForm || '',
      strengthMg: med.strengthMg != null ? String(med.strengthMg) : '',
      strengthUnit: med.strengthUnit || 'mg', strengthLabel: med.strengthLabel || '',
      defaultDiscountPct: String(med.defaultDiscountPct ?? 0),
      requiresPrescription: med.requiresPrescription ? 'true' : 'false',
      taxInclusive: med.taxInclusive ? 'true' : 'false',
      supplierId: med.supplierId || '', substituteIds: subIds, notes: med.notes || '',
      purchasePrice: String(med.purchasePrice), sellingPrice: String(med.sellingPrice),
      mrp: String(med.mrp), quantity: String(med.quantity),
      minStockLevel: String(med.minStockLevel), expiryDate: med.expiryDate.split('T')[0],
      gstRate: String(med.gstRate), cgstRate: String(med.cgstRate), sgstRate: String(med.sgstRate),
      location: med.location || '', description: med.description || '',
    });
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Record<string, unknown> = {
      sku: form.sku.trim() || null, name: form.name.trim(),
      brandName: form.brandName.trim() || null, genericName: form.genericName.trim() || null,
      category: form.category.trim(), manufacturer: form.manufacturer.trim() || null,
      batchNumber: form.batchNumber.trim(), barcode: form.barcode.trim() || null,
      hsnCode: form.hsnCode.trim() || null,
      schedule: (form.schedule && String(form.schedule).trim()) || null,
      unit: form.unit, composition: form.composition.trim() || null,
      packSize: form.packSize.trim() || null, dosageForm: form.dosageForm.trim() || null,
      strengthUnit: form.strengthUnit || 'mg', strengthLabel: form.strengthLabel.trim() || null,
      purchasePrice: parseFloat(form.purchasePrice),
      sellingPrice: editMed ? parseFloat(form.sellingPrice) : (() => {
        const mrp = parseFloat(form.mrp), pur = parseFloat(form.purchasePrice);
        if (Number.isFinite(mrp) && mrp >= 0) return mrp;
        if (Number.isFinite(pur) && pur >= 0) return pur;
        return 0;
      })(),
      mrp: parseFloat(form.mrp), quantity: parseInt(form.quantity, 10),
      minStockLevel: parseInt(form.minStockLevel, 10), expiryDate: new Date(form.expiryDate).toISOString(),
      gstRate: parseFloat(form.gstRate), cgstRate: parseFloat(form.cgstRate), sgstRate: parseFloat(form.sgstRate),
      defaultDiscountPct: parseFloat(form.defaultDiscountPct || '0') || 0,
      requiresPrescription: form.requiresPrescription === 'true',
      taxInclusive: form.taxInclusive === 'true',
      location: form.location.trim() || null, description: form.description.trim() || null,
      notes: form.notes.trim() || null,
    };
    if (form.strengthMg !== '' && form.strengthMg != null) payload.strengthMg = parseFloat(String(form.strengthMg));
    else payload.strengthMg = null;
    const subRaw = form.substituteIds?.trim();
    if (subRaw) {
      const ids = subRaw.split(',').map(s => s.trim()).filter(Boolean);
      payload.substituteMedicineIds = ids.length ? ids : null;
    } else payload.substituteMedicineIds = null;
    payload.supplierId = form.supplierId?.trim() || null;
    saveMutation.mutate(payload);
  };

  /* bulk stock */
  const openBulkStock = () => {
    const source = selectedIds.size > 0 ? medicines.filter(m => selectedIds.has(m.id)) : medicines;
    setBulkStockRows(source.map(m => ({
      id: m.id, name: m.name, sku: m.sku || '', currentQty: m.quantity,
      type: 'ADDITION', quantity: '', reason: '',
    })));
    setBulkStockSearch('');
    setShowBulkStock(true);
  };

  const handleBulkStock = () => {
    const items = bulkStockRows.filter(r => r.quantity !== '');
    if (!items.length) { toast.error('Enter quantity for at least one item'); return; }
    bulkStockMutation.mutate(items);
  };

  /* bulk price */
  const openBulkPrice = () => {
    const source = selectedIds.size > 0 ? medicines.filter(m => selectedIds.has(m.id)) : medicines;
    setBulkPriceRows(source.map(m => ({
      id: m.id, name: m.name, sku: m.sku || '',
      purchasePrice: String(m.purchasePrice), sellingPrice: String(m.sellingPrice), mrp: String(m.mrp),
      origPP: m.purchasePrice, origSP: m.sellingPrice, origMRP: m.mrp,
    })));
    setBulkPriceSearch('');
    setShowBulkPrice(true);
  };

  const handleBulkPrice = () => {
    const items = bulkPriceRows.filter(r =>
      parseFloat(r.purchasePrice) !== r.origPP ||
      parseFloat(r.sellingPrice) !== r.origSP ||
      parseFloat(r.mrp) !== r.origMRP
    );
    if (!items.length) { toast.error('No prices were changed'); return; }
    bulkPriceMutation.mutate(items);
  };

  /* CSV import */
  const handleCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) { toast.error('CSV has no data rows'); return; }
      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
      const rows = lines.slice(1).map(line => {
        const values = parseCSVLine(line);
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => { obj[h] = (values[i] || '').trim(); });
        return obj;
      }).filter(r => r.name);
      setImportRows(rows);
      setImportResult(null);
      toast.success(`Loaded ${rows.length} rows — review and click Import`);
    };
    reader.readAsText(file);
  };

  const downloadTemplate = () => {
    const example = [
      'MED-PARA-500', 'Paracetamol 500mg', 'Crocin', 'Paracetamol', 'Tablet', 'GSK',
      'B001', '30049099', 'Tablet', '10 Tablets/Strip', 'Paracetamol IP 500mg',
      '500', 'mg', 'strip', '8.50', '12.00', '14.00', '100', '20', '2026-12-31', '12', 'A1-R2', '',
    ];
    const csv = [CSV_HEADERS.join(','), example.join(',')].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'inventory-template.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExport = async () => {
    try {
      const p: Record<string, string | number> = { sortBy, sortOrder };
      if (search) p.search = search;
      if (filterBrand) p.brand = filterBrand;
      if (filterSupplierId) p.supplierId = filterSupplierId;
      if (filterManufacturer) p.manufacturer = filterManufacturer;
      if (filterCategory) p.category = filterCategory;
      if (tab === 'lowStock') p.lowStock = 'true';
      const response = await api.get('/medicines/export', { params: p, responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement('a');
      a.href = url; a.download = `inventory-${new Date().toISOString().split('T')[0]}.csv`; a.click();
      URL.revokeObjectURL(url);
      toast.success('Export downloaded');
    } catch { toast.error('Export failed'); }
  };

  /* sorting */
  const toggleSort = (col: string) => {
    if (sortBy === col) setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortOrder('asc'); }
    setPage(1);
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortBy !== col) return <ArrowUpDown className="w-3 h-3 opacity-30 inline ml-1" />;
    return sortOrder === 'asc'
      ? <ArrowUp className="w-3 h-3 inline ml-1 text-primary-500" />
      : <ArrowDown className="w-3 h-3 inline ml-1 text-primary-500" />;
  };

  /* selection */
  const toggleSelectAll = () => {
    if (selectedIds.size === medicines.length && medicines.length > 0) setSelectedIds(new Set());
    else setSelectedIds(new Set(medicines.map(m => m.id)));
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  /* badge helpers */
  const expiryBadge = (date: string) => {
    const status = getExpiryStatus(date);
    return ({
      expired: <span className="badge badge-red">Expired</span>,
      critical: <span className="badge badge-red">{'< 30 days'}</span>,
      warning: <span className="badge badge-yellow">{'< 90 days'}</span>,
      good: <span className="badge badge-green">{formatDate(date)}</span>,
    } as Record<string, React.ReactNode>)[status];
  };

  const stockBadge = (qty: number, min: number) => {
    const status = getStockStatus(qty, min);
    return ({
      out: <span className="badge badge-red">Out of Stock</span>,
      low: <span className="badge badge-yellow">{qty} (Low)</span>,
      ok: <span className="badge badge-green">{qty}</span>,
    } as Record<string, React.ReactNode>)[status];
  };

  const filteredBulkStockRows = bulkStockSearch
    ? bulkStockRows.filter(r => r.name.toLowerCase().includes(bulkStockSearch.toLowerCase()) || r.sku.toLowerCase().includes(bulkStockSearch.toLowerCase()))
    : bulkStockRows;

  const filteredBulkPriceRows = bulkPriceSearch
    ? bulkPriceRows.filter(r => r.name.toLowerCase().includes(bulkPriceSearch.toLowerCase()) || r.sku.toLowerCase().includes(bulkPriceSearch.toLowerCase()))
    : bulkPriceRows;

  /* ─── JSX ─────────────────────────────────────────────────────── */
  return (
    <div className="space-y-4">

      {/* ── Stats Bar ── */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="card p-3 text-center">
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalItems}</div>
            <div className="text-xs text-gray-500 mt-0.5 flex items-center justify-center gap-1">
              <Package className="w-3 h-3" /> Total Items
            </div>
          </div>
          <div className={cn('card p-3 text-center', stats.lowStockCount > 0 && 'border-yellow-300 dark:border-yellow-700')}>
            <div className={cn('text-2xl font-bold', stats.lowStockCount > 0 ? 'text-yellow-600' : 'text-gray-900 dark:text-white')}>
              {stats.lowStockCount}
            </div>
            <div className="text-xs text-gray-500 mt-0.5 flex items-center justify-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Low Stock
            </div>
          </div>
          <div className={cn('card p-3 text-center', stats.outOfStockCount > 0 && 'border-red-300 dark:border-red-700')}>
            <div className={cn('text-2xl font-bold', stats.outOfStockCount > 0 ? 'text-red-600' : 'text-gray-900 dark:text-white')}>
              {stats.outOfStockCount}
            </div>
            <div className="text-xs text-gray-500 mt-0.5 flex items-center justify-center gap-1">
              <ShoppingBag className="w-3 h-3" /> Out of Stock
            </div>
          </div>
          <div className="card p-3 text-center">
            <div className="text-lg font-bold text-green-700 dark:text-green-400 truncate">
              {formatCurrency(stats.stockValue)}
            </div>
            <div className="text-xs text-gray-500 mt-0.5 flex items-center justify-center gap-1">
              <TrendingUp className="w-3 h-3" /> Stock Value (Cost)
            </div>
          </div>
          <div className="card p-3 text-center">
            <div className="text-lg font-bold text-blue-700 dark:text-blue-400 truncate">
              {formatCurrency(stats.mrpValue)}
            </div>
            <div className="text-xs text-gray-500 mt-0.5 flex items-center justify-center gap-1">
              <DollarSign className="w-3 h-3" /> Stock Value (MRP)
            </div>
          </div>
        </div>
      )}

      {/* ── Header: Tabs + Actions ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex gap-2 flex-wrap">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setPage(1); }}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                tab === t.id
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-50'
              )}
            >{t.label}</button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Bulk Actions dropdown */}
          <div className="relative" ref={bulkActionsRef}>
            <button
              onClick={() => setShowBulkActions(!showBulkActions)}
              className="btn-secondary flex items-center gap-1.5"
            >
              <BarChart2 className="w-4 h-4" />
              Bulk Actions
              <ChevronDown className={cn('w-4 h-4 transition-transform', showBulkActions && 'rotate-180')} />
            </button>
            {showBulkActions && (
              <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-20 py-1.5 w-52">
                <button
                  onClick={() => { openBulkStock(); setShowBulkActions(false); }}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2"
                >
                  <RefreshCw className="w-4 h-4 text-blue-500" />
                  <div>
                    <div className="font-medium">Bulk Stock Update</div>
                    <div className="text-xs text-gray-400">Add / set / correct qty</div>
                  </div>
                </button>
                <button
                  onClick={() => { openBulkPrice(); setShowBulkActions(false); }}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2"
                >
                  <DollarSign className="w-4 h-4 text-green-500" />
                  <div>
                    <div className="font-medium">Bulk Price Update</div>
                    <div className="text-xs text-gray-400">MRP / sell / purchase</div>
                  </div>
                </button>
                <div className="my-1.5 border-t border-gray-100 dark:border-gray-800" />
                <button
                  onClick={() => { setShowImport(true); setImportRows([]); setImportResult(null); setShowBulkActions(false); }}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2"
                >
                  <Upload className="w-4 h-4 text-purple-500" />
                  <div>
                    <div className="font-medium">Import Items (CSV)</div>
                    <div className="text-xs text-gray-400">Create or update items</div>
                  </div>
                </button>
                <button
                  onClick={() => { handleExport(); setShowBulkActions(false); }}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2"
                >
                  <Download className="w-4 h-4 text-orange-500" />
                  <div>
                    <div className="font-medium">Export to CSV</div>
                    <div className="text-xs text-gray-400">Current filtered view</div>
                  </div>
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => { setShowForm(true); setEditMed(null); setForm(EMPTY_FORM); }}
            className="btn-primary"
          >
            <Plus className="w-4 h-4" /> Add Medicine
          </button>
        </div>
      </div>

      {/* ── Search & Filters ── */}
      <div className="card p-3 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text" placeholder="Search name, brand, SKU, barcode, HSN, rack, composition…"
            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="input pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Filter className="w-4 h-4 text-gray-400 shrink-0" />
          <select className="input py-2 text-sm min-w-[140px]" value={filterCategory}
            onChange={e => { setFilterCategory(e.target.value); setPage(1); }}>
            <option value="">All categories</option>
            {(categories || []).map((c: { category: string }) => (
              <option key={c.category} value={c.category}>{c.category}</option>
            ))}
          </select>
          <select className="input py-2 text-sm min-w-[140px]" value={filterBrand}
            onChange={e => { setFilterBrand(e.target.value); setPage(1); }}>
            <option value="">All brands</option>
            {(filterOptions?.brands || []).map((b: string) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          <select className="input py-2 text-sm min-w-[160px]" value={filterSupplierId}
            onChange={e => { setFilterSupplierId(e.target.value); setPage(1); }}>
            <option value="">All suppliers</option>
            {(filterOptions?.suppliers || []).map((s: { id: string; name: string }) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <select className="input py-2 text-sm min-w-[160px]" value={filterManufacturer}
            onChange={e => { setFilterManufacturer(e.target.value); setPage(1); }}>
            <option value="">All manufacturers</option>
            {(filterOptions?.manufacturers || []).map((m: string) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          {(filterBrand || filterSupplierId || filterManufacturer || filterCategory) && (
            <button type="button" className="text-xs text-primary-600 hover:underline"
              onClick={() => { setFilterBrand(''); setFilterSupplierId(''); setFilterManufacturer(''); setFilterCategory(''); setPage(1); }}>
              Clear filters
            </button>
          )}
          <button onClick={() => { refetchStats(); qc.invalidateQueries({ queryKey: ['medicines'] }); }}
            className="ml-auto text-gray-400 hover:text-gray-600" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Selection action bar ── */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl px-4 py-2.5">
          <CheckSquare className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
            {selectedIds.size} item{selectedIds.size !== 1 ? 's' : ''} selected
          </span>
          <div className="flex gap-2 ml-auto flex-wrap">
            <button onClick={openBulkStock} className="btn-secondary btn-sm text-blue-700 border-blue-300">
              <RefreshCw className="w-3.5 h-3.5" /> Update Stock
            </button>
            <button onClick={openBulkPrice} className="btn-secondary btn-sm text-green-700 border-green-300">
              <DollarSign className="w-3.5 h-3.5" /> Update Prices
            </button>
            <button onClick={() => setSelectedIds(new Set())} className="btn-secondary btn-sm">
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          </div>
        </div>
      )}

      {/* ── Table ── */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <span className="text-sm text-gray-500">
            {meta?.total || 0} medicines found
            {selectedIds.size > 0 && <span className="ml-2 text-blue-600 font-medium">· {selectedIds.size} selected</span>}
          </span>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading…</div>
        ) : medicines.length === 0 ? (
          <div className="p-12 text-center">
            <Package className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400">No medicines found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th className="w-8">
                    <input type="checkbox" className="rounded"
                      checked={selectedIds.size === medicines.length && medicines.length > 0}
                      onChange={toggleSelectAll} />
                  </th>
                  <th>
                    <button onClick={() => toggleSort('name')} className="flex items-center gap-1 hover:text-primary-600">
                      Product (SKU / strength)<SortIcon col="name" />
                    </button>
                  </th>
                  <th>Category</th>
                  <th>Batch / Expiry</th>
                  <th>
                    <button onClick={() => toggleSort('mrp')} className="flex items-center gap-1 hover:text-primary-600">
                      MRP / Sell<SortIcon col="mrp" />
                    </button>
                  </th>
                  <th>
                    <button onClick={() => toggleSort('quantity')} className="flex items-center gap-1 hover:text-primary-600">
                      Stock / Rack<SortIcon col="quantity" />
                    </button>
                  </th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {medicines.map(med => (
                  <tr key={med.id} className={selectedIds.has(med.id) ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}>
                    <td>
                      <input type="checkbox" className="rounded"
                        checked={selectedIds.has(med.id)}
                        onChange={() => toggleSelect(med.id)} />
                    </td>
                    <td>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-gray-900 dark:text-white">{med.name}</span>
                        {med.sku && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">{med.sku}</span>
                        )}
                      </div>
                      {formatStrength(med) && (
                        <div className="text-xs font-medium text-primary-700 dark:text-primary-400 mt-0.5">{formatStrength(med)}</div>
                      )}
                      {med.genericName && <div className="text-xs text-gray-400">{med.genericName}</div>}
                      {med.schedule && <span className="badge badge-red text-xs mt-0.5">{med.schedule}</span>}
                    </td>
                    <td><span className="badge badge-blue">{med.category}</span></td>
                    <td>
                      <div className="text-xs font-mono text-gray-500">{med.batchNumber}</div>
                      {expiryBadge(med.expiryDate)}
                    </td>
                    {/* Price cell — click pencil to quick-edit */}
                    <td>
                      <div className="flex items-start gap-1.5 group/price">
                        <div>
                          <div className="text-sm font-semibold">{formatCurrency(med.mrp)}</div>
                          <div className="text-xs text-gray-400">Sell: {formatCurrency(med.sellingPrice)}</div>
                          <div className="text-xs text-gray-400">Cost: {formatCurrency(med.purchasePrice)}</div>
                        </div>
                        <button
                          onClick={() => {
                            setQuickPriceMed(med);
                            setQuickPriceForm({
                              purchasePrice: String(med.purchasePrice),
                              sellingPrice: String(med.sellingPrice),
                              mrp: String(med.mrp),
                            });
                          }}
                          className="opacity-0 group-hover/price:opacity-100 mt-0.5 text-gray-300 hover:text-primary-600 transition-all"
                          title="Quick price edit"
                        >
                          <Edit className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                    {/* Stock cell — click badge to inline-edit */}
                    <td>
                      {inlineStockRow === med.id ? (
                        <div className="space-y-1.5 min-w-[200px]">
                          <select
                            className="input py-1 text-xs w-full"
                            value={inlineStockType}
                            onChange={e => setInlineStockType(e.target.value)}
                          >
                            <option value="ADDITION">+ Add Stock</option>
                            <option value="SUBTRACTION">- Remove Stock</option>
                            <option value="CORRECTION">= Set Exact Qty</option>
                            <option value="DAMAGE">Damage / Wastage</option>
                            <option value="RETURN">Return to Supplier</option>
                          </select>
                          <div className="flex gap-1">
                            <input
                              type="number" min="0" placeholder="Qty"
                              className="input py-1 text-sm flex-1"
                              value={inlineStockQty}
                              autoFocus
                              onChange={e => setInlineStockQty(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter' && inlineStockQty) {
                                  inlineStockMutation.mutate({ id: med.id, data: { type: inlineStockType, quantity: parseInt(inlineStockQty), reason: 'Quick adjust' } });
                                }
                                if (e.key === 'Escape') { setInlineStockRow(null); setInlineStockQty(''); }
                              }}
                            />
                            <button
                              disabled={!inlineStockQty || inlineStockMutation.isPending}
                              onClick={() => inlineStockMutation.mutate({ id: med.id, data: { type: inlineStockType, quantity: parseInt(inlineStockQty), reason: 'Quick adjust' } })}
                              className="btn-primary px-2 py-1 text-xs"
                            >✓</button>
                            <button
                              onClick={() => { setInlineStockRow(null); setInlineStockQty(''); }}
                              className="btn-secondary px-2 py-1 text-xs"
                            >✕</button>
                          </div>
                          <div className="text-[10px] text-gray-400">Current: {med.quantity} {med.unit}</div>
                        </div>
                      ) : (
                        <button
                          className="text-left w-full group/stock"
                          onClick={() => { setInlineStockRow(med.id); setInlineStockQty(''); setInlineStockType('ADDITION'); }}
                          title="Click to adjust stock"
                        >
                          {stockBadge(med.quantity, med.minStockLevel)}
                          <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                            {med.unit}
                            <Edit className="w-2.5 h-2.5 opacity-0 group-hover/stock:opacity-60 transition-opacity" />
                          </div>
                          {med.location && (
                            <div className="text-[10px] font-mono text-amber-700 dark:text-amber-400 mt-1">Rack {med.location}</div>
                          )}
                        </button>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setAdjustModal(med)}
                          className="text-gray-400 hover:text-blue-600"
                          title="Detailed stock adjust"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => openEdit(med)} className="text-gray-400 hover:text-primary-600" title="Edit all fields">
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => { if (confirm(`Deactivate "${med.name}"?`)) deleteMutation.mutate(med.id); }}
                          className="text-gray-400 hover:text-red-600"
                          title="Deactivate"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
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

      {/* ══════════════════════════════════════════════════════════ */}
      {/* Add / Edit Modal                                           */}
      {/* ══════════════════════════════════════════════════════════ */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl my-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
              <h3 className="font-bold text-lg text-gray-900 dark:text-white">
                {editMed ? 'Edit Medicine' : 'Add New Medicine'}
              </h3>
              <button onClick={() => { setShowForm(false); setEditMed(null); }} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
              <p className="text-xs text-gray-500 -mt-1 pb-2 border-b border-gray-100 dark:border-gray-800">
                Fields aligned with common pharmacy retail software (SKU, strength, HSN, salt composition).
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="label">Trade name *</label>
                  <input required className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Crocin 500 Tablet" />
                </div>
                <div>
                  <label className="label">SKU / item code * (unique)</label>
                  <input required className="input font-mono text-sm" value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} placeholder="e.g. MED-PARA-500" maxLength={64} />
                  <p className="text-[10px] text-gray-500 mt-1">Same SKU cannot exist twice.</p>
                </div>
                <div>
                  <label className="label">HSN code</label>
                  <input className="input font-mono" value={form.hsnCode} onChange={e => setForm(f => ({ ...f, hsnCode: e.target.value }))} placeholder="30049099" />
                </div>
                <div>
                  <label className="label">Generic name</label>
                  <input className="input" value={form.genericName} onChange={e => setForm(f => ({ ...f, genericName: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Brand name</label>
                  <input className="input" value={form.brandName} onChange={e => setForm(f => ({ ...f, brandName: e.target.value }))} placeholder="e.g. Crocin" />
                </div>
                <div>
                  <label className="label">Category *</label>
                  <input required list="categories" className="input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
                  <datalist id="categories">{categories?.map((c: { category: string }) => <option key={c.category} value={c.category} />)}</datalist>
                </div>
                <div>
                  <label className="label">Manufacturer</label>
                  <input className="input" value={form.manufacturer} onChange={e => setForm(f => ({ ...f, manufacturer: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className="label">Salt composition</label>
                  <input className="input" value={form.composition} onChange={e => setForm(f => ({ ...f, composition: e.target.value }))} placeholder="e.g. Paracetamol IP 500mg" />
                </div>
                <div>
                  <label className="label">Strength (numeric)</label>
                  <div className="flex gap-2">
                    <input type="number" step="any" min="0" className="input flex-1" value={form.strengthMg} onChange={e => setForm(f => ({ ...f, strengthMg: e.target.value }))} placeholder="500" />
                    <select className="input w-28" value={form.strengthUnit} onChange={e => setForm(f => ({ ...f, strengthUnit: e.target.value }))}>
                      {['mg', 'ml', 'mcg', 'IU', '%', 'g'].map(u => <option key={u}>{u}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="label">Strength (free text)</label>
                  <input className="input" value={form.strengthLabel} onChange={e => setForm(f => ({ ...f, strengthLabel: e.target.value }))} placeholder="e.g. 500 mg SR" />
                </div>
                <div>
                  <label className="label">Pack size</label>
                  <input className="input" value={form.packSize} onChange={e => setForm(f => ({ ...f, packSize: e.target.value }))} placeholder="10 tablets / strip" />
                </div>
                <div>
                  <label className="label">Dosage form</label>
                  <select className="input" value={form.dosageForm} onChange={e => setForm(f => ({ ...f, dosageForm: e.target.value }))}>
                    <option value="">— Select —</option>
                    {['Tablet', 'Capsule', 'Syrup', 'Suspension', 'Injection', 'Cream', 'Ointment', 'Drops', 'Inhaler', 'Powder', 'Sachet'].map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Schedule</label>
                  <select className="input" value={form.schedule} onChange={e => setForm(f => ({ ...f, schedule: e.target.value }))}>
                    <option value="">OTC (No Schedule)</option>
                    <option value="Schedule H">Schedule H</option>
                    <option value="Schedule H1">Schedule H1</option>
                    <option value="Schedule X">Schedule X</option>
                  </select>
                </div>
                <div>
                  <label className="label">Batch number *</label>
                  <input required className="input" value={form.batchNumber} onChange={e => setForm(f => ({ ...f, batchNumber: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Barcode</label>
                  <input className="input font-mono text-sm" value={form.barcode} onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Expiry date *</label>
                  <input required type="date" className="input" value={form.expiryDate} onChange={e => setForm(f => ({ ...f, expiryDate: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Stock unit</label>
                  <select className="input" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
                    {['strip', 'bottle', 'box', 'vial', 'tube', 'sachet', 'tablet', 'capsule', 'injection', 'syrup'].map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
                <div className="relative">
                  <label className="label flex items-center justify-between">
                    <span>Rack / shelf</span>
                    <button
                      type="button"
                      onClick={() => setShowRackManager(true)}
                      className="text-[10px] text-primary-600 hover:underline font-medium"
                    >
                      + Manage Racks
                    </button>
                  </label>
                  <div className="relative">
                    <input
                      ref={rackInputRef}
                      className="input font-mono text-sm pr-8"
                      value={form.location}
                      onChange={e => { setForm(f => ({ ...f, location: e.target.value })); setShowRackDropdown(true); }}
                      onFocus={() => setShowRackDropdown(true)}
                      onBlur={() => setTimeout(() => setShowRackDropdown(false), 150)}
                      placeholder="Select or type rack (e.g. A1-R2)"
                    />
                    {showRackDropdown && racks.length > 0 && (
                      <div className="absolute z-30 top-full left-0 right-0 mt-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg max-h-44 overflow-auto">
                        {racks
                          .filter(r => !form.location || r.toLowerCase().includes(form.location.toLowerCase()))
                          .map(r => (
                            <button
                              key={r}
                              type="button"
                              onMouseDown={() => { setForm(f => ({ ...f, location: r })); setShowRackDropdown(false); }}
                              className="w-full text-left px-3 py-2 text-sm font-mono hover:bg-stone-50 dark:hover:bg-gray-800 border-b border-stone-100 dark:border-gray-800 last:border-0"
                            >
                              {r}
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="label">Primary supplier</label>
                  <select className="input" value={form.supplierId} onChange={e => setForm(f => ({ ...f, supplierId: e.target.value }))}>
                    <option value="">— None —</option>
                    {suppliers?.map((s: { id: string; name: string }) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>

              <div className={cn('grid gap-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl', editMed ? 'grid-cols-3' : 'grid-cols-2')}>
                <div>
                  <label className="label">Purchase Price *</label>
                  <input required type="number" step="0.01" min="0" className="input" value={form.purchasePrice} onChange={e => setForm(f => ({ ...f, purchasePrice: e.target.value }))} />
                </div>
                {editMed && (
                  <div>
                    <label className="label">Selling Price *</label>
                    <input required type="number" step="0.01" min="0" className="input" value={form.sellingPrice} onChange={e => setForm(f => ({ ...f, sellingPrice: e.target.value }))} />
                  </div>
                )}
                <div>
                  <label className="label">MRP *</label>
                  <input required type="number" step="0.01" min="0" className="input" value={form.mrp} onChange={e => setForm(f => ({ ...f, mrp: e.target.value }))} />
                  {!editMed && <p className="text-xs text-gray-500 mt-1">Selling price is set to MRP on save.</p>}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="label">Quantity *</label>
                  <input required type="number" min="0" className="input" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Min Stock Level</label>
                  <input type="number" min="0" className="input" value={form.minStockLevel} onChange={e => setForm(f => ({ ...f, minStockLevel: e.target.value }))} />
                </div>
                <div>
                  <label className="label">GST rate (%)</label>
                  <select className="input" value={form.gstRate} onChange={e => {
                    const rate = parseFloat(e.target.value), half = rate === 0 ? 0 : rate / 2;
                    setForm(f => ({ ...f, gstRate: e.target.value, cgstRate: String(half), sgstRate: String(half) }));
                  }}>
                    <option value={0}>0% — No GST</option>
                    {[5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div>
                  <label className="label">Default line disc. %</label>
                  <input type="number" step="0.1" min="0" max="100" className="input" value={form.defaultDiscountPct} onChange={e => setForm(f => ({ ...f, defaultDiscountPct: e.target.value }))} />
                </div>
                <div>
                  <label className="label">MRP tax-inclusive?</label>
                  <select className="input" value={form.taxInclusive} onChange={e => setForm(f => ({ ...f, taxInclusive: e.target.value }))}>
                    <option value="false">No</option><option value="true">Yes</option>
                  </select>
                </div>
                <div>
                  <label className="label">Prescription required</label>
                  <select className="input" value={form.requiresPrescription} onChange={e => setForm(f => ({ ...f, requiresPrescription: e.target.value }))}>
                    <option value="false">No</option><option value="true">Yes</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="label">Substitute products (medicine IDs, comma-separated)</label>
                <input className="input font-mono text-xs" value={form.substituteIds} onChange={e => setForm(f => ({ ...f, substituteIds: e.target.value }))} placeholder="cuid1, cuid2 — optional" />
              </div>
              <div>
                <label className="label">Internal notes</label>
                <textarea className="input min-h-[72px]" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Shelf life, scheme, supplier remarks…" />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => { setShowForm(false); setEditMed(null); }} className="btn-secondary">Cancel</button>
                <button type="submit" disabled={saveMutation.isPending} className="btn-primary">
                  {saveMutation.isPending ? 'Saving…' : editMed ? 'Update Medicine' : 'Add Medicine'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* Single Stock Adjust Modal                                  */}
      {/* ══════════════════════════════════════════════════════════ */}
      {adjustModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">Adjust Stock</h3>
              <button onClick={() => setAdjustModal(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              <span className="font-medium">{adjustModal.name}</span> — Current Qty: <strong>{adjustModal.quantity}</strong>
            </p>
            <div className="space-y-3">
              <div>
                <label className="label">Adjustment Type</label>
                <select className="input" value={adjustForm.type} onChange={e => setAdjustForm(f => ({ ...f, type: e.target.value }))}>
                  <option value="ADDITION">Addition (Received new stock)</option>
                  <option value="SUBTRACTION">Subtraction (Manual reduction)</option>
                  <option value="CORRECTION">Correction (Set exact quantity)</option>
                  <option value="DAMAGE">Damage / Wastage</option>
                  <option value="RETURN">Return to Supplier</option>
                </select>
              </div>
              <div>
                <label className="label">Quantity</label>
                <input type="number" min="1" className="input" value={adjustForm.quantity} onChange={e => setAdjustForm(f => ({ ...f, quantity: e.target.value }))} />
              </div>
              <div>
                <label className="label">Reason (optional)</label>
                <input className="input" value={adjustForm.reason} onChange={e => setAdjustForm(f => ({ ...f, reason: e.target.value }))} placeholder="e.g. Physical count correction" />
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setAdjustModal(null)} className="btn-secondary flex-1">Cancel</button>
              <button
                disabled={!adjustForm.quantity || adjustMutation.isPending}
                onClick={() => adjustMutation.mutate({
                  id: adjustModal.id,
                  data: { type: adjustForm.type, quantity: parseInt(adjustForm.quantity), reason: adjustForm.reason },
                })}
                className="btn-primary flex-1"
              >
                {adjustMutation.isPending ? 'Saving…' : 'Apply Adjustment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* Bulk Stock Update Modal                                    */}
      {/* ══════════════════════════════════════════════════════════ */}
      {showBulkStock && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
              <div>
                <h3 className="font-bold text-lg">Bulk Stock Update</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Enter qty only for items you want to update. Leave blank to skip.
                  {selectedIds.size > 0 && <span className="text-blue-600 ml-1">({selectedIds.size} items pre-selected)</span>}
                </p>
              </div>
              <button onClick={() => setShowBulkStock(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>

            <div className="px-6 py-3 border-b border-gray-100 dark:border-gray-800">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="text" placeholder="Search by name or SKU…" value={bulkStockSearch}
                  onChange={e => setBulkStockSearch(e.target.value)} className="input pl-9" />
              </div>
            </div>

            <div className="overflow-auto flex-1">
              <table className="table">
                <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800 z-10">
                  <tr>
                    <th>Medicine</th>
                    <th className="w-24">Current Qty</th>
                    <th className="w-44">Adjustment Type</th>
                    <th className="w-32">Qty</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBulkStockRows.map((row, idx) => {
                    const globalIdx = bulkStockRows.findIndex(r => r.id === row.id);
                    return (
                      <tr key={row.id} className={row.quantity ? 'bg-blue-50/40 dark:bg-blue-900/10' : ''}>
                        <td>
                          <div className="font-medium text-sm">{row.name}</div>
                          {row.sku && <div className="text-xs font-mono text-gray-400">{row.sku}</div>}
                        </td>
                        <td>
                          <span className={cn('font-semibold', row.currentQty === 0 ? 'text-red-600' : row.currentQty < 10 ? 'text-yellow-600' : 'text-green-700')}>
                            {row.currentQty}
                          </span>
                        </td>
                        <td>
                          <select className="input py-1 text-xs" value={row.type}
                            onChange={e => setBulkStockRows(prev => {
                              const next = [...prev]; next[globalIdx] = { ...next[globalIdx], type: e.target.value }; return next;
                            })}>
                            <option value="ADDITION">Add (Receive)</option>
                            <option value="SUBTRACTION">Subtract</option>
                            <option value="CORRECTION">Set Exact Qty</option>
                            <option value="DAMAGE">Damage/Wastage</option>
                            <option value="RETURN">Return to Supplier</option>
                          </select>
                        </td>
                        <td>
                          <input type="number" min="0" placeholder="—" className="input py-1 text-sm"
                            value={row.quantity}
                            onChange={e => setBulkStockRows(prev => {
                              const next = [...prev]; next[globalIdx] = { ...next[globalIdx], quantity: e.target.value }; return next;
                            })} />
                        </td>
                        <td>
                          <input type="text" placeholder="Optional reason…" className="input py-1 text-sm"
                            value={row.reason}
                            onChange={e => setBulkStockRows(prev => {
                              const next = [...prev]; next[globalIdx] = { ...next[globalIdx], reason: e.target.value }; return next;
                            })} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <span className="text-sm text-gray-500">
                {bulkStockRows.filter(r => r.quantity !== '').length} item(s) will be updated
              </span>
              <div className="flex gap-3">
                <button onClick={() => setShowBulkStock(false)} className="btn-secondary">Cancel</button>
                <button onClick={handleBulkStock} disabled={bulkStockMutation.isPending} className="btn-primary">
                  {bulkStockMutation.isPending ? 'Updating…' : 'Apply Stock Updates'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* Bulk Price Update Modal                                    */}
      {/* ══════════════════════════════════════════════════════════ */}
      {showBulkPrice && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
              <div>
                <h3 className="font-bold text-lg">Bulk Price Update</h3>
                <p className="text-xs text-gray-500 mt-0.5">Edit prices inline. Only changed rows will be saved. <span className="text-amber-600">Highlighted = changed.</span></p>
              </div>
              <button onClick={() => setShowBulkPrice(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>

            <div className="px-6 py-3 border-b border-gray-100 dark:border-gray-800">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="text" placeholder="Search by name or SKU…" value={bulkPriceSearch}
                  onChange={e => setBulkPriceSearch(e.target.value)} className="input pl-9" />
              </div>
            </div>

            <div className="overflow-auto flex-1">
              <table className="table">
                <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800 z-10">
                  <tr>
                    <th>Medicine</th>
                    <th className="w-36">Purchase Price (₹)</th>
                    <th className="w-36">MRP (₹)</th>
                    <th className="w-36">Selling Price (₹)</th>
                    <th className="w-20">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBulkPriceRows.map(row => {
                    const globalIdx = bulkPriceRows.findIndex(r => r.id === row.id);
                    const ppChanged = parseFloat(row.purchasePrice) !== row.origPP;
                    const spChanged = parseFloat(row.sellingPrice) !== row.origSP;
                    const mrpChanged = parseFloat(row.mrp) !== row.origMRP;
                    const anyChanged = ppChanged || spChanged || mrpChanged;
                    const margin = row.purchasePrice && row.sellingPrice
                      ? (((parseFloat(row.sellingPrice) - parseFloat(row.purchasePrice)) / parseFloat(row.sellingPrice)) * 100).toFixed(1)
                      : '—';
                    return (
                      <tr key={row.id} className={anyChanged ? 'bg-amber-50/60 dark:bg-amber-900/10' : ''}>
                        <td>
                          <div className="font-medium text-sm">{row.name}</div>
                          {row.sku && <div className="text-xs font-mono text-gray-400">{row.sku}</div>}
                        </td>
                        <td>
                          <input type="number" step="0.01" min="0" className={cn('input py-1 text-sm', ppChanged && 'border-amber-400 bg-amber-50 dark:bg-amber-900/20')}
                            value={row.purchasePrice}
                            onChange={e => setBulkPriceRows(prev => {
                              const next = [...prev]; next[globalIdx] = { ...next[globalIdx], purchasePrice: e.target.value }; return next;
                            })} />
                          {ppChanged && <div className="text-[10px] text-amber-600">was {row.origPP}</div>}
                        </td>
                        <td>
                          <input type="number" step="0.01" min="0" className={cn('input py-1 text-sm', mrpChanged && 'border-amber-400 bg-amber-50 dark:bg-amber-900/20')}
                            value={row.mrp}
                            onChange={e => setBulkPriceRows(prev => {
                              const next = [...prev]; next[globalIdx] = { ...next[globalIdx], mrp: e.target.value }; return next;
                            })} />
                          {mrpChanged && <div className="text-[10px] text-amber-600">was {row.origMRP}</div>}
                        </td>
                        <td>
                          <input type="number" step="0.01" min="0" className={cn('input py-1 text-sm', spChanged && 'border-amber-400 bg-amber-50 dark:bg-amber-900/20')}
                            value={row.sellingPrice}
                            onChange={e => setBulkPriceRows(prev => {
                              const next = [...prev]; next[globalIdx] = { ...next[globalIdx], sellingPrice: e.target.value }; return next;
                            })} />
                          {spChanged && <div className="text-[10px] text-amber-600">was {row.origSP}</div>}
                        </td>
                        <td>
                          <span className={cn('text-sm font-medium', parseFloat(margin) > 20 ? 'text-green-600' : parseFloat(margin) > 0 ? 'text-yellow-600' : 'text-red-600')}>
                            {margin}{margin !== '—' ? '%' : ''}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <span className="text-sm text-gray-500">
                {bulkPriceRows.filter(r => parseFloat(r.purchasePrice) !== r.origPP || parseFloat(r.sellingPrice) !== r.origSP || parseFloat(r.mrp) !== r.origMRP).length} item(s) changed
              </span>
              <div className="flex gap-3">
                <button onClick={() => setShowBulkPrice(false)} className="btn-secondary">Cancel</button>
                <button onClick={handleBulkPrice} disabled={bulkPriceMutation.isPending} className="btn-primary">
                  {bulkPriceMutation.isPending ? 'Saving…' : 'Save Price Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* Quick Price Edit Modal                                     */}
      {/* ══════════════════════════════════════════════════════════ */}
      {quickPriceMed && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-lg">Quick Price Edit</h3>
                <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[240px]">{quickPriceMed.name}</p>
              </div>
              <button onClick={() => setQuickPriceMed(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="label">Purchase Price (₹) *</label>
                <input
                  type="number" step="0.01" min="0" className="input"
                  value={quickPriceForm.purchasePrice}
                  onChange={e => setQuickPriceForm(f => ({ ...f, purchasePrice: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">MRP (₹) *</label>
                <input
                  type="number" step="0.01" min="0" className="input"
                  value={quickPriceForm.mrp}
                  onChange={e => setQuickPriceForm(f => ({ ...f, mrp: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Selling Price (₹) *</label>
                <input
                  type="number" step="0.01" min="0" className="input"
                  value={quickPriceForm.sellingPrice}
                  onChange={e => setQuickPriceForm(f => ({ ...f, sellingPrice: e.target.value }))}
                />
                {quickPriceForm.purchasePrice && quickPriceForm.sellingPrice && (
                  <p className="text-xs mt-1">
                    Margin: <span className={cn(
                      'font-semibold',
                      ((parseFloat(quickPriceForm.sellingPrice) - parseFloat(quickPriceForm.purchasePrice)) / parseFloat(quickPriceForm.sellingPrice) * 100) > 20
                        ? 'text-green-600' : 'text-yellow-600'
                    )}>
                      {(((parseFloat(quickPriceForm.sellingPrice) - parseFloat(quickPriceForm.purchasePrice)) / parseFloat(quickPriceForm.sellingPrice)) * 100).toFixed(1)}%
                    </span>
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setQuickPriceMed(null)} className="btn-secondary flex-1">Cancel</button>
              <button
                disabled={quickPriceMutation.isPending}
                onClick={() => {
                  const pp = parseFloat(quickPriceForm.purchasePrice);
                  const sp = parseFloat(quickPriceForm.sellingPrice);
                  const mrp = parseFloat(quickPriceForm.mrp);
                  if (isNaN(pp) || isNaN(sp) || isNaN(mrp)) { toast.error('Enter valid prices'); return; }
                  quickPriceMutation.mutate({
                    id: quickPriceMed.id,
                    data: { purchasePrice: pp, sellingPrice: sp, mrp },
                  });
                }}
                className="btn-primary flex-1"
              >
                {quickPriceMutation.isPending ? 'Saving…' : 'Update Prices'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* Import CSV Modal                                           */}
      {/* ══════════════════════════════════════════════════════════ */}
      {showImport && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
              <div>
                <h3 className="font-bold text-lg">Import Items from CSV</h3>
                <p className="text-xs text-gray-500 mt-0.5">If SKU matches an existing item it will be <strong>updated</strong>; otherwise a new item is <strong>created</strong>.</p>
              </div>
              <button onClick={() => setShowImport(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {/* Step 1: download template */}
              <div className="flex items-start gap-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                <FileText className="w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-200">Step 1 — Download the template</p>
                  <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">
                    Required columns: <span className="font-mono">sku, name, category, batchNumber, purchasePrice, mrp, quantity, expiryDate (YYYY-MM-DD)</span>
                  </p>
                </div>
                <button onClick={downloadTemplate} className="btn-secondary btn-sm flex-shrink-0">
                  <Download className="w-3.5 h-3.5" /> Template
                </button>
              </div>

              {/* Step 2: upload */}
              <div>
                <p className="text-sm font-medium mb-2">Step 2 — Upload your CSV file</p>
                <label className={cn(
                  'flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-8 cursor-pointer transition-colors',
                  'border-gray-200 dark:border-gray-700 hover:border-primary-400 hover:bg-primary-50/30 dark:hover:bg-primary-900/10'
                )}>
                  <Upload className="w-8 h-8 text-gray-300 mb-2" />
                  <span className="text-sm text-gray-500">Click to select CSV file</span>
                  <span className="text-xs text-gray-400 mt-1">UTF-8 encoded, comma-separated</span>
                  <input type="file" accept=".csv,text/csv" className="hidden" ref={fileInputRef} onChange={handleCsvFile} />
                </label>
              </div>

              {/* Preview */}
              {importRows.length > 0 && !importResult && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium">
                      Preview — <span className="text-primary-600">{importRows.length} rows</span> loaded
                    </p>
                    <span className="text-xs text-gray-400">Showing first 5 rows</span>
                  </div>
                  <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-xl">
                    <table className="table text-xs">
                      <thead>
                        <tr>
                          {Object.keys(importRows[0]).slice(0, 8).map(h => <th key={h}>{h}</th>)}
                          {Object.keys(importRows[0]).length > 8 && <th>+{Object.keys(importRows[0]).length - 8} more</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {importRows.slice(0, 5).map((row, i) => (
                          <tr key={i}>
                            {Object.values(row).slice(0, 8).map((v, j) => (
                              <td key={j} className="truncate max-w-[120px]">{String(v)}</td>
                            ))}
                            {Object.keys(row).length > 8 && <td className="text-gray-400">…</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {importRows.length > 5 && (
                    <p className="text-xs text-gray-400 mt-1">… and {importRows.length - 5} more rows</p>
                  )}
                </div>
              )}

              {/* Import result */}
              {importResult && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-xl text-center">
                      <div className="text-2xl font-bold text-green-700">{importResult.created}</div>
                      <div className="text-xs text-green-600">Items Created</div>
                    </div>
                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-center">
                      <div className="text-2xl font-bold text-blue-700">{importResult.updated}</div>
                      <div className="text-xs text-blue-600">Items Updated</div>
                    </div>
                    <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-xl text-center">
                      <div className="text-2xl font-bold text-red-700">{importResult.errors.length}</div>
                      <div className="text-xs text-red-600">Errors</div>
                    </div>
                  </div>
                  {importResult.errors.length > 0 && (
                    <div className="border border-red-200 dark:border-red-800 rounded-xl overflow-hidden">
                      <div className="px-3 py-2 bg-red-50 dark:bg-red-900/20 text-xs font-medium text-red-700">Import Errors</div>
                      <div className="divide-y divide-red-100 dark:divide-red-900/30 max-h-40 overflow-y-auto">
                        {importResult.errors.map((e, i) => (
                          <div key={i} className="px-3 py-2 text-xs">
                            <span className="font-medium">{e.name}</span>
                            <span className="text-red-600 ml-2">— {e.error}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <button onClick={() => { setImportRows([]); setImportResult(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                    className="btn-secondary w-full">
                    Import Another File
                  </button>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-3">
              <button onClick={() => setShowImport(false)} className="btn-secondary">Close</button>
              {importRows.length > 0 && !importResult && (
                <button onClick={() => importMutation.mutate(importRows)} disabled={importMutation.isPending} className="btn-primary">
                  {importMutation.isPending ? 'Importing…' : `Import ${importRows.length} Items`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Rack Manager Modal ─────────────────────────────────────── */}
      {showRackManager && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
              <h3 className="font-bold text-lg">Manage Racks / Shelves</h3>
              <button onClick={() => setShowRackManager(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              {/* Add new rack */}
              <div className="flex gap-2">
                <input
                  className="input flex-1 font-mono"
                  placeholder="New rack name (e.g. A1-R2)"
                  value={newRackName}
                  onChange={e => setNewRackName(e.target.value.toUpperCase())}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newRackName.trim()) {
                      addRackMutation.mutate(newRackName.trim());
                    }
                  }}
                />
                <button
                  onClick={() => { if (newRackName.trim()) addRackMutation.mutate(newRackName.trim()); }}
                  disabled={!newRackName.trim() || addRackMutation.isPending}
                  className="btn-primary"
                >
                  <Plus className="w-4 h-4" /> Add
                </button>
              </div>

              {/* Rack list */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                {racks.length === 0 ? (
                  <div className="p-6 text-center text-gray-400 text-sm">No racks yet. Add your first rack above.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                        <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Rack</th>
                        <th className="px-4 py-2 w-16" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {racks.map(r => (
                        <tr key={r} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                          <td className="px-4 py-2.5 font-mono font-medium text-gray-900 dark:text-white">{r}</td>
                          <td className="px-4 py-2.5 text-right">
                            <button
                              onClick={() => deleteRackMutation.mutate(r)}
                              disabled={deleteRackMutation.isPending}
                              className="text-xs text-red-500 hover:text-red-700 hover:underline"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <p className="text-xs text-gray-400">
                Rack names are automatically uppercased and sorted alphabetically.{' '}
                <a href="/racks" className="text-primary-600 hover:underline font-medium">Open full Rack Manager →</a>
              </p>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex justify-end">
              <button onClick={() => setShowRackManager(false)} className="btn-primary">Done</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
