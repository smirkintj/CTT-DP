'use client';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

export type ActivityItem = {
  id: string;
  type: string;
  message: string;
  createdAt: string;
  taskId?: string | null;
  isRead: boolean;
};

type ActivitiesContextValue = {
  activities: ActivityItem[];
  loading: boolean;
  markRead: (activityId: string) => Promise<void>;
  markAllRead: () => Promise<void>;
};

const ActivitiesContext = createContext<ActivitiesContextValue>({
  activities: [],
  loading: false,
  markRead: async () => {},
  markAllRead: async () => {},
});

export function ActivitiesProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!session?.user?.id) { setActivities([]); return; }
    let active = true;
    setLoading(true);
    fetch('/api/activities', { cache: 'no-store' })
      .then((r) => r.ok ? r.json() : [])
      .then((data) => { if (active && Array.isArray(data)) setActivities(data); })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [session?.user?.id]);

  const markRead = useCallback(async (activityId: string) => {
    const r = await fetch('/api/activities/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activityId }),
    });
    if (!r.ok) return;
    setActivities((prev) => prev.map((a) => (a.id === activityId ? { ...a, isRead: true } : a)));
  }, []);

  const markAllRead = useCallback(async () => {
    const r = await fetch('/api/activities/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    });
    if (!r.ok) return;
    setActivities((prev) => prev.map((a) => ({ ...a, isRead: true })));
  }, []);

  return (
    <ActivitiesContext.Provider value={{ activities, loading, markRead, markAllRead }}>
      {children}
    </ActivitiesContext.Provider>
  );
}

export function useActivities() {
  return useContext(ActivitiesContext);
}
