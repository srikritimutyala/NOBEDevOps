'use client';

import RequireAuth from '../RequireAuth';

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  return <RequireAuth requireAdmin>{children}</RequireAuth>;
}
