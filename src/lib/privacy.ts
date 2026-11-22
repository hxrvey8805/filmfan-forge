import {AI_NOTICE_VERSION,type AIFeature} from '../../supabase/functions/_shared/ai-privacy';
export {AI_NOTICE_VERSION,type AIFeature};
export const SUPPORT_EMAIL='cinegeek.support@gmail.com';
export const AI_DISCLOSURES:Record<AIFeature,{title:string;heading:string;summary:string;recipient:string;data:string;purpose:string}>= {
 companion:{title:'Chat with Geek',heading:'Meet your AI Geek',recipient:'OpenRouter and OpenAI',
  summary:'To answer at your viewing point, CineGeek shares your question, film or episode, timestamp and relevant story/chat context with',
  data:'Your question, selected film or episode, viewing timestamp, relevant story context and any earlier chat needed to understand a follow-up.',
  purpose:'To explain the story and check the answer against your viewing point.'},
 smart_lists:{title:'AI list helper',heading:'Let Geek sort it',recipient:'OpenRouter and Baidu (ERNIE)',
  summary:'To suggest a rule for your list, CineGeek shares only your list description with',
  data:'Only the description you ask Geek to interpret. Your watch history and the titles in your lists are not sent to this AI helper.',
  purpose:'To suggest a matching rule for you to review before saving.'},
};
export type AIChoices=Partial<Record<AIFeature,boolean>>;
export function parseAIChoices(value:unknown):AIChoices {
 if(!value || typeof value!=='object' || Array.isArray(value))throw Error('Privacy settings unavailable. Try again.');
 const v=value as Record<string,unknown>, result:AIChoices={};
 for(const feature of ['companion','smart_lists'] as const){
  if(v[feature]!==undefined && typeof v[feature]!=='boolean')throw Error('Privacy settings unavailable. Try again.');
  if(typeof v[feature]==='boolean')result[feature]=v[feature];
 }
 return result;
}
