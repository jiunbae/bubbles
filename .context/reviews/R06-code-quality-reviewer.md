# Code Quality Review (R06)

Reviewer: Staff Engineer (Code Quality)
Scope: Last 10 commits -- mobile responsiveness, Redis integration, graceful shutdown, metrics, physics sync

---

## Critical

### 1. Duplicate `tint()` and `randSize()` helper functions
- **File**: `apps/web/src/components/visual/BubbleControls.tsx:17-25` and `apps/web/src/components/visual/BubbleScene.tsx:48-60`
- **Description**: `tint()`, `randSize()`, and `makeId()` are copy-pasted identically between `BubbleControls.tsx` and `BubbleScene.tsx`. Both files also duplicate the full bubble-creation pattern (computing lifetime, building a `BubbleInfo`, scheduling expiry, sending the WS message). Any future change to bubble creation logic must be applied in both places or behavior will diverge.
- **Suggestion**: Extract a shared `spawnBubble(x, y, z, color)` utility function (e.g., in `lib/bubble-factory.ts`) that handles ID generation, tinting, lifetime computation, store insertion, expiry scheduling, and WS broadcast. Both files import and call that single function.

### 2. `redisAddBubble` performs a no-op destructure that silently keeps the `timer` field
- **File**: `apps/server/src/ws/rooms.ts:78-79`
- **Description**: The line `const { ...data } = bubble;` is intended to strip the `timer` property (since the parameter is `Omit<ActiveBubble, 'timer'>`), but this destructure is a full shallow copy that keeps every field. The intent is correct at the type level (the parameter already omits `timer`), but the pattern is misleading -- it looks like it is stripping a field when it is not. If this function is ever called with a full `ActiveBubble` by mistake, the `timer` (a non-serializable handle) would be serialized to Redis and corrupt data.
- **Suggestion**: Replace with `const data = bubble;` (since the type already guarantees no `timer`), or use explicit field selection: `const { id, blownBy, x, y, z, size, color, pattern, seed, createdAt, expiresAt } = bubble;`.

### 3. `cleanupRedisStaleEntries` parses placeId from Redis key using naive string replacement
- **File**: `apps/server/src/ws/rooms.ts:420`
- **Description**: `key.replace('room:', '').replace(':members', '')` will break if a placeId ever contains the literal substring `room:` or `:members`. While MongoDB ObjectIds are hex strings, this pattern is fragile and should not rely on key contents not matching the prefix/suffix.
- **Suggestion**: Use a regex or split: `const placeId = key.match(/^room:(.+):members$/)?.[1]`. This is unambiguous regardless of the placeId value.

---

## High

### 4. `ModeSwitch` useEffect missing dependency array causes keyboard handler to re-register every render
- **File**: `apps/web/src/components/shared/ModeSwitch.tsx:13-22`
- **Description**: The `useEffect` call that registers the Ctrl+Shift+M keyboard handler has no dependency array at all (not even `[]`). This means the effect runs after every render, adding and removing the event listener on each pass. The `toggle` function it captures is also recreated every render, creating a closure over stale `mode` that technically works but is wasteful and fragile.
- **Suggestion**: Add a dependency array. Either: (a) use `[mode]` and stable reference to `setMode`, or (b) memoize `toggle` with `useCallback` and list it as a dependency. At minimum, add `[toggle]` as the dependency array.

### 5. Duplicate keyboard shortcut handler for Ctrl+Shift+M
- **File**: `apps/web/src/components/shared/ModeSwitch.tsx:14-16` and `apps/web/src/components/stealth/StealthMode.tsx:209-211`
- **Description**: The Ctrl+Shift+M keyboard shortcut is registered independently in both `ModeSwitch` (always mounted in the header) and `StealthMode` (mounted only in stealth view). When in stealth mode, pressing Ctrl+Shift+M fires two handlers. `ModeSwitch` toggles the mode, and `StealthMode` calls `setMode('visual')`. Both achieve the same result, but the double-fire is wasteful and could cause issues if the toggle logic changes.
- **Suggestion**: Remove the keyboard shortcut registration from `StealthMode.tsx` (lines 209-213) since `ModeSwitch` already handles it globally.

### 6. `onError` in WebSocket handler decrements gauge but does not check if `onClose` also fires
- **File**: `apps/server/src/ws/handler.ts:336-345`
- **Description**: Both `onClose` and `onError` call `decGauge('ws_connections_active')` and `leaveRoom()`. When a WebSocket error occurs, browsers typically fire `onerror` followed by `onclose`. If both fire, the gauge is decremented twice and `leaveRoom` is called twice. The second `leaveRoom` is harmless (the session is already gone), but the double gauge decrement corrupts the metric.
- **Suggestion**: Guard the `onError` handler with a check: only decrement/cleanup if `sessionStates.has(sessionId)`. Since `onClose` deletes the session, the second handler becomes a no-op. Alternatively, move all cleanup to `onClose` and make `onError` only log.

### 7. `lastCursorSent` map grows unboundedly -- entries never cleaned up on disconnect
- **File**: `apps/server/src/ws/handler.ts:27-28, 301, 331, 343`
- **Description**: The `lastCursorSent` map is keyed by `${placeId}:${sessionId}`. Entries are deleted in `onClose` and `onError`, but only for the session's specific key. If a session sends cursor messages to a room and then the room changes (hypothetical) or keys are constructed differently, stale entries could accumulate. Currently this works because the key construction is consistent, but the map lacks any periodic cleanup. For a long-running server with many short-lived sessions, this is a slow memory leak if any cleanup path is missed.
- **Suggestion**: Add `lastCursorSent` cleanup to the periodic `cleanupStaleRooms` sweep, or use a WeakRef-based approach tied to the session lifecycle.

### 8. `BubbleControls` reads `window.innerWidth` during render for inline styles -- not reactive
- **File**: `apps/web/src/components/visual/BubbleControls.tsx:134, 154, 157`
- **Description**: `window.innerWidth < 640` is evaluated during render to set padding/font-size, but it is not in a state variable or listener. Resizing the browser window does not trigger a re-render, so the controls stay at the initial size class. This creates inconsistency with the rest of the UI which uses Tailwind responsive breakpoints (`sm:`, `md:`) that respond to resize.
- **Suggestion**: Either use Tailwind classes on a wrapper div (preferred for consistency) or add a `useMediaQuery` hook that triggers re-renders on resize. Since this component uses inline styles for the Three.js overlay, a hook like `const isMobile = useMediaQuery('(max-width: 639px)')` would be appropriate.

---

## Medium

### 9. Histogram bucket counting is non-cumulative in storage, recomputed on every scrape
- **File**: `apps/server/src/metrics.ts:43-45`
- **Description**: `observeHistogram` increments individual bucket counts, but the `serialize()` function (line 89) computes cumulative counts via `.slice(0, i + 1).reduce(...)` on every scrape. This is O(n^2) in the number of buckets per label combination. With 11 default buckets, it is 66 additions per histogram series per scrape. Not a problem at current scale, but the pattern is unusual -- standard Prometheus client libraries store cumulative counts directly.
- **Suggestion**: Store cumulative counts directly in `observeHistogram` to make serialization O(n). This also removes the risk of the reduce allocation on the hot scrape path.

### 10. `PlacePage.tsx` uses non-null assertion on `placeId`
- **File**: `apps/web/src/routes/PlacePage.tsx:274`
- **Description**: `placeId={placeId!}` uses a non-null assertion. While the component would not render this branch if `placeId` were undefined (the early `if (!placeId) return` guard is not present), there is actually no such guard. The `useParams` returns `string | undefined`, and the component proceeds without checking for undefined in the main render path.
- **Suggestion**: Add an early return guard: `if (!placeId) return <Navigate to="/" />;` before the main render. This makes the non-null assertion unnecessary and handles the edge case properly.

### 11. `SpreadsheetView` injects a `<style>` tag inside the component body on every render
- **File**: `apps/web/src/components/stealth/SpreadsheetView.tsx:185-190`
- **Description**: The `@keyframes stealth-row-flash` animation is injected via a `<style>` JSX element inside the component. This means the style tag is re-inserted into the DOM on every render. While browsers deduplicate identical style content, this is unconventional and could cause flash-of-unstyled-content issues.
- **Suggestion**: Move the keyframe definition to `styles.css` or use Tailwind's `@layer` with a custom animation. The animation name is already referenced via a Tailwind arbitrary class `animate-[stealth-row-flash_1s_ease-out]`, so defining it in CSS is the natural home.

### 12. Stealth dropdown close handlers are duplicated across 4 components
- **File**: `apps/web/src/components/stealth/FakeMenuBar.tsx:26-33`, `StealthToolbar.tsx:57-69`, `StealthActionBar.tsx:20-29`, `SheetTabs.tsx:24-31`
- **Description**: Four components each independently implement the same "click outside to close" pattern: a `useEffect` that adds a `mousedown` listener checking `ref.current.contains(e.target)`. The logic is identical each time, differing only in which refs to check.
- **Suggestion**: Extract a `useClickOutside(refs: RefObject[], onClose: () => void)` hook. This eliminates ~40 lines of duplicated boilerplate and ensures consistent behavior (e.g., if you later need to handle touch events or focus trapping).

### 13. `bubblePhysics.ts` uses hardcoded `SIZE_RADIUS['M']` instead of actual bubble size
- **File**: `apps/web/src/physics/bubblePhysics.ts:138`
- **Description**: `const radius = SIZE_RADIUS['M'];` is hardcoded to medium regardless of the actual bubble size. The comment says "caller can pass actual radius via scale" but the `BubblePhysicsState` type has no `size` field -- only `scale` which starts at 1. This means small and large bubbles have identical buoyancy physics, which may not be intentional.
- **Suggestion**: Add a `size: BubbleSize` field to `BubblePhysicsState` (or pass it to `updateBubble`) so the physics correctly accounts for bubble size affecting buoyancy and drag.

### 14. `connectRedis` duplicates connection options for command and sub clients
- **File**: `apps/server/src/db/redis.ts:17-33`
- **Description**: The Redis connection options (`maxRetriesPerRequest`, `lazyConnect`, `retryStrategy`) are copy-pasted identically for the `redis` and `sub` instances. Any change to one must be manually mirrored to the other.
- **Suggestion**: Extract a shared options object: `const redisOpts = { maxRetriesPerRequest: 3, ... }; redis = new Redis(url, redisOpts); sub = new Redis(url, redisOpts);`

### 15. `VisualMode.tsx` uses `as any` cast for OrbitControls mouseButtons
- **File**: `apps/web/src/components/visual/VisualMode.tsx:106`
- **Description**: `LEFT: -1 as any` is used to disable left-click orbit. The `-1` value is an undocumented Three.js convention, and the `as any` silences the type checker. This is a type-safety escape hatch that hides the intent.
- **Suggestion**: Define a named constant with a comment: `const MOUSE_DISABLED = -1 as unknown as MOUSE;` to make the intent explicit and limit the `any` scope.

---

## Low

### 16. `StealthMode.tsx` is a 296-line component with 8 useState hooks and 6 useEffect hooks
- **File**: `apps/web/src/components/stealth/StealthMode.tsx`
- **Description**: The component manages action log tracking, bubble watching, user watching, keyboard shortcuts, calculating flash state, and the blow/pop handlers -- all in one function. At 296 lines with substantial effect logic, it is approaching the threshold where readability suffers and bugs hide.
- **Suggestion**: Consider extracting a `useStealthActionLog()` hook for the action-tracking effects (lines 48-133) and a `useStealthKeyboard()` hook for the keyboard shortcuts (lines 195-218). The component body would then focus on composition and rendering.

### 17. Inline SVG icons duplicated across components
- **File**: `apps/web/src/routes/PlacePage.tsx:110-122`, `apps/web/src/routes/PlacePage.tsx:238-248`, `apps/web/src/components/visual/BubbleControls.tsx` (various), `apps/web/src/components/stealth/StealthToolbar.tsx` (various)
- **Description**: SVG icons (back arrow, clipboard, cut/copy, alignment, etc.) are defined inline as JSX in multiple places. While this avoids an icon library dependency, it makes the SVGs hard to update consistently and adds visual noise to component code.
- **Suggestion**: Create an `icons.tsx` barrel file exporting named icon components (e.g., `<ChevronLeftIcon />`, `<ClipboardIcon />`). This keeps components focused on layout and behavior.

### 18. `FakeStatusBar` sum calculation uses magic number 26.7
- **File**: `apps/web/src/components/stealth/FakeStatusBar.tsx:25`
- **Description**: `(actionCount * 26.7).toFixed(0)` uses an unexplained magic number to generate a fake "SUM" value in the status bar. While this is deliberately fake, the number is undocumented.
- **Suggestion**: Add a brief comment: `// Fake sum to mimic Excel status bar` or extract it as a named constant `const FAKE_CELL_VALUE = 26.7;`.

### 19. `PlacePage` users dropdown lacks click-outside-to-close behavior
- **File**: `apps/web/src/routes/PlacePage.tsx:219-229`
- **Description**: The `showUsers` dropdown (online users list) toggles on button click but has no click-outside handler to dismiss it. Clicking anywhere else on the page leaves the dropdown open. Other dropdowns in the stealth components properly handle click-outside.
- **Suggestion**: Add a `useClickOutside` handler (or the extracted hook from finding #12) to close the dropdown when clicking outside.

### 20. No test files exist in the entire project
- **File**: (project root)
- **Description**: There are zero test files (`*.test.ts`, `*.test.tsx`, `*.spec.ts`) in either `apps/server` or `apps/web`. The following areas are especially high-value for testing:
  - `bubblePhysics.ts` -- Pure deterministic functions (`seededRandom`, `updateBubble`, `shouldNaturallyPop`, `generateLifetime`) are ideal unit test candidates.
  - `apps/server/src/ws/rooms.ts` -- Room join/leave/broadcast logic with Redis fallback paths.
  - `apps/server/src/metrics.ts` -- Counter/histogram/gauge serialization to Prometheus format.
  - `apps/web/src/lib/ws-client.ts` -- Reconnection backoff logic and close-code handling.
  - `apps/web/src/components/stealth/stealth-utils.ts` -- Pure data transformation functions.
- **Suggestion**: Prioritize adding tests for the pure-logic modules (`bubblePhysics.ts`, `metrics.ts`, `stealth-utils.ts`) first since they require no mocking. Then add integration tests for `rooms.ts` (mocking Redis/Mongo) and `ws-client.ts` (mocking WebSocket).

### 21. Graceful shutdown uses `process.exit(0)` without awaiting in-flight HTTP requests
- **File**: `apps/server/src/index.ts:92`
- **Description**: The shutdown handler closes WebSocket connections and waits 2 seconds, then calls `process.exit(0)`. Any in-flight HTTP requests (place creation, log queries) are terminated abruptly. The Bun HTTP server's `fetch` handler does not have a built-in drain mechanism, but the 2-second sleep may not be sufficient under load.
- **Suggestion**: Consider using Bun's `server.stop()` (if available in your Bun version) for graceful HTTP drain, or increase the sleep to match K8s `terminationGracePeriodSeconds`. Document the expected shutdown timeline.

### 22. `WebSocketProvider` dependency array includes `removeBubble` which is unused in the effect
- **File**: `apps/web/src/providers/WebSocketProvider.tsx:83`
- **Description**: The `useEffect` dependency array includes `removeBubble` from the bubble store, but the effect body never calls `removeBubble` directly -- it only calls `popBubble`. Including unused dependencies causes unnecessary effect re-runs if the reference changes.
- **Suggestion**: Remove `removeBubble` from the dependency array, or verify whether it should replace one of the `popBubble` calls.
