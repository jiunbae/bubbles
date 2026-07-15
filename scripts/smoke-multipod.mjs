const serverA = process.env.SERVER_A_URL || 'http://127.0.0.1:3002';
const serverB = process.env.SERVER_B_URL || 'http://127.0.0.1:3003';
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 10_000);

function websocketUrl(httpUrl, placeId) {
  const url = new URL(`/ws/place/${placeId}`, httpUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

class Peer {
  constructor(url, label) {
    this.label = label;
    this.messages = [];
    this.waiters = [];
    this.disposed = false;
    this.openAbort = null;
    this.socket = new WebSocket(url);
    this.handleMessage = (event) => {
      const message = JSON.parse(String(event.data));
      const waiterIndex = this.waiters.findIndex((waiter) =>
        waiter.matches(message)
      );
      if (waiterIndex === -1) {
        this.messages.push(message);
        return;
      }
      const [waiter] = this.waiters.splice(waiterIndex, 1);
      waiter.resolve(message);
    };
    this.socket.addEventListener('message', this.handleMessage);
  }

  async open() {
    if (this.socket.readyState === WebSocket.OPEN) return;
    await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.socket.removeEventListener('open', onOpen);
        this.socket.removeEventListener('error', onError);
        this.openAbort = null;
        callback(value);
      };
      const onOpen = () => finish(resolve);
      const onError = () =>
        finish(reject, new Error(`${this.label} WebSocket failed to open`));
      const timer = setTimeout(
        () =>
          finish(
            reject,
            new Error(`${this.label} did not open within ${timeoutMs}ms`)
          ),
        timeoutMs
      );
      this.openAbort = () =>
        finish(reject, new Error(`${this.label} WebSocket was disposed`));
      this.socket.addEventListener('open', onOpen);
      this.socket.addEventListener('error', onError);
    });
  }

  waitFor(type, predicate = () => true) {
    const matches = (message) => message.type === type && predicate(message);
    const queuedIndex = this.messages.findIndex(matches);
    if (queuedIndex !== -1)
      return Promise.resolve(this.messages.splice(queuedIndex, 1)[0]);

    return new Promise((resolve, reject) => {
      let timer;
      const waiter = {
        matches,
        resolve: (message) => {
          clearTimeout(timer);
          resolve(message);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      };
      this.waiters.push(waiter);
      timer = setTimeout(() => {
        const index = this.waiters.indexOf(waiter);
        if (index !== -1) this.waiters.splice(index, 1);
        waiter.reject(
          new Error(
            `${this.label} did not receive ${type} within ${timeoutMs}ms`
          )
        );
      }, timeoutMs);
    });
  }

  send(type, data) {
    this.socket.send(
      JSON.stringify(data === undefined ? { type } : { type, data })
    );
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.openAbort?.();
    this.openAbort = null;
    const error = new Error(`${this.label} was disposed`);
    for (const waiter of this.waiters.splice(0)) waiter.reject(error);
    this.socket.removeEventListener('message', this.handleMessage);
    try {
      if (typeof this.socket.terminate === 'function') {
        this.socket.terminate();
      } else if (
        this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING
      ) {
        this.socket.close(1000, 'Smoke test complete');
      }
    } catch {
      // Best-effort teardown must not hide the original smoke failure.
    }
  }
}

async function assertReady(baseUrl) {
  const response = await fetch(new URL('/health/ready', baseUrl), {
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await response.json();
  if (
    !response.ok ||
    body?.checks?.mongo !== 'ok' ||
    body?.checks?.redis !== 'ok'
  ) {
    throw new Error(
      `${baseUrl} is not ready: ${response.status} ${JSON.stringify(body)}`
    );
  }
}

async function main() {
  let peerA;
  let peerB;
  try {
    await Promise.all([assertReady(serverA), assertReady(serverB)]);

    const placeResponse = await fetch(new URL('/places', serverA), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        name: `ops-smoke-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
        theme: 'rooftop',
      }),
    });
    if (!placeResponse.ok) {
      throw new Error(
        `Place creation failed: ${placeResponse.status} ${await placeResponse.text()}`
      );
    }
    const place = await placeResponse.json();

    peerA = new Peer(websocketUrl(serverA, place.id), 'server A client');
    await peerA.open();
    const stateA = await peerA.waitFor('room_state');

    peerB = new Peer(websocketUrl(serverB, place.id), 'server B client');
    await peerB.open();
    const [stateB] = await Promise.all([
      peerB.waitFor('room_state'),
      peerA.waitFor('user_joined'),
    ]);
    if (stateB.data.users.length !== 2) {
      throw new Error(
        `Expected two global members, got ${stateB.data.users.length}`
      );
    }

    const bubbleId = crypto.randomUUID();
    peerA.send('blow', {
      bubbleId,
      size: 'S',
      color: '#87CEEB',
      pattern: 'plain',
      x: 0.1,
      y: 0.5,
      z: -0.1,
      seed: 42,
      expiresAt: Date.now() + 15_000,
    });
    await Promise.all([
      peerA.waitFor(
        'bubble_created',
        (message) => message.data.bubbleId === bubbleId
      ),
      peerB.waitFor(
        'bubble_created',
        (message) => message.data.bubbleId === bubbleId
      ),
    ]);

    peerB.send('cursor', { x: 0.25, y: 0.75 });
    await peerA.waitFor(
      'cursor_moved',
      (message) => message.data.sessionId === stateB.data.mySessionId
    );

    peerB.send('pop', { bubbleId });
    await peerA.waitFor(
      'bubble_popped',
      (message) => message.data.bubbleId === bubbleId
    );

    const placeStateResponse = await fetch(
      new URL(`/places/${place.id}`, serverA),
      { signal: AbortSignal.timeout(timeoutMs) }
    );
    const placeState = await placeStateResponse.json();
    if (!placeStateResponse.ok || placeState.userCount !== 2) {
      throw new Error(
        `Expected API global userCount=2, got ${JSON.stringify(placeState)}`
      );
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          placeId: place.id,
          serverA,
          serverB,
          checks: [
            'mongo-and-redis-readiness',
            'global-membership',
            'cross-pod-bubble-create',
            'cross-pod-cursor-relay',
            'cross-pod-bubble-pop',
            'global-api-user-count',
          ],
          firstSession: stateA.data.mySessionId,
        },
        null,
        2
      )
    );
  } finally {
    peerB?.dispose();
    peerA?.dispose();
    await Bun.sleep(50);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
