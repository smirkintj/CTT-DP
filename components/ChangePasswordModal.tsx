'use client';
import React, { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Check } from 'lucide-react';
import { notify } from '@/lib/notify';

export function ChangePasswordModal() {
  const { data: session, update: updateSession } = useSession();
  const router = useRouter();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const policyValid = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/.test(newPassword);
  const checks = [
    newPassword.length >= 8,
    /[A-Z]/.test(newPassword),
    /[a-z]/.test(newPassword),
    /\d/.test(newPassword),
    /[^A-Za-z\d]/.test(newPassword),
  ];
  const confirmMatches = confirmPassword.length > 0 && newPassword === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (changing) return;
    if (!newPassword || !confirmPassword) { setError('Please fill in both password fields.'); return; }
    if (!policyValid) { setError('Use 8+ chars with uppercase, lowercase, number, and symbol.'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return; }

    setChanging(true);
    setError(null);
    try {
      const response = await fetch('/api/users/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword, confirmPassword }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) { setError(data?.error || 'Failed to change password.'); return; }
      notify('Password updated. Redirecting to your dashboard...', 'success');
      await updateSession();
      router.refresh();
    } finally {
      setChanging(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 backdrop-blur-[10px]"
      style={{ background: 'rgba(255,255,255,0.22)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pw-change-title"
      aria-describedby="pw-change-desc"
    >
      <div
        className="w-full border border-slate-200/90 bg-white/95 p-6 ring-1 ring-slate-100/90 sm:p-7"
        style={{ maxWidth: '360px', borderRadius: '28px', boxShadow: '0 18px 52px rgba(15,23,42,0.16)' }}
      >
        <div className="mb-6">
          <h2
            id="pw-change-title"
            className="font-semibold text-slate-900 sm:text-[32px]"
            style={{ fontSize: '30px', lineHeight: 0.95, letterSpacing: '-0.03em' }}
          >
            Set your password
          </h2>
          <p id="pw-change-desc" className="mt-1.5 text-sm text-slate-500 leading-relaxed">
            Your account needs a new password before you can continue.
          </p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">New password</label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={`block w-full rounded-2xl border bg-slate-50 px-4 py-3 pr-12 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 ${
                  newPassword.length > 0 && !policyValid
                    ? 'border-rose-300 focus:border-rose-400'
                    : 'border-slate-200 focus:border-slate-300'
                }`}
                autoComplete="new-password"
                placeholder="New password"
              />
              <button
                type="button"
                onClick={() => setShowNew((p) => !p)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                aria-label={showNew ? 'Hide password' : 'Show password'}
              >
                {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <div className="mt-2.5">
              <div className="flex gap-1">
                {checks.map((met, i) => (
                  <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${met ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                ))}
              </div>
              <p className="mt-1.5 text-[11px] leading-tight text-slate-400">
                8+ chars · uppercase · lowercase · number · symbol
              </p>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Confirm password</label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={`block w-full rounded-2xl border bg-slate-50 px-4 py-3 pr-12 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 ${
                  confirmPassword.length > 0 && !confirmMatches
                    ? 'border-rose-300 focus:border-rose-400'
                    : confirmMatches
                    ? 'border-emerald-300 focus:border-emerald-400'
                    : 'border-slate-200 focus:border-slate-300'
                }`}
                autoComplete="new-password"
                placeholder="Confirm password"
              />
              {confirmMatches ? (
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-500 pointer-events-none">
                  <Check size={16} />
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowConfirm((p) => !p)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label={showConfirm ? 'Hide password' : 'Show password'}
                >
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              )}
            </div>
          </div>

          {error && (
            <p className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={changing || !policyValid || !confirmMatches}
            className={`w-full py-3 rounded-2xl text-sm font-semibold transition-all ${
              changing || !policyValid || !confirmMatches
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                : 'bg-slate-900 text-white hover:bg-slate-800'
            }`}
          >
            {changing ? 'Updating...' : 'Set password'}
          </button>
        </form>
      </div>
    </div>
  );
}
