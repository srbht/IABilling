'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Eye, EyeOff, Stethoscope, Lock, Mail } from 'lucide-react';
import { useAuthStore } from '@/lib/store';
import api from '@/lib/api';
import { cn } from '@/lib/utils';

interface LoginForm {
  email: string;
  password: string;
}

export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (data: LoginForm) => {
    setLoading(true);
    try {
      const res = await api.post('/auth/login', data);
      const { token, user } = res.data.data;
      setAuth(user, token);
      toast.success(`Welcome back, ${user.name}!`);
      router.push('/dashboard');
    } catch (err: any) {
      const d = err.response?.data;
      const msg =
        d?.message
        || d?.errors?.[0]?.msg
        || (err.code === 'ERR_NETWORK' || err.message === 'Network Error'
          ? 'Service temporarily unavailable. Please try again in a moment.'
          : null)
        || 'Login failed. Please check your credentials.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary-800 via-primary-700 to-primary-600 flex-col justify-between p-12 text-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
            <Stethoscope className="w-6 h-6" />
          </div>
          <span className="text-xl font-bold tracking-tight">PharmEase</span>
        </div>

        <div>
          <h1 className="text-4xl font-bold mb-4 leading-tight">
            Your Complete<br />Pharmacy Solution
          </h1>
          <p className="text-primary-200 text-lg mb-8 leading-relaxed">
            Streamline billing, manage inventory, track expiry dates, and grow your business — all from one platform.
          </p>
          <div className="grid grid-cols-2 gap-4">
            {[
              ['Fast POS Billing', 'Barcode scanning & instant checkout'],
              ['Smart Inventory', 'Expiry alerts & auto reorder levels'],
              ['GST Compliant', 'Automated CGST/SGST calculations'],
              ['Insights & Reports', 'Profit, loss & sales analytics'],
            ].map(([title, desc]) => (
              <div key={title} className="bg-white/10 rounded-xl p-4 backdrop-blur-sm">
                <div className="font-semibold mb-1">{title}</div>
                <div className="text-sm text-primary-200">{desc}</div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-primary-300 text-sm">
          © {new Date().getFullYear()} PharmEase. All rights reserved.
        </p>
      </div>

      {/* Right panel */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center">
              <Stethoscope className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900">PharmEase</span>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-2">Sign in to your account</h2>
          <p className="text-gray-500 mb-8">Enter your credentials to access the dashboard</p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <label className="label">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  {...register('email', { required: 'Email is required' })}
                  type="email"
                  className={cn('input pl-10', errors.email && 'border-red-400 focus:ring-red-500')}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>
              {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>}
            </div>

            <div>
              <label className="label">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  {...register('password', { required: 'Password is required' })}
                  type={showPassword ? 'text' : 'password'}
                  className={cn('input pl-10 pr-10', errors.password && 'border-red-400 focus:ring-red-500')}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && <p className="mt-1 text-xs text-red-500">{errors.password.message}</p>}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full btn-lg"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Signing in...
                </>
              ) : 'Sign In'}
            </button>
          </form>

          <p className="mt-8 text-center text-xs text-gray-400">
            Secure login protected by industry-standard encryption.
          </p>
        </div>
      </div>
    </div>
  );
}
