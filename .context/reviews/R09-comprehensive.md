# R09 Comprehensive Review — P1-P3 Feature Batch

Reviewer: Claude Opus 4.6 | Date: 2025-03-24

---

## 1. Missing i18n Key: `lobby.globalStats`

- **Severity**: critical
- **Type**: i18n
- **Location**: `apps/web/src/components/lobby/GlobalStatsBanner.tsx:27`
- **Description**: `t('lobby.globalStats', { bubbles, visitors })` is called but the key `lobby.globalStats` does not exist in either `en.json` or `ko.json`. This will render the raw key string `"lobby.globalStats"` to users instead of a meaningful sentence.
- **Fix**: Add the key to both locale files:
  - `en.json`: `"globalStats": "{{bubbles}} bubbles blown by {{visitors}} visitors"`
  - `ko.json`: `"globalStats": "방문자 {{visitors}}명이 비눗방울 {{bubbles}}개를 만들었어요"`

## 2. Missing i18n Keys: `lobby.createPlaceButton` and `lobby.createPlacePrompt`

- **Severity**: critical
- **Type**: i18n
- **Location**: `apps/web/src/components/lobby/CreatePlaceForm.tsx:54,57`
- **Description**: `t('lobby.createPlaceButton')` and `t('lobby.createPlacePrompt')` are used but neither key exists in `en.json` or `ko.json`. The collapsed CTA button will show raw key strings.
- **Fix**: Add to both locale files:
  - `en.json`: `"createPlaceButton": "Create a new place"`, `"createPlacePrompt": "Start your own bubble room"`
  - `ko.json`: `"createPlaceButton": "새 장소 만들기"`, `"createPlacePrompt": "나만의 방울 공간을 만들어보세요"`

## 3. Missing i18n Keys in PlacePage (with fallbacks)

- **Severity**: low
- **Type**: i18n
- **Location**: `apps/web/src/routes/PlacePage.tsx:186,257,265,273,338`
- **Description**: Multiple `t()` calls use inline fallback strings (`t('place.changeColor', 'Change bubble color')`, `place.switchToPop`, `place.switchToBlow`, `place.blowMode`, `place.popMode`, `place.muteSound`, `place.unmuteSound`). These keys are missing from both locale files. The English fallback works, but Korean users will see English text.
- **Fix**: Add all these keys to `en.json` and `ko.json` under the `place` namespace. There are 7 missing keys total.

## 4. `useAnimatedCount` Always Starts From Zero

- **Severity**: medium
- **Type**: bug
- **Location**: `apps/web/src/hooks/useAnimatedCount.ts:8,17-28`
- **Description**: The hook always animates from 0 to `target`. When `GlobalStatsBanner` re-renders because `places` changed (e.g., a new bubble increments `totalBubbles` from 500 to 501), the counter animates from 0 to 501 instead of from 500 to 501. This causes a jarring full-reset animation on every store update.
- **Fix**: Track the previous target in a ref and animate from `previousTarget` to `target` instead of always from 0. Example:
  ```ts
  const fromRef = useRef(0);
  // In the effect: animate from fromRef.current to target
  // On effect cleanup: fromRef.current = target;
  ```

## 5. Milestone Counter Only Counts Remote Bubbles

- **Severity**: medium
- **Type**: bug
- **Location**: `apps/web/src/providers/WebSocketProvider.tsx:43,73-85`
- **Description**: `totalBubbleCountRef` is only incremented in the `bubble_created` handler (remote bubbles). Locally-blown bubbles never increment this counter, so milestones will only fire based on other users' activity. If a solo user blows 100 bubbles, the milestone toast never appears.
- **Fix**: Also increment `totalBubbleCountRef` when the local user spawns a bubble (either in `bubble-factory.ts` via a callback, or by also counting existing bubbles in `room_state` and tracking based on store size changes).

## 6. Milestone Counter Resets on Room Join But Not on Reconnect

- **Severity**: low
- **Type**: bug
- **Location**: `apps/web/src/providers/WebSocketProvider.tsx:60-61`
- **Description**: `totalBubbleCountRef` is reset to 0 on `room_state`, but the milestone threshold set is also cleared. If a user reconnects (WebSocket drops and reconnects), they'll see milestone toasts again for thresholds already shown in the same session.
- **Fix**: Consider persisting `shownMilestonesRef` per placeId in sessionStorage, or only reset on actual place navigation (not reconnect).

## 7. InviteBanner z-index Clash with SizeSelector and HelpButton

- **Severity**: medium
- **Type**: ux
- **Location**: `apps/web/src/components/shared/InviteBanner.tsx:37` vs `apps/web/src/components/visual/VisualMode.tsx:35,198`
- **Description**: `InviteBanner` uses `z-40` (Tailwind = 40). `SizeSelector` and `HelpButton` both use inline `zIndex: 10000`. While the InviteBanner won't overlap the 3D controls, if a future component uses `z-50`, there's an inconsistent z-index strategy — some use Tailwind classes (40, 50) and some use raw `10000`. This is fragile.
- **Fix**: Establish a z-index scale in Tailwind config or a constants file. For now, the InviteBanner should use a high enough z-index to not be obscured by the 3D canvas overlay. The current `z-40` may be rendered behind the Canvas if a stacking context is created.

## 8. OnboardingOverlay Uses `position: absolute` Instead of `fixed`

- **Severity**: medium
- **Type**: ux
- **Location**: `apps/web/src/components/visual/VisualMode.tsx:122-123`
- **Description**: The `OnboardingOverlay` uses `position: 'absolute'` with `inset: 0`. Its parent is the VisualMode wrapper div which has `position: 'relative'`. This means the overlay only covers the canvas area, not the header. If the user scrolls or the header is visible, the overlay won't dim the full viewport. This is likely intentional for the canvas, but the overlay `zIndex: 50` is vastly lower than the `SizeSelector` and `HelpButton` at `10000`, meaning those controls will render on top of the overlay.
- **Fix**: Either raise the overlay z-index above 10000 (e.g., 10001), or lower the controls below 50 when the overlay is visible. The help button and size selector being clickable while the overlay is shown creates confusion.

## 9. Color Picker Dropdown Doesn't Close on Outside Click

- **Severity**: low
- **Type**: ux
- **Location**: `apps/web/src/routes/PlacePage.tsx:181-206`
- **Description**: The color picker dropdown (`showColorPicker` state) opens on button click but has no outside-click handler to close it. The only way to close it is to click a color or toggle the button again. This is inconsistent with the user dropdown pattern.
- **Fix**: Add a click-outside listener (e.g., using a `useRef` + `useEffect` with `mousedown` listener on `document`) to close the dropdown when clicking elsewhere.

## 10. `handleShare` Clipboard Fallback Can Throw

- **Severity**: low
- **Type**: bug
- **Location**: `apps/web/src/routes/PlacePage.tsx:76-78`
- **Description**: In the `catch` block of `handleShare`, `navigator.clipboard.writeText(url)` is called as a fallback. But if the original error was a clipboard permission denial (not a share API failure), this fallback will also throw and the error is unhandled (no try-catch around the fallback).
- **Fix**: Wrap the fallback `clipboard.writeText` in its own try-catch.

## 11. `hoveredId` State in BubbleInstances Triggers Re-renders

- **Severity**: medium
- **Type**: performance
- **Location**: `apps/web/src/components/visual/BubbleInstances.tsx:49,379`
- **Description**: `setHoveredId(newId)` in `handlePointerMove` causes a React re-render of the entire `BubbleInstances` component every time the user moves their mouse over a different bubble (or from bubble to empty space). This triggers React reconciliation including the `<Html>` tooltip, which is expensive. The `hoveredIdRef` is already tracked — but the state is still set to force a render for the tooltip.
- **Fix**: This is somewhat unavoidable if you want to show the tooltip via React. Consider using a separate lightweight component for the tooltip that subscribes only to the hovered ID, preventing the entire BubbleInstances from re-rendering. Alternatively, use R3F's `Html` with a ref-based approach.

## 12. `navigator.vibrate` Call Without Feature Check

- **Severity**: low
- **Type**: bug
- **Location**: `apps/web/src/components/visual/BubbleInstances.tsx:363`
- **Description**: `navigator.vibrate?.(10)` uses optional chaining which is correct and won't crash. However, on iOS Safari, `navigator.vibrate` does not exist at all, so the haptic feedback simply does nothing on iPhones. This is not a bug per se, but worth noting there's no iOS haptic alternative.
- **Fix**: No immediate fix needed. Document that haptics only work on Android/Chrome. Consider using the experimental `navigator.vibrate` or a Web Haptics API polyfill for iOS in the future.

## 13. BubbleControls Text Not Internationalized

- **Severity**: medium
- **Type**: i18n
- **Location**: `apps/web/src/components/visual/BubbleControls.tsx:103,139`
- **Description**: Hardcoded English strings: `"${bubbleCount} bubbles floating"`, `"Hold button or press Space"`, `"🫧 Blowing..."`, and `"🫧 Blow"` are not wrapped in `t()` calls. Korean users will see English text in the blow controls.
- **Fix**: Add `useTranslation()` to the component and create corresponding i18n keys.

## 14. `useAnimatedCount` Cleanup Race Condition

- **Severity**: low
- **Type**: bug
- **Location**: `apps/web/src/hooks/useAnimatedCount.ts:32-34`
- **Description**: The cleanup function checks `if (rafRef.current)` but `rafRef.current` is initialized to `0`, which is falsy. If `requestAnimationFrame` returns `0` as a valid handle (unlikely but spec-legal), the cancel won't fire. More practically, if `target` changes to `0` during an animation, the effect sets `setValue(0)` and returns early without cancelling the in-flight rAF from the previous effect invocation (because React runs cleanup before the new effect, so the previous rAF is cancelled — this is actually fine due to React's cleanup ordering). No real bug here, just a minor code smell.
- **Fix**: Initialize `rafRef` to `-1` or use a `null` sentinel instead of `0`.

## 15. InviteBanner `slideUp` Animation Defined in Inline `<style>` Tag

- **Severity**: low
- **Type**: performance
- **Location**: `apps/web/src/components/shared/InviteBanner.tsx:59-64`
- **Description**: A `<style>` tag is injected into the DOM every time the `InviteBanner` becomes visible. This is a minor perf issue (style recalculation) and is an unconventional pattern in a Tailwind project. It also creates a global `@keyframes slideUp` that could clash with other animations of the same name.
- **Fix**: Move the keyframes to `bubble-loader.css` or a shared CSS file, or use Tailwind's `@keyframes` configuration in `tailwind.config`.

## 16. `myRooms` Filter Uses `user.name` Instead of `user.id`

- **Severity**: high
- **Type**: bug
- **Location**: `apps/web/src/routes/LobbyPage.tsx:62`
- **Description**: `places.filter((p) => p.createdBy === user.name)` compares `createdBy` (which is likely a user ID based on the `Place` type in shared) with `user.name` (a display name string). If `createdBy` stores user IDs (as is standard), this filter will never match, and the "Your Rooms" section will always be empty.
- **Fix**: Change to `p.createdBy === user.id` to match against the authenticated user's ID.

## 17. Sound Toggle State Not Checked in `playPop`/`playJoin`

- **Severity**: medium
- **Type**: bug
- **Location**: `apps/web/src/providers/WebSocketProvider.tsx:90,98`
- **Description**: `playPop()` and `playJoin()` are called unconditionally in the WebSocket message handler, regardless of `isSoundEnabled` state. Even when the user has muted sound via the toggle, remote bubble pops and user joins will still play audio.
- **Fix**: Check `useUIStore.getState().isSoundEnabled` before calling `playPop()` and `playJoin()` in the WebSocket handler. Similarly check in `BubbleInstances.tsx:362`.

## 18. GlobalStatsBanner Not Centered Under Header

- **Severity**: low
- **Type**: ux
- **Location**: `apps/web/src/routes/LobbyPage.tsx:130`
- **Description**: `<GlobalStatsBanner />` is rendered as a direct child of the content div without any centering wrapper. It's a `<p>` with `text-sm text-text-muted` but no `text-center` class, so it renders left-aligned under the centered header. This looks visually inconsistent.
- **Fix**: Add `text-center mb-6` to the `GlobalStatsBanner` wrapper or the `<p>` tag itself.

## 19. BubbleLoader Label Accessibility

- **Severity**: low
- **Type**: ux
- **Location**: `apps/web/src/components/shared/BubbleLoader.tsx:10`
- **Description**: When `BubbleLoader` is used without a label (e.g., in `LobbyPage.tsx:142`), screen readers will announce "Loading" which is fine. However, in `AuthCallback.tsx:109`, the `BubbleLoader` is placed next to a text node `{t('common.signingIn')}` without the label prop, so screen readers may announce "Loading" + "Signing in..." redundantly.
- **Fix**: Pass `label={t('common.signingIn')}` to the `BubbleLoader` in `AuthCallback.tsx` and remove the adjacent text, or set `aria-hidden` on the text span.

## 20. `user-scalable=yes` Security/UX Consideration

- **Severity**: low
- **Type**: ux
- **Location**: `apps/web/index.html:6`
- **Description**: `user-scalable=yes` was added to the viewport meta tag. While this improves accessibility (WCAG compliance), on the PlacePage with `touchAction: 'none'` on the canvas, there may be conflicts — the browser allows zoom gestures but the canvas prevents them, which could cause inconsistent behavior on mobile.
- **Fix**: This is generally fine and is the right accessibility choice. Just be aware that the canvas `touchAction: 'none'` already prevents zoom within the 3D viewport. No action needed.

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 2     |
| High     | 1     |
| Medium   | 5     |
| Low      | 8     |

**Top priority fixes:**
1. Add missing i18n keys `lobby.globalStats`, `lobby.createPlaceButton`, `lobby.createPlacePrompt` (items 1-2)
2. Fix `myRooms` filter to use `user.id` instead of `user.name` (item 16)
3. Check `isSoundEnabled` before playing sounds in WebSocket handler (item 17)
4. Fix `useAnimatedCount` to animate from previous value, not from zero (item 4)
5. Internationalize BubbleControls hardcoded strings (item 13)
