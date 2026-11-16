// Subscription identifiers exist as App Store Connect drafts (15 Nov 2026).
// The sample pack remains unregistered and test-only until launch economics agree.
export const APPLE_BUNDLE_ID = 'app.cinegeek.mobile';
export const STOREKIT_PRODUCTS = {
  'app.cinegeek.mobile.pro.monthly': {kind:'subscription', plan:'monthly', questions:15},
  'app.cinegeek.mobile.pro.annual': {kind:'subscription', plan:'annual', questions:15},
  'app.cinegeek.mobile.test.questions5': {kind:'consumable', plan:null, questions:5},
} as const;
export type StoreProductId = keyof typeof STOREKIT_PRODUCTS;
export function storeProduct(id: string) {
  return Object.prototype.hasOwnProperty.call(STOREKIT_PRODUCTS,id) ? STOREKIT_PRODUCTS[id as StoreProductId] : null;
}

export interface StoreTransaction {
  id: string; originalId: string; productId: StoreProductId; accountToken: string;
  environment: 'Xcode'|'Sandbox'|'Production'; purchasedAt: number; signedAt: number;
  expiresAt: number|null; revokedAt: number|null; upgraded: boolean;
  // Apple-signed original billing anchor. Required by server delivery, optional
  // only for the older, isolated Xcode UI simulation.
  originalPurchasedAt?: number;
}
