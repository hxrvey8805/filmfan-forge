import { describe, expect, it, vi } from 'vitest';
import { checkedAnswer } from '../supabase/functions/_shared/answer';
import type { Conversation, Evidence, ViewingPosition } from '../supabase/functions/_shared/companion';

const position: ViewingPosition = { tmdbId: 1, mediaType: 'tv', seasonNumber: 1, episodeNumber: 2, seconds: 30 };
const evidence: Evidence[] = [{ id: 'letter', season: 1, episode: 2, start: 10, end: 12, text: '[00:00:10] (SAM) Keep this letter sealed.' }];
const claim = { text: 'Sam has asked for the letter to stay sealed.', evidenceIds: ['P1'] };
const draft = { status: 'answered', claims: [claim] };
const check = { index: 0, supported: true, issue: 'none', reason: 'Sam explicitly asks for the letter to stay sealed.' };
const pass = { withinBoundary: true, sufficient: true, checks: [check] };
const reject = { withinBoundary: true, sufficient: false, checks: [{ ...check, supported: false, issue: 'speaker', reason: 'The speaker is unestablished.' }] };
const history = (overrides = {}): Conversation => ({ id: 'a', title_id: 1, media_type: 'tv', season_number: 1, episode_number: 2,
  position_seconds: 20, companion_version: 2, question: 'What letter?', answer: 'SAFE_ANSWER', context: '',
  timestamp: '00:00:20', created_at: '2026-10-13T12:00:00Z', answer_status: 'answered', ...overrides });

describe('answer generation and independent verification', () => {
  it('uses permitted memory only for references and maps short citations back to real evidence', async () => {
    const generate = vi.fn().mockResolvedValueOnce(draft).mockResolvedValueOnce(pass);
    const result = await checkedAnswer('Why?', position, evidence, [history(),
      history({ position_seconds: 50, answer: 'FUTURE_ANSWER' }),
      history({ episode_number: 3, answer: 'NEXT_EPISODE' }),
      history({ episode_number: 1, answer: 'OTHER_EPISODE_THREAD' }),
      history({ companion_version: 1, answer: 'UNVERIFIED_LEGACY' }),
      history({ answer_status: 'insufficient_evidence', answer: 'FAILED_ANSWER' })], generate);
    expect(result?.answer).toBe(claim.text);
    expect(result?.evidence[0]).toMatchObject({ id: 'letter', label: 'S1E2 00:00:10–00:00:12' });
    const writer = generate.mock.calls[0][1];
    const verifier = JSON.parse(generate.mock.calls[1][1]);
    expect(writer).toContain('SAFE_ANSWER');
    expect(writer).toContain('[PASSAGE P1');
    expect(verifier).not.toHaveProperty('conversation');
    expect(JSON.stringify(verifier)).not.toContain('SAFE_ANSWER');
    expect(verifier.claims).toEqual(draft.claims);
    expect(verifier.evidence).toEqual([{ ...evidence[0], id: 'P1' }]);
    expect(JSON.stringify(generate.mock.calls)).not.toMatch(/FUTURE_ANSWER|NEXT_EPISODE|OTHER_EPISODE_THREAD|UNVERIFIED_LEGACY|FAILED_ANSWER/);
  });
  it('keeps a useful verified subset and removes rejected prose and citations', async () => {
    const rows = [...evidence, { ...evidence[0], id: 'other', text: 'Other dialogue.' }];
    const mixed = { status: 'answered', claims: [claim, { text: 'UNSUPPORTED_DETAIL', evidenceIds: ['P2'] }] };
    const verdict = { withinBoundary: true, sufficient: true, checks: [
      { index: 1, supported: false, issue: 'inference', reason: 'No evidence for this detail.' }, check] };
    const generate = vi.fn().mockResolvedValueOnce(mixed).mockResolvedValueOnce(verdict);
    const observe = vi.fn();
    const result = await checkedAnswer('Why?', position, rows, [], generate, observe);
    expect(result?.answer).toBe(claim.text);
    expect(result?.evidence.map(row => row.id)).toEqual(['letter']);
    expect(observe).toHaveBeenCalledWith({ stage: 'answered_partial', evidenceCount: 2, claimCount: 1, attempts: 1 });
    expect(generate).toHaveBeenCalledTimes(2);
  });
  it.each([null, {}, { ...pass, withinBoundary: false }, { ...pass, checks: [] },
    { ...pass, checks: [check, check] }, { ...pass, checks: [{ ...check, index: 2 }] },
    { ...pass, checks: [{ ...check, supported: false }] }, { ...pass, checks: [{ ...check, reason: '' }] },
    { ...pass, checks: [{ ...check, issue: 'made_up_issue' }] },
    { ...reject, sufficient: true }])('fails closed on a malformed, inconsistent or boundary-failing verdict (%j)', async verdict => {
    const generate = vi.fn().mockResolvedValueOnce(draft).mockResolvedValueOnce(verdict);
    expect(await checkedAnswer('Why?', position, evidence, [], generate)).toBeNull();
    expect(generate).toHaveBeenCalledTimes(2);
  });
  it('rejects a blanket approval that leaves a claim unchecked', async () => {
    const generate = vi.fn().mockResolvedValueOnce({ ...draft, claims: [claim, claim] }).mockResolvedValueOnce(pass);
    expect(await checkedAnswer('Why?', position, evidence, [], generate)).toBeNull();
  });
  it('includes context the writer did not cite so the checker can detect contradictions', async () => {
    const unrelated = { ...evidence[0], id: 'context', text: '(SAM) I changed my mind.' };
    const generate = vi.fn().mockResolvedValueOnce(draft).mockResolvedValueOnce(pass);
    await checkedAnswer('Why?', position, [...evidence, unrelated], [], generate);
    expect(JSON.parse(generate.mock.calls[1][1]).evidence.map((item: Evidence) => item.text)).toEqual([evidence[0].text, unrelated.text]);
  });
  it('rebuilds once using fixed issue hints, never the rejected draft or verifier prose', async () => {
    const badDraft = { ...draft, claims: [{ ...claim, text: 'UNSAFE_DRAFT' }] };
    const badCheck = { ...reject, checks: [{ ...reject.checks[0], reason: 'REJECTED_PRIVATE_DETAIL' }] };
    const generate = vi.fn().mockResolvedValueOnce(badDraft).mockResolvedValueOnce(badCheck)
      .mockResolvedValueOnce(draft).mockResolvedValueOnce(pass);
    expect((await checkedAnswer('Why?', position, evidence, [], generate))?.answer).toBe(claim.text);
    expect(generate.mock.calls.map(call => call[3])).toEqual(['writer', 'verifier', 'writer', 'verifier']);
    expect(generate.mock.calls[2][1]).toBe(generate.mock.calls[0][1]);
    expect(generate.mock.calls[2][0]).toContain('Distinguish the caller');
    expect(JSON.stringify(generate.mock.calls.slice(2))).not.toMatch(/UNSAFE_DRAFT|REJECTED_PRIVATE_DETAIL/);
  });
  it('does not return a supported but insufficient fragment or loop indefinitely', async () => {
    const generate = vi.fn().mockResolvedValueOnce(draft).mockResolvedValueOnce({ ...pass, sufficient: false })
      .mockResolvedValueOnce(draft).mockResolvedValueOnce({ ...pass, sufficient: false });
    const observe = vi.fn();
    expect(await checkedAnswer('Why?', position, evidence, [], generate, observe)).toBeNull();
    expect(generate).toHaveBeenCalledTimes(4);
    expect(observe.mock.calls[0][0]).toMatchObject({ stage: 'verification_rejected', attempts: 2 });
  });
  it.each([null, { status: 'insufficient_evidence', claims: [] },
    { ...draft, claims: [{ ...claim, evidenceIds: ['FAKE_ID'] }] }])('allows one checked rebuild of an unusable first draft (%j)', async first => {
    const generate = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(draft).mockResolvedValueOnce(pass);
    expect((await checkedAnswer('Why?', position, evidence, [], generate))?.answer).toBe(claim.text);
    expect(generate.mock.calls.map(call => call[3])).toEqual(['writer', 'writer', 'verifier']);
  });
  it('never publishes a replacement without a successful complete check', async () => {
    const generate = vi.fn().mockResolvedValueOnce({ status: 'insufficient_evidence', claims: [] })
      .mockResolvedValueOnce(draft).mockResolvedValueOnce(null);
    expect(await checkedAnswer('Why?', position, evidence, [], generate)).toBeNull();
  });
  it('bounds repeated invalid drafts and reports no private text', async () => {
    const generate = vi.fn().mockResolvedValue({ ...draft, claims: [{ text: 'UNSAFE', evidenceIds: ['future'] }] });
    const observe = vi.fn();
    expect(await checkedAnswer('PRIVATE_QUESTION', position, evidence, [history()], generate, observe)).toBeNull();
    expect(generate).toHaveBeenCalledTimes(2);
    expect(observe).toHaveBeenCalledOnce();
    expect(observe.mock.calls[0][0]).toMatchObject({ stage: 'draft_invalid', attempts: 2 });
    expect(JSON.stringify(observe.mock.calls)).not.toMatch(/PRIVATE_QUESTION|SAFE_ANSWER|UNSAFE|sealed/);
  });
  it('rejects future and ambiguous packets again before either generation attempt', async () => {
    const rows = [{ ...evidence[0], id: 'future', end: 30.001, text: 'FUTURE_PACKET' },
      { ...evidence[0], id: 'episode', episode: 3, text: 'NEXT_EPISODE' },
      { ...evidence[0], id: 'duplicate', text: 'AMBIGUOUS_A' }, { ...evidence[0], id: 'duplicate', text: 'AMBIGUOUS_B' }];
    const generate = vi.fn().mockResolvedValueOnce(draft).mockResolvedValueOnce(reject)
      .mockResolvedValueOnce(draft).mockResolvedValueOnce(pass);
    expect((await checkedAnswer('Why?', position, [evidence[0], ...rows], [], generate))?.answer).toBe(claim.text);
    expect(JSON.stringify(generate.mock.calls)).not.toMatch(/FUTURE_PACKET|NEXT_EPISODE|AMBIGUOUS_A|AMBIGUOUS_B/);
    expect(await checkedAnswer('Why?', position, rows, [], vi.fn())).toBeNull();
  });
  it('does not call the model without permitted evidence, including at 00:00:00', async () => {
    const generate = vi.fn();
    expect(await checkedAnswer('Tell me the ending', { ...position, seconds: 0 }, evidence, [], generate)).toBeNull();
    expect(generate).not.toHaveBeenCalled();
  });
  it('propagates provider failures instead of publishing or retrying an unchecked draft', async () => {
    const generate = vi.fn().mockResolvedValueOnce(draft).mockRejectedValueOnce(new Error('Provider unavailable'));
    await expect(checkedAnswer('Why?', position, evidence, [], generate)).rejects.toThrow('Provider unavailable');
    expect(generate).toHaveBeenCalledTimes(2);
  });
});
