import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { Database, Json } from '@/integrations/supabase/types';

// Reviewed release RPC contracts, kept separate from live-generated schema types.
type TierFunctions = {
  spin_cinegeek_reward: { Args: Record<string, never>; Returns: Json };
  decide_cinegeek_pack: {
    Args: { p_pack: string; p_keep: boolean; p_replace?: string | null };
    Returns: Json;
  };
  redeem_cinegeek_xp: { Args: { p_request: string; p_item: string }; Returns: Json };
  start_cinegeek_game: {
    Args: { p_game: string; p_start: number; p_target: number };
    Returns: Json;
  };
  end_cinegeek_game: { Args: { p_game: string }; Returns: undefined };
};

type TierDatabase = Omit<Database, 'public'> & {
  public: Omit<Database['public'], 'Functions'> & {
    Functions: Database['public']['Functions'] & TierFunctions;
  };
};

export function tierRpc<Name extends keyof TierFunctions>(
  name: Name,
  args?: TierFunctions[Name]['Args'],
) {
  // Same authenticated client and transport; this only extends static typing.
  const client = supabase as unknown as SupabaseClient<TierDatabase>;
  return client.rpc(name, args);
}