import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_PRIVACY_CHOICES,
  PRIVACY_CONSENT_STORAGE_KEY,
  effectivePrivacyChoices,
  isAdvertisingFeatureEnabled,
  parsePrivacyConsent,
  readPrivacyConsent,
  writePrivacyConsent,
  type StorageLike,
} from '../lib/privacy-consent';

function memoryStorage(): StorageLike & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

describe('privacy consent', () => {
  test('defaults every optional purpose to denied before a decision', () => {
    expect(effectivePrivacyChoices(null)).toEqual(DEFAULT_PRIVACY_CHOICES);
  });

  test('keeps advertising unavailable unless the build flag is exactly true', () => {
    expect(isAdvertisingFeatureEnabled(undefined)).toBe(false);
    expect(isAdvertisingFeatureEnabled(false)).toBe(false);
    expect(isAdvertisingFeatureEnabled('TRUE')).toBe(false);
    expect(isAdvertisingFeatureEnabled('true')).toBe(true);

    const stored = {
      version: 1 as const,
      analytics: true,
      advertising: true,
    };
    expect(effectivePrivacyChoices(stored)).toEqual({
      analytics: true,
      advertising: false,
    });
    expect(effectivePrivacyChoices(stored, true)).toEqual({
      analytics: true,
      advertising: true,
    });
  });

  test('rejects malformed, incomplete and old stored values', () => {
    expect(parsePrivacyConsent('not-json')).toBeNull();
    expect(
      parsePrivacyConsent('{"version":0,"analytics":true,"advertising":true}')
    ).toBeNull();
    expect(parsePrivacyConsent('{"version":1,"analytics":true}')).toBeNull();
    expect(
      parsePrivacyConsent('{"version":1,"analytics":"yes","advertising":false}')
    ).toBeNull();
  });

  test('persists and restores independent analytics and advertising choices', () => {
    const storage = memoryStorage();
    const written = writePrivacyConsent(storage, {
      analytics: true,
      advertising: false,
    });

    expect(storage.values.has(PRIVACY_CONSENT_STORAGE_KEY)).toBe(true);
    expect(readPrivacyConsent(storage)).toEqual(written);
    expect(effectivePrivacyChoices(readPrivacyConsent(storage), true)).toEqual({
      analytics: true,
      advertising: false,
    });
  });

  test('keeps the in-memory choice when browser storage is unavailable', () => {
    const blockedStorage: StorageLike = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };

    expect(readPrivacyConsent(blockedStorage)).toBeNull();
    expect(
      writePrivacyConsent(blockedStorage, {
        analytics: false,
        advertising: true,
      })
    ).toEqual({ version: 1, analytics: false, advertising: true });
  });
});
