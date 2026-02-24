'use client';

import { useEffect, useState } from 'react';
import { subscribeToToast, ToastMessage } from '../lib/notify';

type ToastItem = ToastMessage & { id: number };

export function ToastHost() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const unsubscribe = subscribeToToast((payload) => {
      const item: ToastItem = { id: Date.now() + Math.random(), ...payload };
      setToasts((prev) => [...prev, item]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((toast) => toast.id !== item.id));
      }, 3200);
    });
    return unsubscribe;
  }, []);

  return (
    <div className="fixed right-4 top-4 z-[9999] flex max-w-sm flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`rounded-lg border px-4 py-3 text-sm shadow-md ${
            toast.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : toast.type === 'error'
                ? 'border-rose-200 bg-rose-50 text-rose-900'
                : 'border-slate-200 bg-white text-slate-800'
          }`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
