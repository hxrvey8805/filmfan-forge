import { describe, expect, it, vi } from 'vitest';
import { acceptedStory, futureHint, prepareStoryDraft, storyContext, storyExplanation, validateStoryDraft, type StoryDraft } from '../supabase/functions/_shared/story-explanation';
import { companionAnswer } from '../supabase/functions/_shared/answer';
import { selectSceneContext } from '../supabase/functions/_shared/scene-evidence';
import { type Conversation, type Evidence, type ViewingPosition } from '../supabase/functions/_shared/companion';

const position: ViewingPosition = { tmdbId: 81, mediaType: 'tv', seasonNumber: 1, episodeNumber: 2, seconds: 60 };
const evidence: Evidence[] = [{ id: 'source', season: 1, episode: 2, start: 31, end: 55,
  text: '[00:00:31] (MIRA) Would you take this job?\n[00:00:35] (SAM) Why keep the offer secret?\n[00:00:40] (MIRA) I cannot say.\n[00:00:50] (SAM) I have not agreed.' }];
const aliased = evidence.map(row => ({ ...row, id: 'P1' }));
const draft: StoryDraft = { facts: [
  { text: 'Mira offers a job.', state: 'proposal', sources: ['P1:1'] },
  { text: 'Sam asks why the offer is secret and states that he has not agreed.', state: 'statement', sources: ['P1:2', 'P1:4'] },
], readings: [{ text: 'The secrecy could make the offer feel difficult to assess.', basedOn: [0, 1] }] };
const verdict = { boundarySafe: true, relevant: true, facts: draft.facts.map((fact, index) => ({ index,
  verdict: 'supported', state: fact.state, sources: fact.sources, issue: 'none' })),
readings: [{ index: 0, verdict: 'grounded', issue: 'none' }] };
const history = (overrides: Partial<Conversation> = {}): Conversation => ({ id: 'chat', title_id: 81, media_type: 'tv',
  season_number: 1, episode_number: 2, position_seconds: 30, companion_version: 3, question: 'Why the secret offer?',
  answer: 'My read: INVENTED_SECRET_RELATIONSHIP.', answer_status: 'answered', context: '', timestamp: '00:00:30', created_at: '2026-10-22', ...overrides });

describe('grounded explanations with separate interpretation', () => {
  it('renders a checked explanation and explicitly labels interpretation, mapping real citations', async () => {
    const generate = vi.fn().mockResolvedValueOnce(draft).mockResolvedValueOnce(verdict);
    const result = await companionAnswer('Why is the offer awkward?', position, evidence, [], generate);
    expect(result?.answer).toBe(draft.facts.map(fact => fact.text).join('\n\n') + '\n\nMy read: ' + draft.readings[0].text);
    expect(result?.evidence[0].id).toBe('source');
    expect(generate.mock.calls.map(call => call[3])).toEqual(['analyst', 'verifier']);
    const schema = generate.mock.calls[0][4].json_schema.schema.properties.facts.items.properties;
    // The serving decoder consumes the whole pattern, unlike an ordinary
    // prefix search. Regress the captured "A speaker"-only response.
    const fullSentence = 'A speaker offers another person a job.';
    expect(new RegExp(schema.text.pattern).exec(fullSentence)?.[0]).toBe(fullSentence);
    expect(schema.sources.items.enum).toEqual(['P1:1', 'P1:2', 'P1:3', 'P1:4']);
  });
  it('keeps useful facts when a speculative reading fails, without treating the reading as a fact', () => {
    expect(acceptedStory({ ...verdict, readings: [{ index: 0, verdict: 'unsupported', issue: 'causality' }] }, draft, aliased))
      .toEqual({ facts: draft.facts, readings: [] });
  });
  it('removes an invalid draft point and all dependent readings before independent review', async () => {
    const raw = { facts: [draft.facts[0], { ...draft.facts[1], text: 'Darth leaves town.' }, draft.facts[1]],
      readings: [{ text: 'This could make the offer harder to assess.', basedOn: [0, 2] },
        { text: 'That could explain the departure.', basedOn: [1] }] };
    const prepared = prepareStoryDraft(raw, aliased, false);
    expect(prepared?.facts).toEqual(draft.facts);
    expect(prepared?.readings).toEqual([{ text: 'This could make the offer harder to assess.', basedOn: [0, 1] }]);
    const generate = vi.fn().mockResolvedValueOnce(raw).mockResolvedValueOnce(verdict);
    expect((await storyExplanation('Why?', position, evidence, [], generate))?.answer).toContain('My read:');
    expect(generate.mock.calls[1][1]).not.toMatch(/Darth|departure/);
  });
  it('does not salvage a changed factual answer under a verdict about the original draft', () => {
    expect(acceptedStory({ ...verdict, facts: [verdict.facts[0], { ...verdict.facts[1], verdict: 'unsupported', issue: 'action', sources: [] }] }, draft, aliased)).toBeNull();
  });
  it('rejects a proposed event promoted into existing income before a checker can approve it', () => {
    expect(validateStoryDraft({ facts: [{ ...draft.facts[0], text: 'Mira reports that he earns money from this job.' }], readings: [] }, aliased, false)).toBeNull();
    expect(acceptedStory({ ...verdict, facts: [{ ...verdict.facts[0], state: 'statement' }, verdict.facts[1]] }, draft, aliased)).toBeNull();
  });
  it.each(['Maybe Darth is secretly his father.', 'This will matter later.', 'The offer foreshadows his death.', 'You will discover why.', 'The secrecy sets up a betrayal.'])(
    'does not let interpretation authorize outside identities or future hints: %s', text => {
      expect(validateStoryDraft({ ...draft, readings: [{ text, basedOn: [0] }] }, aliased, false)).toBeNull();
    });
  it('recognizes future-hint wording independently of sources', () => {
    expect(futureHint('Keep an eye on the ring.')).toBe(true);
    expect(futureHint('The argument could reflect different priorities.')).toBe(false);
  });
  it('refuses guessed actions from sounds, while permitting literal caption observations', () => {
    const sounds = [{ ...aliased[0], text: '[FOOTSTEPS]\n[DOOR CLOSES]' }];
    expect(validateStoryDraft({ facts: [{ text: 'Someone reports that she leaves the room.', state: 'statement', sources: ['P1:1'] }], readings: [] }, sounds, false)).toBeNull();
    expect(validateStoryDraft({ facts: [{ text: 'Captions: [FOOTSTEPS]; [DOOR CLOSES]', state: 'observation', sources: ['P1:1', 'P1:2'] }], readings: [] }, sounds, false)).not.toBeNull();
  });
  it.each([
    { sources: ['P9:1'] }, { sources: ['P1:99'] }, { sources: ['P1:1', 'P1:1'] }, { text: 'Mira offers a jo' }, { state: 'completed' },
  ])('rejects malformed proof or an unfinished fact %j', change => {
    expect(validateStoryDraft({ facts: [{ ...draft.facts[0], ...change }], readings: [] }, aliased, false)).toBeNull();
  });
  it.each([
    { boundarySafe: false }, { relevant: false }, { facts: [verdict.facts[0], verdict.facts[0]] },
    { facts: [{ ...verdict.facts[0], sources: ['P1:99'] }, verdict.facts[1]] },
    { facts: [{ ...verdict.facts[0], sources: ['P1:4'] }, verdict.facts[1]] },
    { readings: [] }, { readings: [{ index: 5, verdict: 'grounded', issue: 'none' }] },
    { readings: [{ index: 0, verdict: 'grounded', issue: 'boundary' }] },
  ])('requires a complete consistent review with exact support %j', change => {
    expect(acceptedStory({ ...verdict, ...change }, draft, aliased)).toBeNull();
  });
  it('strips model extra fields before review and publication', async () => {
    const generate = vi.fn().mockResolvedValueOnce({ ...draft, secret: 'FUTURE_SECRET', facts: draft.facts.map(f => ({ ...f, extra: 'FUTURE_SECRET' })) }).mockResolvedValueOnce(verdict);
    const result = await storyExplanation('Why is the offer awkward?', position, evidence, [], generate);
    expect(result?.answer).toContain('My read:');
    expect(generate.mock.calls[1][1]).not.toContain('FUTURE_SECRET');
  });
  it('does not publish an explanation after a provider failure or call a paid/unchecked fallback', async () => {
    const generate = vi.fn().mockResolvedValueOnce(draft).mockRejectedValueOnce(new Error('free quota'));
    await expect(companionAnswer('Why?', position, evidence, [], generate)).rejects.toThrow('free quota');
    expect(generate).toHaveBeenCalledTimes(2);
  });
});

describe('story state and conversation boundaries', () => {
  it('uses only earlier questions, never prior assistant guesses, as conversational context', () => {
    const data = storyContext('Why that?', position, evidence, [history()]).data;
    expect(data.earlierQuestions).toEqual([{ question: 'Why the secret offer?', seconds: 30 }]);
    expect(JSON.stringify(data)).not.toMatch(/INVENTED_SECRET|My read/);
  });
  it.each([
    { position_seconds: 61 }, { episode_number: 3 }, { episode_number: 1 }, { title_id: 82 },
    { media_type: 'movie' }, { companion_version: 2 }, { answer_status: 'insufficient_evidence' },
  ])('drops ineligible history from the entire prompt %j', change => {
    expect(storyContext('Why?', position, evidence, [history({ ...change, question: 'PRIVATE_FUTURE_QUESTION' })]).data.earlierQuestions).toEqual([]);
  });
  it('rebuilds from source on rewind and excludes a cue crossing the exact timestamp', () => {
    const row = { id: 'r', tmdb_id: 81, media_type: 'tv', season_number: 1, episode_number: 2, ingestion_version: 3,
      cues: [{ start: 1, end: 2, text: 'An earlier line.' }, { start: 20, end: 40, text: 'FUTURE_REVEAL' }] };
    const context = selectSceneContext([row], { ...position, seconds: 30 }, 'Why?', []);
    const prompt = storyContext('Why?', { ...position, seconds: 30 }, context.evidence, [history({ position_seconds: 40, question: 'FUTURE_QUESTION' })]);
    expect(JSON.stringify(prompt)).not.toMatch(/FUTURE_/);
    expect(JSON.stringify(prompt)).toContain('An earlier line.');
  });
  it('does not call the AI when a rewind or episode switch removes the referenced answer', async () => {
    for (const changed of [{ ...position, seconds: 20 }, { ...position, episodeNumber: 1 }, { ...position, tmdbId: 82 }]) {
      const generate = vi.fn();
      expect(await companionAnswer('Explain your last answer.', changed, evidence, [history()], generate)).toBeNull();
      expect(generate).not.toHaveBeenCalled();
    }
  });
  it('gates again before generation and does not pass hidden source metadata', () => {
    const prompt = storyContext('Why?', position, [
      { ...evidence[0], fullSynopsis: 'FUTURE_SYNOPSIS' },
      { ...evidence[0], id: 'later', end: 61, text: 'FUTURE_LINE' },
      { ...evidence[0], id: 'next', episode: 3, text: 'FUTURE_EPISODE' },
    ], [], { providedPassages: 2, selectedPassages: 1, omittedPassages: 1,
      omittedRanges: [{ season: 2, episode: 1, start: 0, end: 999 }] });
    expect(JSON.stringify(prompt)).not.toMatch(/FUTURE_|999/);
  });
  it('never treats an older exchange as a current-scene explanation', async () => {
    const generate = vi.fn();
    expect(await storyExplanation('What is happening right now?', { ...position, seconds: 120 }, evidence, [], generate)).toBeNull();
    expect(generate).not.toHaveBeenCalled();
  });
  it('requires the current discussion in a general at-this-point explanation', async () => {
    const rows = [...evidence, { ...evidence[0], id: 'middle', start: 56, end: 57, text: 'The discussion has changed.' },
      { ...evidence[0], id: 'latest', start: 58, end: 59, text: 'Another topic is being discussed.' }];
    const generate = vi.fn().mockResolvedValueOnce(draft);
    expect(await storyExplanation('What are they discussing at this point?', position, rows, [], generate)).toBeNull();
    expect(generate).toHaveBeenCalledOnce();
    expect(JSON.parse(generate.mock.calls[0][1]).focusPassageIds).toEqual(['P2', 'P3']);
  });
});
