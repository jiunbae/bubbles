# Code Review Summary (R07) — Follow-up on R05 Fixes

## R05 Fix Verification

**6/7 HIGH issues resolved:**
| R05# | Issue | Status |
|------|-------|--------|
| 1 | JWT in WS URL | Fixed (ticket exchange) |
| 2 | Client expiresAt bypass | Fixed (server-side compute) |
| 3 | JWT in WS URL | Fixed (ticket exchange) |
| 4 | 80 draw calls | Fixed (InstancedMesh) |
| 5 | 80 useFrame callbacks | Fixed (single loop) |
| 6 | Redis KEYS blocking | Fixed (SCAN) |
| 7 | `as any` casts | Fixed |

## New HIGH Finding (must fix)

### 1. In-memory ticket store breaks multi-pod auth
- **Agents**: Security + Architecture (2 agents agree)
- **Location**: `apps/server/src/routes/auth.ts:12`
- **Issue**: Tickets stored in local `Map`. HTTP and WS may hit different pods → ticket lookup fails → silent anonymous fallback
- **Fix**: Store tickets in Redis with 30s TTL: `SET ticket:<uuid> <json> EX 30`, consume with `GETDEL`

## Medium Priority

### 2. `onError`/`onClose` double-decrement gauge risk
- **Agents**: Architecture
- **Location**: `handler.ts:326-342`
- **Fix**: Extract idempotent `cleanupSession()` function

### 3. Slot-to-bubble reverse lookup is O(n)
- **Agents**: Architecture + Performance (2 agents agree)
- **Location**: `BubbleInstances.tsx:307-319`
- **Fix**: Add `slotToId` reverse Map for O(1) lookup

### 4. `handlePointerMove` triggers React re-render on every move
- **Agents**: Performance
- **Location**: `BubbleInstances.tsx:325-339`
- **Fix**: Guard with `if (id !== hoveredId)` before calling `setHoveredId`

## Low Priority

- `setColorAt` called every frame (set once at creation instead) — Perf + Arch
- OAuth `state` param still missing (jiun-api handles server-side, client should verify) — Security
- `shouldNaturallyPop` still creates PRNG per frame per bubble — Perf
- PopEffect `useState` still causes re-renders — Perf
- Expire pop effect uses spawn position not live position — Perf
- Ticket store no size cap — Security + Perf
- `set_name` shares rate-limit bucket with `blow` — Security
- Ticket exchange silent fallback to anonymous — Architecture

## Multi-Agent Agreements

| Finding | Agents |
|---------|--------|
| In-memory ticket store | Security + Architecture |
| Slot reverse lookup O(n) | Architecture + Performance |
| setColorAt every frame | Architecture + Performance |

## Architectural Positives (noted by reviewers)

- Ticket exchange: clean separation, testable pure functions
- InstancedMesh: slot recycling, ref-based physics, zero-alloc useFrame loop
- Slot allocator: O(1) push/pop stack
- Store sync via direct Zustand subscription (no React selectors)

## Statistics

- Total new findings: 8
- HIGH: 1, Medium: 3, Low: 4+
- R05 fix rate: 6/7 HIGH fixed, 6/17 total fixed
- By agent: Security 9, Architecture 7, Performance 5
