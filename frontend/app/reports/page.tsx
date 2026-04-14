'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
  LineChart, Line, AreaChart, Area,
} from 'recharts';
import {
  TrendingUp, TrendingDown, IndianRupee, ShoppingBag, Package,
  FileText, Users, Tag, Download, BarChart3, Calendar,
  ArrowUpRight, Star, AlertTriangle, Percent,
} from 'lucide-react';
import api from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';

/* ─── Constants ─────────────────────────────────────────────────── */
const PERIODS = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
  { id: 'year', label: 'This Year' },
];

const TABS = [
  { id: 'sales', label: 'Sales Overview', icon: TrendingUp },
  { id: 'byItem', label: 'By Item', icon: Package },
  { id: 'byCustomer', label: 'By Customer', icon: Users },
  { id: 'byCategory', label: 'By Category', icon: Tag },
  { id: 'purchases', label: 'Purchases', icon: ShoppingBag },
  { id: 'profit', label: 'P&L', icon: IndianRupee },
  { id: 'gst', label: 'GST', icon: FileText },
  { id: 'expiry', label: 'Expiry & Stock', icon: AlertTriangle },
];

const PALETTE = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

/* ─── Helpers ────────────────────────────────────────────────────── */
function downloadCsv(filename: string, headers: string[], rows: (string | number)[]) {
  const escape = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [headers.map(escape).join(','), ...rows].join('\n');
  const blob = new Blob([csv as string], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function StatCard({ label, value, sub, icon: Icon, color = 'text-blue-600', bg = 'bg-blue-50 dark:bg-blue-950/30' }: {
  label: string; value: string; sub?: string; icon: React.ElementType; color?: string; bg?: string;
}) {
  return (
    <div className={cn('card p-4', bg)}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className={cn('w-4 h-4', color)} />
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <div className={cn('text-2xl font-bold', color)}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

/* ─── Component ─────────────────────────────────────────────────── */
export default function ReportsPage() {
  const [tab, setTab] = useState('sales');
  const [period, setPeriod] = useState('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [itemSort, setItemSort] = useState<'revenue' | 'quantity' | 'profit' | 'margin'>('revenue');
  const [custSort, setCustSort] = useState<'totalAmount' | 'totalBills' | 'outstandingCredit'>('totalAmount');

  const dateParams = customFrom && customTo
    ? { startDate: customFrom, endDate: customTo }
    : { period };

  /* ─── Queries ─── */
  const { data: salesData } = useQuery({
    queryKey: ['report-sales', dateParams],
    queryFn: () => api.get('/reports/sales', { params: dateParams }).then(r => r.data.data),
    enabled: tab === 'sales',
  });

  const { data: topMeds } = useQuery({
    queryKey: ['report-top', dateParams],
    queryFn: () => api.get('/reports/top-medicines', { params: { ...dateParams, limit: 10 } }).then(r => r.data.data),
    enabled: tab === 'sales',
  });

  const { data: itemData } = useQuery({
    queryKey: ['report-by-item', dateParams],
    queryFn: () => api.get('/reports/by-item', { params: { ...dateParams, limit: 200 } }).then(r => r.data.data),
    enabled: tab === 'byItem',
  });

  const { data: custData } = useQuery({
    queryKey: ['report-by-customer', dateParams],
    queryFn: () => api.get('/reports/by-customer', { params: { ...dateParams, limit: 200 } }).then(r => r.data.data),
    enabled: tab === 'byCustomer',
  });

  const { data: categoryData } = useQuery({
    queryKey: ['report-by-category', dateParams],
    queryFn: () => api.get('/reports/by-category', { params: dateParams }).then(r => r.data.data),
    enabled: tab === 'byCategory',
  });

  const { data: purchaseData } = useQuery({
    queryKey: ['report-purchases', dateParams],
    queryFn: () => api.get('/reports/purchases', { params: dateParams }).then(r => r.data.data),
    enabled: tab === 'purchases',
  });

  const { data: profitData } = useQuery({
    queryKey: ['report-profit', dateParams],
    queryFn: () => api.get('/reports/profit-loss', { params: dateParams }).then(r => r.data.data),
    enabled: tab === 'profit',
  });

  const { data: gstData } = useQuery({
    queryKey: ['report-gst', dateParams],
    queryFn: () => api.get('/reports/gst', { params: dateParams }).then(r => r.data.data),
    enabled: tab === 'gst',
  });

  const { data: expiryData } = useQuery({
    queryKey: ['report-expiry'],
    queryFn: () => api.get('/reports/expiry', { params: { days: 90 } }).then(r => r.data.data),
    enabled: tab === 'expiry',
  });

  const { data: stockData } = useQuery({
    queryKey: ['report-stock'],
    queryFn: () => api.get('/reports/stock').then(r => r.data.data),
    enabled: tab === 'expiry',
  });

  /* ─── Sorted item/customer lists ─── */
  const sortedItems = [...(itemData?.items || [])].sort((a: Record<string, number>, b: Record<string, number>) => (b[itemSort] ?? 0) - (a[itemSort] ?? 0));
  const sortedCustomers = [...(custData?.customers || [])].sort((a: Record<string, number>, b: Record<string, number>) => (b[custSort] ?? 0) - (a[custSort] ?? 0));

  /* ─── CSV exports ─── */
  const exportItems = () => {
    if (!itemData?.items?.length) return;
    const headers = ['Medicine', 'Category', 'Qty Sold', 'Revenue', 'Cost', 'Profit', 'Margin%', 'Bills'];
    const rows = sortedItems.map((r: any) =>
      [headers.map(() => ''), `${r.medicineName},${r.category},${r.quantity},${r.revenue},${r.cost},${r.profit},${r.margin},${r.bills}`].join('')
    );
    downloadCsv(`sales-by-item-${period}.csv`, headers,
      sortedItems.map((r: any) => [r.medicineName, r.category, r.quantity, r.revenue, r.cost, r.profit, `${r.margin}%`, r.bills].map(v => `"${v}"`).join(',') as string)
    );
  };

  const exportCustomers = () => {
    if (!custData?.customers?.length) return;
    downloadCsv(`sales-by-customer-${period}.csv`,
      ['Customer', 'Phone', 'Bills', 'Total Amount', 'Total Discount', 'Outstanding'],
      sortedCustomers.map((r: any) =>
        [r.customerName, r.phone, r.totalBills, r.totalAmount, r.totalDiscount, r.outstandingCredit].map(v => `"${v}"`).join(',') as string
      )
    );
  };

  /* ─── JSX ────────────────────────────────────────────────────── */
  return (
    <div className="space-y-4">

      {/* ── Tabs ── */}
      <div className="flex gap-2 flex-wrap">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all',
                tab === t.id
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-50'
              )}>
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {/* ── Date / Period picker ── */}
      <div className="card p-3 flex flex-wrap items-center gap-3">
        <div className="flex gap-2 flex-wrap">
          {PERIODS.map(p => (
            <button key={p.id} onClick={() => { setPeriod(p.id); setCustomFrom(''); setCustomTo(''); }}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm transition-all',
                period === p.id && !customFrom
                  ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              )}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
          <input type="date" className="input py-1.5 text-sm w-36"
            value={customFrom} onChange={e => { setCustomFrom(e.target.value); setPeriod(''); }} />
          <span className="text-gray-400 text-sm">to</span>
          <input type="date" className="input py-1.5 text-sm w-36"
            value={customTo} onChange={e => { setCustomTo(e.target.value); setPeriod(''); }} />
          {(customFrom || customTo) && (
            <button onClick={() => { setCustomFrom(''); setCustomTo(''); setPeriod('month'); }}
              className="text-xs text-primary-600 hover:underline shrink-0">Clear</button>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* SALES OVERVIEW                                               */}
      {/* ════════════════════════════════════════════════════════════ */}
      {tab === 'sales' && salesData && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <StatCard label="Total Sales" value={formatCurrency(salesData.summary?.totalSales || 0)} icon={TrendingUp} color="text-blue-600" />
            <StatCard label="Total Bills" value={String(salesData.summary?.totalBills || 0)} icon={FileText} color="text-gray-700 dark:text-gray-300" bg="bg-gray-50 dark:bg-gray-900" />
            <StatCard label="Avg Bill Value" value={formatCurrency(salesData.summary?.totalBills ? (salesData.summary.totalSales / salesData.summary.totalBills) : 0)} icon={IndianRupee} color="text-violet-600" bg="bg-violet-50 dark:bg-violet-950/30" />
            <StatCard label="Total Tax" value={formatCurrency(salesData.summary?.totalTax || 0)} icon={Percent} color="text-orange-600" bg="bg-orange-50 dark:bg-orange-950/30" />
            <StatCard label="Total Discount" value={formatCurrency(salesData.summary?.totalDiscount || 0)} icon={Tag} color="text-green-600" bg="bg-green-50 dark:bg-green-950/30" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Payment mode pie */}
            <div className="card p-5">
              <h3 className="font-semibold mb-4 text-gray-900 dark:text-white">Sales by Payment Mode</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Cash', value: salesData.summary?.cashSales || 0 },
                      { name: 'UPI', value: salesData.summary?.upiSales || 0 },
                      { name: 'Card', value: salesData.summary?.cardSales || 0 },
                      { name: 'Credit', value: salesData.summary?.creditSales || 0 },
                    ].filter(d => d.value > 0)}
                    cx="50%" cy="50%" innerRadius={55} outerRadius={75} dataKey="value"
                  >
                    {PALETTE.map((color, i) => <Cell key={i} fill={color} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Top medicines bar */}
            <div className="card p-5">
              <h3 className="font-semibold mb-4 text-gray-900 dark:text-white">Top 5 Medicines by Qty</h3>
              {topMeds && topMeds.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={topMeds.slice(0, 5)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="medicineName" tick={{ fontSize: 10 }} width={110} />
                    <Tooltip formatter={(v: number) => [v, 'Qty']} />
                    <Bar dataKey="_sum.quantity" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-gray-400 text-sm text-center py-8">No data</p>}
            </div>
          </div>

          {salesData.dailySales?.length > 0 && (
            <div className="card p-5">
              <h3 className="font-semibold mb-4 text-gray-900 dark:text-white">Daily Sales Trend</h3>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={salesData.dailySales}>
                  <defs>
                    <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={d => d.slice(5)} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} width={50} />
                  <Tooltip formatter={(v: number) => [formatCurrency(v), 'Sales']} labelFormatter={l => formatDate(l)} contentStyle={{ borderRadius: '12px', fontSize: '13px' }} />
                  <Area type="monotone" dataKey="totalSales" stroke="#3b82f6" strokeWidth={2.5} fill="url(#sg)" dot={{ r: 3, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════ */}
      {/* BY ITEM                                                      */}
      {/* ════════════════════════════════════════════════════════════ */}
      {tab === 'byItem' && itemData && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Items Sold" value={String(itemData.totals?.totalItems || 0)} sub={`${itemData.totals?.totalQty || 0} units total`} icon={Package} color="text-blue-600" />
            <StatCard label="Total Revenue" value={formatCurrency(itemData.totals?.totalRevenue || 0)} icon={TrendingUp} color="text-green-600" bg="bg-green-50 dark:bg-green-950/30" />
            <StatCard label="Total Cost" value={formatCurrency(itemData.totals?.totalCost || 0)} icon={TrendingDown} color="text-red-600" bg="bg-red-50 dark:bg-red-950/30" />
            <StatCard label="Gross Profit" value={formatCurrency(itemData.totals?.totalProfit || 0)} icon={IndianRupee}
              color={itemData.totals?.totalProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}
              bg={itemData.totals?.totalProfit >= 0 ? 'bg-emerald-50 dark:bg-emerald-950/30' : 'bg-red-50 dark:bg-red-950/30'} />
          </div>

          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="font-semibold text-gray-900 dark:text-white">Item-wise Sales</span>
                <span className="text-xs text-gray-400">{itemData.items?.length} medicines</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 text-sm text-gray-500">
                  Sort:
                  {(['revenue', 'quantity', 'profit', 'margin'] as const).map(s => (
                    <button key={s} onClick={() => setItemSort(s)}
                      className={cn('px-2 py-0.5 rounded text-xs capitalize', itemSort === s ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300 font-medium' : 'hover:bg-gray-100 dark:hover:bg-gray-800')}>
                      {s}
                    </button>
                  ))}
                </div>
                <button onClick={exportItems} className="btn-secondary btn-sm">
                  <Download className="w-3.5 h-3.5" /> CSV
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Medicine</th>
                    <th>Category</th>
                    <th className="text-right">Qty Sold</th>
                    <th className="text-right">Revenue</th>
                    <th className="text-right">Cost</th>
                    <th className="text-right">Profit</th>
                    <th className="text-right">Margin</th>
                    <th className="text-right">Bills</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedItems.map((item: any, idx: number) => (
                    <tr key={item.medicineId || item.medicineName}>
                      <td className="text-gray-400 text-xs">{idx + 1}</td>
                      <td className="font-medium">{item.medicineName}</td>
                      <td><span className="badge badge-blue">{item.category}</span></td>
                      <td className="text-right font-mono">{item.quantity}</td>
                      <td className="text-right font-semibold">{formatCurrency(item.revenue)}</td>
                      <td className="text-right text-gray-500">{formatCurrency(item.cost)}</td>
                      <td className={cn('text-right font-semibold', item.profit >= 0 ? 'text-green-600' : 'text-red-600')}>
                        {formatCurrency(item.profit)}
                      </td>
                      <td className="text-right">
                        <span className={cn('badge', item.margin >= 25 ? 'badge-green' : item.margin >= 10 ? 'badge-yellow' : 'badge-red')}>
                          {item.margin}%
                        </span>
                      </td>
                      <td className="text-right text-gray-400">{item.bills}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 dark:bg-gray-800/50">
                  <tr>
                    <td colSpan={3} className="font-semibold text-gray-700 dark:text-gray-300">Total</td>
                    <td className="text-right font-mono font-semibold">{itemData.totals?.totalQty}</td>
                    <td className="text-right font-semibold text-green-700">{formatCurrency(itemData.totals?.totalRevenue)}</td>
                    <td className="text-right font-semibold text-red-600">{formatCurrency(itemData.totals?.totalCost)}</td>
                    <td className="text-right font-semibold text-emerald-700">{formatCurrency(itemData.totals?.totalProfit)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════ */}
      {/* BY CUSTOMER                                                  */}
      {/* ════════════════════════════════════════════════════════════ */}
      {tab === 'byCustomer' && custData && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <StatCard label="Named Customers" value={String(custData.totals?.namedCustomers || 0)} icon={Users} color="text-blue-600" />
            <StatCard label="Walk-in Customers" value={String(custData.totals?.walkIns || 0)} icon={Users} color="text-gray-600" bg="bg-gray-50 dark:bg-gray-900" />
            <StatCard label="Total Revenue" value={formatCurrency(custData.totals?.totalRevenue || 0)} icon={TrendingUp} color="text-green-600" bg="bg-green-50 dark:bg-green-950/30" />
            <StatCard label="Total Discount" value={formatCurrency(custData.totals?.totalDiscount || 0)} icon={Tag} color="text-orange-600" bg="bg-orange-50 dark:bg-orange-950/30" />
            <StatCard label="Outstanding Credit" value={formatCurrency(custData.totals?.totalOutstanding || 0)} icon={IndianRupee}
              color={custData.totals?.totalOutstanding > 0 ? 'text-red-600' : 'text-gray-600'}
              bg={custData.totals?.totalOutstanding > 0 ? 'bg-red-50 dark:bg-red-950/30' : 'bg-gray-50 dark:bg-gray-900'} />
          </div>

          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="font-semibold text-gray-900 dark:text-white">Customer-wise Sales</span>
                <span className="text-xs text-gray-400">{custData.customers?.length} entries</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 text-sm text-gray-500">
                  Sort:
                  {([['totalAmount', 'Amount'], ['totalBills', 'Bills'], ['outstandingCredit', 'Credit']] as [string, string][]).map(([key, label]) => (
                    <button key={key} onClick={() => setCustSort(key as typeof custSort)}
                      className={cn('px-2 py-0.5 rounded text-xs', custSort === key ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300 font-medium' : 'hover:bg-gray-100 dark:hover:bg-gray-800')}>
                      {label}
                    </button>
                  ))}
                </div>
                <button onClick={exportCustomers} className="btn-secondary btn-sm">
                  <Download className="w-3.5 h-3.5" /> CSV
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Customer</th>
                    <th>Phone</th>
                    <th className="text-right">Bills</th>
                    <th className="text-right">Total Spent</th>
                    <th className="text-right">Discount</th>
                    <th className="text-right">Tax Paid</th>
                    <th className="text-right">Outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedCustomers.map((c: any, idx: number) => (
                    <tr key={c.customerId || `walkin-${idx}`}>
                      <td className="text-gray-400 text-xs">{idx + 1}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-xs font-bold text-primary-700 dark:text-primary-400 shrink-0">
                            {(c.customerName || 'W')[0].toUpperCase()}
                          </div>
                          <span className="font-medium">{c.customerName}</span>
                          {idx < 3 && c.customerId && <Star className="w-3 h-3 text-amber-400 fill-amber-400" />}
                        </div>
                      </td>
                      <td className="font-mono text-sm text-gray-500">{c.phone}</td>
                      <td className="text-right">{c.totalBills}</td>
                      <td className="text-right font-semibold">{formatCurrency(c.totalAmount)}</td>
                      <td className="text-right text-green-600">{formatCurrency(c.totalDiscount)}</td>
                      <td className="text-right text-orange-600">{formatCurrency(c.totalTax)}</td>
                      <td className="text-right">
                        {c.outstandingCredit > 0
                          ? <span className="badge badge-red">{formatCurrency(c.outstandingCredit)}</span>
                          : <span className="text-gray-400 text-xs">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════ */}
      {/* BY CATEGORY                                                  */}
      {/* ════════════════════════════════════════════════════════════ */}
      {tab === 'byCategory' && categoryData && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card p-5">
              <h3 className="font-semibold mb-4">Revenue by Category</h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={categoryData} cx="50%" cy="50%" innerRadius={60} outerRadius={85} dataKey="totalRevenue" nameKey="category">
                    {categoryData.map((_: unknown, i: number) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="card p-5">
              <h3 className="font-semibold mb-4">Quantity Sold by Category</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={categoryData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="category" tick={{ fontSize: 11 }} width={100} />
                  <Tooltip formatter={(v: number) => [v, 'Units']} />
                  <Bar dataKey="totalQty" radius={[0, 4, 4, 0]}>
                    {categoryData.map((_: unknown, i: number) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 font-semibold text-gray-900 dark:text-white">
              Category Breakdown
            </div>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th className="text-right">Qty Sold</th>
                    <th className="text-right">Revenue</th>
                    <th className="text-right">Cost</th>
                    <th className="text-right">Profit</th>
                    <th className="text-right">Margin</th>
                    <th className="text-right">Bills</th>
                    <th>Revenue Share</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const totalRev = categoryData.reduce((s: number, c: any) => s + c.totalRevenue, 0);
                    return categoryData.map((cat: any, idx: number) => {
                      const share = totalRev > 0 ? ((cat.totalRevenue / totalRev) * 100).toFixed(1) : '0';
                      const margin = cat.totalRevenue > 0 ? ((cat.profit / cat.totalRevenue) * 100).toFixed(1) : '0';
                      return (
                        <tr key={cat.category}>
                          <td>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: PALETTE[idx % PALETTE.length] }} />
                              <span className="font-medium">{cat.category}</span>
                            </div>
                          </td>
                          <td className="text-right font-mono">{cat.totalQty}</td>
                          <td className="text-right font-semibold">{formatCurrency(cat.totalRevenue)}</td>
                          <td className="text-right text-gray-500">{formatCurrency(cat.totalCost)}</td>
                          <td className={cn('text-right font-semibold', cat.profit >= 0 ? 'text-green-600' : 'text-red-600')}>{formatCurrency(cat.profit)}</td>
                          <td className="text-right">
                            <span className={cn('badge', parseFloat(margin) >= 20 ? 'badge-green' : parseFloat(margin) >= 5 ? 'badge-yellow' : 'badge-red')}>
                              {margin}%
                            </span>
                          </td>
                          <td className="text-right text-gray-400">{cat.totalBills}</td>
                          <td>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${share}%`, backgroundColor: PALETTE[idx % PALETTE.length] }} />
                              </div>
                              <span className="text-xs text-gray-500 w-10 text-right">{share}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════ */}
      {/* PURCHASES                                                    */}
      {/* ════════════════════════════════════════════════════════════ */}
      {tab === 'purchases' && purchaseData && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total Purchases" value={String(purchaseData.summary?.totalPurchases || 0)} icon={ShoppingBag} color="text-blue-600" />
            <StatCard label="Total Amount" value={formatCurrency(purchaseData.summary?.totalAmount || 0)} icon={IndianRupee} color="text-green-600" bg="bg-green-50 dark:bg-green-950/30" />
            <StatCard label="Total Tax" value={formatCurrency(purchaseData.summary?.totalTax || 0)} icon={Percent} color="text-orange-600" bg="bg-orange-50 dark:bg-orange-950/30" />
            <StatCard label="Amount Due" value={formatCurrency(purchaseData.summary?.totalDue || 0)} icon={AlertTriangle}
              color={purchaseData.summary?.totalDue > 0 ? 'text-red-600' : 'text-gray-600'}
              bg={purchaseData.summary?.totalDue > 0 ? 'bg-red-50 dark:bg-red-950/30' : 'bg-gray-50 dark:bg-gray-900'} />
          </div>

          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 font-semibold text-gray-900 dark:text-white">Purchase History</div>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr><th>Purchase #</th><th>Supplier</th><th>Date</th><th className="text-right">Amount</th><th className="text-right">Tax</th><th className="text-right">Due</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {purchaseData.purchases?.map((p: any) => (
                    <tr key={p.id}>
                      <td className="font-mono text-xs text-primary-600">{p.purchaseNumber}</td>
                      <td className="font-medium">{p.supplier?.name || '—'}</td>
                      <td className="text-gray-400">{formatDate(p.createdAt)}</td>
                      <td className="text-right font-semibold">{formatCurrency(p.totalAmount)}</td>
                      <td className="text-right text-orange-600">{formatCurrency(p.totalTax)}</td>
                      <td className="text-right">
                        {p.amountDue > 0
                          ? <span className="badge badge-red">{formatCurrency(p.amountDue)}</span>
                          : <span className="badge badge-green">Paid</span>}
                      </td>
                      <td>
                        <span className={cn('badge', p.status === 'COMPLETED' ? 'badge-green' : p.status === 'PARTIAL' ? 'badge-yellow' : 'badge-blue')}>
                          {p.status}
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

      {/* ════════════════════════════════════════════════════════════ */}
      {/* PROFIT & LOSS                                                */}
      {/* ════════════════════════════════════════════════════════════ */}
      {tab === 'profit' && profitData && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Revenue" value={formatCurrency(profitData.revenue)} icon={TrendingUp} color="text-blue-600" />
            <StatCard label="Cost of Goods" value={formatCurrency(profitData.cogs)} icon={TrendingDown} color="text-red-600" bg="bg-red-50 dark:bg-red-950/30" />
            <StatCard label="Gross Profit" value={formatCurrency(profitData.grossProfit)} icon={IndianRupee}
              color={profitData.grossProfit >= 0 ? 'text-green-600' : 'text-red-600'}
              bg={profitData.grossProfit >= 0 ? 'bg-green-50 dark:bg-green-950/30' : 'bg-red-50 dark:bg-red-950/30'} />
            <StatCard label="Gross Margin" value={`${profitData.grossMargin}%`} icon={Percent}
              color={profitData.grossMargin >= 0 ? 'text-emerald-600' : 'text-red-600'}
              bg={profitData.grossMargin >= 0 ? 'bg-emerald-50 dark:bg-emerald-950/30' : 'bg-red-50 dark:bg-red-950/30'} />
          </div>

          <div className="card p-6">
            <h3 className="font-semibold mb-5 text-gray-900 dark:text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary-500" /> Profit & Loss Statement
            </h3>
            <div className="space-y-3">
              {[
                { label: '(+) Gross Revenue', value: formatCurrency(profitData.revenue), cls: 'text-blue-600' },
                { label: '(-) Cost of Goods Sold (at purchase price)', value: formatCurrency(profitData.cogs), cls: 'text-red-500' },
                { label: '(=) Gross Profit', value: formatCurrency(profitData.grossProfit), cls: profitData.grossProfit >= 0 ? 'text-green-600 font-bold text-xl' : 'text-red-600 font-bold text-xl', border: true },
                { label: 'Gross Margin %', value: `${profitData.grossMargin}%`, cls: profitData.grossMargin >= 20 ? 'text-emerald-600' : 'text-amber-600' },
              ].map(({ label, value, cls, border }) => (
                <div key={label} className={cn('flex justify-between items-center py-2.5', border ? 'border-t-2 border-gray-200 dark:border-gray-700 mt-2 pt-4' : 'border-b border-gray-100 dark:border-gray-800')}>
                  <span className="text-gray-600 dark:text-gray-400">{label}</span>
                  <span className={cn('font-semibold', cls)}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════ */}
      {/* GST REPORT                                                   */}
      {/* ════════════════════════════════════════════════════════════ */}
      {tab === 'gst' && gstData && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card p-4">
              <div className="text-sm text-gray-500 mb-1">Output GST (on Sales)</div>
              <div className="text-2xl font-bold text-blue-600">{formatCurrency(gstData.salesSummary?.totalTax || 0)}</div>
              <div className="text-xs text-gray-400 mt-1">CGST: {formatCurrency(gstData.salesSummary?.cgst || 0)} · SGST: {formatCurrency(gstData.salesSummary?.sgst || 0)}</div>
            </div>
            <div className="card p-4">
              <div className="text-sm text-gray-500 mb-1">Input GST (on Purchases)</div>
              <div className="text-2xl font-bold text-green-600">{formatCurrency(gstData.purchaseSummary?.totalTax || 0)}</div>
              <div className="text-xs text-gray-400 mt-1">CGST: {formatCurrency(gstData.purchaseSummary?.cgst || 0)} · SGST: {formatCurrency(gstData.purchaseSummary?.sgst || 0)}</div>
            </div>
            <div className="card p-4">
              <div className="text-sm text-gray-500 mb-1">Net GST Liability</div>
              <div className={cn('text-2xl font-bold', gstData.netTaxLiability >= 0 ? 'text-red-600' : 'text-green-600')}>
                {formatCurrency(Math.abs(gstData.netTaxLiability || 0))}
              </div>
              <div className="text-xs text-gray-400 mt-1">{gstData.netTaxLiability >= 0 ? 'Payable to Government' : 'Refundable'}</div>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 font-semibold">GST on Sales (GSTR-1)</div>
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>Invoice</th><th>Date</th><th>Taxable Amt</th><th>CGST</th><th>SGST</th><th>Total Tax</th><th>Net Amount</th></tr></thead>
                <tbody>
                  {gstData.salesGst?.slice(0, 30).map((b: any) => (
                    <tr key={b.billNumber}>
                      <td className="font-mono text-xs text-primary-600">{b.billNumber}</td>
                      <td className="text-gray-400">{formatDate(b.createdAt)}</td>
                      <td>{formatCurrency(b.taxableAmount)}</td>
                      <td>{formatCurrency(b.cgstAmount)}</td>
                      <td>{formatCurrency(b.sgstAmount)}</td>
                      <td className="text-orange-600 font-semibold">{formatCurrency(b.totalTax)}</td>
                      <td className="font-semibold">{formatCurrency(b.netAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════ */}
      {/* EXPIRY & STOCK                                               */}
      {/* ════════════════════════════════════════════════════════════ */}
      {tab === 'expiry' && (
        <div className="space-y-4">
          {/* Stock value summary */}
          {stockData && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="card p-5 text-center">
                <div className="text-3xl font-bold text-blue-600">{formatCurrency(stockData.stockValue)}</div>
                <div className="text-sm text-gray-500 mt-1">Purchase Value (Cost)</div>
              </div>
              <div className="card p-5 text-center">
                <div className="text-3xl font-bold text-green-600">{formatCurrency(stockData.retailValue)}</div>
                <div className="text-sm text-gray-500 mt-1">Retail Value (Selling Price)</div>
              </div>
              <div className="card p-5 text-center">
                <div className="text-3xl font-bold text-gray-900 dark:text-white">{stockData.totalSkus}</div>
                <div className="text-sm text-gray-500 mt-1">Total Active SKUs</div>
              </div>
            </div>
          )}

          {/* Expired */}
          {expiryData?.expired?.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-red-100 bg-red-50 dark:bg-red-900/20">
                <h3 className="font-semibold text-red-700 dark:text-red-400">❌ Expired Medicines ({expiryData.expired.length})</h3>
              </div>
              <table className="table">
                <thead><tr><th>Medicine</th><th>Batch</th><th>Expired On</th><th>Stock</th><th>Loss Value</th></tr></thead>
                <tbody>
                  {expiryData.expired.map((m: any) => (
                    <tr key={m.id}>
                      <td><div className="font-medium">{m.name}</div><div className="text-xs text-gray-400">{m.manufacturer}</div></td>
                      <td className="font-mono text-xs">{m.batchNumber}</td>
                      <td><span className="badge badge-red">{formatDate(m.expiryDate)}</span></td>
                      <td>{m.quantity} {m.unit}</td>
                      <td className="text-red-600 font-semibold">{formatCurrency(m.quantity * m.purchasePrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Expiring soon */}
          {expiryData?.expiring?.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-yellow-100 bg-yellow-50 dark:bg-yellow-900/20">
                <h3 className="font-semibold text-yellow-700 dark:text-yellow-400">⚠️ Expiring Within 90 Days ({expiryData.expiring.length})</h3>
              </div>
              <table className="table">
                <thead><tr><th>Medicine</th><th>Batch</th><th>Expiry</th><th>Days Left</th><th>Stock</th><th>Value at Risk</th></tr></thead>
                <tbody>
                  {expiryData.expiring.map((m: any) => {
                    const days = Math.ceil((new Date(m.expiryDate).getTime() - Date.now()) / 86400000);
                    return (
                      <tr key={m.id}>
                        <td><div className="font-medium">{m.name}</div></td>
                        <td className="font-mono text-xs">{m.batchNumber}</td>
                        <td>{formatDate(m.expiryDate)}</td>
                        <td><span className={cn('badge', days <= 30 ? 'badge-red' : 'badge-yellow')}>{days} days</span></td>
                        <td>{m.quantity} {m.unit}</td>
                        <td className="text-amber-600 font-semibold">{formatCurrency(m.quantity * m.purchasePrice)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Low stock */}
          {stockData?.lowStock?.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-yellow-100 bg-yellow-50 dark:bg-yellow-900/20">
                <h3 className="font-semibold text-yellow-700 dark:text-yellow-400">⚠️ Low Stock — Reorder Needed ({stockData.lowStock.length})</h3>
              </div>
              <table className="table">
                <thead><tr><th>Medicine</th><th>Category</th><th>Current Stock</th><th>Min Level</th><th>Suggest Order Qty</th></tr></thead>
                <tbody>
                  {stockData.lowStock.map((m: any) => (
                    <tr key={m.id}>
                      <td className="font-medium">{m.name}</td>
                      <td><span className="badge badge-blue">{m.category}</span></td>
                      <td><span className={cn('badge', m.quantity === 0 ? 'badge-red' : 'badge-yellow')}>{m.quantity} {m.unit}</span></td>
                      <td className="text-gray-400">{m.minStockLevel}</td>
                      <td className="text-primary-600 font-semibold">{Math.max(0, m.minStockLevel * 2 - m.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {expiryData?.expired?.length === 0 && expiryData?.expiring?.length === 0 && !stockData?.lowStock?.length && (
            <div className="card p-12 text-center">
              <Package className="w-12 h-12 text-green-400 mx-auto mb-3" />
              <p className="text-green-600 font-semibold">All medicines are within expiry and well stocked! ✓</p>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!['sales', 'byItem', 'byCustomer', 'byCategory', 'purchases', 'profit', 'gst', 'expiry'].includes(tab) && (
        <div className="card p-12 text-center">
          <BarChart3 className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400">Select a report tab above</p>
        </div>
      )}

    </div>
  );
}
