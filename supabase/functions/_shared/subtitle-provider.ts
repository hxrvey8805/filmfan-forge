import { parseSubtitles, type ViewingPosition } from './companion.ts';
import { selectSubtitleFile, subtitleSearchParams } from './subtitle-source.ts';

export type SubtitleFailure = 'quota_exceeded' | 'rate_limited' | 'provider_error';
const messages: Record<SubtitleFailure, string> = {
  quota_exceeded: 'The dialogue service has reached its daily download limit. Please try this title again tomorrow. You have not been charged.',
  rate_limited: 'The dialogue service is busy. Please try again in a minute. You have not been charged.',
  provider_error: 'The dialogue service is temporarily unavailable. Please try again later. You have not been charged.',
};
export class SubtitleProviderError extends Error {
  constructor(public reason: SubtitleFailure, public stage: string, public status = 0) {
    super(messages[reason]);
  }
}

export async function assertSubtitlePreparation(response: Response): Promise<void> {
  const body = await response.json().catch(() => null);
  if (response.ok && (body?.success === true || body?.reason === 'unavailable')) return;
  const reason: SubtitleFailure = body?.reason === 'quota_exceeded' || body?.reason === 'rate_limited'
    ? body.reason : 'provider_error';
  throw new SubtitleProviderError(reason, 'prepare', response.status);
}

export async function loadSubtitleFile(position: Omit<ViewingPosition, 'seconds'>, apiKey: string,
  fetcher: typeof fetch = fetch) {
  const apiHeaders = { 'Api-Key': apiKey, 'Content-Type': 'application/json', 'User-Agent': 'CineGeek v1.0' };
  async function request(url: string, options: RequestInit, stage: string) {
    try {
      const response = await fetcher(url, { ...options, signal: AbortSignal.timeout(12000) });
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        const reason = response.status === 429 ? 'rate_limited' :
          response.status === 406 && detail?.remaining === 0 ? 'quota_exceeded' : 'provider_error';
        throw new SubtitleProviderError(reason, stage, response.status);
      }
      return response;
    } catch (error) {
      if (error instanceof SubtitleProviderError) throw error;
      // Never expose API keys, provider response bodies, or signed download URLs.
      throw new SubtitleProviderError('provider_error', stage);
    }
  }
  try {
    const search = await request(`https://api.opensubtitles.com/api/v1/subtitles?${subtitleSearchParams(position)}`,
      { headers: apiHeaders }, 'search');
    const fileId = selectSubtitleFile((await search.json()).data, position);
    if (!fileId) return null;
    // One download per import: do not exhaust a daily quota by retrying POSTs.
    const download = await request('https://api.opensubtitles.com/api/v1/download', {
      method: 'POST', headers: apiHeaders, body: JSON.stringify({ file_id: fileId }),
    }, 'download');
    const link = (await download.json()).link;
    if (typeof link !== 'string' || !link.startsWith('https://')) throw new SubtitleProviderError('provider_error', 'link');
    const file = await request(link, {}, 'file');
    const text = await file.text();
    let cues;
    try { cues = parseSubtitles(text); } catch { throw new SubtitleProviderError('provider_error', 'parse'); }
    if (!cues.length) throw new SubtitleProviderError('provider_error', 'parse');
    return { fileId, cues };
  } catch (error) {
    if (error instanceof SubtitleProviderError) throw error;
    throw new SubtitleProviderError('provider_error', 'response');
  }
}
