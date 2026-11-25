// A rejected draft/selection does not establish that story context is missing.
// Keep rejected prose out of the response and let the caller retry explicitly.
export class CompanionAnswerError extends Error {
  readonly code = 'question_answer_unverified';
  constructor() {
    super('I couldn’t verify a reliable answer this time. You can try again or make your question more specific. No question used.');
    this.name = 'CompanionAnswerError';
  }
}
