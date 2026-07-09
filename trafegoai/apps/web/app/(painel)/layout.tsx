'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/store';

export default function PainelLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { token, setProfile } = useAuthStore();

  useEffect(() => {
    if (!token) {
      router.replace('/login');
      return;
    }
    api
      .get<{ user: { name: string; email: string }; org: { id: string; name: string; plan: string } }>('/auth/me')
      .then((me) => setProfile(me.user, me.org))
      .catch(() => router.replace('/login'));
  }, [token, router, setProfile]);

  if (!token) return null;

  return (
    <div className="flex">
      <Sidebar />
      <main className="min-h-screen flex-1 overflow-x-hidden p-6 lg:p-8">{children}</main>
    </div>
  );
}
