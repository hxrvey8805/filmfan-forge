// A source gap must not become a correction of an event the viewer saw.
export const asksAboutDeath = (question: string) =>
  /\b(?:kill(?:ed|s|ing|er)?|murder(?:ed|s|er)?|shot|dead|death|died)\b/i.test(question);

export function eventCoverageReply(question: string, timestamp: string): string | null {
  const subject = question.trim().match(/^(?:is (.{1,64}) (?:dead|alive)|did (.{1,64}) die)\s*[?.!]*$/i);
  const name = subject?.[1] ?? subject?.[2];
  if (name && /^[\p{L}][\p{L}'’.-]*(?: [\p{L}][\p{L}'’.-]*){0,4}$/u.test(name)) {
    const subject = /^(?:he|she|they)$/i.test(name) ? 'that' : `${name}’s fate`;
    return `I can’t confirm ${subject} from what I have by ${timestamp}.`;
  }
  if (/\bwhy\b/i.test(question) && asksAboutDeath(question)) return `I can’t pin down the reason from what I have by ${timestamp}.`;
  if (/\bwho\b/i.test(question) && asksAboutDeath(question)) return `I can’t identify who was responsible from what I have by ${timestamp}.`;
  return null;
}

export const silentEventCaution = `For this event question, captions are not a complete visual record. Missing dialogue cannot establish that a death or shooting did not happen, or that its explanation has not been revealed in the story. An earlier allegation that a character attacked someone does not contradict that character later being attacked. Correct a premise only with explicit evidence about the same event, never absence of mention or an unrelated older allegation. If the requested event, identity or cause is unsupported, acknowledge a source gap without denying what the viewer saw. Do not suggest suspects, motives or theories.`;
