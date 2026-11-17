export const AI_NOTICE_VERSION = '2026-11-17';
export type AIFeature = 'companion' | 'smart_lists';
type Rpc = (name: string, args: Record<string, unknown>) => PromiseLike<{data: unknown; error: unknown}>;
export async function aiPermission(rpc: Rpc, user: string, feature: AIFeature): Promise<boolean> {
  const {data,error}=await rpc('cinegeek_ai_allowed',{p_user:user,p_feature:feature,p_version:AI_NOTICE_VERSION});
  if(error || typeof data!=='boolean') throw Error('AI privacy settings unavailable');
  return data;
}
