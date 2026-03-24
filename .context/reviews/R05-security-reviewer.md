## Security Review (R05)

Reviewed: OAuth flow, JWT handling, token storage, WebSocket authentication, set_name handler, CORS, message injection, secrets management, Redis integration.

---

### 1. JWT Token Passed in WebSocket URL Query String
- **Severity**: medium
- **Description**: The JWT access token is appended to the WebSocket URL as a query parameter (`?token=...`). Query strings are logged in web server access logs, proxy logs, CDN logs, and browser history. This means the bearer token can be exposed in plaintext across multiple infrastructure layers. It also survives in the `Referer` header if the page navigates to an external link.
- **Location**: `apps/web/src/lib/ws-client.ts:52`, `apps/server/src/ws/handler.ts:56-57`
- **Suggestion**: Use a short-lived, single-use ticket instead. The client requests a one-time ticket via an authenticated HTTP endpoint, then passes the ticket in the WS query string. The server exchanges the ticket for a session on connect and invalidates it. Alternatively, send the token as the first WS message after connection opens, but before joining the room.

---

### 2. No CSRF / OAuth `state` Parameter in Authorization Flow
- **Severity**: high
- **Description**: The OAuth login redirect (`handleLogin` in PlacePage and LobbyPage) navigates to `${JIUN_API_URL}/auth/github?redirect_uri=...` without generating or validating a `state` parameter. Without `state`, the OAuth callback is vulnerable to CSRF: an attacker can craft a URL that logs the victim into the attacker's account (login CSRF) or force-links an attacker's OAuth grant to the victim's session.
- **Location**: `apps/web/src/routes/PlacePage.tsx:61`, `apps/web/src/routes/LobbyPage.tsx:122-123`, `apps/web/src/routes/AuthCallback.tsx:30-46`
- **Suggestion**: Generate a random `state` value per login attempt, store it in `sessionStorage`, pass it to the auth endpoint, and verify it matches in `AuthCallback` before exchanging the code. If the upstream `jiun-api` already handles `state`, ensure the client verifies the round-trip value.

---

### 3. JWT Parsed Client-Side Without Signature Verification
- **Severity**: medium
- **Description**: `parseJwt` in `token.ts` performs a raw base64 decode of the JWT payload without verifying the signature. The client trusts whatever claims are in the token (sub, name, username) for building the `AuthUser` object. A tampered or forged JWT stored in localStorage would be accepted by the client. While the server does verify the JWT with `jose.jwtVerify`, the client-side trust creates a discrepancy: the UI may show a spoofed identity until the next server interaction rejects it.
- **Location**: `apps/web/src/lib/token.ts:25-35`, `apps/web/src/providers/AuthProvider.tsx:27-46`
- **Suggestion**: This is acceptable as a performance trade-off if the server always verifies. Document that `parseJwt` is intentionally unverified and is only used for UI hints. Consider adding a comment to make this explicit. The real risk is if any authorization decisions are made client-side based on these claims.

---

### 4. Display Name Not Sanitized for XSS on Server Side
- **Severity**: medium
- **Description**: The `set_name` handler trims and length-limits the display name to 30 chars, but does not reject or sanitize HTML/script content. A user can set their name to `<img src=x onerror=alert(1)>` or similar payloads. The name is then broadcast to all clients via `user_renamed` and `user_joined` messages. React's JSX rendering escapes text content by default, so this is mitigated on the current web client. However, any future client (mobile app, admin dashboard, log viewer) that renders these names without escaping would be vulnerable to stored XSS.
- **Location**: `apps/server/src/ws/handler.ts:231-261`
- **Suggestion**: Add server-side validation to reject names containing HTML characters (`<`, `>`, `&`) or apply a strict allowlist (alphanumeric, spaces, common unicode). This provides defense-in-depth regardless of client rendering.

---

### 5. No Rate Limiting on `set_name` WebSocket Message
- **Severity**: low
- **Description**: The `blow` and `pop` message types are rate-limited via `checkRateLimit`, but `set_name` has no rate limiting. A malicious client could spam name changes at high frequency, causing excessive broadcast traffic to all room members and Redis pub/sub churn. This is a denial-of-service vector for the room.
- **Location**: `apps/server/src/ws/handler.ts:231-261`
- **Suggestion**: Add rate limiting to `set_name`, e.g., max 5 renames per minute per session.

---

### 6. JWT Token Stored in localStorage (XSS Exfiltration Risk)
- **Severity**: medium
- **Description**: The JWT access token is stored in `localStorage` under the key `bubbles_token`. If an XSS vulnerability exists anywhere in the application (or in a third-party script/dependency), the attacker can trivially read `localStorage.getItem('bubbles_token')` and exfiltrate the token for full account impersonation.
- **Location**: `apps/web/src/lib/token.ts:1-14`, `apps/web/src/stores/auth-store.ts:29`
- **Suggestion**: Store the token in an `httpOnly` cookie instead, so it is inaccessible to JavaScript. If cookies are not feasible (e.g., multi-origin), use `sessionStorage` (which limits exposure to the current tab) and ensure CSP headers are strict.

---

### 7. Silent JWT Verification Failure Allows Anonymous Escalation Confusion
- **Severity**: low
- **Description**: In the WebSocket `onOpen` handler, if JWT verification fails, the `catch` block is empty (`catch {}`). The connection silently degrades to anonymous. A user whose token has expired will see themselves connected but without their authenticated identity, with no error feedback. This is not a direct vulnerability but can confuse authorization state, especially if authenticated users expect their identity to persist.
- **Location**: `apps/server/src/ws/handler.ts:63-69`
- **Suggestion**: Send a server message (e.g., `{ type: 'error', data: { code: 'TOKEN_EXPIRED' } }`) after downgrading to anonymous so the client can prompt re-authentication.

---

### 8. Bubble Color Field Accepts Arbitrary Strings
- **Severity**: low
- **Description**: The `blow` handler accepts a `color` field from the client as `typeof color === 'string' ? color : '#87CEEB'`. This value is broadcast to all clients and rendered in the UI. While React escapes text in JSX, the color is used in `style` attributes (e.g., `backgroundColor`). An attacker could inject CSS expressions or excessively long strings. Modern browsers do not execute CSS expressions, but this is still unsanitized user input flowing into style attributes.
- **Location**: `apps/server/src/ws/handler.ts:161`
- **Suggestion**: Validate that color matches a hex pattern (`/^#[0-9a-fA-F]{6}$/`) or is from a predefined palette.

---

### 9. `redirect_uri` Controlled by Client in OAuth Flow
- **Severity**: medium
- **Description**: The `redirect_uri` passed to the OAuth provider is constructed from `window.location.origin` on the client side. If `jiun-api` does not validate the `redirect_uri` against an allowlist, an attacker could craft a malicious link with a tampered origin, causing the auth code to be sent to an attacker-controlled callback URL (open redirect leading to authorization code theft).
- **Location**: `apps/web/src/routes/PlacePage.tsx:61`, `apps/web/src/routes/LobbyPage.tsx:122-123`
- **Suggestion**: Verify that the upstream `jiun-api` `/auth/github` endpoint validates `redirect_uri` against a strict allowlist. The client-side construction is fine as long as the server enforces it. If not, this is a high-severity issue.

---

### 10. No `set_name` Authorization Check for Authenticated Users
- **Severity**: low
- **Description**: An authenticated user can use `set_name` to change their display name to anything, overriding the name from their JWT/profile. This allows authenticated users to impersonate others by choosing the same display name. There is no distinction in the broadcast message between authenticated and anonymous name changes.
- **Location**: `apps/server/src/ws/handler.ts:231-261`
- **Suggestion**: Consider restricting `set_name` to anonymous users only, or preserving the authenticated user's verified name. If authenticated users should be allowed to set custom names, at minimum include an `isAuthenticated` flag in the `user_renamed` broadcast so clients can indicate verified vs. custom names.

---

### Summary

| # | Finding | Severity |
|---|---------|----------|
| 1 | JWT in WebSocket query string | medium |
| 2 | No OAuth `state` parameter (CSRF) | high |
| 3 | Client-side JWT parsed without signature verification | medium |
| 4 | Display name not sanitized for XSS server-side | medium |
| 5 | No rate limit on `set_name` | low |
| 6 | JWT stored in localStorage | medium |
| 7 | Silent JWT failure on WS connect | low |
| 8 | Bubble color field unsanitized | low |
| 9 | Client-controlled `redirect_uri` | medium |
| 10 | Authenticated users can override verified name | low |

**Highest priority**: Finding #2 (OAuth CSRF) should be addressed before production use. Finding #1 (token in URL) and #6 (localStorage) are standard hardening items.
