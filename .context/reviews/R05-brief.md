# Review Brief (R05)

- Branch: main (recent commits)
- Scope: Last 10 commits — major feature additions
- Changed files: 46
- Diff size: ~4000 lines

## Key Changes
1. **Anonymous user rename** — WebSocket `set_name` / `user_renamed` messages, UI for inline name editing
2. **jiun-api OAuth login** — GitHub OAuth via api.jiun.dev, AuthCallback exchange flow, JWT token verification
3. **Redis-backed state** — Cross-pod bubble/user sync via Redis pub/sub
4. **i18n** — react-i18next integration with en/ko locales
5. **Visual improvements** — Bubble transparency, ambient lighting, streetlamp components
6. **WebSocket reconnection** — Improved reconnect logic, graceful shutdown
7. **Dockerfile** — VITE_JIUN_API_URL build arg for OAuth config

## Focus Areas
- Security: OAuth flow, JWT handling, CORS, credential exposure
- Architecture: WebSocket message design, store patterns, Redis integration
- Performance: Bubble rendering, material cloning, physics simulation
- Code quality: Type safety, error handling, i18n completeness
