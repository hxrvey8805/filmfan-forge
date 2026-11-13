import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useViewerSession } from '@/hooks/use-viewer-session';
import { needsOnboarding } from '@/lib/onboarding';

export function NewAccountGate({ children }: { children: ReactNode }) {
  const viewer = useViewerSession(), location = useLocation();
  // Only accounts explicitly enrolled at signup enter the tour. Existing
  // accounts and installs are never classified as new based on local storage.
  if (needsOnboarding(viewer) && ['/', '/dashboard', '/companion'].includes(location.pathname)) {
    return <Navigate to="/onboarding" replace />;
  }
  return children;
}
