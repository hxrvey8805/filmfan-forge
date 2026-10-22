import { describe, expect, it, vi } from 'vitest';
import { captionSpeech, dialogueEvidence, speechCues } from '../supabase/functions/_shared/dialogue-evidence';
import { storySpeechIssue } from '../supabase/functions/_shared/story-speech-grounding';
import { acceptedStory, storyContext, storyExplanation, validateStoryDraft, type StoryDraft } from '../supabase/functions/_shared/story-explanation';
import type { Evidence, ViewingPosition } from '../supabase/functions/_shared/companion';

// Synthetic analogues of the saved real-title failures, never source subtitles.
const row = (text: string): Evidence => ({ id: 'P1', season: 1, episode: 1, start: 0, end: 55, text });
const position: ViewingPosition = { tmdbId: 81, mediaType: 'tv', seasonNumber: 1, episodeNumber: 1, seconds: 60 };
const fact = (text: string, sources: string[], state: StoryDraft['facts'][number]['state'] = 'statement'): StoryDraft => ({ facts: [{ text, sources, state }], readings: [] });

describe('dialogue input annotations', () => {
  it('keeps words and order intact and never carries labels over an unlabeled reply', () => {
    const source = row('[00:00:10] (MIRA) Your parents seem well.\n[00:00:12] Yes, but they need work.\n[00:00:14] Mira, would you cover my shift?');
    const data = dialogueEvidence([source])[0].lines;
    expect(data.map(line => line.text)).toEqual(['(MIRA) Your parents seem well.', 'Yes, but they need work.', 'Mira, would you cover my shift?']);
    expect(data[0]).toMatchObject({ id: 'P1:1', explicitSpeaker: 'MIRA', cues: ['addressee_possession'] });
    expect(data[1]).not.toHaveProperty('explicitSpeaker');
    expect(data[2]).not.toHaveProperty('explicitSpeaker');
    expect(data[2].cues).toEqual(['question', 'possible_request_or_intention', 'speaker_possession']);
  });
  it.each(['Mira!', '[MIRA GASPS] Yes.', '[Mira is addressed] Yes.', 'MIRA: No. SAM: Yes.', '(MIRA) No. (SAM) Yes.'])(
    'does not manufacture a unique speaker for %s', text => expect(captionSpeech(text).speaker).toBeNull());
  it('marks questions, denials, belief and acknowledgement separately without inferring event state', () => {
    expect(speechCues("Are you sure those aren't my records?")).toEqual(['question', 'negation', 'speaker_possession']);
    expect(speechCues('It is said to bring good luck.')).toContain('belief_or_uncertainty');
    expect(speechCues('Thanks for your trust.')).toContain('acknowledgement');
    expect(speechCues('[FOOTSTEPS]')).toEqual(['sound_only']);
  });
  it('rebuilds annotations only from the permitted episode and timestamp', () => {
    const earlier = row('(MIRA) Your parents need work.');
    const later = { ...earlier, id: 'later', start: 61, end: 70, text: '(FUTURE_NAME) My future plan.' };
    const next = { ...earlier, id: 'next', episode: 2, text: '(NEXT_EPISODE) Your new job.' };
    const prompt = storyContext('Why?', position, [earlier, later, next], []).data;
    expect(JSON.stringify(prompt)).not.toMatch(/FUTURE_NAME|NEXT_EPISODE/);
    expect(prompt.evidence[0].lines[0]).toHaveProperty('explicitSpeaker', 'MIRA');
    expect(storyContext('Why?', { ...position, seconds: 30 }, [earlier, later, next], []).data.evidence).toEqual([]);
  });
});

describe('saved speaker and event-state failure regressions', () => {
  it('does not borrow a label to name an anonymous reply or reverse a named reply', () => {
    for (const reply of ['I never agreed to that.', '(SAM) I never agreed to that.']) {
      const source = [row(`(MIRA) Would you cover my shift?\n${reply}`)];
      const wrong = fact('Mira denies agreeing to cover the shift.', ['P1:1', 'P1:2'], 'denial');
      expect(validateStoryDraft(wrong, source, false)).toBeNull();
      const correct = fact('A speaker denies agreeing to cover the shift.', ['P1:2'], 'denial');
      expect(validateStoryDraft(correct, source, false)).toEqual(correct);
      const positiveReview = { boundarySafe: true, relevant: true, facts: [{ index: 0, verdict: 'supported', state: 'denial', sources: wrong.facts[0].sources, issue: 'none' }], readings: [] };
      expect(acceptedStory(positiveReview, wrong, source)).toBeNull();
    }
  });
  it('allows a named report supported by the same explicit speaker on every cited line', () => {
    const source = [row('(MIRA) I disagree.\n(MIRA) The offer is unfair.')];
    const correct = fact('Mira reports that the offer is unfair.', ['P1:1', 'P1:2']);
    expect(validateStoryDraft(correct, source, false)).toEqual(correct);
  });
  it.each(['Le-Ann thanks the speaker and asks whether a disguise is needed.',
    'Le-Ann reiterates that a disguise is needed.', 'Le-Ann explains why a disguise is needed.'])(
    'does not use a different speech verb to evade attribution checks: %s', text => {
      const source = [row('Thanks for your trust,\nbut do I need a disguise?')];
      expect(validateStoryDraft(fact(text, ['P1:1', 'P1:2'], 'question'), source, false)).toBeNull();
    });
  it.each(["Mira reports that Mira's parents need work.", "A speaker reports that Mira's parents need work.",
    "A speaker says the speaker's parents need work.", 'A speaker says his parents need work.'])(
    'does not reverse ownership of your parents: %s', text => {
      expect(storySpeechIssue(text, 'statement', ['(MIRA) Your parents need work.'])).toBe('ownership');
    });
  it('preserves named first-person ownership, explicit third-person ownership and anonymous listener wording', () => {
    expect(storySpeechIssue("Mira says Mira's parents need work.", 'statement', ['(MIRA) My parents need work.'])).toBeNull();
    expect(storySpeechIssue("A speaker says Mira's parents need work.", 'statement', ["Mira's parents need work."])).toBeNull();
    expect(storySpeechIssue("A speaker says the listener's parents need work.", 'statement', ['(MIRA) Your parents need work.'])).toBeNull();
  });
  it('requires proposals to remain proposals even when accompanied by thanks', () => {
    const source = [row('Would you cover my shift?\nThanks for your trust.')];
    const wrong = fact('A speaker reports that someone is now working the shift.', ['P1:1', 'P1:2']);
    expect(validateStoryDraft(wrong, source, false)).toBeNull();
    const correct = fact('A speaker asks someone to cover a shift.', ['P1:1'], 'proposal');
    expect(validateStoryDraft(correct, source, false)).toEqual(correct);
    expect(validateStoryDraft(fact('A speaker reports that someone accepted the shift.', ['P1:2']), source, false)).toBeNull();
  });
  it('keeps an instruction to take over a role separate from existing paid employment', () => {
    const source = [row('You take over as her music teacher.')];
    expect(validateStoryDraft(fact('A speaker reports that someone is already earning money as a teacher.', ['P1:1']), source, false)).toBeNull();
    const correct = fact('A speaker proposes that someone take over as a teacher.', ['P1:1'], 'proposal');
    expect(validateStoryDraft(correct, source, false)).toEqual(correct);
  });
  it('allows an explicitly spoken self-introduction without extending identity to anonymous later replies', () => {
    const source = [row("I'm Robin Jones.\nAnd you are my colleague.\nDo I need to sign?")];
    const correct = fact('A speaker introduces themselves as Robin Jones.', ['P1:1']);
    expect(validateStoryDraft(correct, source, false)).toEqual(correct);
    expect(validateStoryDraft(fact('Robin asks whether a signature is needed.', ['P1:1', 'P1:3'], 'question'), source, false)).toBeNull();
  });
  it('does not promote a repeated denial and a question into two mistaken identities', () => {
    const source = [row("Those aren't my records.\nAre you sure?\nI never worked at that hospital.")];
    const correct = fact('A speaker denies that the records describe their own life.', ['P1:1', 'P1:3'], 'denial');
    expect(validateStoryDraft(correct, source, false)).toEqual(correct);
    expect(validateStoryDraft({ ...correct, readings: [{ text: 'Their mutual denial could suggest both characters realize they are in the wrong place.', basedOn: [0] }] }, source, false)).toBeNull();
    expect(validateStoryDraft(fact('The discussion shows both speakers admit their records are wrong.', ['P1:1', 'P1:2', 'P1:3']), source, false)).toBeNull();
  });
  it('allows a qualified reading of a claimed mismatch without inventing a broken system', () => {
    const source = [row("Those aren't my records.\nI never worked at that hospital.")];
    const correct = { ...fact('A speaker denies that the records describe their own life.', ['P1:1', 'P1:2'], 'denial'),
      readings: [{ text: 'The claimed mismatch could make the records difficult to trust.', basedOn: [0] }] };
    expect(validateStoryDraft(correct, source, false)).toEqual(correct);
  });
  it('does not forbid shared denial when two explicit first-person accounts support review', () => {
    expect(storySpeechIssue('The discussion shows both speakers deny owning these records.', 'denial',
      ["MIRA: Those are not my records.", "SAM: Those aren't my records either."])).toBeNull();
  });
  it('cannot disguise an invented physical scene as a tentative interpretation', () => {
    const source = [row('Would you cover my shift?')];
    const correct = fact('A speaker asks someone to cover a shift.', ['P1:1'], 'proposal');
    expect(validateStoryDraft({ ...correct, readings: [{ text: 'After finding the missing worker in the woods, the group may be hiding her in the cellar.', basedOn: [0] }] }, source, false)).toBeNull();
  });
  it.each(['(MIRA) [GASPS]', 'MIRA: [FOOTSTEPS]'])(
    'does not turn a sound into reported dialogue merely because it has a label: %s', text => {
      expect(validateStoryDraft(fact('Mira reports that someone is running away.', ['P1:1']), [row(text)], false)).toBeNull();
    });
  it('rejects the wrong speaker before the reviewer and sends annotated sources for a useful anonymous answer', async () => {
    const source = [row('(MIRA) Would you cover my shift?\nI have not agreed.')];
    const correct = fact('A speaker denies agreeing to cover the shift.', ['P1:2'], 'denial');
    const generate = vi.fn().mockResolvedValueOnce({ facts: [fact('Mira denies agreeing to cover the shift.', ['P1:1', 'P1:2'], 'denial').facts[0], ...correct.facts], readings: [] })
      .mockResolvedValueOnce({ boundarySafe: true, relevant: true, facts: [{ index: 0, verdict: 'supported', state: 'denial', sources: ['P1:2'], issue: 'none' }], readings: [] });
    expect((await storyExplanation('What is the disagreement?', position, source, [], generate))?.answer).toBe(correct.facts[0].text);
    const reviewInput = JSON.parse(generate.mock.calls[1][1]);
    expect(reviewInput.draft).toEqual(correct);
    expect(reviewInput.evidence[0].lines[0]).toHaveProperty('explicitSpeaker', 'MIRA');
    expect(reviewInput.evidence[0].lines[1]).not.toHaveProperty('explicitSpeaker');
  });
});
