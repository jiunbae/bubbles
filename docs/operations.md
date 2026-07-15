# Production operations contract

This document separates behavior guaranteed by this repository from infrastructure that must be
enforced in the external `jiunbae/IaC` repository. Treat the external checks below as release gates,
not as assumptions.

## Repository-owned behavior

- `GET /health` is a process liveness endpoint. It stays `200` while the process can serve requests.
- `GET /health/ready` checks MongoDB and, when `REDIS_URL` is configured, Redis. It returns `503`
  when a dependency is unavailable or graceful shutdown has started.
- On `SIGTERM`/`SIGINT`, the server first becomes unready, removes its sessions from Redis, closes
  WebSockets with code `1012`, waits two seconds for close frames, then closes Redis and MongoDB.
- The web client reconnects after a `1012` close with 200–1500 ms jitter. Other failures use bounded
  exponential backoff.
- `docker-compose.yml` runs MongoDB, persistent Redis, two server replicas, Nginx, and the optional
  Cloudflare tunnel. Host ports `3002` and `3003` expose the two server replicas for cross-pod tests.
- The checked-in Kubernetes tree owns only the web Nginx ConfigMap. It does **not** define the
  Deployment, Service, Ingress, Redis, disruption budget, or Argo CD application.

## External IaC release gate

Before production rollout, verify the rendered manifests in `jiunbae/IaC`, not only overlay source
files. The deployment pipeline updates immutable image tags there but has no Kubernetes credentials
and therefore cannot validate the resulting rollout itself.

The deploy workflow fails closed if a Bubbles ConfigMap contains `JWT_SECRET`, `SESSION_SECRET`, or
`OWNER_ID_SECRET`. It renders the dev and prod Kustomize overlays separately with a pinned kubectl,
then structurally parses each rendered environment. The actual `bubbles-server` workload must use a
non-optional `envFrom.secretRef` whose name and namespace match a rendered SealedSecret/ExternalSecret
output containing all three keys, or explicitly map all three required environment variables through
matching `secretKeyRef` keys. A resource from another environment/namespace, a dangling reference,
an incomplete key mapping, or an unrelated workload/registry secret cannot satisfy the gate.
Rendered manifests stream directly from Kustomize to the validator and are not written to the CI
workspace, avoiding plaintext Secret material at rest in build artifacts.
Secret values must never be committed to ConfigMaps or printed by CI. An external IaC overlay that
still uses ConfigMap secret keys must be migrated before the next deployment can proceed.

Required server workload baseline:

| Control           | Required contract                                                                |
| ----------------- | -------------------------------------------------------------------------------- |
| Replicas          | At least 2 during normal operation                                               |
| Startup probe     | `GET /health`; confirm the process can serve before liveness takes over          |
| Liveness probe    | `GET /health`; do not use dependency readiness as liveness                       |
| Readiness probe   | `GET /health/ready`; remove a pod before termination or dependency isolation     |
| `preStop`         | Sleep 5 seconds so endpoint removal propagates before `SIGTERM`                  |
| Termination grace | At least 20 seconds (5 s preStop + 2 s application drain + margin)               |
| Rolling strategy  | `maxSurge: 1`, `maxUnavailable: 0`                                               |
| Disruptions       | A PDB that keeps at least one server pod available                               |
| Ingress           | WebSocket upgrade enabled; idle timeout above the 20 s client heartbeat interval |

The Ingress must strip `/api` before routing to the server, preserve `/ws/place/...`, and route both
to the server Service. Confirm this explicitly because the Kubernetes Nginx ConfigMap serves only
the SPA and intentionally has no API/WebSocket proxy.

Also verify resource requests/limits, topology spread or anti-affinity, alerting on readiness and
restart rate, and Argo CD sync/health behavior. These are external IaC responsibilities and cannot
be enforced from this repository.

The read-only R02 audit of the available external IaC checkout found that replicas, rolling strategy,
probes, 5-second preStop, 30-second termination grace, resource requests/limits, and API/WS Ingress
routing already match this baseline. Remaining external blockers were: application secrets stored in
a ConfigMap with only an optional Secret reference and no matching Bubbles SealedSecret/ExternalSecret,
no server PDB, and a single-replica `Recreate` Redis deployment. Redis has PVC/AOF and backup jobs but
not high availability. Re-check rendered manifests because the image-tag workflow does not sync the
Nginx ConfigMap or any other application-repository manifest into external IaC.

## Privacy and advertising release gate

Analytics uses basic consent mode: the GA tag is not loaded and analytics storage remains denied
until the user opts in. Validate the built HTML and a fresh browser profile on every release so no
analytics request occurs before that choice. The default CSP allowlists the current GA script and
collection hosts, but a vendor or regional endpoint change must be reviewed and updated deliberately
in both Nginx configurations and the external IaC copy; do not replace it with a broad wildcard.
Disable GA4 Enhanced Measurement's browser-history page-change tracking so it cannot bypass the
application's explicit sanitized `page_view` events. Confirm this setting with Tag Assistant and a
network trace covering lobby, room, and auth-callback navigation before release.

The built-in preference UI is not a Google-certified CMP and does not provide an IAB TCF consent
string. AdSense must remain disabled for users in the EEA, UK, and Switzerland until a
Google-certified CMP/IAB TCF integration is configured and validated. A custom advertising opt-in
alone is not sufficient for those regions. The production release owner must verify the geographic
policy, consent withdrawal, privacy-policy links, and network requests before enabling ads.
The default CSP intentionally has `frame-src 'none'` and no AdSense hosts, so enabling AdSense also
requires a narrowly scoped CSP change in both checked-in Nginx configurations plus external IaC sync.

## Redis contract and failure behavior

Local Compose uses Redis 7 with AOF (`appendfsync everysec`) and a named volume. This is suitable for
production-like testing, but can still lose roughly the last second of writes during abrupt host
failure.

Production Redis must provide authentication/TLS as appropriate, durable storage, backups, and an
HA/failover policy in external IaC or a managed service. Bubbles uses Redis for:

- cross-pod Pub/Sub relay;
- active room member and bubble hashes;
- single-use WebSocket tickets.

When configured Redis becomes unavailable, readiness fails so new traffic should stop reaching the
pod. Existing sockets may still exchange local-pod events, but cross-pod convergence and shared
tickets are not guaranteed. Alert immediately, avoid rolling another workload during the outage,
restore Redis, then drain/restart server pods so clients rebuild presence. Active bubble state is
ephemeral and may be lost after a full Redis data loss.

Keep `OWNER_ID_SECRET` stable and separate from session/JWT secrets in production. The server has a
backward-compatible `SESSION_SECRET` fallback, but changing the effective owner-ID secret changes
derived opaque owner identifiers. Rotate it only with an ownership migration or an explicit plan to
accept loss of legacy owner matching.

## Local production-like smoke test

Create `.env` from `.env.example`, use development-only secrets, and start the topology:

```bash
docker compose up --build --wait
docker compose ps
```

The Cloudflare tunnel is excluded by default. Start it only when a token is configured, using
`docker compose --profile tunnel up --build --wait`.

Compose starts two server replicas on ports `3002` and `3003`. Run the deterministic cross-pod smoke:

```bash
bun scripts/smoke-multipod.mjs
curl --fail http://localhost:8080/
```

The script verifies MongoDB/Redis readiness, global membership, bubble create/pop relay, cursor
relay, and the global API user count across different server processes.

To exercise graceful termination, keep the browser open, identify one container name with
`docker compose ps server`, then run `docker stop --timeout 15 <container-name>` for only that replica.
The acceptance criteria are: readiness changes before exit, the connected socket receives close code
`1012`, the client reconnects through the remaining healthy backend, and the room remains usable.
Container logs must not show forced termination. This final reconnect path must be repeated in staging
through the real Ingress because direct host ports intentionally bypass load balancing.

When finished:

```bash
docker compose down
```

Use `docker compose down --volumes` only when intentionally deleting local MongoDB and Redis data.

## Rollout and rollback

1. Record the currently deployed server and web image SHAs.
2. Run the local smoke test, then verify the external IaC release gate above.
3. Merge/push only immutable SHA tags; do not deploy `latest`.
4. Watch Argo CD sync plus Deployment availability, readiness, WebSocket reconnects, error rate, and
   Redis/MongoDB health through the full rollout.
5. If acceptance checks fail, revert the IaC image-tag commit to the recorded pair of SHAs and wait
   for Argo CD plus Kubernetes rollout completion.
6. Re-run health, lobby/API, and two-client WebSocket smoke checks after rollback.

Application data changes must remain backward-compatible across adjacent releases. If a future
release introduces an irreversible migration, it needs a separate backup/restore and rollback plan.

## Build-runtime boundary

The production web build is pinned to Node 22 in CI and Docker. Node 24 is also supported. A traced
build on Node 26.5.0 reports `DEP0205` from `@tailwindcss/node@4.2.2`, which calls the now-deprecated
`module.register()` while the Tailwind Vite plugin loads. The same Vite 6.4.1/Tailwind 4.2.2 build
completes on Node 24.13.0 without the warning; Node 25.9.0 also loads the config without it.

This is an upstream Tailwind/Node 26 compatibility boundary, not application code. `.nvmrc` and the
root `engines` field constrain supported builds to Node 22/24. Revisit the constraint after Tailwind
replaces `module.register()` with `module.registerHooks()` and a traced Node 26 build is clean.
