'use client';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  TrendingUp, TrendingDown, ShoppingCart, Package, AlertTriangle,
  ArrowUpRight, Clock, IndianRupee, Plus, FileText,
  CreditCard, Truck, Pill, Activity, BarChart3,
} from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import api, { openAuthenticatedPdf } from '@/lib/api';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/lib/store';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

export default function DashboardPage() {
  const { user } = useAuthStore();

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/dashboard').then(r => r.data.data),
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 bg-gray-100 dark:bg-gray-800 rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-64 bg-gray-100 dark:bg-gray-800 rounded-2xl" />
          <div className="h-64 bg-gray-100 dark:bg-gray-800 rounded-2xl" />
        </div>
      </div>
    );
  }

  const stats = data?.stats || {};
  const trend = data?.salesTrend || [];
  const recentBills = data?.recentBills || [];
  const topMeds = data?.topMedicines || [];

  const statCards = [
    {
      label: "Today's Sales",
      value: formatCurrency(stats.todaySales || 0),
      sub: `${stats.todayBills || 0} bills today`,
      icon: IndianRupee,
      gradient: 'from-blue-500 to-blue-600',
      bgLight: 'bg-blue-50 dark:bg-blue-950/40',
      textColor: 'text-blue-600 dark:text-blue-400',
      growth: stats.salesGrowth,
      href: '/billing/history',
    },
    {
      label: 'Monthly Revenue',
      value: formatCurrency(stats.monthSales || 0),
      sub: `${stats.monthBills || 0} bills this month`,
      icon: TrendingUp,
      gradient: 'from-emerald-500 to-emerald-600',
      bgLight: 'bg-emerald-50 dark:bg-emerald-950/40',
      textColor: 'text-emerald-600 dark:text-emerald-400',
      href: '/reports',
    },
    {
      label: 'Total Medicines',
      value: stats.totalMedicines?.toLocaleString('en-IN') || '0',
      sub: stats.lowStockCount > 0 ? `${stats.lowStockCount} low stock` : 'All stocked',
      icon: Package,
      gradient: 'from-violet-500 to-violet-600',
      bgLight: stats.lowStockCount > 0 ? 'bg-amber-50 dark:bg-amber-950/40' : 'bg-violet-50 dark:bg-violet-950/40',
      textColor: stats.lowStockCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-violet-600 dark:text-violet-400',
      href: '/inventory',
    },
    {
      label: 'Expiry Alerts',
      value: stats.expiringCount?.toString() || '0',
      sub: 'Within 90 days',
      icon: AlertTriangle,
      gradient: 'from-rose-500 to-rose-600',
      bgLight: stats.expiringCount > 0 ? 'bg-rose-50 dark:bg-rose-950/40' : 'bg-gray-50 dark:bg-gray-900',
      textColor: stats.expiringCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-gray-500 dark:text-gray-400',
      href: '/reports',
    },
  ];

  const quickActions = [
    { label: 'New Sale', icon: ShoppingCart, href: '/billing', color: 'text-blue-600' },
    { label: 'Add Medicine', icon: Plus, href: '/inventory', color: 'text-emerald-600' },
    { label: 'Purchase Order', icon: Truck, href: '/purchases', color: 'text-violet-600' },
    { label: 'View Reports', icon: BarChart3, href: '/reports', color: 'text-amber-600' },
    { label: 'Bill History', icon: FileText, href: '/billing/history', color: 'text-cyan-600' },
    { label: 'Customers', icon: CreditCard, href: '/customers', color: 'text-pink-600' },
  ];

  return (
    <div className="space-y-6">
      {/* Greeting + Quick summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            {getGreeting()}, {user?.name?.split(' ')[0] || 'there'}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Here&apos;s what&apos;s happening at your pharmacy today.
          </p>
        </div>
        <Link href="/billing" className="btn-primary shrink-0">
          <ShoppingCart className="w-4 h-4" /> New Sale
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.label}
              href={card.href}
              className={cn(
                'stat-card-gradient group',
                card.bgLight,
              )}
            >
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-3">
                  <div className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center bg-white/80 dark:bg-gray-800/80 shadow-sm',
                    card.textColor,
                  )}>
                    <Icon className="w-5 h-5" />
                  </div>
                  {card.growth !== undefined && (
                    <div className={cn(
                      'flex items-center gap-0.5 text-xs font-semibold px-2 py-1 rounded-lg',
                      card.growth >= 0
                        ? 'text-emerald-700 bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-900/40'
                        : 'text-rose-700 bg-rose-100 dark:text-rose-400 dark:bg-rose-900/40',
                    )}>
                      {card.growth >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {Math.abs(card.growth)}%
                    </div>
                  )}
                  {card.growth === undefined && (
                    <ArrowUpRight className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-gray-400 transition-colors" />
                  )}
                </div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1 tracking-tight">
                  {card.value}
                </div>
                <div className="text-sm font-medium text-gray-500 dark:text-gray-400">{card.label}</div>
                <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{card.sub}</div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Quick Actions</span>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link key={action.label} href={action.href} className="quick-action group">
                <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center bg-gray-50 dark:bg-gray-800 group-hover:scale-110 transition-transform', action.color)}>
                  <Icon className="w-4.5 h-4.5" />
                </div>
                <span className="text-xs text-gray-600 dark:text-gray-400 text-center leading-tight">{action.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Financial overview row */}
      {(stats.pendingCredit > 0 || stats.pendingPurchasePayments > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {stats.pendingCredit > 0 && (
            <Link href="/customers" className="card p-4 flex items-center gap-4 hover:shadow-md transition-shadow group">
              <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center flex-shrink-0">
                <CreditCard className="w-6 h-6 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-lg font-bold text-amber-600 dark:text-amber-400">
                  {formatCurrency(stats.pendingCredit)}
                </div>
                <div className="text-sm text-gray-500">
                  Credit pending from {stats.pendingCreditCustomers} customer{stats.pendingCreditCustomers !== 1 ? 's' : ''}
                </div>
              </div>
              <ArrowUpRight className="w-4 h-4 text-gray-300 group-hover:text-amber-500 transition-colors flex-shrink-0" />
            </Link>
          )}
          {stats.pendingPurchasePayments > 0 && (
            <Link href="/purchases" className="card p-4 flex items-center gap-4 hover:shadow-md transition-shadow group">
              <div className="w-12 h-12 rounded-xl bg-red-50 dark:bg-red-950/40 flex items-center justify-center flex-shrink-0">
                <Truck className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-lg font-bold text-red-600 dark:text-red-400">
                  {formatCurrency(stats.pendingPurchasePayments)}
                </div>
                <div className="text-sm text-gray-500">
                  Due to {stats.pendingPurchaseCount} supplier{stats.pendingPurchaseCount !== 1 ? 's' : ''}
                </div>
              </div>
              <ArrowUpRight className="w-4 h-4 text-gray-300 group-hover:text-red-500 transition-colors flex-shrink-0" />
            </Link>
          )}
        </div>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales trend */}
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Sales Trend</h3>
              <p className="text-xs text-gray-400 mt-0.5">Last 7 days performance</p>
            </div>
            <Link href="/reports" className="text-xs text-primary-600 hover:text-primary-700 font-medium">
              View full report →
            </Link>
          </div>
          {trend.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v) => {
                    const d = new Date(v + 'T00:00:00');
                    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
                  }}
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                  axisLine={false}
                  tickLine={false}
                  width={50}
                />
                <Tooltip
                  formatter={(value: number) => [formatCurrency(value), 'Sales']}
                  labelFormatter={(l) => {
                    const d = new Date(l + 'T00:00:00');
                    return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'long' });
                  }}
                  contentStyle={{
                    borderRadius: '12px',
                    border: '1px solid #e5e7eb',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                    fontSize: '13px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="sales"
                  stroke="#3b82f6"
                  strokeWidth={2.5}
                  fill="url(#salesGrad)"
                  dot={{ r: 3, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }}
                  activeDot={{ r: 5, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[220px] text-gray-400 text-sm">
              No sales data available yet
            </div>
          )}
        </div>

        {/* Top medicines */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Top Sellers</h3>
              <p className="text-xs text-gray-400 mt-0.5">This month by revenue</p>
            </div>
            <Pill className="w-4 h-4 text-gray-300" />
          </div>
          <div className="space-y-3">
            {topMeds.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                <Package className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-sm">No sales data yet</p>
              </div>
            ) : (
              topMeds.map((med: any, idx: number) => {
                const maxAmount = topMeds[0]?._sum?.amount || 1;
                const pct = Math.round(((med._sum.amount || 0) / maxAmount) * 100);
                const colors = ['bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500', 'bg-pink-500'];
                return (
                  <div key={med.medicineName}>
                    <div className="flex items-center gap-3 mb-1.5">
                      <div className={cn(
                        'w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0',
                        colors[idx] || 'bg-gray-400',
                      )}>
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 dark:text-white truncate">{med.medicineName}</p>
                      </div>
                      <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex-shrink-0">
                        {formatCurrency(med._sum.amount || 0)}
                      </div>
                    </div>
                    <div className="ml-9 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all duration-500', colors[idx] || 'bg-gray-400')}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Recent bills */}
      <div className="card">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">Recent Transactions</h3>
            <p className="text-xs text-gray-400 mt-0.5">Latest bills across all payment modes</p>
          </div>
          <Link href="/billing/history" className="btn-secondary btn-sm">
            View All
          </Link>
        </div>
        <div className="table-container rounded-none rounded-b-xl border-0">
          <table className="table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Customer</th>
                <th>Amount</th>
                <th>Payment</th>
                <th>Status</th>
                <th>Time</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {recentBills.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10">
                    <div className="flex flex-col items-center text-gray-400">
                      <FileText className="w-8 h-8 mb-2 opacity-50" />
                      <p className="text-sm font-medium">No transactions yet</p>
                      <p className="text-xs mt-1">Create your first sale to see it here</p>
                    </div>
                  </td>
                </tr>
              ) : (
                recentBills.map((bill: any) => (
                  <tr key={bill.id}>
                    <td>
                      <span className="font-mono text-sm font-medium text-primary-600 dark:text-primary-400">
                        {bill.billNumber}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                          <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400">
                            {(bill.customerName || 'W')[0].toUpperCase()}
                          </span>
                        </div>
                        <span className="text-gray-700 dark:text-gray-300">
                          {bill.customerName || <span className="text-gray-400 italic">Walk-in</span>}
                        </span>
                      </div>
                    </td>
                    <td className="font-semibold">{formatCurrency(bill.netAmount)}</td>
                    <td>
                      <span className={cn(
                        'badge',
                        bill.paymentMode === 'CASH' && 'badge-green',
                        bill.paymentMode === 'UPI' && 'badge-blue',
                        bill.paymentMode === 'CARD' && 'badge-blue',
                        bill.paymentMode === 'CREDIT' && 'badge-yellow',
                      )}>
                        {bill.paymentMode}
                      </span>
                    </td>
                    <td>
                      <span className={cn(
                        'badge',
                        bill.paymentStatus === 'PAID' && 'badge-green',
                        bill.paymentStatus === 'PARTIAL' && 'badge-yellow',
                        bill.paymentStatus === 'PENDING' && 'badge-red',
                      )}>
                        {bill.paymentStatus || 'PAID'}
                      </span>
                    </td>
                    <td className="text-gray-400 text-xs">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDateTime(bill.createdAt)}
                      </div>
                    </td>
                    <td className="text-right">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 px-2 py-1 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
                        onClick={async () => {
                          try {
                            await openAuthenticatedPdf(`billing/${bill.id}/pdf`);
                          } catch (e: any) {
                            toast.error(e?.message || 'Could not open invoice');
                          }
                        }}
                      >
                        <FileText className="w-3 h-3" />
                        Print
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
