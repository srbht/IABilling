'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit, Key, X, UserCheck, UserX } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';

const EMPTY = { name: '', email: '', password: '', role: 'PHARMACIST', phone: '' };

export default function UsersPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editUser, setEditUser] = useState<any>(null);
  const [form, setForm] = useState(EMPTY);
  const [resetUser, setResetUser] = useState<any>(null);
  const [newPassword, setNewPassword] = useState('');

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(r => r.data.data),
  });

  const saveMutation = useMutation({
    mutationFn: (d: any) => editUser
      ? api.put(`/users/${editUser.id}`, d)
      : api.post('/users', d),
    onSuccess: () => {
      toast.success(editUser ? 'User updated!' : 'User created!');
      qc.invalidateQueries({ queryKey: ['users'] });
      setShowForm(false); setEditUser(null); setForm(EMPTY);
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const resetMutation = useMutation({
    mutationFn: ({ id, password }: any) => api.post(`/users/${id}/reset-password`, { newPassword: password }),
    onSuccess: () => {
      toast.success('Password reset!');
      setResetUser(null); setNewPassword('');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: any) => api.put(`/users/${id}`, { isActive }),
    onSuccess: () => { toast.success('User updated'); qc.invalidateQueries({ queryKey: ['users'] }); },
  });

  const ROLE_COLORS: Record<string, string> = {
    ADMIN: 'badge-red',
    PHARMACIST: 'badge-blue',
    ACCOUNTANT: 'badge-green',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{users.length} users in the system</p>
        <button onClick={() => { setShowForm(true); setEditUser(null); setForm(EMPTY); }} className="btn-primary">
          <Plus className="w-4 h-4" /> Add User
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {users.map((user: any) => (
          <div key={user.id} className={cn('card p-5', !user.isActive && 'opacity-60')}>
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center">
                  <span className="font-bold text-primary-700 dark:text-primary-400">
                    {user.name[0].toUpperCase()}
                  </span>
                </div>
                <div>
                  <div className="font-semibold text-gray-900 dark:text-white">{user.name}</div>
                  <div className="text-xs text-gray-400">{user.email}</div>
                </div>
              </div>
              <span className={cn('badge', ROLE_COLORS[user.role] || 'badge-gray')}>{user.role}</span>
            </div>

            <div className="text-xs text-gray-400 mb-3">
              Joined: {formatDate(user.createdAt)} | {user.phone || 'No phone'}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => {
                  setEditUser(user);
                  setForm({ name: user.name, email: user.email, password: '', role: user.role, phone: user.phone || '' });
                  setShowForm(true);
                }}
                className="btn-secondary btn-sm"
              >
                <Edit className="w-3 h-3" /> Edit
              </button>
              <button onClick={() => { setResetUser(user); setNewPassword(''); }} className="btn-secondary btn-sm">
                <Key className="w-3 h-3" /> Reset Password
              </button>
              <button
                onClick={() => toggleMutation.mutate({ id: user.id, isActive: !user.isActive })}
                className={cn('btn-sm', user.isActive ? 'btn-danger' : 'btn-success')}
              >
                {user.isActive ? <><UserX className="w-3 h-3" /> Disable</> : <><UserCheck className="w-3 h-3" /> Enable</>}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
              <h3 className="font-bold text-lg">{editUser ? 'Edit User' : 'Add New User'}</h3>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(form); }} className="p-6 space-y-4">
              <div>
                <label className="label">Full Name *</label>
                <input required className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="label">Email *</label>
                <input required type="email" className="input" disabled={!!editUser} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              {!editUser && (
                <div>
                  <label className="label">Password *</label>
                  <input required type="password" minLength={6} className="input" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Role *</label>
                  <select required className="input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                    <option value="PHARMACIST">Pharmacist</option>
                    <option value="ADMIN">Admin</option>
                    <option value="ACCOUNTANT">Accountant</option>
                  </select>
                </div>
                <div>
                  <label className="label">Phone</label>
                  <input className="input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={saveMutation.isPending} className="btn-primary flex-1">
                  {saveMutation.isPending ? 'Saving...' : editUser ? 'Update User' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetUser && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="font-bold text-lg mb-1">Reset Password</h3>
            <p className="text-sm text-gray-500 mb-4">For: <span className="font-medium">{resetUser.name}</span></p>
            <div>
              <label className="label">New Password (min 6 chars)</label>
              <input type="password" minLength={6} className="input" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setResetUser(null)} className="btn-secondary flex-1">Cancel</button>
              <button
                disabled={newPassword.length < 6 || resetMutation.isPending}
                onClick={() => resetMutation.mutate({ id: resetUser.id, password: newPassword })}
                className="btn-primary flex-1"
              >
                {resetMutation.isPending ? 'Resetting...' : 'Reset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
