import { ReactElement } from 'react';
import { Navigate } from 'react-router-dom';
import { loadAuth } from '../api/client';

export default function RequireAdmin({ children }: { children: ReactElement }) {
  const auth = loadAuth();
  if (!auth) return <Navigate to="/login" replace />;
  if (auth.role !== 'ADMIN') return <Navigate to="/login" replace state={{ error: 'admin only' }} />;
  return children;
}
