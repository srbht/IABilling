import axios from 'axios';

/**
 * Default `/api` uses Next.js rewrites → Express on port 5000 (same origin, no CORS).
 * Override with NEXT_PUBLIC_API_URL only if the API is on another host.
 */
export const API_URL =
  typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_API_URL || '/api'
    : process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5000/api';

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      const onLogin = window.location.pathname.startsWith('/auth/login');
      if (!onLogin) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/auth/login';
      }
    }
    return Promise.reject(err);
  }
);

/** For <a href> PDF links. Pass path after /api/, e.g. `billing/abc123/pdf` */
export function apiUrl(pathAfterApi: string): string {
  const s = pathAfterApi.replace(/^\//, '');
  const base = (typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_API_URL || '/api'
    : 'http://127.0.0.1:5000/api'
  ).replace(/\/$/, '');
  return `${base}/${s}`;
}

/**
 * Open a PDF from the API with the same auth as axios (Bearer token).
 * Plain <a href> to /api/.../pdf does not send Authorization — backend returns "Access token required".
 */
export async function openAuthenticatedPdf(pathAfterApi: string): Promise<void> {
  const s = pathAfterApi.replace(/^\//, '');
  const base = (typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_API_URL || '/api'
    : 'http://127.0.0.1:5000/api'
  ).replace(/\/$/, '');
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}/${s}`, { headers });
  if (!res.ok) {
    let msg = 'Could not open PDF';
    try {
      const j = await res.json();
      if (j?.message) msg = j.message;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
}

/** Origin of the Express server (for static files like /uploads), derived from NEXT_PUBLIC_API_URL when absolute. */
export function getBackendOrigin(): string {
  if (typeof window === 'undefined') return '';
  const api = process.env.NEXT_PUBLIC_API_URL || '';
  if (api.startsWith('http')) {
    try {
      return new URL(api).origin;
    } catch {
      /* ignore */
    }
  }
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:5000`;
}

export default api;
