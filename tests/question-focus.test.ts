import { describe, expect, it, vi } from 'vitest';
import { addressesNamedRelationship, coversRecap } from '../supabase/functions/_shared/question-focus';
import { checkedAnswer } from '../supabase/functions/_shared/answer';
import { companionResponse } from '../supabase/functions/_shared/companion-response';
import type { ViewingPosition, Evidence } from '../supabase/functions/_shared/companion';

const position: ViewingPosition = { tmdbId: 1, mediaType: 'movie', seconds: 30 };
const evidence: Evidence[] = [{ id: 'caption', season: null, episode: null, start: 10, end: 20,
  text: '[00:00:10] Mira and Rowan are cousins.\n[00:00:11] (GUARD) The king will choose an heir.' }];
const question = 'What do we know about the relationship between Mira and Rowan?';
const relevant = { text: 'Mira and Rowan are described as cousins.', evidenceIds: ['P1'] };
const other = { text: 'The guard expects the king to choose an heir.', evidenceIds: ['P1'] };
const verdict = { withinBoundary: true, sufficient: true, answersQuestion: true,
  checks: [{ index: 0, supported: true, basis: 'entailed', issue: 'none', sources: ['P1:1'] }] };

describe('question focus is separate from factual support', () => {
  it('rejects a correct nearby fact that never addresses the named relationship', async () => {
    const generate = vi.fn().mockResolvedValue({ status: 'answered', claims: [other] });
    expect(await checkedAnswer(question, position, evidence, [], generate)).toBeNull();
    expect(generate.mock.calls.map(call => call[3])).toEqual(['writer', 'writer']);
    expect(generate.mock.calls[1][0]).toContain('named relationship');
  });
  it('accepts a grounded answer that actually addresses both named subjects', async () => {
    const generate = vi.fn().mockResolvedValueOnce({ status: 'answered', claims: [relevant] }).mockResolvedValueOnce(verdict);
    expect((await checkedAnswer(question, position, evidence, [], generate))?.answer).toBe(relevant.text);
  });
  it('does not publish an irrelevant remainder after the checker removes the relationship claim', async () => {
    const draft = { status: 'answered', claims: [relevant, other] };
    const passOther = { ...verdict, checks: [
      { index: 0, supported: false, basis: 'unsupported', issue: 'inference', sources: [] },
      { index: 1, supported: true, basis: 'entailed', issue: 'none', sources: ['P1:2'] },
    ] };
    const generate = vi.fn().mockResolvedValueOnce(draft).mockResolvedValueOnce(passOther)
      .mockResolvedValueOnce(draft).mockResolvedValueOnce(passOther);
    expect(await checkedAnswer(question, position, evidence, [], generate)).toBeNull();
  });
  it('requires a separate relevance verdict even when every claim is factually supported', async () => {
    const draft = { status: 'answered', claims: [relevant] };
    const generate = vi.fn().mockResolvedValueOnce(draft).mockResolvedValueOnce({ ...verdict, answersQuestion: false })
      .mockResolvedValueOnce(draft).mockResolvedValueOnce({ ...verdict, answersQuestion: false });
    expect(await checkedAnswer('Why did they argue?', position, evidence, [], generate)).toBeNull();
  });
  it('does not accept legacy verifier approvals missing the relevance field', async () => {
    const { answersQuestion: _unused, ...legacy } = verdict;
    const generate = vi.fn().mockResolvedValueOnce({ status: 'answered', claims: [relevant] }).mockResolvedValueOnce(legacy);
    expect(await checkedAnswer(question, position, evidence, [], generate)).toBeNull();
  });
  it('normalizes possessives and distinguishes a focus check from grounding', () => {
    expect(addressesNamedRelationship('What is Élodie’s relationship with Rowan?', [
      { text: "Élodie's relationship with Rowan is not established by these excerpts.", evidenceIds: ['P1'] },
    ])).toBe(true); // This does not establish the truth of the claim.
    expect(addressesNamedRelationship(question, [{ ...relevant, text: 'Mira is mentioned.' }])).toBe(false);
    expect(addressesNamedRelationship('What is their relationship?', [other])).toBe(true); // Semantic check still required.
    expect(addressesNamedRelationship('Recap the story so far.', [other])).toBe(true);
  });
  it('explains a caption limitation without claiming no relationship exists in the story', () => {
    const result = companionResponse(question, position, evidence, [], null);
    expect(result.answer).toContain('relationship you asked about');
    expect(result.answer).toContain('limit of these captions');
    expect(result.answer).toContain('00:00:30');
    expect(result).toMatchObject({ answer_status: 'insufficient_evidence', charge: false });
  });
  it('does not treat title-cased question grammar as character names or split hyphenated names', () => {
    expect(addressesNamedRelationship('What Is The Relationship Between Them?', [other])).toBe(true);
    expect(addressesNamedRelationship('What is Jean-Luc’s relationship with Anne-Marie?', [
      { text: 'Jean-Luc and Anne-Marie are described as cousins.', evidenceIds: ['P1'] },
    ])).toBe(true);
    expect(addressesNamedRelationship('What is Jean-Luc’s relationship with Anne-Marie?', [
      { text: 'Jean-Luc is mentioned.', evidenceIds: ['P1'] },
    ])).toBe(false);
  });
});

describe('recaps cover the available prefix', () => {
  const rows = Array.from({ length: 9 }, (_, i): Evidence => ({ id: `P${i + 1}`, season: null, episode: null,
    start: i * 60, end: i * 60 + 30, text: `[00:00:00] A speaker describes a different substantive development in this exchange with several complete words.` }));
  const claims = (ids: string[]) => ids.map(id => ({ text: 'A speaker reports a development.', evidenceIds: [id] }));
  it('requires early and later substantive dialogue without repeating the opening', () => {
    expect(coversRecap('Recap the story so far.', claims(['P1', 'P4', 'P8']), rows)).toBe(true);
    expect(coversRecap('Recap the story so far.', claims(['P1', 'P2', 'P3']), rows)).toBe(false);
    expect(coversRecap('Recap the story so far.', claims(['P1', 'P1', 'P8']), rows)).toBe(false);
    expect(coversRecap('Recap the story so far.', claims(['P8', 'P4', 'P1']), rows)).toBe(false);
  });
  it('does not pressure the writer to infer an event from a final sound or unfinished name', () => {
    const extra = [...rows, { ...rows[0], id: 'noise', start: 570, end: 580, text: '[00:09:30] [MAN GASPS]' },
      { ...rows[0], id: 'name', start: 590, end: 599, text: '[00:09:50] Rowan?' }];
    expect(coversRecap('Recap the story so far.', claims(['P1', 'P4', 'P8']), extra)).toBe(true);
  });
  it('requires one complete point per passage, but does not impose recap breadth on a scene question', () => {
    const merged = [{ text: 'A speaker reports a development.', evidenceIds: ['P1', 'P8'] }];
    expect(coversRecap('Recap the story so far.', merged, rows)).toBe(false);
    expect(coversRecap('What is happening here?', merged, rows)).toBe(true);
    expect(coversRecap('Recap the story so far.', claims(['P1']), rows.slice(0, 2))).toBe(true);
  });
  it('rejects unknown citations even when the shape looks chronological', () => {
    expect(coversRecap('Recap the story so far.', claims(['P1', 'P5', 'P99']), rows)).toBe(false);
  });
});
