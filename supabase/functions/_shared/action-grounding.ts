// Captions often contain "I'm leaving" immediately before more conversation.
// That is speech/intent, not a timestamped observation of someone departing.
// Require the answer to preserve that distinction even if a model checker
// approves it. Likewise, nearby noises/"Yes!" do not prove a plan succeeded or
// explain an emotional reaction. These are narrow necessary conditions, not a
// complete action parser or a substitute for semantic/relevance review.
const guardedActions = /\b(?:leaves|leaving|left|departs?|departed|departing|walk(?:s|ed|ing)? (?:away|out)|(?:goes|went|going) back|return(?:s|ed|ing)? to|succeed(?:s|ed|ing)?|successfully|(?:is|was|are|were) successful|manag(?:es|ed|ing) to|celebrat(?:e|es|ed|ing)|cheer(?:s|ed|ing)?|arriv(?:e|es|ed|ing)|bring(?:s|ing)?|brought|hid(?:e|es|ing)?|hidden|find(?:s|ing)?|found|receiv(?:e|es|ed|ing)|accept(?:s|ed|ing)?|agre(?:e|es|ed|eing) to|(?:takes?|took|taking) (?:on )?(?:a|the) (?:job|role|position)|(?:see|sees|saw|seeing|notic(?:e|es|ed|ing)) (?:a|the|her|his|their) (?:tattoo|scar|weapon)|(?:yell|shout|scream|gasp)(?:s|ed|ing)? (?:in|with|from|out of) (?:excitement|relief|fear|anger|pain))\b/gi;
// A noun such as "the offer" is not a reporting verb licensing an action.
const reporting = /(?<!\b(?:the|this|that|an?|their|his|her)\s)\b(?:says?|said|states?|stated|announces?|announced|mentions?|mentioned|reports?|reported|plans?|planned|intends?|intended|proposes?|proposed|asks?|asked|wants?|wanted|discuss(?:es|ed)?|describ(?:e|es|ed)|denies|denied|offers?|offered|claims?|claimed|talks? about)\b[^.!?;]{0,140}$/i;
const nonPhysicalSubject = /\b(?:conversation|discussion|dialogue|topic|focus|question|argument|exchange|reply|answer|wording|truth|news|information)\s+(?:then\s+)?$/i;
const abstractEffect = /\b(?:offer|request|proposal|promise)\s+(?:could|may|might)\s+$/i;
const languageSubject = /\b(?:translation|wording|phrase|metaphor|description|comparison|interpretation|explanation|the quoted words)["'”’]?\s+$/i;
// Discussing a hypothetical action is not asserting that it happened. Keep
// this exception within the same clause; a later "but actually..." must still
// pass its own action check and the independent source review.
const hypotheticalMention = /\b(?:guess|question|suggestion|claim|allegation|theory|hypothesis|speculation)\s+(?:about|of)\s+(?:(?:someone|somebody|anyone)\s+)?$/i;

// Return only a term from the fixed action vocabulary, never rejected prose.
// This lets a retry correct the specific wording without receiving an unsafe
// draft (which could contain invented actions or later plot information).
export function unqualifiedCaptionActionTerm(text: string): string | null {
  if (/^Captions: \[[^\]\r\n]+\](?:; \[[^\]\r\n]+\])*$/.test(text.trim())) return null;
  for (const match of text.matchAll(guardedActions)) {
    const before = text.slice(0, match.index);
    const after = text.slice(match.index! + match[0].length);
    if (/^find(?:s|ing)?$|^found$/i.test(match[0]) &&
      /^\s+(?:(?:a|an|the)\s+)?(?:(?:equivalent|appropriate|right|correct|literal)\s+)?(?:word|translation|meaning)\b/i.test(after)) continue;
    if (/^hid(?:e|es|ing)?$|^hidden$/i.test(match[0]) && languageSubject.test(before)) continue;
    // A meaning hidden inside wording is figurative, not a witnessed hiding
    // action. Require both an abstract subject and a language object; the
    // independent source review must still establish that meaning.
    if (/^hidden$/i.test(match[0]) && /\b(?:meaning|affection|love|tenderness|feelings?|emotion|humou?r|irony|criticism|implication|wordplay|joke)\s+(?:(?:is|was|being|seems?|appears?)\s+(?:to be\s+)?)?$/i.test(before) &&
        /^\s+(?:in|inside|within|beneath)\s+(?:(?:an?|the|these|those|apparently|ordinary|simple|polite|everyday)\s+){0,4}(?:reply|response|exchange|phrase|wording|words|language)\b/i.test(after)) continue;
    if (/^(?:leaves|leaving|left)$/i.test(match[0]) && languageSubject.test(before) && /^\s+out\b/i.test(after)) continue;
    if (nonPhysicalSubject.test(before)) continue;
    if (/^(?:leaves|leaving|left)$/i.test(match[0]) &&
        /^\s+(?:the|this|that|an?) (?:issue|question|matter) (?:open|unresolved|unanswered)\b/i.test(after)) continue;
    // These are abstract descriptions, not a departure or an acceptance act.
    // A separate physical action later in the sentence is still checked.
    if (/^(?:leaves|leaving|left)$/i.test(match[0]) &&
        /^\s+room for (?:improvement|doubt|interpretation|debate|uncertainty)\b/i.test(after)) continue;
    if (/^accepted$/i.test(match[0]) && /\b(?:an?|the|widely|generally|commonly)\s+$/i.test(before) &&
        /^\s+(?:ranking|interpretation|view|idea|principle)\b/i.test(after)) continue;
    if (/^(?:leaves|leaving|left)$/i.test(match[0]) &&
        /^\s+(?:(?:them|us|everyone|the (?:group|viewer))\s+)?(?:stuck on|unsure|uncertain|wondering)\s+(?:about |of )?(?:whether|if|who|why|how)\b/i.test(after)) continue;
    if (/^(?:hide|hiding)$/i.test(match[0]) &&
      /\b(?:request|plan|instruction|proposal) (?:to |[^.!?;]{1,55} (?:depends|hinges) on )$/i.test(before)) continue;
    if (/^bring(?:s|ing)?$/i.test(match[0]) && abstractEffect.test(before) &&
      /^\s+(?:financial )?(?:relief|pressure|uncertainty|tension|hope|clarity)\b/i.test(after)) continue;
    // Figurative movement of a discussion is not a physical act. Restrict the
    // exception to explicit discourse/procedure objects; a bag or a person
    // being brought back still needs a reporting clause and source review.
    if (/^bring(?:s|ing)?$/i.test(match[0]) &&
        /^\s+(?:the )?(?:conversation|discussion|focus|topic|exchange)\s+back\b/i.test(after)) continue;
    if (/^return(?:s|ed|ing)? to$/i.test(match[0]) &&
        /^\s+(?:(?:the|responsible|proper|established)\s+)?(?:procedure|procedures|topic|discussion)\b/i.test(after)) continue;
    // An expectation of finding something does not assert a discovery.
    // The exception never covers 'found' or a later, separately stated act.
    if (/^find$/i.test(match[0]) && /\bexpect(?:s|ed|ing)? to\s+$/i.test(before)) continue;
    if (/^left$/i.test(match[0]) && /^\s+(?:hand|side|foot|arm|leg|eye|ear)\b/i.test(after)) continue;
    // Remaining room/time is a quantity, not somebody departing. Check any
    // separately stated departure later in the sentence as usual.
    if (/^left$/i.test(match[0]) && /\b(?:room|time|space)\s+$/i.test(before) && /^\s+for\b/i.test(after)) continue;
    // "Would accepting require ...?" considers a condition; it does not say
    // the offer was accepted. Do not exempt a positive acceptance elsewhere.
    if (/^(?:accepting|taking (?:on )?(?:a|the) (?:job|role|position))$/i.test(match[0]) &&
        /\b(?:would|does|whether)\s+$/i.test(before) && /^\s+(?:means?|requires?|involves?)\b/i.test(after)) continue;
    // An attribution cannot spill into a second action: "says goodbye and
    // leaves" is different from "says she is leaving". Each clause must retain
    // its own qualification; a rejected draft is regenerated, never edited.
    const clause = before.split(/[.!?;]|\b(?:and|but|then|before|after|while)\b/i).at(-1) ?? '';
    if (hypotheticalMention.test(clause)) continue;
    // A disputed difference remaining is an abstract result, not a departure.
    if (/^leaves?$/i.test(match[0]) && /^\s+(?:the )?(?:disputed )?(?:difference|disagreement) intact\b/i.test(after)) continue;
    // Explicitly denying that one thing entails receiving another does not
    // establish a receipt. A later positive clause is still checked separately.
    if (/^receiving$/i.test(match[0]) && /\b(?:doesn['’]t|does not) (?:necessarily )?mean\s+$/i.test(before)) continue;
    if (!reporting.test(clause)) return match[0].toLowerCase();
  }
  return null;
}

export function unqualifiedCaptionAction(text: string): boolean {
  return unqualifiedCaptionActionTerm(text) !== null;
}
