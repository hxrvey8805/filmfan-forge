import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { readQuestionAllowance, type QuestionAllowance } from '@/lib/question-allowance';

export function useQuestionAllowance(enabled = true) {
  const [allowance, setAllowance] = useState<QuestionAllowance>({mode:'unavailable'});
  useEffect(() => {
    let active = true, revision = 0;
    const refresh = async () => {
      const current = ++revision;
      if (!enabled) return;
      try {
        const {data,error} = await supabase.rpc('get_companion_allowance');
        if (active && current === revision) setAllowance(error ? {mode:'unavailable'} : readQuestionAllowance(data));
      } catch {
        if (active && current === revision) setAllowance({mode:'unavailable'});
      }
    };
    void refresh();
    const {data:{subscription}} = supabase.auth.onAuthStateChange(() => {
      ++revision; setAllowance({mode:'unavailable'});
      // Leave the auth callback before making a network request.
      queueMicrotask(() => { if(active) void refresh(); });
    });
    const timer = window.setInterval(() => { if(document.visibilityState === 'visible') void refresh(); }, 60000);
    const visible = () => { if(document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('questionAsked', refresh);
    document.addEventListener('visibilitychange', visible);
    return () => { active=false; ++revision; subscription.unsubscribe(); clearInterval(timer);
      window.removeEventListener('questionAsked',refresh); document.removeEventListener('visibilitychange',visible); };
  }, [enabled]);
  return allowance;
}
