import { describe, expect, it } from 'vitest';
import { unqualifiedCaptionAction } from '../supabase/functions/_shared/action-grounding';

describe('speech does not establish physical departure', () => {
  it.each([
    'One speaker breaks up with the other and leaves.',
    'The argument ends with one speaker leaving.',
    'She says goodbye and then walks out.',
    'A speaker announces a breakup, then returns to the dorm.',
    'He left after the disagreement.',
    'They depart following the apology.',
    'She states she needs to study, but leaves.',
    'They eventually succeed as the engine revs and both cheer.',
    'The radio repair is successful.',
    'The machine successfully starts.',
    'They managed to fix the radio.',
    'One speaker proposes fixing it, then they celebrate.',
    'An engine revs, prompting them to yell in excitement.',
    'A speaker gasps in relief after the plan works.',
    'A speaker says she needs help and brings her to the house.',
    'After finding a girl in the woods, someone asks for help.',
    'A speaker describes her name after seeing her tattoo.',
    'A speaker asks for help, then accepts the job.',
    'Someone arrives carrying a gift and describes it.',
    'They decide to talk and then hide the envelope.',
    'The group hides her in the basement.',
    'A speaker says thanks and takes the job.',
    'The offer could bring her to the house.',
    'There is a guess about the mask, but someone is hiding an injury.',
    'A question about leaving is raised, then someone leaves.',
    'The suggestion of hiding something is followed by someone leaving.',
    'Someone finds a hidden letter.',
    'The explanation describes a clue and someone hides it.',
    'The translation is disputed, then someone leaves.',
  ])('requires an action qualification: %s', text => expect(unqualifiedCaptionAction(text)).toBe(true));
  it.each([
    'A speaker announces a plan to return to their room.',
    'One speaker says they are leaving.',
    'A speaker reports that someone left.',
    'A speaker asks the other person to leave.',
    'She says she is going back to her room.',
    'The conversation returns to the original complaint.',
    'A speaker describes pain in their left hand.',
    'Captions: [WOMAN LEAVES]; [DOOR CLOSES]',
    'A speaker reports that the repair was successful.',
    'A speaker says they succeeded.',
    'Captions: [ENGINE REVS]; [BOTH YELL]',
    'A speaker reports finding someone in the woods.',
    'A speaker proposes hiding someone until morning.',
    'The offer could bring financial relief.',
    'A speaker denies accepting the job.',
    'The request to hide a letter is still a proposal.',
    'The news leaves everyone unsure whether the package was delivered.',
    'The joke contrasts a guess about hiding an injury with a mundane explanation.',
    'The question about leaving remains unanswered.',
    'The allegation of hiding evidence is still unproven.',
    'Translation is more than finding an equivalent word.',
    'A neat translation hides some assumptions.',
    'The wording leaves out a qualification.',
    'The motive is something the quoted words leave out.',
  ])('retains reported speech and nonphysical uses: %s', text => expect(unqualifiedCaptionAction(text)).toBe(false));
});

it('distinguishes leaving a question unresolved from physically leaving', () => {
  expect(unqualifiedCaptionAction('The reply could leave the question open.')).toBe(false);
  expect(unqualifiedCaptionAction('The denial leaves the issue unresolved.')).toBe(false);
  expect(unqualifiedCaptionAction('Someone leaves the room.')).toBe(true);
});

it.each([
  'The instruction brings the conversation back to procedure.',
  'The reminder reads as a return to responsible procedure.',
  'The reply suggests they expected to find a familiar landmark.',
])('allows a discourse metaphor or explicitly expected discovery: %s', text => {
  expect(unqualifiedCaptionAction(text)).toBe(false);
});

it.each([
  'Someone brings the bag back to the room.',
  'Someone returns to the station.',
  'They expected to find a landmark, but found a weapon.',
  'The reminder brings the conversation back to procedure, and someone leaves.',
  'Someone expected to find help and then arrived at the station.',
])('still rejects a physical act beside an abstract or expected one: %s', text => {
  expect(unqualifiedCaptionAction(text)).toBe(true);
});

it.each(['The exchange leaves the disagreement intact.', 'The truth arrives wrapped in a request for protection.'])(
  'recognizes a nonphysical grammatical subject: %s', text => expect(unqualifiedCaptionAction(text)).toBe(false));
it.each(['The visitor arrives wrapped in a blanket.', 'The reply leaves the disagreement intact, then someone leaves.'])(
  'still checks actual physical subjects and later clauses: %s', text => expect(unqualifiedCaptionAction(text)).toBe(true));

it('distinguishes abstract disagreement and a negated receipt from completed action', () => {
  expect(unqualifiedCaptionAction('Appealing to the contract leaves the disputed difference intact.')).toBe(false);
  expect(unqualifiedCaptionAction('Following one rule does not necessarily mean receiving equal shares.')).toBe(false);
  expect(unqualifiedCaptionAction('Someone receives equal shares.')).toBe(true);
  expect(unqualifiedCaptionAction('The exchange leaves the disagreement intact, then someone leaves the room.')).toBe(true);
});

it('distinguishes meaning hidden in language from physically hiding an object', () => {
  expect(unqualifiedCaptionAction('The passage explains affection hidden inside an apparently ordinary exchange.')).toBe(false);
  expect(unqualifiedCaptionAction('The meaning is hidden in the wording.')).toBe(false);
  expect(unqualifiedCaptionAction('The meaning is hidden in the bag.')).toBe(true);
  expect(unqualifiedCaptionAction('A weapon is hidden inside a book.')).toBe(true);
  expect(unqualifiedCaptionAction('Affection hidden inside words contrasts with the person leaving.')).toBe(true);
});

it('keeps conditional acceptance separate from completed acceptance', () => {
  expect(unqualifiedCaptionAction('Would accepting require pretending to be qualified?')).toBe(false);
  expect(unqualifiedCaptionAction('Would taking the job mean pretending to be qualified?')).toBe(false);
  expect(unqualifiedCaptionAction('Does accepting require pretending to be qualified?')).toBe(false);
  expect(unqualifiedCaptionAction('The question is whether accepting requires a false credential.')).toBe(false);
  expect(unqualifiedCaptionAction('Would accepting require a lie? Someone accepts anyway.')).toBe(true);
  expect(unqualifiedCaptionAction('Someone accepted the offer.')).toBe(true);
});

it('treats remaining room for negotiation as a quantity, without excusing departures', () => {
  expect(unqualifiedCaptionAction('There is little room left for bargaining.')).toBe(false);
  expect(unqualifiedCaptionAction('There is no time left for debate, then someone left.')).toBe(true);
});

it('distinguishes room for improvement and accepted ideas from physical actions', () => {
  expect(unqualifiedCaptionAction('The idea leaves room for improvement.')).toBe(false);
  expect(unqualifiedCaptionAction('The praise sounds like a widely accepted ranking.')).toBe(false);
  expect(unqualifiedCaptionAction('The idea leaves room for improvement, but someone leaves the room.')).toBe(true);
  expect(unqualifiedCaptionAction('It is an accepted view; someone accepted the job.')).toBe(true);
  expect(unqualifiedCaptionAction('Someone leaves the room for a meeting.')).toBe(true);
});
