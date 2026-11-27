import {CARD_REPLACEMENT_PRICE} from './xp-prices';
export {CARD_REPLACEMENT_PRICE} from './xp-prices';
export type PackChoice = {keep:boolean; replace:string|null; cost:number};
const pending = new Map<string, PackChoice>();
const key = (user:string, pack:string) => `cinegeek.pack-choice.v2:${user}:${pack}`;
export function pendingPackChoice(user:string, pack:string):PackChoice|null {
  const id=key(user,pack);
  if(pending.has(id))return pending.get(id)!;
  try {
    const value=JSON.parse(localStorage.getItem(id)??'null');
    if(value && typeof value.keep==='boolean' && (value.replace===null||typeof value.replace==='string') &&
      value.cost===(value.keep&&value.replace?CARD_REPLACEMENT_PRICE:0)) {
      pending.set(id,value);return value;
    }
  } catch { /* Storage is optional; the server also protects against duplicate decisions. */ }
  return null;
}
export function savePackChoice(user:string,pack:string,choice:PackChoice|null) {
  const id=key(user,pack);
  if(choice)pending.set(id,choice);else pending.delete(id);
  try {if(choice)localStorage.setItem(id,JSON.stringify(choice));else localStorage.removeItem(id);} catch { /* memory fallback */ }
}
export function requirePackDecision(value:unknown,choice:PackChoice) {
  const receipt=value as {decision?:unknown;replacementXp?:unknown}|null;
  if(receipt?.decision!==(choice.keep?'kept':'skipped')||receipt.replacementXp!==choice.cost)
    throw new Error('Your choice could not be confirmed. Retry to check the same decision.');
}
