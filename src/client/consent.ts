// Tier 2 consent, ready for when Google tags are added (docs/research/privacy-consent-research.md §0). Today
// config.features.thirdPartyTags is false: initConsent() does nothing, no tag loads, and no banner exists.
// When it's turned on: Consent Mode starts with everything denied before any Google tag loads, Global Privacy Control
// keeps it denied for good, and only an "Accept" on the (future) banner may call grantConsent().

type Gtag = (...args: unknown[]) => void;
const w = window as unknown as { dataLayer?: unknown[]; gtag?: Gtag };

/** True when the browser sends Global Privacy Control (navigator.globalPrivacyControl). */
export const gpcOn = (): boolean => (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;

export const CONSENT_DENIED = { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", analytics_storage: "denied" } as const;

/** Sets the Consent Mode v2 default (denied) when Tier 2 is on. Returns whether third-party tags may ever load on this page. */
export function initConsent(thirdPartyTags: boolean): boolean {
  if (!thirdPartyTags) return false;
  w.dataLayer = w.dataLayer ?? [];
  w.gtag = w.gtag ?? function gtag() { w.dataLayer!.push(arguments); }; // eslint-disable-line prefer-rest-params
  w.gtag("consent", "default", { ...CONSENT_DENIED, wait_for_update: 500 });
  return !gpcOn();
}

/** For the future banner's Accept. Never grants while GPC is on. */
export function grantConsent(): void {
  if (gpcOn() || !w.gtag) return;
  w.gtag("consent", "update", { ad_storage: "granted", ad_user_data: "granted", ad_personalization: "granted", analytics_storage: "granted" });
}
