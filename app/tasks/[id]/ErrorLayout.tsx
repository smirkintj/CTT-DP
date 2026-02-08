'use client';

import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { Layout } from '../../../components/Layout';
import { User, ViewState } from '../../../types';

interface ErrorLayoutProps {
  title: string;
  message: string;
  user: User;
}

export default function ErrorLayout({ title, message, user }: ErrorLayoutProps) {
  const router = useRouter();

  const handleNavigate = (view: ViewState) => {
    switch (view) {
      case 'DASHBOARD_ADMIN':
        router.push('/admin/dashboard');
        return;
      case 'ADMIN_TASK_MANAGEMENT':
        router.push('/admin/tasks');
        return;
      case 'ADMIN_DATABASE':
        router.push('/admin/database');
        return;
      case 'IMPORT_WIZARD':
        router.push('/import');
        return;
      case 'DASHBOARD_STAKEHOLDER':
      case 'LOGIN':
        router.push('/');
        return;
      default:
        router.push('/');
        return;
    }
  };

  const handleLogout = () => {
    void signOut({ redirect: false });
    router.replace('/');
  };

  return (
    <Layout
      currentUser={user}
      onLogout={handleLogout}
      currentView="TASK_DETAIL"
      onNavigate={handleNavigate}
    >
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
    </Layout>
  );
}
