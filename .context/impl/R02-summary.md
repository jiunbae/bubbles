# R02 residual launch-readiness summary

## Outcome

R01에서 남긴 개인정보 동의, 안정적인 장소 소유권, shared 직접 테스트, Redis 기반 멀티 인스턴스 검증, 운영 계약, 배포 비밀값 가드와 런타임 버전 경계를 구현했다. 기존 사용자 소유 파일인 `.claude/`와 `.context/reviews/R10-*`는 수정하거나 커밋 대상에 포함하지 않았다.

## Privacy and accessibility

- 정적 HTML에서 GA4와 AdSense를 제거하고, 모든 선택 기능을 기본 거부한다.
- 접근 가능한 한/영 동의 배너, 설정 다이얼로그, 키보드 포커스 트랩/복귀, 언제든 재설정할 수 있는 Privacy 버튼과 `/privacy` 고지 페이지를 추가했다.
- 분석 동의 후에만 GA4 loader를 삽입하며, 철회 시 consent denied, loader 제거, 앱 이벤트 중단과 접근 가능한 `_ga*` 쿠키 정리를 시도한다.
- 광고는 `VITE_ADSENSE_ENABLED=true`인 빌드에서도 사용자가 별도로 동의해야 하며, 기본 빌드에서는 UI와 네트워크 로드를 비활성화한다.
- 분석에서 장소 이름, 표시 이름, OAuth query/hash, 원시 오류 메시지·stack, 사용자 생성 문서 제목을 제외했다. 경로와 오류 종류는 제한된 값만 전송한다.
- Google 공식 GA4 CSP 호스트만 Nginx 정책에 추가하고 AdSense/DoubleClick 호스트는 계속 차단한다.

## Stable ownership and cache safety

- 인증 계정의 JWT `sub` 또는 익명 서명 세션을 `OWNER_ID_SECRET`으로 HMAC-SHA-256 처리한 불투명 내부 소유자 ID를 새 장소에 저장한다.
- 원본 계정 ID, 세션 ID와 내부 owner ID는 API DTO에 노출하지 않고, 요청자별 `isOwnedByCurrentUser`만 반환한다.
- 기존 owner ID 없는 문서는 인증 사용자의 표시 이름 fallback으로만 호환한다. 새 문서는 표시 이름 변경이나 중복에 의존하지 않는다.
- `sub` 없는 JWT와 WebSocket ticket은 인증 사용자로 취급하지 않는다.
- 개인화된 `/places` 응답 전체에 `Cache-Control: private, no-store`와 `Vary: Authorization, Cookie`를 적용했다.
- shared 패키지에 직접 제약 테스트와 정상 build/test 스크립트를 추가했다.

## Operations and deployment hardening

- Compose에 AOF `everysec`와 영속 볼륨을 사용하는 Redis, 두 서버 replica, dependency health check, host port 3002/3003, graceful stop, 선택형 tunnel profile을 구성했다.
- 실제 MongoDB+Redis와 서로 다른 서버 프로세스의 두 WebSocket client로 global membership, room state, bubble create/pop, cursor relay와 API user count를 검증하는 `scripts/smoke-multipod.mjs`를 추가했다.
- 스모크 실패 경로는 fetch/WebSocket timeout과 `finally` teardown으로 socket, waiter, timer를 정리해 hang 없이 실패한다.
- 운영 문서에 liveness/readiness, preStop, termination grace, rolling strategy, PDB, Ingress, Redis 장애/내구성, smoke, rollout/rollback 계약을 기록하고 저장소 소유 범위와 외부 IaC 책임을 구분했다.
- 배포 workflow는 외부 IaC의 ConfigMap 비밀값을 거부하고, dev/prod 렌더 결과에서 workload가 참조하는 Secret 이름과 동일한 SealedSecret/ExternalSecret이 필수 3개 키를 제공할 때만 이미지 빌드와 tag 업데이트를 진행한다. 검증한 IaC revision을 고정해 변경 경쟁 시 push가 실패하며, mutable `latest` 대신 commit SHA 이미지 태그만 발행한다.
- `.env.example`, 지원 Node 22/24와 `.nvmrc`를 추가했다. Node 26.5의 경고는 `@tailwindcss/node`의 deprecated `module.register()` 경로로 추적했으며 지원 범위에서는 제외했다.
- Nginx에 CSP, clickjacking/MIME/referrer/permissions 보안 헤더와 SPA no-cache를 추가했다.

## Verification

- Node 24 `pnpm lint`: pass.
- Node 24 `pnpm typecheck`: pass, server/web/shared.
- `pnpm test`: pass, server 39 + web 28 + shared 4 + rendered-IaC validator 9 = 80 tests.
- Node 24 `pnpm build`: pass, server and production web.
- locale parity: pass, English/Korean 285 scalar keys match.
- `git diff --check`: pass.
- Compose config, workflow/Kubernetes YAML parse, Node script syntax, Nginx `-t`: pass.
- production HTML: no static GA4/AdSense tag; only vendor preload, no Three/R3F preload.
- two-process MongoDB+Redis runtime: readiness, global membership, cross-pod bubble/cursor/pop relay and global user count passed.
- graceful shutdown: terminating replica became unready and its WebSocket received close code `1012`; remaining replica stayed ready.
- Compose two-replica smoke: pass. Deliberate unreachable-server smoke: immediate exit 1 without hang.
- repository and staged-content security scans: no tracked real `.env`, private key, known credential prefix or credential-bearing database URL detected.

## Remaining external release blockers and accepted trade-offs

1. Read-only external `jiunbae/IaC` audit found real application secrets committed in a Bubbles ConfigMap. They must be migrated to a matching Bubbles SealedSecret/ExternalSecret and the exposed JWT/session secrets must be rotated. JWT rotation must be coordinated with `jiun-api`. This repository now intentionally blocks deployment until migration, but external repository/cluster mutation requires explicit authority.
2. External IaC has no Bubbles server PDB. Its Redis is a single-replica `Recreate` workload with PVC/AOF/backups, not HA. Add a PDB and make an explicit Redis HA/managed-service availability decision before production SLA claims.
3. The Gitea pull mirror did not advance from `3dc41dc` after GitHub push and manual mirror-sync request, so Gitea Actions cannot deploy current commits until mirror credentials/synchronization are repaired.
4. The built-in preference UI is not a Google-certified CMP/IAB TCF implementation. Keep AdSense disabled for EEA/UK/Switzerland and any other applicable region until a certified CMP, deployment-specific privacy policy and legal review are complete.
5. Anonymous ownership is intentionally browser-cookie/device scoped. Rotating `OWNER_ID_SECRET` changes derived ownership IDs and therefore requires migration or acceptance of lost matching.
6. Three.js core remains about 690 KB raw/177 KB gzip, but R01 keeps it out of initial HTML preload and loads it only on visual-mode entry.
7. Automated code, HTTP, WebSocket and configuration checks passed, but final staging acceptance still needs real desktop/mobile visual regression, full keyboard/screen-reader review, camera permission paths, GA Tag Assistant/network validation and a rollout through the production Ingress.
