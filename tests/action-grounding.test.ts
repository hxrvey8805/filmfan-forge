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
  ])('retains reported speech and nonphysical uses: %s', text => expect(unqualifiedCaptionAction(text)).toBe(false));
});
