# R04 residual-risk reduction

## Goal

Reduce the remaining launch risks after the R03 production rollout: make `OWNER_ID_SECRET` rotatable without breaking place ownership, improve the recoverability and observability of the single-node Redis deployment without claiming false HA, and turn the measured lazy Three.js behavior plus key accessibility/privacy assumptions into executable release gates.

## Shared safety rules

- Never print, commit, or persist plaintext production credentials.
- Preserve user-owned `.claude/` and `.context/reviews/R10-*` files.
- Work only in the assigned paths and do not commit or push; the root agent reviews and integrates.
- Use `apply_patch` for edits and run focused tests.
- Do not weaken current secret, CSP, consent, readiness, or deployment guards.
- Do not describe multiple Redis pods on the same single node and RWO volume as high availability.

## Track A: versioned ownership migration

- Add optional `OWNER_ID_SECRET_PREVIOUS` support to the Bubbles server.
- Derive current and previous opaque owner IDs from the same authenticated or anonymous principal without exposing that principal.
- New places must always persist the current owner ID.
- Reads of a place matching the previous ID must preserve `isOwnedByCurrentUser` and lazily migrate the stored owner ID to current with a race-safe update.
- Preserve legacy display-name fallback only for records that have no owner ID.
- Add unit/route tests for current, previous, unrelated, anonymous, and lazy-migration paths; update environment and operations documentation.

## Track B: Redis recovery and observability

- Inspect the current external IaC Redis storage, backups, monitoring, and single-node topology in `/tmp/bubbles-r03-iac`.
- Implement the highest-confidence recovery/alerting improvement supported by existing conventions, such as backup freshness/failure alerting or a non-destructive restore verification job.
- Render dev/prod overlays and validate manifests.
- Document the remaining node/PVC failure boundary and a concrete restore drill/rollback path.

## Track C: web release regression gates

- Add a deterministic production-bundle verifier that fails if Three/R3F returns to the initial HTML preload or exceeds a measured gzip budget with small intentional headroom.
- Integrate the verifier into normal production web builds without creating a separate duplicate build.
- Add focused tests for the verifier when practical and document how to update budgets deliberately.
- Add static, automatable release checks for consent/analytics and accessible structure only where they provide new coverage; do not claim they replace real VoiceOver/NVDA, camera-permission, or Tag Assistant validation.

## Root integration and rollout

- Review all changes, run full lint/typecheck/test/build and rendered-IaC checks, then commit and push each repository intentionally.
- Perform a staged owner-key overlap rollout, verify old ownership matching and lazy migration, and remove the compromised key only when the data lifecycle makes that safe.
- Validate Redis jobs/alerts in the live cluster where possible.
- Use only the bundled in-app browser control skill for interactive browser verification; if its required tool is unavailable, report the irreducible manual acceptance step rather than substituting an unsupported automation stack.
