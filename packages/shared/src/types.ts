export interface UserInfo {
  sessionId: string;
  displayName: string;
  isAuthenticated: boolean;
  color: string; // cursor/presence color
}

export interface BubbleInfo {
  bubbleId: string;
  blownBy: UserInfo;
  x: number;
  y: number;
  z: number;
  size: 'S' | 'M' | 'L';
  color: string;
  pattern: 'plain' | 'spiral' | 'dots' | 'star';
  seed: number; // deterministic physics seed
  createdAt: number;
  expiresAt: number;
}

export type BubbleSize = 'S' | 'M' | 'L';
export type BubblePattern = 'plain' | 'spiral' | 'dots' | 'star';
export type PlaceTheme = 'rooftop' | 'park' | 'alley';

export const PLACE_THEMES: { value: PlaceTheme; label: string; emoji: string; description: string }[] = [
  { value: 'rooftop', label: 'Rooftop', emoji: '🏙️', description: 'City skyline & concrete' },
  { value: 'park', label: 'Park', emoji: '🌳', description: 'Grass, trees & open sky' },
  { value: 'alley', label: 'Alley', emoji: '🏮', description: 'Brick walls & warm lights' },
];

export interface Place {
  id: string;
  name: string;
  theme: PlaceTheme;
  createdBy: string;
  userCount: number;
  bubbleCount: number;
  createdAt: string;
  lastActivityAt: string;
}

export const BUBBLE_COLORS = [
  '#FFB5C2', // soft pink
  '#87CEEB', // sky blue
  '#98FB98', // mint green
  '#DDA0DD', // lavender
  '#FFD700', // warm yellow
  '#FFDAB9', // peach
  '#F5F5F5', // pearl white
  '#FF69B4', // rainbow/iridescent
] as const;

export const BUBBLE_LIFETIME = {
  S: { min: 6000, max: 15000 },
  M: { min: 10000, max: 20000 },
  L: { min: 15000, max: 30000 },
} as const;
