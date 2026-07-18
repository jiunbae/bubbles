# R04 residual-risk reduction summary

## Outcome

The remaining launch risks were reduced with executable safeguards and live recovery checks rather than documentation alone. Production and development are healthy on the new owner-rotation server and bundle-gated web build. User-owned `.claude/` and `.context/reviews/R10-*` files were not staged or modified.

## Owner-ID key revocation

- The server accepts an optional `OWNER_ID_SECRET_PREVIOUS`, derives current and previous opaque IDs from the same request principal, and keeps the previous ID out of serialized user data.
- New places always persist the current ID. Reads matching the previous ID retain ownership and lazily migrate with an `_id + previous ownerId` compare-and-set.
- Display-name fallback is limited to records where `ownerId` is absent or null.
- The deploy validator rejects `OWNER_ID_SECRET_PREVIOUS` in ConfigMaps.
- Immediately before rotation, both prod and dev `places` collections contained zero documents. Independent random owner-ID keys were generated for each cluster, piped directly into `kubeseal`, and never stored as plaintext.
- The historical owner key was removed without an overlap key. Live Secrets contain only `JWT_SECRET`, `SESSION_SECRET`, and the new `OWNER_ID_SECRET`; prod and dev owner keys are distinct from each other and from the exposed historical value.

## Redis recovery proof

- Redis backups now use `redis-cli --rdb`, `redis-check-rdb`, gzip verification, per-Pod temporary paths, and an atomic final rename. The backup Job no longer mounts the live Redis PVC.
- A daily local restore verifier and a weekly production NFS restore verifier boot isolated Redis instances from the newest backup on localhost and an `emptyDir`.
- Prod local backup, local restore, offsite sync, and offsite restore Jobs all completed successfully. Dev local backup and restore also completed successfully.
- Four Grafana rules are deployed for Redis availability, recovery Job failures, daily freshness, and weekly offsite proof. New CronJobs are age-gated so they are not falsely stale before their first scheduled window. Grafana reports all four rules provisioned and no active Bubbles Redis alert.
- The remaining physical boundary is explicit: each cluster has one node and a local-path RWO live PVC. Prod NFS provides an off-node recovery copy, not automatic failover or immutable multi-region backup.

## Web, privacy, accessibility, and camera guards

- Every production web build verifies that Three/R3F/VisualMode is absent from initial modulepreload, optional analytics/advertising loaders are absent from static HTML, document language/title/viewport remain usable, and user zoom is not disabled.
- Gzip budgets are 140,000 B for Three, 56,000 B for R3F, 18,000 B for VisualMode, and 210,000 B combined. The Node 22 container build measured about 134 KB, 52 KB, 14 KB, and 200 KB respectively; the only initial preload was the vendor chunk.
- Camera failures now distinguish denied/security-blocked permission, another application using the camera, constraint failure, no device, unexpected disconnection, and legacy browser error names. A failed front-camera fallback preserves its real failure reason.
- Static gates and unit tests do not replace real VoiceOver/NVDA, mobile/desktop visual acceptance, OS camera permission UI, or Google Tag Assistant. Those remain staging promotion checks because the required in-app browser control tool was not available in this session.

## Repository and delivery hygiene

- The Gitea mirror tracks the new GitHub main and Actions built both server and web images successfully. A concurrent IaC update correctly caused the pinned manifest push to fail fast; the image tags were then applied manually on top of the latest IaC revision without overwriting unrelated changes.
- Token-bearing Git URLs remain removed. An active repository-scoped credential is stored per path in macOS Keychain, all three affected Gitea remotes work non-interactively, and the revoked administrator token is marked revoked in Bitwarden.
- High-confidence key, private-key, credential URL, and tracked sensitive-file scans found no new secret in either staged change set. Test-only secret strings are placeholders.

## Verification

- Node 24 lint, typecheck, full tests, production build, formatting, and `git diff --check`: pass.
- Server tests: 49 pass. Web tests after camera coverage: 38 pass. Shared tests: 4 pass. Release-script tests and rendered-IaC validator: pass.
- Node 22 production web Docker build and bundle release gates: pass.
- Prod/dev rendered Secret contracts and Kubernetes client dry-run: pass.
- Prod/dev Argo applications, deployments, and SealedSecrets: synced and healthy after the owner-key rollout.
