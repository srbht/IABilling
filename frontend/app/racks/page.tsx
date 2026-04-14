'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Warehouse, Plus, Pencil, Trash2, Search, X, Check,
  Package, AlertTriangle, Info,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/lib/store';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

interface Rack {
  name: string;
  description: string;
  medicineCount: number;
}

function apiFetch(path: string, token: string, opts?: RequestInit) {
  return fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts?.headers || {}) },
  });
}

const EMPTY_FORM = { name: '', description: '' };

export default function RacksPage() {
  const { token, user } = useAuthStore();
  const qc = useQueryClient();
  const isAdmin = user?.role === 'ADMIN';
  const canEdit = user?.role === 'ADMIN' || user?.role === 'PHARMACIST';

  // ── State ──
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_FORM);
  const [editRack, setEditRack] = useState<Rack | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<Rack | null>(null);

  // ── Data ──
  const { data, isLoading } = useQuery<{ success: boolean; data: Rack[] }>({
    queryKey: ['racks'],
    queryFn: async () => {
      const r = await apiFetch('/api/racks', token!);
      if (!r.ok) throw new Error('Failed to load racks');
      return r.json();
    },
    enabled: !!token,
  });
  const racks: Rack[] = data?.data || [];

  const filtered = racks.filter(
    r =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.description.toLowerCase().includes(search.toLowerCase()),
  );

  const totalMedicines = racks.reduce((s, r) => s + r.medicineCount, 0);
  const emptyRacks = racks.filter(r => r.medicineCount === 0).length;

  // ── Mutations ──
  const addMutation = useMutation({
    mutationFn: async (body: typeof EMPTY_FORM) => {
      const r = await apiFetch('/api/racks', token!, { method: 'POST', body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || 'Failed to add rack');
      return j;
    },
    onSuccess: () => { toast.success('Rack added'); qc.invalidateQueries({ queryKey: ['racks'] }); setShowAdd(false); setAddForm(EMPTY_FORM); },
    onError: (e: Error) => toast.error(e.message),
  });

  const editMutation = useMutation({
    mutationFn: async ({ oldName, body }: { oldName: string; body: typeof EMPTY_FORM }) => {
      const r = await apiFetch(`/api/racks/${encodeURIComponent(oldName)}`, token!, { method: 'PUT', body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || 'Failed to update rack');
      return j;
    },
    onSuccess: () => {
      toast.success('Rack updated');
      qc.invalidateQueries({ queryKey: ['racks'] });
      qc.invalidateQueries({ queryKey: ['medicines'] });
      setEditRack(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (name: string) => {
      const r = await apiFetch(`/api/racks/${encodeURIComponent(name)}`, token!, { method: 'DELETE' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || 'Failed to delete rack');
      return j;
    },
    onSuccess: () => {
      toast.success('Rack deleted');
      qc.invalidateQueries({ queryKey: ['racks'] });
      qc.invalidateQueries({ queryKey: ['medicines'] });
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Handlers ──
  const openEdit = (rack: Rack) => {
    setEditRack(rack);
    setEditForm({ name: rack.name, description: rack.description });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Warehouse className="w-7 h-7 text-primary-600" />
            Racks &amp; Shelves
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage storage locations for your inventory</p>
        </div>
        {canEdit && (
          <button
            onClick={() => { setShowAdd(true); setAddForm(EMPTY_FORM); }}
            className="btn btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Add Rack
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
            <Warehouse className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{racks.length}</p>
            <p className="text-xs text-gray-500">Total Racks</p>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
            <Package className="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{totalMedicines}</p>
            <p className="text-xs text-gray-500">Medicines Placed</p>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{emptyRacks}</p>
            <p className="text-xs text-gray-500">Empty Racks</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          className="input pl-9 w-full max-w-xs"
          placeholder="Search racks..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mr-2" />
            Loading racks...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
            <Warehouse className="w-10 h-10 opacity-30" />
            <p className="text-sm">{search ? 'No racks match your search' : 'No racks added yet'}</p>
            {!search && canEdit && (
              <button onClick={() => setShowAdd(true)} className="text-primary-600 text-sm hover:underline mt-1">
                + Add your first rack
              </button>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400 w-8">#</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Rack / Shelf</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Description</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Medicines</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filtered.map((rack, i) => (
                <tr key={rack.name} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                  <td className="px-4 py-3 text-gray-400 text-xs">{i + 1}</td>
                  <td className="px-4 py-3">
                    <span className="font-mono font-semibold text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                      {rack.name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                    {rack.description || <span className="italic text-gray-300 dark:text-gray-600">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {rack.medicineCount > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 rounded-full">
                        <Package className="w-3 h-3" /> {rack.medicineCount}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300 dark:text-gray-600">Empty</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {canEdit && (
                        <button
                          onClick={() => openEdit(rack)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                          title="Edit rack"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                      {isAdmin && (
                        <button
                          onClick={() => setDeleteTarget(rack)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          title="Delete rack"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Add Rack Modal ── */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-primary-600" /> Add New Rack
              </h2>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="label">Rack / Shelf Name <span className="text-red-500">*</span></label>
                <input
                  className="input font-mono uppercase"
                  placeholder="e.g. A1-R2, COLD-01, FRONT-SHELF"
                  value={addForm.name}
                  onChange={e => setAddForm(f => ({ ...f, name: e.target.value.toUpperCase() }))}
                  autoFocus
                />
                <p className="text-xs text-gray-400 mt-1">Name will be saved in uppercase (e.g. A1-R2)</p>
              </div>
              <div>
                <label className="label">Description <span className="text-gray-400 font-normal">(optional)</span></label>
                <input
                  className="input"
                  placeholder="e.g. Cold storage, Antibiotics, Front counter"
                  value={addForm.description}
                  onChange={e => setAddForm(f => ({ ...f, description: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 pb-5">
              <button onClick={() => setShowAdd(false)} className="btn btn-secondary">Cancel</button>
              <button
                onClick={() => addMutation.mutate(addForm)}
                disabled={!addForm.name.trim() || addMutation.isPending}
                className="btn btn-primary flex items-center gap-2"
              >
                {addMutation.isPending ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : <Check className="w-4 h-4" />}
                Add Rack
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Rack Modal ── */}
      {editRack && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Pencil className="w-5 h-5 text-blue-600" /> Edit Rack
              </h2>
              <button onClick={() => setEditRack(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {editForm.name !== editRack.name && editRack.medicineCount > 0 && (
                <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm text-amber-800 dark:text-amber-300">
                  <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>
                    Renaming will automatically update the rack location for all{' '}
                    <strong>{editRack.medicineCount}</strong> medicine{editRack.medicineCount !== 1 ? 's' : ''} assigned to this rack.
                  </span>
                </div>
              )}
              <div>
                <label className="label">Rack / Shelf Name <span className="text-red-500">*</span></label>
                <input
                  className="input font-mono uppercase"
                  value={editForm.name}
                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value.toUpperCase() }))}
                  autoFocus
                />
              </div>
              <div>
                <label className="label">Description <span className="text-gray-400 font-normal">(optional)</span></label>
                <input
                  className="input"
                  placeholder="e.g. Cold storage, Antibiotics, Front counter"
                  value={editForm.description}
                  onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 pb-5">
              <button onClick={() => setEditRack(null)} className="btn btn-secondary">Cancel</button>
              <button
                onClick={() => editMutation.mutate({ oldName: editRack.name, body: editForm })}
                disabled={!editForm.name.trim() || editMutation.isPending}
                className="btn btn-primary flex items-center gap-2"
              >
                {editMutation.isPending ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : <Check className="w-4 h-4" />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="p-6 text-center space-y-3">
              <div className="w-14 h-14 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto">
                <Trash2 className="w-7 h-7 text-red-600 dark:text-red-400" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Delete Rack</h2>
              <p className="text-sm text-gray-500">
                Are you sure you want to delete rack{' '}
                <span className="font-mono font-semibold text-gray-900 dark:text-white">{deleteTarget.name}</span>?
              </p>
              {deleteTarget.medicineCount > 0 && (
                <div className="flex items-start gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-800 dark:text-red-300 text-left">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>
                    <strong>{deleteTarget.medicineCount}</strong> medicine{deleteTarget.medicineCount !== 1 ? 's' : ''} are assigned to this rack.
                    Their rack location will be cleared.
                  </span>
                </div>
              )}
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setDeleteTarget(null)} className="btn btn-secondary flex-1">Cancel</button>
              <button
                onClick={() => deleteMutation.mutate(deleteTarget.name)}
                disabled={deleteMutation.isPending}
                className="btn flex-1 bg-red-600 hover:bg-red-700 text-white flex items-center justify-center gap-2"
              >
                {deleteMutation.isPending ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : <Trash2 className="w-4 h-4" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
