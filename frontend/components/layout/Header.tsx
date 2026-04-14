'use client';
import { useQuery } from '@tanstack/react-query';
import { Bell, Menu, Sun, Moon, AlertTriangle, Package } from 'lucide-react';
import { useState } from 'react';
import { useAuthStore } from '@/lib/store';
import api from '@/lib/api';
import { cn } from '@/lib/utils';

interface HeaderProps {
  onMenuClick: () => void;
  title: string;
}

export default function Header({ onMenuClick, title }: HeaderProps) {
  const { user } = useAuthStore();
  const [showAlerts, setShowAlerts] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  const { data: alerts } = useQuery({
    queryKey: ['alerts'],
    queryFn: () => api.get('/medicines/alerts').then(r => r.data.data),
    refetchInterval: 5 * 60 * 1000,
  });

  const alertCount = (alerts?.lowStock?.length || 0) + (alerts?.expiring?.length || 0) + (alerts?.expired?.length || 0);

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
    document.documentElement.classList.toggle('dark');
  };

  return (
    <header className="sticky top-0 z-30 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onMenuClick}
            className="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
          >
            <Menu className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h1>
        </div>

        <div className="flex items-center gap-2">
          {/* Dark mode toggle */}
          <button
            onClick={toggleDarkMode}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
          >
            {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          {/* Alerts */}
          <div className="relative">
            <button
              onClick={() => setShowAlerts(!showAlerts)}
              className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
            >
              <Bell className="w-5 h-5" />
              {alertCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                  {alertCount > 9 ? '9+' : alertCount}
                </span>
              )}
            </button>

            {showAlerts && (
              <div className="absolute right-0 top-12 w-80 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-800 overflow-hidden z-50">
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                  <h3 className="font-semibold text-sm text-gray-900 dark:text-white">Alerts & Notifications</h3>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {alertCount === 0 ? (
                    <div className="px-4 py-6 text-center text-gray-400 text-sm">
                      No alerts at this time
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-50 dark:divide-gray-800">
                      {alerts?.expired?.length > 0 && (
                        <div className="px-4 py-3">
                          <div className="flex items-center gap-2 text-red-600 mb-2">
                            <AlertTriangle className="w-4 h-4" />
                            <span className="text-xs font-semibold">{alerts.expired.length} EXPIRED MEDICINES</span>
                          </div>
                          {alerts.expired.slice(0, 3).map((m: any) => (
                            <div key={m.id} className="text-xs text-gray-600 dark:text-gray-400 py-0.5">{m.name} - {m.batchNumber}</div>
                          ))}
                        </div>
                      )}
                      {alerts?.lowStock?.length > 0 && (
                        <div className="px-4 py-3">
                          <div className="flex items-center gap-2 text-yellow-600 mb-2">
                            <Package className="w-4 h-4" />
                            <span className="text-xs font-semibold">{alerts.lowStock.length} LOW STOCK ITEMS</span>
                          </div>
                          {alerts.lowStock.slice(0, 3).map((m: any) => (
                            <div key={m.id} className="text-xs text-gray-600 dark:text-gray-400 py-0.5">{m.name} - Qty: {m.quantity}</div>
                          ))}
                        </div>
                      )}
                      {alerts?.expiring?.length > 0 && (
                        <div className="px-4 py-3">
                          <div className="flex items-center gap-2 text-orange-600 mb-2">
                            <AlertTriangle className="w-4 h-4" />
                            <span className="text-xs font-semibold">{alerts.expiring.length} EXPIRING SOON</span>
                          </div>
                          {alerts.expiring.slice(0, 3).map((m: any) => (
                            <div key={m.id} className="text-xs text-gray-600 dark:text-gray-400 py-0.5">{m.name}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User avatar */}
          <div className="w-8 h-8 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center">
            <span className="text-sm font-bold text-primary-700 dark:text-primary-400">
              {user?.name?.[0]?.toUpperCase()}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
