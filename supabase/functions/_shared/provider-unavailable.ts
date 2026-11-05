// A failed external model call is recoverable with literal, uncharged source
// context. Programming errors and database failures are not provider failures.
export class ProviderUnavailable extends Error {
  constructor(message: string, readonly canShowSource = true) {
    super(message);
    this.name = 'ProviderUnavailable';
  }
}
