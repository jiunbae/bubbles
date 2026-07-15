# R02 residual launch concerns

## Goal

Resolve the remaining launch concerns from R01 after commit `1a44cd2`: privacy consent, stable room ownership, shared-package tests, Redis multi-pod verification support, deployment operations contract, and build deprecation diagnosis. Preserve user-owned `.claude/` and `.context/reviews/R10-*` files.

## Shared rules

- Work directly in the shared checkout but only in the assigned files/scope.
- Do not commit or push.
- Do not edit files owned by another R02 task unless strictly necessary; message the root agent before overlap.
- Use `apply_patch` for edits and run focused checks.
- Prefer backward-compatible data/API changes.
- Record material decisions and remaining blockers in the final response.

## Task A: privacy-accessibility

- Remove unconditional GA4 and AdSense loading from `apps/web/index.html`.
- Add an accessible, localized privacy/consent experience with default-deny optional analytics/advertising and a persistent way to revisit settings.
- Load third-party scripts only after the corresponding opt-in; ensure analytics and ad components degrade cleanly before consent or when blocked.
- Add focused tests for pure consent behavior where practical.
- Scope: web consent/privacy components, analytics/ads integration, App/lobby wiring, locales, index HTML.
- Do not edit server ownership, Docker/Kubernetes, or operations docs.

## Task B: stable-ownership-shared-tests

- Replace new-room ownership based solely on display name with a stable principal identifier while retaining `createdBy` for display and backward compatibility for old documents.
- Thread the stable owner identifier through server DTO/shared types and lobby ownership detection without exposing secrets.
- Cover authenticated and anonymous identity behavior with focused tests.
- Add meaningful direct tests in `packages/shared` and remove the need to rely only on `--pass-with-no-tests` if feasible.
- Scope: server auth/place routes/tests, shared types/tests/package script, web ownership filtering and identity helpers.
- Do not edit privacy UI, Docker/Kubernetes, or operations docs.

## Task C: operations-runtime

- Audit actual `docker-compose.yml`, `.gitea/workflows/deploy.yml`, README and the local Kubernetes Nginx config against the R01 operational concerns.
- Add Redis to the local production-like compose topology with health checks and wire it to the server so multi-pod behavior is reproducible.
- Add a concise production operations contract/runbook covering probes, preStop, termination grace, rolling strategy, Redis durability/failure behavior, rollback and a repeatable smoke procedure. Clearly distinguish external IaC responsibilities.
- Diagnose the Vite/Node `module.register()` deprecation warning and implement a high-confidence fix or document the exact version/runtime boundary if it is external.
- Scope: compose, operations docs/scripts, README/build metadata where needed. Avoid web privacy/ownership source.

## Root verification

- Integrate all changes and run lint, typecheck, tests, production build, locale parity, diff checks.
- Run two server processes against MongoDB + Redis, connect clients to different pods, and verify room state, create/pop/cursor relay, global membership, one-pod shutdown behavior, and graceful close/reconnect contract.
- Verify production preview and third-party scripts are absent before consent using HTTP/build artifact inspection.
- Update `R02-summary.md`, then create a second scoped commit and push after verification.
