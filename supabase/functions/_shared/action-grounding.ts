// Captions often contain "I'm leaving" immediately before more conversation.
// That is speech/intent, not a timestamped observation of someone departing.
// Require the answer to preserve that distinction even if a model checker
// approves it. Likewise, nearby noises/"Yes!" do not prove a plan succeeded or
// explain an emotional reaction. These are narrow necessary conditions, not a
// complete action parser or a substitute for semantic/relevance review.
const guardedActions = /\b(?:leaves|leaving|left|departs?|departed|departing|walk(?:s|ed|ing)? (?:away|out)|(?:goes|went|going) back|return(?:s|ed|ing)? to|succeed(?:s|ed|ing)?|successfully|(?:is|was|are|were) successful|manag(?:es|ed|ing) to|celebrat(?:e|es|ed|ing)|cheer(?:s|ed|ing)?|(?:yell|shout|scream|gasp)(?:s|ed|ing)? (?:in|with|from|out of) (?:excitement|relief|fear|anger|pain))\b/gi;
const reporting = /\b(?:says?|said|states?|stated|announces?|announced|mentions?|mentioned|reports?|reported|plans?|planned|intends?|intended|proposes?|proposed|asks?|asked|wants?|wanted|discuss(?:es|ed)?|talks? about)\b[^.!?;]{0,100}$/i;
const nonPhysicalSubject = /\b(?:conversation|discussion|dialogue|topic|focus|question|argument)\s+(?:then\s+)?$/i;

export function unqualifiedCaptionAction(text: string): boolean {
  if (/^Captions: \[[^\]\r\n]+\](?:; \[[^\]\r\n]+\])*$/.test(text.trim())) return false;
  for (const match of text.matchAll(guardedActions)) {
    const before = text.slice(0, match.index);
    const after = text.slice(match.index! + match[0].length);
    if (nonPhysicalSubject.test(before)) continue;
    if (/^left$/i.test(match[0]) && /^\s+(?:hand|side|foot|arm|leg|eye|ear)\b/i.test(after)) continue;
    // An attribution cannot spill into a second action: "says goodbye and
    // leaves" is different from "says she is leaving". Each clause must retain
    // its own qualification; a rejected draft is regenerated, never edited.
    const clause = before.split(/[.!?;]|\b(?:and|but|then|before|after|while)\b/i).at(-1) ?? '';
    if (!reporting.test(clause)) return true;
  }
  return false;
}
