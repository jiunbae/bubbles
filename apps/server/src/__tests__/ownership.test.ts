import { describe, expect, it } from 'bun:test';
import { createOwnerId, createOwnershipIds } from '../utils/ownership';

const secret = 'ownership-test-secret';

describe('createOwnerId', () => {
  it('keeps authenticated ownership stable across sessions and display changes', async () => {
    const first = await createOwnerId(
      { sessionId: 'session-a', userId: 'account-123', isAuthenticated: true },
      secret
    );
    const second = await createOwnerId(
      { sessionId: 'session-b', userId: 'account-123', isAuthenticated: true },
      secret
    );

    expect(second).toBe(first);
    expect(first).not.toContain('account-123');
    expect(first).not.toContain('session-a');
  });

  it('uses the signed-cookie session as the anonymous principal', async () => {
    const first = await createOwnerId(
      { sessionId: 'anonymous-a', isAuthenticated: false },
      secret
    );
    const sameSession = await createOwnerId(
      { sessionId: 'anonymous-a', isAuthenticated: false },
      secret
    );
    const otherSession = await createOwnerId(
      { sessionId: 'anonymous-b', isAuthenticated: false },
      secret
    );

    expect(sameSession).toBe(first);
    expect(otherSession).not.toBe(first);
    expect(first).not.toContain('anonymous-a');
  });

  it('namespaces authenticated and anonymous identities', async () => {
    const authenticated = await createOwnerId(
      { sessionId: 'unused', userId: 'same-value', isAuthenticated: true },
      secret
    );
    const anonymous = await createOwnerId(
      { sessionId: 'same-value', isAuthenticated: false },
      secret
    );

    expect(anonymous).not.toBe(authenticated);
  });

  it('derives distinct current and previous IDs during key overlap', async () => {
    const identity = {
      sessionId: 'unused',
      userId: 'account-rotation',
      isAuthenticated: true,
    };
    const ids = await createOwnershipIds(
      identity,
      'current-owner-secret',
      'previous-owner-secret'
    );

    expect(ids.current).toBe(
      await createOwnerId(identity, 'current-owner-secret')
    );
    expect(ids.previous).toBe(
      await createOwnerId(identity, 'previous-owner-secret')
    );
    expect(ids.previous).not.toBe(ids.current);
    expect(JSON.stringify(ids)).not.toContain('account-rotation');
  });

  it('omits a redundant previous ID when no distinct key is configured', async () => {
    const identity = {
      sessionId: 'anonymous-overlap',
      isAuthenticated: false,
    };

    const missing = await createOwnershipIds(identity, secret);
    const equal = await createOwnershipIds(identity, secret, secret);

    expect(missing.previous).toBeUndefined();
    expect(equal.previous).toBeUndefined();
    expect(equal.current).toBe(missing.current);
  });
});
