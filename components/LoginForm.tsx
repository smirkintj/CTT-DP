'use client';
import React, { useEffect, useState } from 'react';
import { signIn, getSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { fieldBaseClass } from '@/components/ui/formClasses';

const LOGIN_LOCK_MS = 30_000;

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [lockUntil, setLockUntil] = useState<number | null>(null);
  const [remainingLockSeconds, setRemainingLockSeconds] = useState(0);
  const [loginError, setLoginError] = useState<string | null>(null);
  const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const isLocked = !!lockUntil && Date.now() < lockUntil;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const savedEmail = window.localStorage.getItem('ctt_saved_email');
    const savedRemember = window.localStorage.getItem('ctt_remember_me');
    if (savedRemember === 'false') { setRememberMe(false); return; }
    if (savedEmail) setEmail(savedEmail);
  }, []);

  useEffect(() => {
    if (!email) { setLockUntil(null); setRemainingLockSeconds(0); return; }
    const key = `ctt_login_lock_${email.toLowerCase().trim()}`;
    const raw = window.localStorage.getItem(key);
    if (!raw) return;
    const until = Number(raw);
    if (!Number.isFinite(until) || until <= Date.now()) { window.localStorage.removeItem(key); return; }
    setLockUntil(until);
  }, [email]);

  useEffect(() => {
    if (!lockUntil) { setRemainingLockSeconds(0); return; }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000));
      setRemainingLockSeconds(remaining);
      if (remaining === 0) {
        window.localStorage.removeItem(`ctt_login_lock_${email.toLowerCase().trim()}`);
        setLockUntil(null);
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [lockUntil, email]);

  useEffect(() => {
    if (!lockUntil || remainingLockSeconds <= 0) return;
    setLoginError(`Too many failed attempts. Please retry in ${remainingLockSeconds}s.`);
  }, [lockUntil, remainingLockSeconds]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || isLoggingIn) return;
    if (!emailIsValid) { setLoginError('Please enter a valid email address.'); return; }
    if (isLocked && remainingLockSeconds > 0) {
      setLoginError(`Too many attempts. Try again in ${remainingLockSeconds}s.`);
      return;
    }

    setLoginError(null);
    setIsLoggingIn(true);
    const result = await signIn('credentials', { email, password, redirect: false });

    if (!result || result.error) {
      const keyBase = email.toLowerCase().trim();
      const attemptsKey = `ctt_login_attempts_${keyBase}`;
      const lockKey = `ctt_login_lock_${keyBase}`;
      const nextAttempts = Number(window.localStorage.getItem(attemptsKey) || '0') + 1;
      if (nextAttempts >= 3) {
        const until = Date.now() + LOGIN_LOCK_MS;
        window.localStorage.setItem(lockKey, String(until));
        window.localStorage.removeItem(attemptsKey);
        setLockUntil(until);
        setLoginError(`Too many failed attempts. Please retry in ${Math.ceil(LOGIN_LOCK_MS / 1000)}s.`);
      } else {
        window.localStorage.setItem(attemptsKey, String(nextAttempts));
        setLoginError('Invalid email or password. Please try again.');
      }
      setIsLoggingIn(false);
      return;
    }

    window.localStorage.removeItem(`ctt_login_attempts_${email.toLowerCase().trim()}`);
    window.localStorage.removeItem(`ctt_login_lock_${email.toLowerCase().trim()}`);
    if (rememberMe) {
      window.localStorage.setItem('ctt_saved_email', email.trim());
      window.localStorage.setItem('ctt_remember_me', 'true');
    } else {
      window.localStorage.removeItem('ctt_saved_email');
      window.localStorage.setItem('ctt_remember_me', 'false');
    }

    const updatedSession = await getSession();
    router.push(updatedSession?.user?.role === 'ADMIN' ? '/admin/dashboard' : '/');
    setIsLoggingIn(false);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="bg-white p-8 shadow-xl border border-slate-200 rounded-2xl">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-5">
              <div className="h-12 w-auto px-4 bg-brand-500 rounded-xl flex items-center justify-center shadow-md">
                <span className="text-white font-bold text-2xl tracking-wider">CTT</span>
              </div>
            </div>
            <p className="mt-2 text-sm text-slate-500 font-medium">Cuba Try Test - UAT Management</p>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit} aria-describedby="login-help">
            <div>
              <label htmlFor="login-email" className="block text-sm font-medium text-slate-700">Email address</label>
              <input
                id="login-email"
                type="email"
                inputMode="email"
                autoComplete="username"
                className={`${fieldBaseClass} mt-1 placeholder-slate-400`}
                placeholder="user@dksh.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={Boolean(email) && !emailIsValid}
                aria-describedby="login-help"
              />
            </div>
            <div>
              <label htmlFor="login-password" className="block text-sm font-medium text-slate-700">Password</label>
              <div className="relative mt-1">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className={`${fieldBaseClass} pr-12 placeholder-slate-400`}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="text-slate-400 hover:text-slate-600"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>

            <label htmlFor="remember-email" className="flex items-center gap-2 text-sm text-slate-600">
              <input
                id="remember-email"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              Remember email on this device
            </label>

            {loginError && (
              <div role="alert" aria-live="assertive" className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
                {loginError}
              </div>
            )}
            <p id="login-help" className="sr-only">Enter your DKSH email and password to sign in.</p>

            <div>
              <button
                type="submit"
                disabled={isLoggingIn || isLocked || !emailIsValid || !password}
                className={`w-full flex justify-center items-center gap-2 py-3 px-4 border rounded-xl shadow-sm text-sm font-semibold transition-all ${
                  isLoggingIn || isLocked || !emailIsValid || !password
                    ? 'bg-slate-300 text-slate-500 border-slate-300 cursor-not-allowed'
                    : 'text-white bg-slate-900 border-transparent hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900'
                }`}
                aria-busy={isLoggingIn}
              >
                {isLoggingIn ? (<><Loader2 size={16} className="animate-spin" />Signing in...</>) : 'Sign in'}
              </button>
              {isLoggingIn && (
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full w-1/3 rounded-full bg-slate-500 animate-indeterminate" />
                </div>
              )}
            </div>
          </form>
        </div>
        <div className="mt-6 text-center select-none space-y-1">
          <span className="text-xs text-slate-400 font-mono">v{process.env.NEXT_PUBLIC_APP_VERSION ?? '1.0.0'}</span>
          <p className="text-[10px] text-slate-300">© {new Date().getFullYear()} DKSH CSSC Digital Product</p>
        </div>
      </div>
    </div>
  );
}
