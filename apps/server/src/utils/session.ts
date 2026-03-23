const ADJECTIVES = [
  'Bubbly', 'Fizzy', 'Sparkly', 'Bouncy', 'Dreamy',
  'Fluffy', 'Misty', 'Peppy', 'Gentle', 'Cozy',
  'Breezy', 'Sunny',
];

const ANIMALS = [
  'Panda', 'Otter', 'Fox', 'Koala', 'Penguin',
  'Bunny', 'Cat', 'Owl', 'Seal', 'Deer',
  'Duck', 'Bear',
];

export function generateSessionId(): string {
  return crypto.randomUUID();
}

export async function signSession(sessionId: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(sessionId));
  const sigHex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${sessionId}.${sigHex}`;
}

export async function verifySession(signed: string, secret: string): Promise<string | null> {
  const dotIndex = signed.lastIndexOf('.');
  if (dotIndex === -1) return null;

  const sessionId = signed.substring(0, dotIndex);
  const expectedSigned = await signSession(sessionId, secret);
  if (signed !== expectedSigned) return null;

  return sessionId;
}

export function generateDisplayName(sessionId: string): string {
  // Simple deterministic hash from sessionId
  let hash = 0;
  for (let i = 0; i < sessionId.length; i++) {
    const char = sessionId.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  // Make positive
  hash = Math.abs(hash);

  const adjective = ADJECTIVES[hash % ADJECTIVES.length];
  const animal = ANIMALS[Math.floor(hash / ADJECTIVES.length) % ANIMALS.length];
  return `${adjective} ${animal}`;
}
