import {ProviderUnavailable} from './provider-unavailable.ts';

export class CompanionWorkDeferred extends ProviderUnavailable {
  constructor() { super('Geek needs more time to finish checking this answer. No question has been used.',false); }
}
// An admission floor, not a smaller response timeout. Every admitted call keeps
// the existing remaining deadline; this rejects the observed one-second repair.
const MIN_CALL_WINDOW_MS=10000;
const deadlines=new WeakMap<AbortSignal,number>();
export function assertCallWindow(deadline:number) {
  if(deadline-Date.now()<MIN_CALL_WINDOW_MS)throw new CompanionWorkDeferred();
}
export function modelCallSignal(deadline:number) {
  assertCallWindow(deadline);
  const signal=AbortSignal.timeout(Math.max(1,deadline-Date.now()));
  deadlines.set(signal,deadline);
  return signal;
}
export function assertDispatchWindow(signal?:AbortSignal|null) {
  if(signal?.aborted)throw new CompanionWorkDeferred();
  const deadline=signal?deadlines.get(signal):undefined;
  if(deadline!==undefined)assertCallWindow(deadline);
}
