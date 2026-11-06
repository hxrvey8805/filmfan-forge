type Scope = { tmdbId: number; mediaType: string; seasonNumber?: number; episodeNumber?: number };

// Only the scope identifier and history revision are shared with the mobile client.
export function cutGroup(p: Scope) {
  if (p.mediaType === 'tv' && p.tmdbId === 66573 && p.seasonNumber === 1 && p.episodeNumber === 1) {
    return 'good-place-pilot';
  }
  return null;
}

export function wholeShowRecap(question: string) {
  const q = question.toLowerCase().replace(/[’]/g, "'").trim();
  if (/^(?:why|who|whose|which|what (?:does|did|do)|did (?:he|she|they))\b/.test(q)) return false;
  // Only an explicit invitation can open the prior-episode boundary.
  if (
    /\b(?:don't|do not|without (?:a |the )?(?:recap|summary)|skip|exclude|no recap|no spoilers from)\b/.test(q) ||
    /\b(?:this|current|the|just this|only this) (?:episode|scene)\b/.test(q)
  ) return false;
  const scope =
    /\b(?:(?:(?:the|this|my|whole|entire) )*(?:show|series)|(?:the whole|the entire|this) season)(?: so far)?\b/;
  if (/\b(?:recap|summary|summari[sz]e|catch me up)\b/.test(q)) {
    const request = q.match(/\b(?:recap|summary|summari[sz]e|catch me up)\b(.*)/)?.[1] ?? '';
    return /^(?:\s+(?:of|on|the|my|this|whole|entire|story|so|far|in|from|all|previous|earlier|please|me|through|to|date|across|every|up|until|point))*\s+(?:show|series|season)\b/
      .test(request) ||
      /\b(?:from (?:the )?(?:pilot|first episode|episode (?:1|one))|(?:all|previous|earlier|all previous|all earlier) episodes)\b/.test(
        request,
      ) ||
      /\b(?:show|series) (?:recap|summary)\b/.test(q);
  }
  return /^(?:what(?:'s| has)? happened|what is the story) (?:so far )?(?:in|on|across)\b/.test(q) && scope.test(q) &&
    /\b(?:so far|up to|until now|to this point)\b/.test(q);
}
