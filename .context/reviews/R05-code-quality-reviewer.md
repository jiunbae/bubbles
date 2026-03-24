## Code Quality Review (R05)

### Hardcoded UI strings bypass i18n
- **Severity**: medium
- **Description**: Several user-facing strings in `PlacePage.tsx` and `LobbyPage.tsx` are hardcoded in English instead of using `t()`. This breaks the Korean locale for login/logout buttons and tooltip text.
- **Location**: `apps/web/src/routes/PlacePage.tsx:179` ("Sign in with GitHub" title), `:183` ("Login"), `:189` ("Sign out" title), `:191` ("Logout"); `apps/web/src/routes/LobbyPage.tsx:116` ("Logout"), `:130` ("Sign in")
- **Suggestion**: Add `auth.login`, `auth.logout`, `auth.signInWithGithub` keys to both `en.json` and `ko.json`, and replace all hardcoded strings with `t()` calls.

### Missing `place.editName` translation key in locale files
- **Severity**: low
- **Description**: `PlacePage.tsx:165` uses `t('place.editName', 'Click to change name')` with an inline fallback, but neither `en.json` nor `ko.json` defines a `place.editName` key. Korean users will always see the English fallback.
- **Location**: `apps/web/src/routes/PlacePage.tsx:165`
- **Suggestion**: Add `"editName": "Click to change name"` to `en.json` under `place`, and the Korean translation `"editName": "이름을 변경하려면 클릭"` to `ko.json`.

### Unsafe `as any` cast on blow message data
- **Severity**: high
- **Description**: The server handler destructures `msg.data as any` for the `blow` message type, completely discarding type safety. The `ClientMessage` union already defines the `blow` data shape, so the cast is unnecessary and masks potential type mismatches (e.g. accepting arbitrary fields from the client without validation).
- **Location**: `apps/server/src/ws/handler.ts:134`
- **Suggestion**: Remove `as any`. Use the typed `msg.data` directly since TypeScript narrows it after the `case 'blow'` branch. For fields not in the type (`x`, `y`, `z`, `seed`, `expiresAt`), they are already optional in the `ClientMessage` definition so they will be properly typed.

### Unsafe `as any` cast on set_name message data
- **Severity**: medium
- **Description**: The `set_name` handler also casts `msg.data as { displayName?: string }` even though the `ClientMessage` type already defines `set_name` data as `{ displayName: string }`. The cast weakens the type from required to optional.
- **Location**: `apps/server/src/ws/handler.ts:232`
- **Suggestion**: Remove the cast and use `msg.data.displayName` directly. The runtime validation (`typeof newName !== 'string'`) already covers the edge case.

### Duplicated OAuth redirect logic across pages
- **Severity**: medium
- **Description**: The GitHub OAuth redirect URL construction is duplicated identically in `PlacePage.tsx:60-61`, `LobbyPage.tsx:122-123`, and the `JIUN_API_URL` constant is declared in three separate files (`PlacePage.tsx:14`, `LobbyPage.tsx:12`, `AuthCallback.tsx:8`).
- **Location**: `apps/web/src/routes/PlacePage.tsx:14,60-61`, `apps/web/src/routes/LobbyPage.tsx:12,122-123`, `apps/web/src/routes/AuthCallback.tsx:8`
- **Suggestion**: Extract a shared `getJiunApiUrl()` constant and a `redirectToOAuth(provider: string)` helper into a shared module (e.g., `@/lib/auth.ts`).

### Duplicated GitHub SVG icon
- **Severity**: low
- **Description**: The GitHub Octocat SVG path is copy-pasted identically in `PlacePage.tsx:181` and `LobbyPage.tsx:128`. Any future branding change requires updating both places.
- **Location**: `apps/web/src/routes/PlacePage.tsx:180-182`, `apps/web/src/routes/LobbyPage.tsx:127-129`
- **Suggestion**: Extract a `<GitHubIcon />` component into `@/components/shared/`.

### AuthCallback error string not i18n-wrapped
- **Severity**: low
- **Description**: The OAuth error from the query parameter is interpolated into a raw English template string (`Authentication error: ${oauthError}`) instead of using a translation key with interpolation.
- **Location**: `apps/web/src/routes/AuthCallback.tsx:20`
- **Suggestion**: Add an `errors.oauthError` key (`"Authentication error: {{error}}"`) and use `t('errors.oauthError', { error: oauthError })`.

### Silent JWT verification failure on server
- **Severity**: medium
- **Description**: When JWT verification fails in the WebSocket `onOpen` handler, the `catch` block is completely empty. A malformed or expired token silently downgrades the user to anonymous without any logging, making debugging auth issues very difficult in production.
- **Location**: `apps/server/src/ws/handler.ts:69`
- **Suggestion**: Add at minimum `console.warn('[ws] JWT verification failed:', err.message)` in the catch block.

### Material cloned per bubble without disposal
- **Severity**: medium
- **Description**: `BubbleMesh` clones `sharedMaterial` in a `useMemo` to create a per-bubble material, but never calls `material.dispose()` when the component unmounts. Over a session with many bubbles created and popped, this leaks GPU resources.
- **Location**: `apps/web/src/components/visual/BubbleMesh.tsx:51-57`
- **Suggestion**: Add a cleanup effect: `useEffect(() => () => material.dispose(), [material])`.

### Module-level `_pos` vector reused across concurrent frames
- **Severity**: low
- **Description**: `BubbleMesh.tsx` declares `const _pos = new THREE.Vector3()` at module scope and uses it in `handleClick`. Since `handleClick` calls `_pos.clone()`, this is safe in practice, but the pattern is fragile -- any future usage that reads `_pos` after the click handler without cloning would see stale data. With R3F's concurrent rendering model this is a minor risk.
- **Location**: `apps/web/src/components/visual/BubbleMesh.tsx:29`
- **Suggestion**: Move `_pos` into the component or document that it must always be cloned before use.

### Raycaster allocated every spawn tick
- **Severity**: low
- **Description**: `BubbleSpawner.spawnBatch` creates `new THREE.Raycaster()` on every call (every 250ms while holding). This is a minor GC pressure source in a hot loop.
- **Location**: `apps/web/src/components/visual/BubbleScene.tsx:101`
- **Suggestion**: Hoist the `Raycaster` to a `useRef` and reuse it.

### Unused destructured variable `x, y, z` in Streetlamp
- **Severity**: low
- **Description**: The `Streetlamp` component destructures `const [x, y, z] = position` but never uses the individual variables. The `position` prop is passed directly to the `<group>`.
- **Location**: `apps/web/src/components/visual/SkyEnvironment.tsx:26`
- **Suggestion**: Remove the unused destructuring: `function Streetlamp({ position }: { position: [number, number, number] }) {`.

### User dropdown does not close on outside click
- **Severity**: low
- **Description**: The online users dropdown in `PlacePage.tsx` toggles on button click but never closes when clicking elsewhere on the page. This is a common UX oversight.
- **Location**: `apps/web/src/routes/PlacePage.tsx:204-231`
- **Suggestion**: Add a `useEffect` with a document click listener that sets `setShowUsers(false)` when clicking outside the dropdown ref.

### `popBubble` not used in WebSocketProvider for `bubble_popped` effect coordinates
- **Severity**: medium
- **Description**: In `WebSocketProvider`, the `bubble_popped` handler calls `popBubble(msg.data.bubbleId)` which queues a pop effect using the bubble's original spawn coordinates (`b.x, b.y, b.z`). However, bubbles have physics-driven movement, so the pop effect renders at the wrong (initial) position rather than the bubble's current visual position.
- **Location**: `apps/web/src/providers/WebSocketProvider.tsx:59`
- **Suggestion**: Consider storing the current visual position of each bubble (e.g., in the bubble store or via a ref map) and using that for pop effect placement, rather than the initial spawn coordinates.

### Non-null assertion on `placeId` in ActivityLog prop
- **Severity**: low
- **Description**: `PlacePage.tsx:276` passes `placeId!` with a non-null assertion. While `placeId` is guarded by an early `useEffect` check, the TypeScript type from `useParams` is `string | undefined`. The assertion masks a potential runtime error if the component rendering logic changes.
- **Location**: `apps/web/src/routes/PlacePage.tsx:276`
- **Suggestion**: Add an early return (`if (!placeId) return null`) before the main render, or narrow the type with a guard.

### `clearBubbles` in WebSocketProvider dependency array but never used
- **Severity**: low
- **Description**: `clearBubbles` is destructured from `useBubbleStore` and listed in the `useEffect` dependency array, but is never called inside the effect.
- **Location**: `apps/web/src/providers/WebSocketProvider.tsx:31,89`
- **Suggestion**: Remove it from both the destructuring and the dependency array to reduce noise.

### `popBubble` not listed in WebSocketProvider dependency array
- **Severity**: medium
- **Description**: `popBubble` is called inside the `useEffect` message handler (lines 59, 62) but is not included in the dependency array (lines 85-95). With Zustand selectors this is safe in practice because the function reference is stable, but it violates the exhaustive-deps rule and could cause subtle bugs if the store implementation changes.
- **Location**: `apps/web/src/providers/WebSocketProvider.tsx:59,62,85-95`
- **Suggestion**: Add `popBubble` to the dependency array for correctness.
