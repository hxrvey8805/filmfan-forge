// The retrieval boundary has already admitted only completed captions. Keep
// the original text/times in evidence and citations, but avoid repeating a
// display timestamp on every model-input line. Passage times and line order
// remain explicit. Never trim, merge, or summarize the actual caption words.
export function modelCaptionLines(text: string): string[] {
  return text.split('\n').map(line => line.replace(/^\[\d{2}:\d{2}:\d{2}\] /, ''));
}
