# Code Review Summary (R05)

## Critical / High Findings (must fix)

### 1. OAuth flow lacks `state` parameter — CSRF risk
- **Agents**: Security
- **Severity**: HIGH
- **Location**: `PlacePage.tsx:61`, `LobbyPage.tsx:122`, `AuthCallback.tsx`
- **Issue**: OAuth redirect has no `state` parameter, enabling login CSRF attacks
- **Fix**: Generate random `state` in `sessionStorage`, verify on callback. (Note: jiun-api already handles `state` server-side via cookies, but client should verify the round-trip value)

### 2. Client-controlled `expiresAt` bypasses server clamping
- **Agents**: Architecture
- **Severity**: HIGH
- **Location**: `handler.ts:143-165`
- **Issue**: Client-provided `expiresAt` is stored directly; clamping only affects the timer. Bubbles can persist indefinitely in Redis.
- **Fix**: Always compute `expiresAt = now + clampedDuration` server-side

### 3. JWT token in WebSocket query parameter
- **Agents**: Security, Architecture
- **Severity**: HIGH (2 agents agree)
- **Location**: `ws-client.ts:52`, `handler.ts:56-57`
- **Issue**: Token exposed in URL logs, browser history, proxy logs
- **Fix**: Use short-lived ticket exchange or send token as first WS message

### 4. 80 material clones = 80 draw calls
- **Agents**: Performance, Code Quality
- **Severity**: HIGH (2 agents agree)
- **Location**: `BubbleMesh.tsx:51-57`
- **Issue**: Each bubble clones the material, preventing GPU batching. Materials also never disposed.
- **Fix**: Switch to `InstancedMesh` with per-instance attributes, or at minimum add `material.dispose()` on unmount

### 5. 80 separate `useFrame` callbacks per frame
- **Agents**: Performance
- **Severity**: HIGH
- **Location**: `BubbleMesh.tsx:75-128`
- **Issue**: Each bubble registers its own per-frame callback with physics, Date.now(), trig
- **Fix**: Consolidate into single loop in `BubbleRenderer`, cache `Date.now()` once per frame

### 6. Redis `KEYS` command blocks event loop
- **Agents**: Architecture, Performance
- **Severity**: HIGH (2 agents agree)
- **Location**: `rooms.ts:402-429`
- **Issue**: O(N) scan of entire keyspace, blocks all Redis operations
- **Fix**: Replace with `SCAN` cursor or maintain a Set of active room IDs

### 7. `as any` cast on blow message defeats type system
- **Agents**: Code Quality, Architecture
- **Severity**: HIGH (2 agents agree)
- **Location**: `handler.ts:134`
- **Issue**: TypeScript narrowing already handles the type; cast bypasses safety
- **Fix**: Remove `as any`, destructure from typed `msg.data`

---

## Medium Priority

### 8. Silent `catch {}` on JWT verification
- **Agents**: Security, Architecture, Code Quality (3 agents agree)
- **Location**: `handler.ts:69`
- **Fix**: Log failure, send `AUTH_FAILED` error message to client

### 9. Display name not sanitized server-side
- **Agents**: Security, Architecture (2 agents agree)
- **Location**: `handler.ts:231-261`
- **Fix**: Strip HTML chars, control characters; add rate limit to `set_name`

### 10. Hardcoded English strings bypass i18n
- **Agents**: Code Quality
- **Location**: `PlacePage.tsx`, `LobbyPage.tsx`, `AuthCallback.tsx`
- **Fix**: Add translation keys for login/logout/sign-in

### 11. Duplicated OAuth logic across 3 files
- **Agents**: Code Quality
- **Location**: `PlacePage.tsx:14`, `LobbyPage.tsx:12`, `AuthCallback.tsx:8`
- **Fix**: Extract `JIUN_API_URL` and `redirectToOAuth()` into `@/lib/auth.ts`

### 12. Duplicate bubble expiry timers race
- **Agents**: Architecture, Performance (2 agents agree)
- **Location**: `WebSocketProvider.tsx:52-55`, `BubbleMesh.tsx:85-89`
- **Fix**: Unify expiry handling — remove client-side `setTimeout` for remote bubbles

### 13. `rooms.ts` god module (483 lines, SRP violation)
- **Agents**: Architecture
- **Location**: `rooms.ts`
- **Fix**: Extract into `room-state.ts`, `room-redis.ts`, `bubble-manager.ts`

### 14. `console.log` on every WS message
- **Agents**: Performance
- **Location**: `handler.ts:121`
- **Fix**: Gate behind DEBUG flag, exclude ping/cursor

### 15. Circular dependency rooms.ts ↔ pubsub.ts
- **Agents**: Architecture
- **Fix**: Invert dependency via callback injection

### 16. Fire-and-forget Redis writes cause silent divergence
- **Agents**: Architecture
- **Fix**: Await Redis calls for error propagation

### 17. Pop effect at spawn position, not current position
- **Agents**: Code Quality, Performance (2 agents agree)
- **Location**: `bubble-store.ts:52-57`
- **Fix**: Track current physics position in mutable map

### 18. `shouldNaturallyPop` creates PRNG every frame per bubble
- **Agents**: Performance
- **Location**: `bubblePhysics.ts:248-266`
- **Fix**: Pre-compute pop probability or cache PRNG per bubble

### 19. PopEffect `useState` triggers unnecessary re-renders
- **Agents**: Performance
- **Location**: `PopEffect.tsx:67-113`
- **Fix**: Use `useRef` instead of `useState` for particle events

### 20. JWT stored in localStorage (XSS exfiltration)
- **Agents**: Security
- **Fix**: Consider `httpOnly` cookie or `sessionStorage`

### 21. Point light count * draw calls = expensive
- **Agents**: Performance
- **Location**: `SkyEnvironment.tsx`
- **Fix**: Limit to 2 point lights, or switch to InstancedMesh first

---

## Low Priority / Suggestions

- Missing `place.editName` translation key (Code Quality)
- Duplicated GitHub SVG icon (Code Quality)
- Unused `[x, y, z]` destructuring in Streetlamp (Code Quality)
- User dropdown doesn't close on outside click (Code Quality)
- `placeId!` non-null assertion without guard (Code Quality)
- `clearBubbles` in dep array but unused (Code Quality)
- `popBubble` missing from dep array (Code Quality)
- `as any` on `set_name` data (Code Quality)
- Dead client-side `sessionId` in auth store (Architecture)
- `id` vs `bubbleId` naming inconsistency (Architecture)
- Module-level mutable Redis singletons (Architecture)
- `window.__bubbleWsClient` global (Architecture)
- No WS message schema validation (Architecture)
- `lastCursorSent` map lacks periodic cleanup (Performance)
- Raycaster allocated every 250ms spawn tick (Performance, Code Quality)
- No WebSocket message batching (Performance)
- Bubble store copies entire Map on mutation (Performance)
- Authenticated users can override verified name (Security)
- Bubble color field unsanitized (Security)

---

## Multi-Agent Agreements (high confidence)

| Finding | Agents Agreeing |
|---------|----------------|
| JWT in WebSocket URL | Security + Architecture |
| Material clone / draw calls | Performance + Code Quality |
| Redis `KEYS` command | Architecture + Performance |
| `as any` cast | Code Quality + Architecture |
| Silent JWT `catch {}` | Security + Architecture + Code Quality |
| Display name sanitization | Security + Architecture |
| Duplicate expiry timers | Architecture + Performance |
| Pop at wrong position | Code Quality + Performance |

---

## Statistics

- **Total findings**: 40 (deduplicated to 30+)
- **High**: 7
- **Medium**: 14
- **Low**: 19
- **By agent**: Security 10, Architecture 17, Code Quality 17, Performance 13
