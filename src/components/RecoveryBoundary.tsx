import { useSyncExternalStore, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { recovery } from '@/lib/password-recovery';

export function RecoveryBoundary({children}:{children:ReactNode}){
  const state=useSyncExternalStore(recovery.subscribe,recovery.snapshot);
  const location=useLocation();
  // Replace the route before mounting ordinary account/onboarding redirects.
  return state.intent && location.pathname!=='/reset-password'
    ? <Navigate to="/reset-password" replace/> : children;
}
