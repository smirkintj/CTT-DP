'use client';

import { Loader2 } from 'lucide-react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type Props = {
  token: string | null;
};

export default function MagicLoginClient({ token }: Props) {
  const router = useRouter();
  const [message, setMessage] = useState('Signing you in securely...');

  useEffect(() => {
    if (!token) {
      setMessage('This sign-in link is invalid. Please request a new one.');
      return;
    }

    let cancelled = false;

    const run = async () => {
      const result = await signIn('magic-link', {
        token,
        redirect: false
      });

      if (cancelled) return;

      if (!result || result.error) {
        setMessage('This sign-in link is invalid or expired. Please request a new one.');
        return;
      }

      router.replace('/admin/dashboard');
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
        <h1 className="text-2xl font-semibold text-slate-900">Admin Sign-in</h1>
        <div className="mt-4 flex items-center gap-3 text-slate-600">
          <Loader2 size={18} className="animate-spin" />
          <p>{message}</p>
        </div>
        <button
          type="button"
          onClick={() => router.replace('/')}
          className="mt-6 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Back to login
        </button>
      </div>
    </div>
  );
}
