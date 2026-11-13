import type { ReactNode } from "react";
import { useViewerSession, ViewerSession } from "@/hooks/use-viewer-session";
import { LaunchSplash } from "./LaunchSplash";

export function AppSession({ children }: { children: ReactNode }) {
  const viewer = useViewerSession();
  if (viewer === undefined) return <LaunchSplash />;
  return <ViewerSession.Provider value={viewer}>{children}</ViewerSession.Provider>;
}
