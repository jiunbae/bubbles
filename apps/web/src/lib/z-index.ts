/**
 * Shared z-index constants to prevent layering conflicts.
 *
 * Hierarchy (lowest to highest):
 *   BACKGROUND / CAMERA_FEED < CONTENT < HEADER < PANEL < DROPDOWN
 *   < UI_CONTROLS < TOAST < ONBOARDING
 */
export const Z_INDEX = {
  /** Camera feed background (AR mode) */
  CAMERA_FEED: 0,
  /** Background decorative elements */
  BACKGROUND: 0,
  /** Main content area */
  CONTENT: 10,
  /** Sticky headers, tab bars */
  STICKY_HEADER: 10,
  /** Top-right header controls (lobby) */
  HEADER_CONTROLS: 20,
  /** Activity log backdrop (mobile) */
  ACTIVITY_BACKDROP: 30,
  /** Panels: activity log, invite banner */
  PANEL: 40,
  /** Dropdowns, menus, popovers */
  DROPDOWN: 50,
  /** UI controls overlay (bubble controls, size picker, help button) */
  UI_CONTROLS: 10000,
  /** Toast notifications — must appear above UI controls */
  TOAST: 10001,
  /** Canvas element in camera/AR mode */
  CANVAS_CAMERA: 1,
  /** Onboarding overlay — must be above everything */
  ONBOARDING: 20000,
} as const;