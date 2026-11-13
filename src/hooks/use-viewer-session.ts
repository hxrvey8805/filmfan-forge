import { createContext, useContext, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

const noProvider = Symbol("no viewer provider");
export const ViewerSession = createContext<User | null | typeof noProvider>(noProvider);

// undefined means the saved session is still being restored.
export function useViewerSession() {
  const sharedViewer = useContext(ViewerSession);
  const [viewer, setViewer] = useState<User | null>();
  useEffect(() => {
    if (sharedViewer !== noProvider) return;
    let active = true;
    let receivedEvent = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      receivedEvent = true;
      setViewer(session?.user ?? null);
    });
    const finish = (user: User | null) => {
      if (active && !receivedEvent) setViewer(user);
    };
    void supabase.auth.getSession().then(({ data }) => finish(data.session?.user ?? null), () => finish(null));
    return () => { active = false; subscription.unsubscribe(); };
  }, [sharedViewer]);
  return sharedViewer === noProvider ? viewer : sharedViewer;
}
