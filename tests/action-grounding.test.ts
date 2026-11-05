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
