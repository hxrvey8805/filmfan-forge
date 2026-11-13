import { supabase } from '@/integrations/supabase/client';
import { ONBOARDING_KEY, ONBOARDING_VERSION, titleIdentity, validOnboardingTitle, type OnboardingTitle } from './onboarding';

export async function completeOnboarding(owner: string, selections: OnboardingTitle[]) {
  if (selections.length > 3 || selections.some(t => !validOnboardingTitle(t))) throw Error('Invalid selections');
  const checkOwner = async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || data.user?.id !== owner) throw Error('Your session changed. Please sign in again.');
  };
  await checkOwner();
  for (const title of new Map(selections.map(t => [titleIdentity(t), t])).values()) {
    const find = () => supabase.from('user_titles').select('id').eq('user_id', owner)
      .eq('title_id', title.id).eq('type', title.type).eq('list_type', 'watching');
    const existing = await find();
    if (existing.error) throw existing.error;
    if (existing.data?.length) continue;
    const { error } = await supabase.from('user_titles').insert({ user_id: owner, title_id: title.id,
      title: title.title, type: title.type, year: title.year ?? null, poster_path: title.posterPath, list_type: 'watching' });
    if (error) {
      // A retry/concurrent completion may already have inserted this title.
      // Never swallow a collision with a different media type or a DB outage.
      const repeated = error.code === '23505' ? await find() : null;
      if (!repeated || repeated.error || !repeated.data?.length) throw error;
    }
  }
  await checkOwner();
  const { error } = await supabase.auth.updateUser({ data: { [ONBOARDING_KEY]: ONBOARDING_VERSION } });
  if (error) throw error;
}
