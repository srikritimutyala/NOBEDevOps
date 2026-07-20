'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './authprovider';

type Props = {
  children: React.ReactNode;
  requireAdmin?: boolean;
};

export default function RequireAuth({ children, requireAdmin = false }: Props) {
  const { profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!profile) {
      router.replace('/users/login');
      return;
    }
    if (requireAdmin && profile.role !== 'ADMIN') {
      router.replace('/users/member');
    }
  }, [loading, profile, requireAdmin, router]);

  if (loading) {
    return (
      <div className="app-shell">
        <div className="page-frame">
          <div className="panel">
            <p className="section-copy">Loading your access...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!profile) return null;
  if (requireAdmin && profile.role !== 'ADMIN') return null;

  return <>{children}</>;
}
