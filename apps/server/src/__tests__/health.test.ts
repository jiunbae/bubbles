import { describe, test, expect, mock } from 'bun:test';

// Mutable stand-ins for the two ioredis clients, so a test can put them into
// a state and ask the probe what it makes of it.
const redisClient = { status: 'ready' };
const subClient = { status: 'ready' };

mock.module('../db/redis', () => ({
  isRedisEnabled: () => true,
  getRedis: () => redisClient,
  getSub: () => subClient,
}));

const { health } = await import('../routes/health');

async function probe(path: string): Promise<number> {
  const res = await health.fetch(new Request(`http://localhost${path}`));
  return res.status;
}

describe('liveness probe', () => {
  test('stays up while a client is merely disconnected', async () => {
    // A dependency outage is not a reason to restart every replica: ioredis
    // reconnects on its own from these states.
    for (const status of ['connecting', 'reconnecting', 'close']) {
      redisClient.status = status;
      subClient.status = 'ready';
      expect(await probe('/live')).toBe(200);
    }
  });

  test('fails once a client has closed for good', async () => {
    // 'end' is terminal — nothing brings the client back, so only a restart
    // clears it. This is the state that wedged both pods on 2026-09-12.
    redisClient.status = 'end';
    subClient.status = 'ready';
    expect(await probe('/live')).toBe(503);
  });

  test('fails when the subscriber connection is the closed one', async () => {
    redisClient.status = 'ready';
    subClient.status = 'end';
    expect(await probe('/live')).toBe(503);
  });

  test('startup probe ignores dependency state entirely', async () => {
    redisClient.status = 'end';
    subClient.status = 'end';
    expect(await probe('/')).toBe(200);
  });
});
