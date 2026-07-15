import { describe, expect, test } from 'bun:test';
import {
  analyticsPageFields,
  normalizeAnalyticsErrorType,
  sanitizeAnalyticsPath,
} from '../lib/analytics';

describe('analytics data minimization', () => {
  test('keeps only bounded standard error categories', () => {
    expect(normalizeAnalyticsErrorType('TypeError')).toBe('TypeError');
    expect(normalizeAnalyticsErrorType('RangeError')).toBe('RangeError');
  });

  test('does not pass arbitrary error names through to analytics', () => {
    expect(normalizeAnalyticsErrorType('Room secret: 1234')).toBe('Error');
    expect(normalizeAnalyticsErrorType(undefined)).toBe('Error');
  });

  test('removes OAuth codes, search parameters and fragments from page paths', () => {
    expect(sanitizeAnalyticsPath('/auth/callback?code=secret#result')).toBe(
      '/auth/callback'
    );
    expect(sanitizeAnalyticsPath('/place/room-id?invite=secret')).toBe(
      '/place/room-id'
    );
    expect(sanitizeAnalyticsPath('https://example.com/?code=secret')).toBe('/');
    expect(sanitizeAnalyticsPath('//example.com/secret')).toBe('/');
  });

  test('never sends a user-created document title or query in page metadata', () => {
    expect(
      analyticsPageFields('/place/room-id?invite=secret', 'https://bubbles.test')
    ).toEqual({
      page_path: '/place/room-id',
      page_location: 'https://bubbles.test/place/room-id',
      page_title: 'Bubbles',
    });
  });
});
