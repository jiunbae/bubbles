export const PRIVACY_CONSENT_STORAGE_KEY = 'bubbles_privacy_consent_v1';
export const PRIVACY_CONSENT_VERSION = 1 as const;

export interface PrivacyChoices {
  analytics: boolean;
  advertising: boolean;
}

export interface StoredPrivacyConsent extends PrivacyChoices {
  version: typeof PRIVACY_CONSENT_VERSION;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const DEFAULT_PRIVACY_CHOICES: Readonly<PrivacyChoices> = Object.freeze({
  analytics: false,
  advertising: false,
});

export function isAdvertisingFeatureEnabled(value: unknown): boolean {
  return value === 'true';
}

export function parsePrivacyConsent(
  serialized: string | null
): StoredPrivacyConsent | null {
  if (!serialized) return null;

  try {
    const value: unknown = JSON.parse(serialized);
    if (
      typeof value !== 'object' ||
      value === null ||
      !('version' in value) ||
      value.version !== PRIVACY_CONSENT_VERSION ||
      !('analytics' in value) ||
      typeof value.analytics !== 'boolean' ||
      !('advertising' in value) ||
      typeof value.advertising !== 'boolean'
    ) {
      return null;
    }

    return {
      version: PRIVACY_CONSENT_VERSION,
      analytics: value.analytics,
      advertising: value.advertising,
    };
  } catch {
    return null;
  }
}

export function readPrivacyConsent(
  storage?: StorageLike
): StoredPrivacyConsent | null {
  if (!storage) return null;

  try {
    return parsePrivacyConsent(storage.getItem(PRIVACY_CONSENT_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writePrivacyConsent(
  storage: StorageLike | undefined,
  choices: PrivacyChoices
): StoredPrivacyConsent {
  const consent: StoredPrivacyConsent = {
    version: PRIVACY_CONSENT_VERSION,
    analytics: choices.analytics,
    advertising: choices.advertising,
  };

  try {
    storage?.setItem(PRIVACY_CONSENT_STORAGE_KEY, JSON.stringify(consent));
  } catch {
    // Storage can be disabled or full. The provider still retains the choice
    // for the current page without weakening the default-deny behavior.
  }

  return consent;
}

export function effectivePrivacyChoices(
  consent: StoredPrivacyConsent | null,
  advertisingAvailable = false
): PrivacyChoices {
  return {
    analytics: consent?.analytics ?? false,
    advertising: advertisingAvailable && (consent?.advertising ?? false),
  };
}
