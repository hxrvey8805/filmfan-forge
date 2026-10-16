import { describe, expect, it, vi } from 'vitest';
import { checkedAnswer } from '../supabase/functions/_shared/answer';
import { unavailableMemoryReply, type Conversation, type Evidence, type ViewingPosition } from '../supabase/functions/_shared/companion';

const position: ViewingPosition = { tmdbId: 1, mediaType: 'tv', seasonNumber: 1, episodeNumber: 2, seconds: 30 };
const evidence: Evidence[] = [{ id: 'letter', season: 1, episode: 2, start: 10, end: 12, text: '[00:00:10] (SAM) Keep this letter sealed.' }];
const claim = { text: 'Sam has asked for the letter to stay sealed.', evidenceIds: ['P1'] };
const draft = { status: 'answered', claims: [claim] };
const check = { index: 0, supported: true, issue: 'none', basis: 'entailed', reason: 'Sam explicitly asks for the letter to stay sealed.', sources: ['P1:1'] };
const pass = { withinBoundary: true, sufficient: true, checks: [check] };
const reject = { withinBoundary: true, sufficient: false, checks: [{ ...check, supported: false, issue: 'speaker', reason: 'The speaker is unestablished.' }] };
const history = (overrides = {}): Conversation => ({ id: 'a', title_id: 1, media_type: 'tv', season_number: 1, episode_number: 2,
  position_seconds: 20, companion_version: 3, question: 'What letter?', answer: 'SAFE_ANSWER', context: '',
  timestamp: '00:00:20', created_at: '2026-10-13T12:00:00Z', answer_status: 'answered', ...overrides });

describe('answer generation and independent verification', () => {
  it('rejects a sentence split across claims before verification instead of joining unchecked fragments', async () => {
    const split = { status: 'answered', claims: [
      { text: 'A speaker considers the plan unreal', evidenceIds: ['P1'] },
      { text: 'istic, but agrees to try it.', evidenceIds: ['P1'] },
    ] };
    const generate = vi.fn().mockResolvedValueOnce(split).mockResolvedValueOnce(draft).mockResolvedValueOnce(pass);
    expect((await checkedAnswer('Why?', position, evidence, [], generate))?.answer).toBe(claim.text);
    expect(generate.mock.calls.map(call => call[3])).toEqual(['writer', 'writer', 'verifier']);
    expect(JSON.stringify(generate.mock.calls[2])).not.toContain('considers the plan');
  });
  it('rejects a named identity absent from the checker proof even when it occurs elsewhere in the cited passage', async () => {
    const rows = [{ ...evidence[0], text: '[00:00:10] Sam!\n[00:00:11] The letter is sealed.' }];
    const wrong = { status: 'answered', claims: [{ text: 'Sam sealed the letter.', evidenceIds: ['P1'] }] };
    const verdict = { ...pass, checks: [{ ...check, sources: ['P1:2'] }] };
    const generate = vi.fn().mockResolvedValueOnce(wrong).mockResolvedValueOnce(verdict)
      .mockResolvedValueOnce(wrong).mockResolvedValueOnce(verdict);
    expect(await checkedAnswer('What happened?', position, rows, [], generate)).toBeNull();
  });
  it('gives the checker the same explicit current-window boundary as the writer', async () => {
    const generate = vi.fn().mockResolvedValueOnce(draft).mockResolvedValueOnce(pass);
    await checkedAnswer('What is happening right now?', position, evidence, [], generate);
    const request = JSON.parse(generate.mock.calls[1][1]);
    expect(request.intent).toBe('scene');
    expect(request.moment).toEqual({ windowStart: 0, recentEvidenceIds: ['P1'] });
    expect(generate.mock.calls[0][1]).toContain(JSON.stringify(request.moment));
  });
  it('keeps unchecked model metadata out of the verifier even if the provider ignores its schema', async () => {
    const generate = vi.fn().mockResolvedValueOnce({ ...draft, futureSummary: 'UNTRUSTED_TOP_LEVEL',
      claims: [{ ...claim, unsupportedContext: 'UNTRUSTED_CLAIM_FIELD' }] }).mockResolvedValueOnce(pass);
    expect((await checkedAnswer('Why?', position, evidence, [], generate))?.answer).toBe(claim.text);
    expect(JSON.stringify(generate.mock.calls[1])).not.toMatch(/UNTRUSTED_/);
  });
  it('rebuilds compound overlong prose before spending a verifier call', async () => {
    const generate = vi.fn().mockResolvedValueOnce({ ...draft, claims: [{ ...claim, text: 'x'.repeat(261) }] })
      .mockResolvedValueOnce(draft).mockResolvedValueOnce(pass);
    expect((await checkedAnswer('Why?', position, evidence, [], generate))?.answer).toBe(claim.text);
    expect(generate.mock.calls.map(call => call[3])).toEqual(['writer', 'writer', 'verifier']);
  });
  it.each([
    { name: 'no history', rows: [] }, { name: 'later timestamp', rows: [history({ position_seconds: 31 })] },
    { name: 'other episode', rows: [history({ episode_number: 3 })] },
    { name: 'other title', rows: [history({ title_id: 2 })] },
    { name: 'failed answer', rows: [history({ answer_status: 'insufficient_evidence' })] },
    { name: 'legacy answer', rows: [history({ companion_version: 1 })] },
    { name: 'retired checked answer', rows: [history({ companion_version: 2 })] },
    { name: 'overlong omitted answer', rows: [history({ answer: 'x'.repeat(1001) })] },
  ])('does not invent a reminder when the referenced assistant answer is unavailable: $name', async ({ rows }) => {
    const question = 'Remind me where they decided to park the RV in your last answer.';
    const generate = vi.fn().mockResolvedValue(draft), observe = vi.fn();
    expect(await checkedAnswer(question, position, evidence, rows, generate, observe)).toBeNull();
    expect(generate).not.toHaveBeenCalled();
    expect(observe).toHaveBeenCalledWith({ stage: 'memory_unavailable', evidenceCount: 1, claimCount: 0, attempts: 0 });
    const reply = unavailableMemoryReply(question, position, rows);
    expect(reply).toContain('previous answer');
    expect(reply).toContain('00:00:30');
    expect(reply).not.toMatch(/RV|SAFE_ANSWER|letter/);
  });
  it('still verifies a follow-up when an eligible prior answer exists', async () => {
    const question = 'Explain your previous answer about the letter.';
    expect(unavailableMemoryReply(question, position, [history()])).toBeNull();
    const generate = vi.fn().mockResolvedValueOnce(draft).mockResolvedValueOnce(pass);
    expect((await checkedAnswer(question, position, evidence, [history()], generate))?.answer).toBe(claim.text);
    expect(generate).toHaveBeenCalledTimes(2);
  });
  it('does not classify ordinary story questions as references to assistant memory', () => {
    for (const question of ['What did they say earlier?', 'What happened last time?', 'What is happening at this moment?']) {
      expect(unavailableMemoryReply(question, position, [])).toBeNull();
    }
  });
  it('rebuilds an invented named attribution and still permits a useful anonymous explanation', async () => {
    const rows = [{ ...evidence[0], text: '[00:00:10] The letter must stay sealed.' }];
    const wrong = { status: 'answered', claims: [{ text: 'Mira says to keep the letter sealed.', evidenceIds: ['P1'] }] };
    const good = { status: 'answered', claims: [{ text: 'A speaker says the letter must remain sealed.', evidenceIds: ['P1'] }] };
    const generate = vi.fn().mockResolvedValueOnce(wrong).mockResolvedValueOnce(good).mockResolvedValueOnce(pass);
    expect((await checkedAnswer('What do we know about Mira?', position, rows, [], generate))?.answer).toBe(good.claims[0].text);
    expect(generate.mock.calls.map(call => call[3])).toEqual(['writer', 'writer', 'verifier']);
    expect(generate.mock.calls[1][0]).toContain('Do not infer a role or identity');
    expect(generate.mock.calls[2][1]).not.toContain(wrong.claims[0].text);
  });
  it('passes bounded omission metadata to both stages without leaking extra fields or future intervals', async () => {
    const coverage = { providedPassages: 2, selectedPassages: 1, omittedPassages: 1,
      omittedRanges: [{ season: 1, episode: 2, start: 1, end: 3, text: 'PRIVATE_EXTRA_FIELD' }] };
    const generate = vi.fn().mockResolvedValueOnce(draft).mockResolvedValueOnce(pass);
    await checkedAnswer('Why?', position, evidence, [], generate, undefined, coverage);
    expect(generate.mock.calls[0][1]).toContain('"omittedPassages":1');
    expect(JSON.parse(generate.mock.calls[1][1]).coverage.omittedRanges).toEqual([{ season: 1, episode: 2, start: 1, end: 3 }]);
    expect(JSON.stringify(generate.mock.calls)).not.toContain('PRIVATE_EXTRA_FIELD');
    const later = { ...coverage, omittedRanges: [{ season: 1, episode: 3, start: 1, end: 3 }] };
    const next = vi.fn().mockResolvedValueOnce(draft).mockResolvedValueOnce(pass);
    await checkedAnswer('Why?', position, evidence, [], next, undefined, later);
    expect(JSON.parse(next.mock.calls[1][1])).not.toHaveProperty('coverage');
    expect(next.mock.calls[0][1]).toContain('Retrieval coverage: Unknown');
  });
  it('does not publish an overlong scene answer even if a model ignores the two-claim limit', async () => {
    const generate = vi.fn().mockResolvedValue({ ...draft, claims: [claim, claim, claim] });
    expect(await checkedAnswer('What is happening at this moment?', position, evidence, [], generate)).toBeNull();
    expect(generate.mock.calls.map(call => call[3])).toEqual(['writer', 'writer']);
    expect(generate.mock.calls[0][0]).toContain('at most 2 claims');
  });
  it('gives the checker stable source-line IDs without asking it to recopy quotations', async () => {
    const generate = vi.fn().mockResolvedValueOnce(draft).mockResolvedValueOnce({ ...pass,
      checks: [{ ...check, sources: ['P1:1', 'P1:2'] }] });
    const rows = [{ ...evidence[0], text: '[00:00:10] (SAM) Keep this\n[00:00:11] letter sealed.' }];
    expect((await checkedAnswer('What did Sam ask?', position, rows, [], generate))?.answer).toBe(claim.text);
    expect(JSON.parse(generate.mock.calls[1][1]).evidence[0].lines).toEqual([
      { id: 'P1:1', text: '(SAM) Keep this' }, { id: 'P1:2', text: 'letter sealed.' }]);
  });
  it('rebuilds a departure inferred from intent before allowing the checker to approve it', async () => {
    const rows = [{ ...evidence[0], text: "[00:00:10] We're not dating anymore.\n[00:00:11] I'm going back to my room." }];
    const wrong = { status: 'answered', claims: [{ text: 'One speaker breaks up with the other and leaves.', evidenceIds: ['P1'] }] };
    const good = { status: 'answered', claims: [{ text: 'A speaker announces a plan to return to their room.', evidenceIds: ['P1'] }] };
    const generate = vi.fn().mockResolvedValueOnce(wrong).mockResolvedValueOnce(good)
      .mockResolvedValueOnce({ ...pass, checks: [{ ...check, sources: ['P1:2'] }] });
    expect((await checkedAnswer('What happened?', position, rows, [], generate))?.answer).toBe(good.claims[0].text);
    expect(generate.mock.calls.map(call => call[3])).toEqual(['writer', 'writer', 'verifier']);
    expect(generate.mock.calls[1][0]).toContain('departure announcement');
    expect(JSON.stringify(generate.mock.calls.slice(1))).not.toContain(wrong.claims[0].text);
  });
  it.each([
    { basis: 'plausible' }, { sources: [] }, { sources: undefined },
    { sources: ['P1:99'] }, { sources: ['P2:1'] }, { sources: ['P1:1', 'P1:1'] },
    { sources: [{ id: 'P1:1' }] },
  ])('rejects a positive verdict without valid, entailed support from the cited passage (%j)', async invalid => {
    const generate = vi.fn().mockResolvedValueOnce(draft)
      .mockResolvedValueOnce({ ...pass, checks: [{ ...check, ...invalid }] });
    expect(await checkedAnswer('Why?', position, evidence, [], generate)).toBeNull();
  });
  it('does not let a bare exclamation prove that a plan succeeded', async () => {
    const row = { ...evidence[0], text: 'Yes! Okay. Thank you.' };
    const generate = vi.fn().mockResolvedValueOnce({ status: 'answered', claims: [
      { text: 'The plan worked and everyone is relieved.', evidenceIds: ['P1'] }] })
      .mockResolvedValueOnce({ ...pass, checks: [{ ...check,
        sources: ['P1:1'] }] });
    expect(await checkedAnswer('What happened?', position, [row], [], generate)).toBeNull();
  });
  it('rejects invented visual actions even when the checker approves sound-only citations', async () => {
    const row = { ...evidence[0], text: '[00:00:10] [FOOTSTEPS]\n[00:00:11] [WOMAN GASPS]' };
    const generate = vi.fn().mockResolvedValueOnce({ status: 'answered', claims: [
      { text: 'She runs away and gasps from exhaustion.', evidenceIds: ['P1'] }] })
      .mockResolvedValueOnce({ ...pass, checks: [{ ...check, sources: ['P1:1', 'P1:2'] }] });
    expect(await checkedAnswer('What happened?', position, [row], [], generate)).toBeNull();
  });
  it('does not let extra substantive context turn noises into a successful outcome', async () => {
    const row = { ...evidence[0], text: "[00:00:10] You flooded it.\n[00:00:11] It will start.\n[00:00:12] [ENGINE REVS]\n[00:00:13] BOTH: Yes!" };
    const bad = { status: 'answered', claims: [{ text: 'They eventually succeed as the engine revs and both cheer.', evidenceIds: ['P1'] }] };
    const generate = vi.fn().mockResolvedValue(bad);
    expect(await checkedAnswer('What happened?', position, [row], [], generate)).toBeNull();
    expect(generate.mock.calls.map(call => call[3])).toEqual(['writer', 'writer']);
  });
  it('can return literal sound captions without inventing an activity or cause', async () => {
    const row = { ...evidence[0], text: '[00:00:10] [FOOTSTEPS]\n[00:00:11] [WOMAN GASPS]' };
    const literal = 'Captions: [FOOTSTEPS]; [WOMAN GASPS]';
    const generate = vi.fn().mockResolvedValueOnce({ status: 'answered', claims: [{ text: literal, evidenceIds: ['P1'] }] })
      .mockResolvedValueOnce({ ...pass, checks: [{ ...check, sources: ['P1:1', 'P1:2'] }] });
    expect((await checkedAnswer('What happened?', position, [row], [], generate))?.answer).toBe(literal);
  });
  it('does not let a proposed task plus later noises prove the task is being carried out', async () => {
    const row = { ...evidence[0], text: '[00:00:10] After we finish repairing this,\n[00:00:11] [METAL CLATTERS]\n[00:00:12] [MAN GROANS]' };
    const generate = vi.fn().mockResolvedValueOnce({ status: 'answered', claims: [
      { text: 'They are repairing the machine, as indicated by the metal clattering and groaning.', evidenceIds: ['P1'] }] })
      .mockResolvedValueOnce({ ...pass, checks: [{ ...check, sources: ['P1:1', 'P1:2', 'P1:3'] }] });
    expect(await checkedAnswer('What happened?', position, [row], [], generate)).toBeNull();
  });
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
    expect(verifier.evidence[0]).toMatchObject({ id: 'P1', lines: [{ id: 'P1:1', text: '(SAM) Keep this letter sealed.' }] });
    expect(verifier.evidence[0]).not.toHaveProperty('text');
    expect(JSON.stringify(generate.mock.calls)).not.toMatch(/FUTURE_ANSWER|NEXT_EPISODE|OTHER_EPISODE_THREAD|UNVERIFIED_LEGACY|FAILED_ANSWER/);
  });
  it('keeps a useful verified subset and removes rejected prose and citations', async () => {
    const rows = [...evidence, { ...evidence[0], id: 'other', text: 'Other dialogue.' }];
    const mixed = { status: 'answered', claims: [claim, { text: 'An unsupported detail.', evidenceIds: ['P2'] }] };
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
    expect(JSON.parse(generate.mock.calls[1][1]).evidence.flatMap((item: { lines: { text: string }[] }) => item.lines.map(line => line.text))).toEqual(['(SAM) Keep this letter sealed.', unrelated.text]);
  });
  it('rebuilds once using fixed issue hints, never the rejected draft or verifier prose', async () => {
    const badDraft = { ...draft, claims: [{ ...claim, text: 'An unsafe draft.' }] };
    const badCheck = { ...reject, checks: [{ ...reject.checks[0], reason: 'REJECTED_PRIVATE_DETAIL' }] };
    const generate = vi.fn().mockResolvedValueOnce(badDraft).mockResolvedValueOnce(badCheck)
      .mockResolvedValueOnce(draft).mockResolvedValueOnce(pass);
    expect((await checkedAnswer('Why?', position, evidence, [], generate))?.answer).toBe(claim.text);
    expect(generate.mock.calls.map(call => call[3])).toEqual(['writer', 'verifier', 'writer', 'verifier']);
    expect(generate.mock.calls[2][1]).toBe(generate.mock.calls[0][1]);
    expect(generate.mock.calls[2][0]).toContain('Distinguish the caller');
    expect(JSON.stringify(generate.mock.calls.slice(2))).not.toMatch(/An unsafe draft|REJECTED_PRIVATE_DETAIL/);
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
