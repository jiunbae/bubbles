# R08 — Product Review Summary (UX + Marketing)

## Scores
| Perspective | Score | Potential |
|-------------|-------|-----------|
| UX Design | 5.6/10 | 8/10 |
| Marketing Readiness | 4/10 | 8/10 |

---

## P0 — Must Do (Both reviewers agree)

### 1. Share Button (Marketing #1, UX implied)
- **Zero share mechanics exist.** Growth loop is broken.
- Fix: "Copy room link" button in PlacePage header. 30분 작업.

### 2. Sound Effects (UX #2, Marketing #8)
- `isSoundEnabled` exists but nothing wired. Bubble app without pop sounds = emotionally flat.
- Fix: Blow sound (fwoop) + pop sound + ambient per theme.

### 3. Multiplayer Cursor Presence (UX #1)
- **Core undelivered promise.** Users can't see each other. "Parallel play, not playing together."
- Fix: Show other users' bubble wands in the 3D scene via WS cursor broadcasts.

### 4. OG Image Missing (Marketing #3)
- `og/default.png` referenced but doesn't exist. Shared links show broken preview.
- Fix: Create 1200x630 OG image. Dynamic per-room OG images for better CTR.

---

## P1 — High Impact

### 5. Lobby First Impression (UX #3, Marketing #4)
- No visual preview, no hero content, CTA buried.
- Fix: Hero section with preview, prominent "Create Place", global stats banner ("X bubbles blown, Y online").

### 6. Stealth Mode Marketing (Marketing #2)
- "Play bubbles at work disguised as Excel" — TikTok-ready, zero code needed.
- **Most viral-ready feature already built but completely undermarketed.**

### 7. Fix Bubble Color Bug (UX #5)
- Blow button always spawns sky blue, ignoring selected color.

### 8. Simplify Place Header (UX #4)
- 13+ controls in one row. Move blow/pop toggle near blow button, collapse secondary info.

### 9. Persistent Tutorial (UX #6)
- 5-second auto-dismiss, no recall. Add "?" help button.

---

## P2 — Growth & Retention

### 10. Room Milestone Celebrations (Marketing #7)
- 100/500/1000 bubble milestones with visual celebration → screenshot moments.

### 11. Global Stats on Lobby (Marketing #4)
- "X bubbles blown across all rooms" banner → social proof.

### 12. "Invite Friends" Prompt (Marketing #6)
- After 30 seconds: gentle "Bubbles are better together" with copy-link.

### 13. "Your Rooms" for Logged-In Users (Marketing #9)
- Room ownership → reason to return.

### 14. Product Hunt Launch (Marketing #10)
- Stealth mode as differentiator. r/InternetIsBeautiful post.

---

## P3 — Polish

- Branded loading animation (bubble instead of spinner)
- Haptic feedback on mobile pop
- Emoji reactions in 3D scene
- Remove `user-scalable=no`
- Seasonal themes (cherry blossom, snow, halloween)
- Bubble patterns (spiral, dots, star) visually implemented

---

## Key Insight (Both Reviewers)

> "The technical foundation (3D rendering, WebSocket sync, physics) is excellent.
> The product needs the **social** and **sensory** layers to match the technical quality."

> "Bubbles doesn't need more features to go viral — it needs the features it already has
> to be **surfaced and shareable**."

**Stealth mode is the hidden viral weapon.** Marketing it requires zero code changes.
