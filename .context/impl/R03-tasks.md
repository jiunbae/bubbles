# R03 external launch blockers and final validation

## Goal

Resolve the six explicitly authorized residual concerns after commit `27913d9`: external IaC secret migration and coordinated rotation, Gitea mirror/credential repair, PDB and Redis availability, real browser validation, and a measured Three.js optimization. Preserve user-owned `.claude/` and `.context/reviews/R10-*` files.

## Shared safety rules

- Never print, commit, or include real secret values in reports, diffs, process output, screenshots, or shell history.
- Work in bounded scopes and do not commit or push; the root agent reviews and performs final external mutations.
- Prefer sealed/encrypted or external secret resources and immutable references.
- Treat production credential rotation, mirror recreation, cluster apply, and history rewriting as high-impact actions: prepare and validate first, then report exact root steps.
- Use `apply_patch` for repository edits and run focused verification.

## Track A: external IaC and availability

- Inspect `jiunbae/IaC` and `jiunbae/jiun-api` using isolated local clones.
- Remove Bubbles application secrets from ConfigMaps and create environment-correct SealedSecret/ExternalSecret wiring without exposing plaintext.
- Design a coordinated JWT/SESSION/OWNER rotation with `jiun-api`, preserving compatibility or documenting an atomic rollout.
- Add a Bubbles server PDB.
- Improve Redis availability using the least-complex architecture supported by the existing cluster, or produce a concrete reasoned limitation if storage/topology makes safe HA impossible.
- Render dev/prod overlays and run the application validator.

## Track B: Gitea mirror and credentials

- Diagnose why the Gitea pull mirror reports successful sync but remains at `3dc41dc`.
- Inspect safe API metadata/logs without exposing credentials.
- Determine the least-destructive repair and whether the mirror can be reconfigured rather than recreated.
- Prepare migration of the local remote from an embedded token to a credential helper and identify required token rotation scope.
- Do not delete/recreate a repository or rotate a credential without root review.

## Track C: Three.js performance

- Measure the current production chunk graph and identify why `three-core` is about 177 KB gzip.
- Implement only a high-confidence reduction that preserves visual mode; do not replace the renderer or remove product features.
- Keep Three/R3F out of the initial HTML preload.
- Verify build, relevant tests, and report before/after transfer sizes and trade-offs.

## Root integration and browser validation

- Use the in-app browser against local and staging targets for desktop/mobile layout, keyboard paths, accessible roles/names, camera permission behavior, privacy consent, and analytics network behavior.
- Run repository and history security audits, validate external rendered manifests, and coordinate safe external changes.
- Update `R03-summary.md` with completed changes, measurements, remaining limitations, and rollback guidance.
