'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AdminLogin from '@/components/AdminLogin';
import AdminNav from '@/components/AdminNav';
import AdminDashboard from '@/components/AdminDashboard';
import AdminInventory from '@/components/AdminInventory';

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState('status');
  const router = useRouter();

  const handleGoToSoldierView = () => {
    if (window.confirm('לעבור לתצוגת חייל?')) {
      router.push('/');
    }
  };

  const handleTabChange = useCallback((tab: string) => {
    if (tab !== activeTab) {
      window.history.pushState({ adminTab: tab }, '');
      setActiveTab(tab);
    }
  }, [activeTab]);

  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      const state = e.state;
      if (state?.adminTab) {
        setActiveTab(state.adminTab);
      } else if (state?.adminSubview) {
        // Handled by child component (AdminInventory)
      } else {
        setActiveTab('status');
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  if (!isAuthenticated) {
    return <AdminLogin onSuccess={() => setIsAuthenticated(true)} />;
  }

  return (
    <>
      <header className="app-header" style={{ position: 'relative' }}>
        <h1 className="app-header__title">לוח בקרה — מפקד</h1>
        <p className="app-header__subtitle">ניהול בדיקת צל״ם</p>
        <button
          className="btn btn--secondary btn--small"
          style={{ position: 'absolute', top: 'var(--space-md)', left: 'var(--space-md)' }}
          onClick={handleGoToSoldierView}
        >
          👤 חייל
        </button>
      </header>

      <main className="page-container page-container--wide">
        <AdminNav activeTab={activeTab} onTabChange={handleTabChange} />

        {activeTab === 'status' && <AdminDashboard />}
        {activeTab === 'inventory' && <AdminInventory />}
      </main>
    </>
  );
}
