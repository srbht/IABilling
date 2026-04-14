import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'PHARMACIST' | 'ACCOUNTANT';
}

interface AuthState {
  user: User | null;
  token: string | null;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      setAuth: (user, token) => {
        if (typeof window !== 'undefined') {
          localStorage.setItem('token', token);
          localStorage.setItem('user', JSON.stringify(user));
        }
        set({ user, token });
      },
      logout: () => {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
        }
        set({ user: null, token: null });
      },
    }),
    { name: 'auth-storage' }
  )
);

// Billing cart store
interface CartItem {
  medicineId: string;
  name: string;
  sku?: string | null;
  genericName?: string | null;
  strengthLine?: string;
  hsnCode?: string | null;
  packSize?: string | null;
  dosageForm?: string | null;
  batchNumber: string;
  expiryDate: string;
  mrp: number;
  sellingPrice: number;
  quantity: number;
  discount: number;
  cgstRate: number;
  sgstRate: number;
  originalCgstRate: number;
  originalSgstRate: number;
  unit: string;
  maxQty: number;
  rackLocation?: string | null;
}

/** Payload for addItem — originals are set from cgst/sgst rates inside the store */
type CartItemInput = Omit<CartItem, 'originalCgstRate' | 'originalSgstRate'>;

interface CartState {
  items: CartItem[];
  customerName: string;
  customerPhone: string;
  customerId: string | null;
  customerAddress: string;
  customerCity: string;
  customerPincode: string;
  customerState: string;
  patientName: string;
  patientAge: string;
  referredByDoctor: string;
  doctorRegNo: string;
  rxReference: string;
  paymentMode: string;
  discountType: string;
  discountValue: number;
  notes: string;
  addItem: (item: CartItemInput) => void;
  updateItem: (medicineId: string, updates: Partial<CartItem>) => void;
  removeItem: (medicineId: string) => void;
  clearCart: () => void;
  setCustomer: (
    name: string,
    phone: string,
    id?: string | null,
    opts?: { address?: string; city?: string; pincode?: string; state?: string }
  ) => void;
  setCustomerAddress: (address: string, city: string, pincode: string, state?: string) => void;
  setPatientReferral: (p: {
    patientName?: string;
    patientAge?: string;
    referredByDoctor?: string;
    doctorRegNo?: string;
    rxReference?: string;
  }) => void;
  setPaymentMode: (mode: string) => void;
  setDiscount: (type: string, value: number) => void;
  setNotes: (notes: string) => void;
}

export const useCartStore = create<CartState>((set) => ({
  items: [],
  customerName: '',
  customerPhone: '',
  customerId: null,
  customerAddress: '',
  customerCity: '',
  customerPincode: '',
  customerState: '',
  patientName: '',
  patientAge: '',
  referredByDoctor: '',
  doctorRegNo: '',
  rxReference: '',
  paymentMode: 'CASH',
  discountType: '',
  discountValue: 0,
  notes: '',

  addItem: (item) => set((state) => {
    const existing = state.items.find(i => i.medicineId === item.medicineId);
    if (existing) {
      return {
        items: state.items.map(i =>
          i.medicineId === item.medicineId
            ? { ...i, quantity: Math.min(i.quantity + 1, i.maxQty) }
            : i
        ),
      };
    }
    return {
      items: [...state.items, {
        ...item,
        originalCgstRate: item.cgstRate,
        originalSgstRate: item.sgstRate,
      }],
    };
  }),

  updateItem: (medicineId, updates) => set((state) => ({
    items: state.items.map(i => i.medicineId === medicineId ? { ...i, ...updates } : i),
  })),

  removeItem: (medicineId) => set((state) => ({
    items: state.items.filter(i => i.medicineId !== medicineId),
  })),

  clearCart: () => set({
    items: [], customerName: '', customerPhone: '',
    customerId: null, customerAddress: '', customerCity: '', customerPincode: '', customerState: '',
    patientName: '', patientAge: '', referredByDoctor: '', doctorRegNo: '', rxReference: '',
    paymentMode: 'CASH',
    discountType: '', discountValue: 0, notes: '',
  }),

  setCustomer: (name, phone, id, opts) => set({
    customerName: name,
    customerPhone: phone,
    customerId: id ?? null,
    customerAddress: opts?.address ?? '',
    customerCity: opts?.city ?? '',
    customerPincode: opts?.pincode ?? '',
    customerState: opts?.state ?? '',
  }),

  setCustomerAddress: (address, city, pincode, state) => set((prev) => ({
    customerAddress: address,
    customerCity: city,
    customerPincode: pincode,
    customerState: state !== undefined ? state : prev.customerState,
  })),

  setPatientReferral: (p) => set((state) => ({
    patientName: p.patientName !== undefined ? p.patientName : state.patientName,
    patientAge: p.patientAge !== undefined ? p.patientAge : state.patientAge,
    referredByDoctor: p.referredByDoctor !== undefined ? p.referredByDoctor : state.referredByDoctor,
    doctorRegNo: p.doctorRegNo !== undefined ? p.doctorRegNo : state.doctorRegNo,
    rxReference: p.rxReference !== undefined ? p.rxReference : state.rxReference,
  })),
  setPaymentMode: (mode) => set({ paymentMode: mode }),
  setDiscount: (type, value) => set({ discountType: type, discountValue: value }),
  setNotes: (notes) => set({ notes }),
}));
