## Security Follow-up Review (R07)

Follow-up on R05 findings. Reviewed ticket exchange endpoint, WS handler changes, client-side ticket flow, shared auth helper, AuthCallback, BubbleInstances, and WebSocketProvider.

---

### R05 Finding Disposition

| R05 # | Finding | Status | Notes |
|--------|---------|--------|-------|
| 1 | JWT in WebSocket query string | **Fixed** | Replaced with single-use ticket exchange. JWT no longer appears in WS URL. |
| 2 | No OAuth `state` parameter (CSRF) | **Not fixed** | `redirectToOAuth` in `auth.ts` still does not generate or validate a `state` parameter. Login CSRF remains possible. |
| 3 | Client-side JWT parsed without signature verification | **Accepted** | No change; acceptable per R05 suggestion (UI hints only). |
| 4 | Display name not sanitized server-side | **Fixed** | `set_name` handler now strips `<>&"'` and control chars. |
| 5 | No rate limit on `set_name` | **Fixed** | `set_name` now reuses the `blow` rate-limit bucket. |
| 6 | JWT stored in localStorage | **Not fixed** | Token still stored in `localStorage`. Low priority but noted. |
| 7 | Silent JWT failure on WS connect | **Fixed** | Server now sends `{ type: 'error', data: { code: 'TICKET_INVALID' } }` when ticket is invalid. |
| 8 | Bubble color field unsanitized | **Fixed** | Color is now validated against `/^#[0-9a-fA-F]{6}$/`. |
| 9 | Client-controlled `redirect_uri` | **Unchanged** | Still constructed from `window.location.origin`. Acceptable if `jiun-api` enforces an allowlist server-side. |
| 10 | Authenticated users can override verified name | **Unchanged** | Accepted risk for this app's scope. |

---

### New Findings

#### N1. Ticket Store Is In-Memory — Not Safe for Multi-Instance Deployments
- **Severity**: medium
- **Description**: The ticket store is a plain `Map<string, TicketData>` in `apps/server/src/routes/auth.ts`. If the server runs more than one process or replica, a ticket created on instance A cannot be consumed on instance B. The client fetches a ticket via HTTP (potentially load-balanced to instance A), then opens a WebSocket (potentially routed to instance B), and the ticket lookup fails silently — the user downgrades to anonymous without clear feedback.
- **Location**: `apps/server/src/routes/auth.ts:12`
- **Suggestion**: For multi-instance deployments, store tickets in Redis (already used for pub/sub in this app). For a single-instance deployment this is fine.

#### N2. Ticket Entropy Relies on `crypto.randomUUID()` — Adequate but Worth Noting
- **Severity**: info
- **Description**: `crypto.randomUUID()` produces a v4 UUID with 122 bits of randomness. This is sufficient for a 30-second-lived, single-use token. No issue here; documenting for completeness.
- **Location**: `apps/server/src/routes/auth.ts:24`

#### N3. No CORS / Origin Check on `/auth/ws-ticket` Endpoint
- **Severity**: low
- **Description**: The `/auth/ws-ticket` POST endpoint does not explicitly enforce CORS or origin validation. Since it requires a valid `Authorization: Bearer` header, the risk is limited — a cross-origin attacker would need the JWT to call it. However, if CORS middleware is permissive (e.g., `Access-Control-Allow-Origin: *` with credentials), a malicious page could use a stolen token to mint tickets. This is a defense-in-depth concern.
- **Location**: `apps/server/src/routes/auth.ts:44`
- **Suggestion**: Ensure the global CORS middleware on this route does not allow wildcard origins with credentials. Verify `isAllowedOrigin` is applied to HTTP routes, not just WebSocket.

#### N4. `set_name` Rate Limit Shares Bucket with `blow` — Interference Risk
- **Severity**: low
- **Description**: The `set_name` handler calls `checkRateLimit(sessionId, 'blow', ...)`, sharing the `blow` action's token bucket. This means renaming consumes blow tokens and vice versa. A user who renames 5 times may be unable to blow bubbles, or a user who blows many bubbles cannot rename. The rate limits are generous (200-300 per minute), so practical impact is negligible, but the coupling is unintuitive.
- **Location**: `apps/server/src/ws/handler.ts:252`
- **Suggestion**: Either add a dedicated `set_name` action to the rate limiter, or document the shared bucket behavior.

#### N5. `displayName` Rendered in Tooltip via `innerHTML`-equivalent in R3F `Html`
- **Severity**: low
- **Description**: In `BubbleInstances.tsx:383`, the `displayName` from `blownBy` is rendered inside a `<div>` within `@react-three/drei`'s `<Html>` component. Since this is standard JSX, React auto-escapes text content. The server-side sanitization (stripping `<>&"'`) provides defense-in-depth. No XSS risk in the current implementation.
- **Location**: `apps/web/src/components/visual/BubbleInstances.tsx:383`

#### N6. `instanceId` from ThreeEvent Is a Numeric Index — No Injection Vector
- **Severity**: info
- **Description**: The `instanceId` from `ThreeEvent` is a numeric index assigned by Three.js raycasting against the InstancedMesh. It is not user-controlled data; it comes from GPU-side intersection testing. The handler correctly uses it only as a slot index lookup (`entry.slotIndex === instanceId`), iterating the state map. No injection or out-of-bounds risk — if the index doesn't match any entry, the loop simply doesn't act.
- **Location**: `apps/web/src/components/visual/BubbleInstances.tsx:302-319`

#### N7. OAuth `state` Parameter Still Missing (Escalation from R05 #2)
- **Severity**: high
- **Description**: The shared `redirectToOAuth` helper in `apps/web/src/lib/auth.ts` constructs the OAuth URL without a `state` parameter. `AuthCallback.tsx` does not validate any `state` on return. This was the highest-priority finding in R05 and remains unaddressed. An attacker can perform login CSRF by crafting a link to the OAuth provider callback with an attacker-controlled authorization code.
- **Location**: `apps/web/src/lib/auth.ts:3-6`, `apps/web/src/routes/AuthCallback.tsx:31-39`
- **Suggestion**: Generate a random `state` in `redirectToOAuth`, store in `sessionStorage`, pass to OAuth, and verify in `AuthCallback` before exchanging the code.

#### N8. Ticket Cleanup Interval Allows Accumulation Under Burst
- **Severity**: low
- **Description**: Expired tickets are cleaned every 60 seconds (`setInterval(..., 60_000)`), but tickets have a 30-second TTL. If an attacker repeatedly calls `/auth/ws-ticket` with valid JWTs without consuming the tickets, the map grows unbounded until the next cleanup. With a 60-second cleanup and 30-second TTL, at most ~60 seconds of tickets accumulate. Given the endpoint requires authentication, this is limited to authenticated users. At thousands of requests per second this could consume significant memory, but that would require a compromised or abused JWT.
- **Location**: `apps/server/src/routes/auth.ts:16-21`
- **Suggestion**: Consider adding a per-user limit on outstanding tickets (e.g., max 3 active tickets per userId) or rate-limiting the `/auth/ws-ticket` endpoint itself.

#### N9. `oauthError` Displayed Without Sanitization in AuthCallback
- **Severity**: low
- **Description**: `AuthCallback.tsx:19` renders `searchParams.get('error')` directly in the UI via template literal: `` `Authentication error: ${oauthError}` ``. Since this is rendered as React text content (not `dangerouslySetInnerHTML`), React escapes it. However, the raw OAuth error string from the URL is displayed to the user. An attacker could craft a URL like `/auth/callback?error=<phishing message>` to show arbitrary text. This is a cosmetic/phishing concern, not XSS.
- **Location**: `apps/web/src/routes/AuthCallback.tsx:19`
- **Suggestion**: Map known OAuth error codes to user-friendly messages rather than displaying the raw query parameter.

---

### Summary

| # | Finding | Severity | Type |
|---|---------|----------|------|
| N1 | In-memory ticket store not safe for multi-instance | medium | New |
| N3 | No explicit CORS on `/auth/ws-ticket` | low | New |
| N4 | `set_name` shares rate-limit bucket with `blow` | low | New |
| N7 | OAuth `state` parameter still missing | high | **Unresolved from R05** |
| N8 | Ticket accumulation under burst | low | New |
| N9 | Raw OAuth error displayed to user | low | New |

**Highest priority**: N7 (OAuth `state` — carried over from R05 #2) should be fixed before production use. N1 matters if/when the server scales beyond a single instance.

The ticket exchange (R05 #1 fix) is well-implemented: single-use, 30-second TTL, adequate entropy, proper delete-before-expiry-check ordering. The name sanitization (R05 #4 fix) and color validation (R05 #8 fix) are solid. The InstancedMesh refactor introduces no new security concerns.
