import { describe, expect, it, vi } from 'vitest';
import { captionExcerpts, captionWindows, selectCaptionExcerpts } from '../supabase/functions/_shared/caption-excerpts';
import { companionAnswer } from '../supabase/functions/_shared/answer';
import { companionResponse } from '../supabase/functions/_shared/companion-response';
import { conversationMemory, type Conversation, type Evidence, type ViewingPosition } from '../supabase/functions/_shared/companion';

const position: ViewingPosition = { tmdbId: 11, mediaType: 'tv', seasonNumber: 1, episodeNumber: 2, seconds: 60 };
const rows: Evidence[] = [{ id: 'real-row', season: 1, episode: 2, start: 31, end: 50,
  text: "[00:00:31] If the bus arrives,\n[00:00:35] we can travel tonight.\n[00:00:40] It has not arrived yet.\n[00:00:45] We must wait." }];
const history: Conversation = { id: 'reply', title_id: 11, media_type: 'tv', season_number: 1, episode_number: 2,
  position_seconds: 60, timestamp: '00:01:00', question: 'What now?', answer: 'LIMITED_CAPTION_CONTEXT', context: '',
  created_at: '2026-10-22T00:00:00Z', companion_version: 3, answer_status: 'insufficient_evidence' };

describe('limited caption context', () => {
  it('bounds every selectable window and keeps sentence conditions intact', () => {
    const windows = captionWindows(rows[0].text);
    expect(windows[0]).toMatchObject({ first: 1, last: 4 });
    expect(windows.some(window => window.first === 2)).toBe(false);
    for (const window of captionWindows(('A complete sentence with several words.\n').repeat(20))) {
      expect((('A complete sentence with several words.\n').repeat(20).split('\n')
        .slice(window.first - 1, window.last).join(' ').match(/\S+/g) ?? []).length).toBeLessThanOrEqual(45);
    }
  });
  it('spreads recap selection over the prefix instead of supplying only its opening', async () => {
    const prefix = Array.from({ length: 9 }, (_, i) => ({ ...rows[0], id: `row-${i}`, start: i * 5, end: i * 5 + 3 }));
    const generate = vi.fn().mockResolvedValue({ selections: { P1: 'R1', P2: 'R1', P3: 'R1', P4: 'R1' } });
    const result = await selectCaptionExcerpts('Recap so far.', position, prefix, generate);
    expect(JSON.parse(generate.mock.calls[0][1]).evidence).toHaveLength(4);
    expect(result?.evidence.map(item => item.id)).toEqual(['row-0', 'row-3', 'row-5', 'row-8']);
  });
  it('keeps conditions, intervening corrections and continuations rather than splicing a misleading quotation', () => {
    const result = captionExcerpts(position, rows, ['real-row:2', 'real-row:4']);
    expect(result?.answer).toContain('If the bus arrives,\nwe can travel tonight.\nIt has not arrived yet.\nWe must wait.');
    expect(result).toMatchObject({ limited: true });
  });
  it('rejects future and other-episode passages again at rendering time', () => {
    expect(captionExcerpts({ ...position, seconds: 40 }, rows, ['real-row:1'])).toBeNull();
    expect(captionExcerpts({ ...position, episodeNumber: 1 }, rows, ['real-row:1'])).toBeNull();
    expect(captionExcerpts(position, rows, ['real-row:99', 'invented:1'])).toBeNull();
  });
  it('skips an oversized exchange whole instead of cutting off its qualification', () => {
    const text = `${'Long dialogue '.repeat(95)}but this has not happened.`;
    expect(captionExcerpts(position, [{ ...rows[0], text }], ['real-row:1'])).toBeNull();
  });
  it('uses only validated source IDs and ignores all model-authored prose', async () => {
    const generate = vi.fn().mockResolvedValue({ selections: { P1: 'R1' }, explanation: 'INVENTED_ACTION' });
    const result = await selectCaptionExcerpts('What is happening?', position, rows, generate);
    expect(result?.answer).toContain('It has not arrived yet.');
    expect(result?.answer).not.toContain('INVENTED_ACTION');
    expect(result?.evidence[0].id).toBe('real-row');
    expect(companionResponse('What now?', position, rows, [], result)).toMatchObject({ charge: false, answer_status: 'insufficient_evidence' });
    expect(conversationMemory([history], position)).toEqual([]);
  });
  it('never sends earlier-scene or future captions to a current-moment selector', async () => {
    const generate = vi.fn().mockResolvedValue({ selections: { P1: 'R1' } });
    await selectCaptionExcerpts('What is happening right now?', position, [
      { ...rows[0], id: 'early', start: 1, end: 20, text: 'OLD_SCENE' },
      ...rows, { ...rows[0], id: 'late', start: 59, end: 61, text: 'FUTURE_SCENE' },
      { ...rows[0], id: 'next', episode: 3, text: 'NEXT_EPISODE' },
    ], generate);
    expect(generate.mock.calls[0][1]).not.toMatch(/OLD_SCENE|FUTURE_SCENE|NEXT_EPISODE/);
  });
  it('bounds over-selection by subject relevance and recency without publishing model prose', async () => {
    const candidates = [
      { ...rows[0], id: 'subject', start: 1, end: 5, text: 'The antenna must be repaired before we can send our message.' },
      { ...rows[0], id: 'old', start: 10, end: 15, text: 'The weather is pleasant and the meal is already on the table.' },
      { ...rows[0], id: 'new', start: 20, end: 25, text: 'The crew has asked us to wait for another announcement.' },
    ];
    const generate = vi.fn().mockResolvedValue({ selections: { P1: 'R1', P2: 'R1', P3: 'R1' }, answer: 'INVENTED' });
    const result = await selectCaptionExcerpts('Why is the antenna important?', position, candidates, generate);
    expect(result?.evidence.map(item => item.id)).toEqual(['subject', 'new']);
    expect(result?.answer).not.toContain('INVENTED');
  });
  it.each([{ selections: { P1: 'R99' } }, { selections: { P9: 'R1' } }, { selections: { P1: 1 } }, { selections: null }, { answer: 'fabricated' }])(
    'withholds invalid selection %j', async response => {
      expect(await selectCaptionExcerpts('What is happening?', position, rows, vi.fn().mockResolvedValue(response))).toBeNull();
    });
  it('falls back to source context when an explanation draft is invalid, without forwarding rejected prose', async () => {
    const generate = vi.fn().mockResolvedValueOnce({ answer: 'Marla leaves town.' }).mockResolvedValueOnce({ selections: { P1: 'R1' },
      answer: 'Marla leaves town.' });
    const result = await companionAnswer('What has happened so far?', position, rows, [], generate);
    expect(result?.answer).toContain('It has not arrived yet.');
    expect(result?.answer).not.toContain('Marla');
    expect(JSON.stringify(generate.mock.calls)).not.toContain('Marla');
    expect(generate).toHaveBeenCalledTimes(2);
  });
  it('never calls a fallback for unavailable memory or a provider failure', async () => {
    const generate = vi.fn().mockRejectedValue(new Error('free quota'));
    expect(await companionAnswer('Repeat your last answer.', { ...position, seconds: 30 }, rows, [history], generate)).toBeNull();
    expect(generate).not.toHaveBeenCalled();
    await expect(companionAnswer('What happened?', position, rows, [], generate)).rejects.toThrow('free quota');
    expect(generate).toHaveBeenCalledOnce();
  });
});
