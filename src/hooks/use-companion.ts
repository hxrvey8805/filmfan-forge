import {useAIPrivacy} from '@/components/AIPrivacy';
import { CompanionAnswerError } from '../../supabase/functions/_shared/companion-answer-error';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { companionVersionFor, safeHistory, type Conversation, type ViewingPosition } from '../../supabase/functions/_shared/companion';

export interface CompanionMessage extends Conversation {
  evidence: { id: string; label: string; start: number; end: number }[];
  answer_status: string | null;
}

// Both entry points use the same server-owned, title/episode-scoped history.
export function useCompanion(position: ViewingPosition | null, enabled = true) {
  const privacy = useAIPrivacy();
  const [userId, setUserId] = useState<string | null>(null);
  const [history, setHistory] = useState<{ scope: string; rows: CompanionMessage[] }>({ scope: '', rows: [] });
  const [isLoading, setLoading] = useState(false);
  const [loadingMessage,setLoadingMessage]=useState('Geek is thinking…');
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const asking = useRef(false);
  const pendingRequest = useRef<{ key: string; id: string } | null>(null);
  const scope = `${userId}:${position?.mediaType}:${position?.tmdbId}:${position?.seasonNumber}:${position?.episodeNumber}`;
  const view = `${scope}:${position?.seconds}:${enabled}`;
  const currentView = useRef(view);
  currentView.current = view;

  useEffect(() => {
    let active = true;
    let authChanged = false;
    supabase.auth.getSession().then(({ data }) => { if (active && !authChanged) setUserId(data.session?.user.id ?? null); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      authChanged = true;
      setUserId(session?.user.id ?? null);
      // Scope filtering hides another account's rows immediately. Refreshing
      // this user's token must not erase history without triggering a reload.
    });
    return () => { active = false; currentView.current = ''; subscription.unsubscribe(); };
  }, []);

  const { tmdbId, mediaType, seasonNumber, episodeNumber, seconds } = position ?? {};
  const hasTimestamp = seconds !== undefined;
  useEffect(() => {
    let active = true;
    setHistoryError(null);
    if (!enabled || !tmdbId || !mediaType || !hasTimestamp || !userId) return;
    const timer = setTimeout(async () => {
      let query = supabase.from('ai_conversations').select('*').eq('user_id', userId)
        .eq('title_id', tmdbId).eq('media_type', mediaType)
        .eq('companion_version', companionVersionFor({ tmdbId, mediaType, seasonNumber, episodeNumber }));
      if (mediaType === 'tv') query = query.eq('season_number', seasonNumber!).eq('episode_number', episodeNumber!);
      const { data, error } = await query.order('created_at', { ascending: false }).limit(30);
      if (!active) return;
      if (error) { setHistoryError('Conversation history could not be loaded. Please try again.'); return; }
      setHistory({ scope, rows: (data ?? []) as unknown as CompanionMessage[] });
    }, 150);
    return () => { active = false; clearTimeout(timer); };
  }, [scope, tmdbId, mediaType, seasonNumber, episodeNumber, hasTimestamp, enabled, userId, revision]);

  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener('questionAsked', refresh);
    return () => window.removeEventListener('questionAsked', refresh);
  }, []);

  const ask = async (question: string, timestamp: string) => {
    if (asking.current || !enabled || !position || !userId) throw new Error('Please sign in and select what you are watching.');
    const requestScope = scope;
    const requestView = view;
    const requestKey = JSON.stringify({ scope, seconds: position.seconds, question: question.trim() });
    if (pendingRequest.current?.key !== requestKey) pendingRequest.current = { key: requestKey, id: crypto.randomUUID() };
    asking.current = true;
    setLoading(true);
    setLoadingMessage('Geek is thinking…');
    try {
      if (!await privacy.ensure('companion')) return { cancelled: true };
      if (currentView.current !== requestView) return { stale: true };
      const body = { ...position, recapProtocol: 1, timestamp, question: question.trim(), requestId: pendingRequest.current.id };
      const invoke = () => supabase.functions.invoke('spoiler-free-companion', { body });
      const started=Date.now();
      let { data, error } = await invoke();
      let continuations=0;
      while (!error && data?.status === 'preparing_recap') {
        if (currentView.current !== requestView) return { stale: true };
        setLoadingMessage(data.stage==='checking_answer'?'Geek is finishing the answer checks…':'Geek is preparing the story context…');
        // Keep the same request and spending ledger if the user retries.
        // Never leave an unbounded preparation loop running on the phone.
        if(++continuations>12||Date.now()-started>180000)throw new Error('This is taking longer than expected. Send the same question to continue from saved progress. No question used.');
        await new Promise(resolve => setTimeout(resolve, 500));
        if (currentView.current !== requestView) return { stale: true };
        ({ data, error } = await invoke());
      }
      if (error) {
        let message = 'The companion could not answer. Please try again.';
        let unverified = false;
        try {
          const failure = await error.context.json();
          message = failure.error || message;
          unverified = failure.code === 'question_answer_unverified';
          if (failure.code === "ai_consent_required") privacy.reload();
          // Retrying a retired cached answer needs a fresh request ID. Other
          // failures keep their ID so a successful save cannot charge twice.
          if (['answer_version_changed', 'question_request_closed', 'question_budget_unavailable', 'question_answer_unverified'].includes(failure.code)) pendingRequest.current = null;
        } catch { /* Network errors have no response body. */ }
        throw unverified ? new CompanionAnswerError() : new Error(message);
      }
      if (!data?.conversation) throw new Error('The answer could not be saved. Please try again.');
      pendingRequest.current = null;
      if (currentView.current === requestView) {
        setHistory(previous => ({ scope: requestScope, rows: [data.conversation,
          ...(previous.scope === requestScope ? previous.rows.filter(row => row.id !== data.conversation.id) : [])] }));
      }
      window.dispatchEvent(new CustomEvent('questionAsked'));
      return { ...data, stale: currentView.current !== requestView };
    } finally { asking.current = false; setLoading(false); }
  };

  return { ask, isLoading, loadingMessage, historyError,
    // Reopening/rewinding an episode keeps the user's already-saved chat.
    // Each row's evidence still has to respect that row's ORIGINAL cutoff.
    // This display ceiling never enters ask(), source retrieval or AI memory.
    messages: enabled && position && history.scope === scope ? safeHistory(history.rows, {...position, seconds:43200}) : [] };
}
