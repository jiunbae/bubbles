# R01 launch-readiness improvement summary

## Outcome

Bubbles의 출시 전 고우선순위 폴리싱, 접근성, 실시간 기능 안정성, 멀티 인스턴스 일관성, 성능 및 CI 검증 게이트를 구현했다. 기존 사용자 소유 파일인 `.claude/`와 `.context/reviews/R10-*`는 수정하지 않았다.

## Product and UX

- 로비의 생성 CTA와 섹션 계층, 빈 상태, 통계 배너, 소유 방 중복 노출을 정리했다.
- 포커스 복귀 새로고침에서 기존 카드를 유지하고 실패 시 재시도 가능한 오류 상태를 제공한다.
- 모바일 비주얼 모드에 Blow/Pop 세그먼트 컨트롤과 Pop 안내를 추가했다.
- 공유 실패, 장소 생성 성공, 연결 상태를 한/영 번역과 함께 명확히 피드백한다.
- 색상 선택 버튼에 접근 가능한 이름과 선택 상태를 추가하고 겹치는 헤더 팝오버 상태를 정리했다.
- 문서 제목과 `<html lang>`이 현재 장소와 선택 언어에 맞게 동기화된다.
- Toast와 활동 로그의 접근성 및 상호작용 세부 동작을 개선했다.

## Functional reliability

- 브라우저가 만든 UUID를 방울 프로토콜에 포함하고 서버가 검증·재사용·발신자에게 확인 응답하도록 변경했다.
- 낙관적 방울 객체를 서버 권위 값과 동일 객체에서 조정해 시각적 깜빡임과 ID 불일치를 방지했다.
- 비주얼/스텔스 방울 생성을 하나의 factory와 Three.js 독립 만료 스케줄러로 통합했다.
- 동시 방울 상한 80개와 제한 피드백을 중앙에서 적용했다.
- 마일스톤 중복 집계와 초기 `room_state` 방울 만료 누락을 수정했다.
- 서버가 크기별 수명을 신뢰 가능한 범위로 제한한다.
- Redis 참여자 heartbeat/정리와 cross-pod cursor 전파를 보강했다.
- 카메라 배경이 검은 WebGL 장면에 가려지던 문제를 수정했다.
- Prometheus histogram의 누적 버킷 이중 집계를 수정하고 회귀 테스트를 추가했다.

## Engineering and performance

- Visual/Stealth 화면을 지연 로딩하고 Vite chunk 경계를 조정했다.
- 최종 `index.html`은 `vendor`만 preload하며 `three-core`와 `r3f`는 비주얼 모드 진입 전 로드하지 않는다.
- 초기 경로에서 Three/R3F 약 232 KB gzip 전송을 비주얼 모드 진입 시점으로 지연했고, 현재 선로드 JS는 약 119 KB gzip이다.
- R3F JSX에만 정확히 범위를 제한한 ESLint 예외를 추가하고 실제 lint 오류는 수정했다.
- 루트 test/typecheck 스크립트와 CI/deploy의 verify gate(typecheck, lint, test)를 추가했다.
- 불필요한 CSS font import와 중복 animation 정의를 제거했다.

## Verification

- `pnpm lint`: pass, 0 issues.
- `pnpm typecheck`: pass, web/server/shared 3 packages.
- `pnpm test`: pass, web 17 + server 29 = 46 tests; shared는 아직 테스트 파일이 없어 명시적으로 pass-with-no-tests.
- `pnpm build`: pass, server and production web.
- locale parity: pass, English/Korean 243 scalar keys match.
- `git diff --check`: pass.
- production preview: HTTP 200, only vendor modulepreload present.
- live runtime with MongoDB: health/ready, place creation, two WebSocket clients, room state, sender bubble acknowledgement, peer create/pop broadcast, persisted cumulative counters, graceful shutdown all verified.

## Remaining launch concerns

1. 실제 데스크톱/모바일 브라우저의 시각 회귀, 키보드 전 경로, 스크린 리더, 카메라 권한은 이번 환경에 in-app browser 실행 도구가 없어 자동화하지 못했다.
2. Three.js core는 약 690 KB raw/176 KB gzip으로 크지만 현재는 비주얼 모드 진입 시에만 로드된다. 더 줄이려면 Three/R3F 기능 축소 또는 별도 렌더링 전략이 필요하다.
3. Redis가 없는 단일 인스턴스 런타임은 검증했지만 실제 Redis를 사용한 multi-pod 장애/재접속/rolling deploy 검증은 별도 staging 환경이 필요하다.
4. 저장소에 Kubernetes 리소스·probe·preStop·ingress·rollback 구성은 없으므로 외부 IaC와 운영 runbook을 출시 전에 검증해야 한다.
5. GA4/AdSense가 동의 전 정적으로 로드된다. 대상 지역에 따라 consent management, 개인정보 처리방침, CSP 검토가 필요하다.
6. 장소 소유권이 불변 user id가 아니라 표시 이름 `createdBy`에 의존한다. 이름 변경/중복 시 소유 방 분류가 불안정할 수 있다.
7. shared 패키지에는 아직 직접 테스트가 없다. 프로토콜 회귀 테스트를 shared 수준에도 추가하는 것이 좋다.
8. Vite 빌드에서 Node의 `module.register()` deprecation 경고가 남아 있어 관련 플러그인 업데이트 추적이 필요하다.
