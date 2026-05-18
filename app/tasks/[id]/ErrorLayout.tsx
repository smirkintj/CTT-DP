'use client';

import { useRouter } from 'next/navigation';

interface ErrorLayoutProps {
  title: string;
  message: string;
}

export default function ErrorLayout({ title, message }: ErrorLayoutProps) {
  const router = useRouter();

  return (
    <div className="max-w-2xl mx-auto py-16 px-4 text-center">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        <p className="text-slate-500 mt-2">{message}</p>
        <button
          onClick={() => router.replace('/')}
          className="mt-6 inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700"
        >
          Back to dashboard
        </button>
      </div>
    </div>
  );
}
