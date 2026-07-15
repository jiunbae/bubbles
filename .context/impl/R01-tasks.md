# R01 launch-readiness improvement

## Goal

Bring Bubbles closer to a professional launch by finding and implementing high-impact polish, UI/UX/accessibility, functional reliability, and engineering/performance improvements. Preserve unrelated untracked user files under `.claude/` and `.context/reviews/R10-*`.

## Current baseline (2026-07-15)

- `pnpm build`: passes, with a CSS `@import` ordering warning and a `three-core` chunk around 690 kB.
- Web tests: 16 pass.
- Server tests: 26 pass.
- Shared `bun test`: exits 1 because no tests exist.
- `pnpm lint`: fails with 281 errors and 5 warnings. Most are false-positive `react/no-unknown-property` reports for R3F JSX, but there are genuine unused-code, accessibility, empty-catch, hook-dependency, and typing issues.
- Recent review context: `.context/reviews/R09-comprehensive.md`, `R10-merged.md`, `R10-architecture-reviewer.md`, `R10-performance-reviewer.md`, and `R08-ux-designer.md`. Verify all claims against current code because many older findings may already be fixed.

## Parallel audit scopes

### product-polish

Inspect the current lobby and place experience, CSS, i18n, responsive layout, visual hierarchy, states, microcopy, and interaction feedback. Identify 3-6 high-value changes that are feasible in this pass. Prefer launch-blocking polish over speculative new product features. Do not edit files during audit.

### functional-accessibility

Inspect current frontend and server flows for real correctness issues, missing error/empty/loading states, keyboard/screen-reader behavior, focus management, async races, and test gaps. Reconcile lint findings with actual issues. Identify exact fixes and verification. Do not edit files during audit.

### architecture-performance

Inspect build/lint/test tooling, bundle splitting, WebGL/camera runtime choices, React/store subscriptions, network reliability, deployment config, server defaults, and operational launch risks. Identify high-confidence changes with explicit tradeoffs. Do not edit files during audit.

## Audit output

Return a concise prioritized list with severity, exact file references, rationale, and a proposed bounded implementation scope. Flag overlap with the other scopes. Do not commit and do not modify source files during this first wave.
