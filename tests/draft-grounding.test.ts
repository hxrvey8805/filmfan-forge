import { describe, expect, it } from 'vitest';
import { draftGroundingIssues } from '../supabase/functions/_shared/draft-grounding';
import type { Evidence, GroundedDraft } from '../supabase/functions/_shared/companion';

// Fictional variants of the saved attribution failures; no title-specific rules.
const passage = (id: string, text: string): Evidence => ({ id, season: null, episode: null, start: 10, end: 30, text });
const draft = (text: string, evidenceIds = ['P2']): GroundedDraft => ({ status: 'answered', claims: [{ text, evidenceIds }] });
const rows = [passage('P1', '[00:00:10] Captain!\n[00:00:11] Mira!'),
  passage('P2', '[00:00:20] Peace, Rowan.\n[00:00:21] Maybe the king is ill.\n[00:00:22] He will choose me.')];

describe('speaker and question-name grounding', () => {
  it('rejects a name imported from an uncited scene even when the question did not name anyone', () => {
    expect(draftGroundingIssues('Recap so far', draft('Mira is discussing the king.'), rows)).toContain('identity');
    expect(draftGroundingIssues('Recap so far', draft('A speaker discusses the king.'), rows)).toEqual([]);
  });
  it('rejects an invented named institution or acronym absent from the cited words', () => {
    expect(draftGroundingIssues('Recap so far', draft('Rowan works for the FBI.'), rows)).toContain('identity');
    expect(draftGroundingIssues('Why are they arguing?', draft('They argue about Oxford.'), rows)).toContain('identity');
  });
  it('normalizes possessives and apostrophes without importing a name from another scene', () => {
    expect(draftGroundingIssues('Recap so far', draft("Mira’s plan concerns the king."), rows)).toContain('identity');
    expect(draftGroundingIssues('Recap so far', draft("Rowan's name is mentioned."), rows)).toEqual([]);
    expect(draftGroundingIssues('Who is mentioned?', draft("The name O’Neill is mentioned.", ['P1']),
      [passage('P1', "O'Neill!")])).toEqual([]);
  });
  it('does not import the question subject into an unrelated cited conversation', () => {
    expect(draftGroundingIssues('What do we know about Mira?', draft('Mira is traveling with Rowan.'), rows)).toContain('identity');
    expect(draftGroundingIssues('What do we know about Mira?', draft('Mira states that the king will choose Rowan.'), rows))
      .toEqual(['identity', 'speaker']);
  });
  it('does not treat a name being called as a label for the subsequent speaker', () => {
    expect(draftGroundingIssues('What do we know about Mira?', draft('Mira is a captain who addresses the soldiers.', ['P1']), rows)).toContain('speaker');
  });
  it.each(['Rowan is arguing for the plan.', 'Rowan has been arguing for the plan.',
    'Rowan accuses the other speaker of being obsessed.', 'Rowan expresses concern about the plan.',
    'Rowan has complained about the plan.', 'Rowan denies the allegation.'])(
  'requires a speaker label for observed attribution variants: %s', text => {
    expect(draftGroundingIssues('What are they discussing?', draft(text), rows)).toContain('speaker');
    expect(draftGroundingIssues('What are they discussing?', draft(text),
      [passage('P2', 'ROWAN: I disagree with the plan.')])).toEqual([]);
  });
  it('allows useful statements about a mentioned name and an anonymous conversation', () => {
    expect(draftGroundingIssues('What do we know about Mira?', draft('Mira is called by name.', ['P1']), rows)).toEqual([]);
    expect(draftGroundingIssues('What do we know about Mira?', draft('A speaker speculates about the king being ill.'), rows)).toEqual([]);
  });
  it.each(['(MIRA) Stay here.', 'MIRA: Stay here.', 'ROWAN: Where? MIRA: Stay here.'])('accepts an explicit cited speaker label (%s)', text => {
    expect(draftGroundingIssues('What did Mira ask?', draft('Mira asks the other person to stay.', ['P1']), [passage('P1', text)])).toEqual([]);
  });
  it('does not use a label from an uncited passage to identify a remote conversation', () => {
    const labeled = [passage('P1', '(MIRA) Stay here.'), rows[1]];
    expect(draftGroundingIssues('Who is speaking?', draft('Mira says the king will choose her.'), labeled)).toContain('speaker');
  });
  it('handles accented names without guessing identity from capitalization alone', () => {
    expect(draftGroundingIssues('What does Élodie say?', draft('Élodie says to wait.', ['P1']), [passage('P1', '(ÉLODIE) Wait.')])).toEqual([]);
    expect(draftGroundingIssues('What does Élodie say?', draft('Élodie says to wait.', ['P1']), [passage('P1', 'Wait.')])).toEqual(['identity', 'speaker']);
  });
});
