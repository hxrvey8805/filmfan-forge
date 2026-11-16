import {APPLE_BUNDLE_ID,storeProduct,type StoreProductId,type StoreTransaction} from './storekit-catalog.ts';

// Narrow interfaces let offline tests exercise the orchestration without
// replacing Apple's cryptographic verifier in the eventual server adapter.
export interface AppleTransactionPayload {
  transactionId?:string;originalTransactionId?:string;productId?:string;bundleId?:string;environment?:string;
  appAccountToken?:string;type?:string;quantity?:number;inAppOwnershipType?:string;
  purchaseDate?:number;originalPurchaseDate?:number;signedDate?:number;expiresDate?:number;revocationDate?:number;isUpgraded?:boolean;
}
export interface AppleVerification {
  verifyAndDecodeTransaction(jws:string):Promise<AppleTransactionPayload>;
}
export interface AppleApi {
  getTransactionInfo(id:string):Promise<{signedTransactionInfo?:string}>;
  getAllSubscriptionStatuses(id:string):Promise<{environment?:string;bundleId?:string;data?:Array<{
    lastTransactions?:Array<{originalTransactionId?:string;status?:number;signedTransactionInfo?:string}>
  }>}>
}
export type VerifiedApplePurchase={transaction:StoreTransaction;active:boolean;status:number|null;verifiedAt:number};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const transactionId=/^\d{1,30}$/;
export type VerifiedSandboxPurchase = VerifiedApplePurchase;
export type AppleEnvironment = 'Sandbox'|'Production';
function normalize(t:AppleTransactionPayload,account:string,now:number,environment:AppleEnvironment):StoreTransaction {
  const product=storeProduct(t.productId??'');
  if(!product||t.bundleId!==APPLE_BUNDLE_ID||t.environment!==environment
    ||!uuid.test(account)||t.appAccountToken?.toLowerCase()!==account.toLowerCase()
    ||t.inAppOwnershipType!=='PURCHASED'||t.quantity!==1
    ||typeof t.transactionId!=='string'||typeof t.originalTransactionId!=='string'||!transactionId.test(t.transactionId)||!transactionId.test(t.originalTransactionId)
    ||!Number.isSafeInteger(t.purchaseDate)||t.purchaseDate!<0||t.purchaseDate!>now+60000
    ||!Number.isSafeInteger(t.originalPurchaseDate)||t.originalPurchaseDate!<0||t.originalPurchaseDate!>t.purchaseDate!
    ||!Number.isSafeInteger(t.signedDate)||t.signedDate!<t.purchaseDate!||t.signedDate!>now+60000
    ||(t.revocationDate!==undefined&&(!Number.isSafeInteger(t.revocationDate)||t.revocationDate<0||t.revocationDate>now+60000))
    ||(t.isUpgraded!==undefined&&typeof t.isUpgraded!=='boolean'))throw Error('Invalid Apple purchase');
  if(environment==='Production'&&product.kind!=='subscription')throw Error('Product is not released');
  if(product.kind==='subscription') {
    if(t.type!=='Auto-Renewable Subscription'||!Number.isSafeInteger(t.expiresDate)||t.expiresDate!<=t.purchaseDate!)throw Error('Invalid subscription');
  }else if(t.type!=='Consumable'||t.expiresDate!==undefined)throw Error('Invalid question pack');
  return {id:t.transactionId!,originalId:t.originalTransactionId!,productId:t.productId as StoreProductId,
    accountToken:account.toLowerCase(),environment,purchasedAt:t.purchaseDate!,signedAt:t.signedDate!,
    expiresAt:t.expiresDate??null,revokedAt:t.revocationDate??null,upgraded:t.isUpgraded??false,originalPurchasedAt:t.originalPurchaseDate};
}

// The server selects one environment; it is never taken from the request.
// A client-supplied JWS alone must never grant access: always reconcile against
// Apple's fresh server state so an old signed receipt can't undo a refund.
export async function verifyApplePurchase(jws:string,account:string,deps:{verifier:AppleVerification;api:AppleApi;now?:()=>number},environment:AppleEnvironment):Promise<VerifiedApplePurchase> {
  if(!['Sandbox','Production'].includes(environment))throw Error('Invalid Apple environment');
  if(typeof jws!=='string'||jws.length<10||jws.length>24000)throw Error('Invalid receipt size');
  const now=(deps.now??Date.now)();
  const submitted=normalize(await deps.verifier.verifyAndDecodeTransaction(jws),account,now,environment);
  const fresh=await deps.api.getTransactionInfo(submitted.id);
  if(!fresh.signedTransactionInfo)throw Error('Apple did not return a current receipt');
  let transaction=normalize(await deps.verifier.verifyAndDecodeTransaction(fresh.signedTransactionInfo),account,now,environment);
  if(transaction.id!==submitted.id||transaction.originalId!==submitted.originalId||transaction.productId!==submitted.productId
    ||transaction.purchasedAt!==submitted.purchasedAt||transaction.originalPurchasedAt!==submitted.originalPurchasedAt
    ||transaction.signedAt<submitted.signedAt)throw Error('Apple receipt mismatch');
  if(storeProduct(transaction.productId)!.kind==='consumable')return {transaction,active:transaction.revokedAt===null,status:null,verifiedAt:now};
  const response=await deps.api.getAllSubscriptionStatuses(transaction.originalId);
  if(response.environment!==environment||response.bundleId!==APPLE_BUNDLE_ID)throw Error('Invalid subscription environment');
  const entries=(response.data??[]).flatMap(group=>group.lastTransactions??[]).filter(item=>item.originalTransactionId===transaction.originalId);
  if(entries.length!==1||!entries[0].signedTransactionInfo||![1,2,3,4,5].includes(entries[0].status!))throw Error('Subscription status unavailable');
  const status=entries[0].status!;
  const latest=normalize(await deps.verifier.verifyAndDecodeTransaction(entries[0].signedTransactionInfo!),account,now,environment);
  if(latest.originalId!==transaction.originalId||storeProduct(latest.productId)!.kind!=='subscription'
    ||latest.originalPurchasedAt!==transaction.originalPurchasedAt
    ||latest.purchasedAt<transaction.purchasedAt||latest.signedAt<transaction.signedAt)throw Error('Invalid subscription renewal');
  transaction=latest;
  // No billing grace period is promised/configured yet. A retry/grace state
  // fails closed pending an explicit launch policy and verified renewal info.
  return {transaction,status,active:status===1&&transaction.revokedAt===null&&!transaction.upgraded&&transaction.expiresAt!>now,verifiedAt:now};
}

// Existing Sandbox tests and host stay pinned to their isolated environment.
export function verifySandboxPurchase(jws:string,account:string,deps:{verifier:AppleVerification;api:AppleApi;now?:()=>number}) {
  return verifyApplePurchase(jws,account,deps,'Sandbox');
}
