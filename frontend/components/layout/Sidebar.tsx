'use client';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import {
  LayoutDashboard, ShoppingCart, Package, Truck,
  Users, BarChart3, Settings, LogOut, Stethoscope, ChevronLeft,
  ChevronRight, UserCog, X, FileText, Building2, Warehouse, ScrollText
} from 'lucide-react';
import { useAuthStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

const navGroups = [
  {
    label: null,
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Sales',
    items: [
      { href: '/billing', label: 'New Sale', icon: ShoppingCart },
      { href: '/billing/history', label: 'Bill History', icon: FileText },
      { href: '/customers', label: 'Customers', icon: Users },
    ],
  },
  {
    label: 'Inventory',
    items: [
      { href: '/inventory', label: 'Medicines', icon: Package },
      { href: '/racks', label: 'Racks & Shelves', icon: Warehouse },
      { href: '/purchases', label: 'Procurement', icon: Truck },
      { href: '/suppliers', label: 'Suppliers', icon: Building2 },
    ],
  },
  {
    label: 'Analytics',
    items: [
      { href: '/reports', label: 'Reports', icon: BarChart3 },
    ],
  },
];

const adminItems = [
  { href: '/logs', label: 'Activity Logs', icon: ScrollText },
  { href: '/users', label: 'User Management', icon: UserCog },
  { href: '/settings', label: 'Settings', icon: Settings },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
    router.push('/auth/login');
  };

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        'fixed top-0 left-0 h-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col z-50 transition-all duration-300',
        collapsed ? 'w-16' : 'w-64',
        open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      )}>
        {/* Logo */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100 dark:border-gray-800">
          {!collapsed && (
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center flex-shrink-0">
                <Stethoscope className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="font-bold text-gray-900 dark:text-white text-sm leading-tight">PharmEase</div>
                <div className="text-xs text-gray-400">Pharmacy Manager</div>
              </div>
            </div>
          )}
          {collapsed && (
            <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center mx-auto">
              <Stethoscope className="w-5 h-5 text-white" />
            </div>
          )}
          <div className="flex items-center gap-1">
            <button
              onClick={onClose}
              className="lg:hidden p-1 rounded hover:bg-gray-100 text-gray-500"
            >
              <X className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="hidden lg:flex p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
            >
              {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
          {navGroups.map((group, gi) => (
            <div key={gi} className={gi > 0 ? 'mt-3' : ''}>
              {group.label && !collapsed && (
                <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-3 pb-1.5 pt-1">
                  {group.label}
                </p>
              )}
              {group.label && collapsed && gi > 0 && (
                <hr className="border-gray-200 dark:border-gray-700 mx-2 mb-1" />
              )}
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      'sidebar-link',
                      active && 'active',
                      collapsed && 'justify-center px-0 py-2.5'
                    )}
                  >
                    <Icon className={cn('w-5 h-5 flex-shrink-0', active ? 'text-primary-600 dark:text-primary-400' : '')} />
                    {!collapsed && <span>{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          ))}

          {user?.role === 'ADMIN' && (
            <div className="mt-3">
              {!collapsed && (
                <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-3 pb-1.5 pt-1">Admin</p>
              )}
              {collapsed && <hr className="border-gray-200 dark:border-gray-700 mx-2 mb-1" />}
              {adminItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      'sidebar-link',
                      active && 'active',
                      collapsed && 'justify-center px-0 py-2.5'
                    )}
                  >
                    <Icon className={cn('w-5 h-5 flex-shrink-0', active ? 'text-primary-600 dark:text-primary-400' : '')} />
                    {!collapsed && <span>{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          )}
        </nav>

        {/* User info & Logout */}
        <div className="border-t border-gray-100 dark:border-gray-800 p-3">
          {!collapsed && (
            <div className="flex items-center gap-3 px-2 py-2 rounded-lg mb-2">
              <div className="w-8 h-8 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-bold text-primary-700 dark:text-primary-400">
                  {user?.name?.[0]?.toUpperCase()}
                </span>
              </div>
              <div className="overflow-hidden">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{user?.name}</p>
                <p className="text-xs text-gray-400 truncate">{user?.role}</p>
              </div>
            </div>
          )}
          <button
            onClick={handleLogout}
            title={collapsed ? 'Logout' : undefined}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors',
              collapsed && 'justify-center px-0'
            )}
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {!collapsed && 'Sign Out'}
          </button>
        </div>
      </aside>

      {/* Spacer for desktop layout */}
      <div className={cn(
        'hidden lg:block flex-shrink-0 transition-all duration-300',
        collapsed ? 'w-16' : 'w-64',
      )} />
    </>
  );
}
