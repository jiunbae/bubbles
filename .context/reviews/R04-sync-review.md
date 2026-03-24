# R04 — Bubble Synchronization Review

**Date:** 2025-03-24
**Scope:** Complete data-flow trace for bubble sync between clients
**Severity:** High — bubbles appear visually different across clients

---

## 1. Data Flow Summary

### Client sends (blow message)
```
{ type: 'blow', data: { size, color, pattern, x, y, z } }
```
**Missing from wire:** `seed`, `lifetime/expiresAt`

### Server generates & broadcasts (bubble_created)
```
{ bubbleId, blownBy, x, y, z, size, color, pattern, seed, createdAt, expiresAt }
```
The server **forwards** the client's `color`, `x`, `y`, `z`, `size`, `pattern`.
The server **generates its own** `seed`, `lifetime/expiresAt`, `bubbleId`.

### Remote client receives
`WebSocketProvider` calls `addBubble(msg.data)` which stores the full `BubbleInfo` from the server.

### Local client (blower)
The blower **never receives** `bubble_created` for their own bubble (server uses `broadcastToRoom(pid, createdMsg, sessionId)` which excludes the sender). The blower uses their locally-generated `BubbleInfo`.

---

## 2. Fields That Are OUT OF SYNC

### 2.1 SEED — Critical Desync

| Client | Seed Source |
|--------|------------|
| Local (blower) | `Math.random() * 10000` (BubbleScene.tsx:74 / BubbleControls.tsx:46) |
| Server | `Math.floor(Math.random() * 1000000)` (handler.ts:136) |
| Remote (viewer) | Server's seed (from `bubble_created` message) |

**Impact:** `seed` drives:
- **Initial velocity** via `createBubbleState()` — `vx`, `vy`, `vz` are derived from `seededRandom(seed)` (bubblePhysics.ts:103-110)
- **Wobble phase** (bubblePhysics.ts:104)
- **Lifetime/natural pop timing** via `generateLifetime(size, seed)` (bubblePhysics.ts:105)
- **Size variation** — `SIZE_RADIUS[size] * (0.8 + (seed % 100) * 0.004)` (BubbleMesh.tsx:40)
- **Grow wobble frequency** — `bubble.seed % 7` (BubbleMesh.tsx:97)
- **Breathing animation** — `Math.sin(time * 2.5 + bubble.seed) * 0.03` (BubbleMesh.tsx:119)

**Result:** Different seed = different direction, speed, wobble, apparent size, animation timing. This is the BIGGEST source of desync.

The seed is NOT sent from client to server. The client sends `{ size, color, pattern, x, y, z }` — no `seed` field. The `ClientMessage` type in `ws-messages.ts` does not include `seed`.

### 2.2 COLOR — Tinted Differently

| Client | Color Source |
|--------|------------|
| Local (blower) | `tint(selectedColor)` — adds `Math.random() * 60` offset per channel (BubbleScene.tsx:52-60) |
| Server | Forwards the tinted color from the client verbatim (handler.ts:152) |
| Remote (viewer) | Uses server-forwarded tinted color |

**Verdict:** Color IS synced between local and remote. The `tint()` result is sent to the server and forwarded. However, there's a subtle issue: the local bubble's `blownBy.color` is set to the tinted color `c` (BubbleScene.tsx:71), while the server sets `blownBy.color` to `user.color` (a session-derived color, handler.ts:148). This is cosmetic (blownBy.color is only used for the user label, not the bubble appearance).

**COLOR IS OK** — the bubble color itself syncs correctly.

### 2.3 LIFETIME / expiresAt — Different Values

| Client | Lifetime Source |
|--------|---------------|
| Local (blower) | `BUBBLE_LIFETIME[size].min + Math.random() * (max - min)` (BubbleScene.tsx:66) |
| Server | `BUBBLE_LIFETIME[size].min + Math.random() * (max - min)` (handler.ts:135) — independent roll |
| Remote (viewer) | Server's `expiresAt` from `bubble_created` |

**Impact:** The local blower's bubble has a DIFFERENT `expiresAt` than what the server computed. Since `createBubbleState()` also generates lifetime from seed (bubblePhysics.ts:105), the physics-layer lifetime diverges from the timer-layer lifetime, but that's a separate issue. The main problem is the blower's bubble lives a different duration than the remote viewer's bubble.

### 2.4 BUBBLE ID — Different IDs

| Client | ID Source |
|--------|----------|
| Local (blower) | `s${Date.now()}_${counter}` (BubbleScene.tsx:47) |
| Server | `crypto.randomUUID()` (handler.ts:132) |
| Remote (viewer) | Server's UUID |

**Impact:** The local blower and remote viewer have different IDs for the same bubble. This means pop actions from remote users (`bubble_popped` with server's bubbleId) won't find the local bubble. However, since the server excludes the sender from broadcast, the blower never receives pop events for their own bubbles from the server — they pop them locally. This is a latent bug but not causing visual desync.

### 2.5 POSITION — Synced OK

The client sends `x, y, z` and the server forwards them. Remote clients use the same coordinates. **Position IS OK.**

### 2.6 SIZE — Synced OK

The client sends `size` ('S'/'M'/'L') and the server forwards it. **Size label IS OK.** However, the **visual radius** differs because it depends on `seed` (see 2.1).

---

## 3. Root Cause Analysis

The fundamental architectural problem: **the client creates a local bubble FIRST, then sends a stripped-down message to the server, which creates a SECOND independent bubble**. The blower and viewers see different bubbles with different seeds, lifetimes, and IDs.

The correct approach: either (a) the client sends ALL fields including seed and lifetime so the server forwards them verbatim, or (b) the client waits for the server's `bubble_created` response and uses THAT as the authoritative bubble (server-authoritative model).

Option (a) is simpler and preserves the low-latency feel for the blower.

---

## 4. Exact Code Fixes

### Fix 1: Add `seed` and `expiresAt` to `ClientMessage`

**File:** `packages/shared/src/ws-messages.ts`

```diff
 export type ClientMessage =
-  | { type: 'blow'; data: { size: 'S' | 'M' | 'L'; color: string; pattern: 'plain' | 'spiral' | 'dots' | 'star'; x?: number; y?: number; z?: number } }
+  | { type: 'blow'; data: { size: 'S' | 'M' | 'L'; color: string; pattern: 'plain' | 'spiral' | 'dots' | 'star'; x?: number; y?: number; z?: number; seed: number; expiresAt: number } }
   | { type: 'pop'; data: { bubbleId: string } }
   | { type: 'cursor'; data: { x: number; y: number } }
   | { type: 'ping' };
```

### Fix 2: Send `seed` and `expiresAt` from BubbleScene.tsx

**File:** `apps/web/src/components/visual/BubbleScene.tsx`

```diff
       if (globalWsClient.isConnected()) {
         globalWsClient.send({
           type: 'blow',
-          data: { size: bubble.size, color: bubble.color, pattern: 'plain', x: bubble.x, y: bubble.y, z: bubble.z },
+          data: { size: bubble.size, color: bubble.color, pattern: 'plain', x: bubble.x, y: bubble.y, z: bubble.z, seed: bubble.seed, expiresAt: bubble.expiresAt },
         });
       }
```

### Fix 3: Send `seed` and `expiresAt` from BubbleControls.tsx

**File:** `apps/web/src/components/visual/BubbleControls.tsx`

```diff
     if (globalWsClient.isConnected()) {
       globalWsClient.send({
         type: 'blow',
-        data: { size, color: c, pattern: 'plain', x: bubble.x, y: bubble.y, z: bubble.z },
+        data: { size, color: c, pattern: 'plain', x: bubble.x, y: bubble.y, z: bubble.z, seed: bubble.seed, expiresAt: bubble.expiresAt },
       });
     }
```

### Fix 4: Server uses client's `seed` and `expiresAt` instead of generating its own

**File:** `apps/server/src/ws/handler.ts`

```diff
-          const { size, color, pattern, x, y, z } = msg.data as any;
+          const { size, color, pattern, x, y, z, seed: clientSeed, expiresAt: clientExpiresAt } = msg.data as any;
           if (!['S', 'M', 'L'].includes(size)) return;

           const bubbleId = crypto.randomUUID();
           const now = Date.now();
-          const lifetime = BUBBLE_LIFETIME[size as BubbleSize];
-          const duration = lifetime.min + Math.random() * (lifetime.max - lifetime.min);
-          const seed = Math.floor(Math.random() * 1000000);
+
+          // Use client-provided seed and expiresAt for cross-client consistency.
+          // Validate and clamp to prevent abuse.
+          const lifetimeRange = BUBBLE_LIFETIME[size as BubbleSize];
+          const maxAllowedExpiry = now + lifetimeRange.max * 1.5; // allow some clock skew
+          const minAllowedExpiry = now + lifetimeRange.min * 0.5;
+          const seed = typeof clientSeed === 'number' && isFinite(clientSeed)
+            ? clientSeed
+            : Math.floor(Math.random() * 1000000);
+          const expiresAt = typeof clientExpiresAt === 'number'
+              && clientExpiresAt >= minAllowedExpiry
+              && clientExpiresAt <= maxAllowedExpiry
+            ? clientExpiresAt
+            : now + lifetimeRange.min + Math.random() * (lifetimeRange.max - lifetimeRange.min);
```

And update the bubble object creation:

```diff
           const bubble = {
             id: bubbleId,
             blownBy: { ... },
             x: bx, y: by, z: bz,
             size: size as BubbleSize,
             color: typeof color === 'string' ? color : '#87CEEB',
             pattern: (pattern || 'plain') as BubblePattern,
             seed,
             createdAt: now,
-            expiresAt: now + duration,
+            expiresAt,
           };
```

---

## 5. Summary Table

| Field | Local (blower) | Remote (viewer) | Synced? | Fix |
|-------|---------------|----------------|---------|-----|
| **x, y, z** | Client-generated | Forwarded from client | Yes | -- |
| **size** | Client-generated | Forwarded from client | Yes | -- |
| **color** | `tint(selected)` | Forwarded tinted value | Yes | -- |
| **pattern** | `'plain'` | Forwarded | Yes | -- |
| **seed** | `Math.random() * 10000` | Server's `Math.random() * 1000000` | **NO** | Send client seed to server |
| **expiresAt** | Client-generated | Server's independent roll | **NO** | Send client expiresAt to server |
| **bubbleId** | `s${timestamp}_${n}` | `crypto.randomUUID()` | **NO** (latent) | Not critical; blower never sees server ID |
| **velocity** | Derived from local seed | Derived from server seed | **NO** (via seed) | Fixed by syncing seed |
| **visual radius** | `seed % 100` variation | Different seed = different | **NO** (via seed) | Fixed by syncing seed |
| **wobble phase** | Derived from local seed | Derived from server seed | **NO** (via seed) | Fixed by syncing seed |

**The single root cause is that `seed` and `expiresAt` are not transmitted from client to server.** Fixing those two fields resolves all velocity, direction, wobble, size-variation, and lifetime discrepancies.
