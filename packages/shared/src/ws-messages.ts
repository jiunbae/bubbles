import type { UserInfo, BubbleInfo } from './types';

// Client -> Server
export type ClientMessage =
  | { type: 'blow'; data: { size: 'S' | 'M' | 'L'; color: string; pattern: 'plain' | 'spiral' | 'dots' | 'star'; x?: number; y?: number; z?: number } }
  | { type: 'pop'; data: { bubbleId: string } }
  | { type: 'cursor'; data: { x: number; y: number } }
  | { type: 'ping' };

// Server -> Client
export type ServerMessage =
  | { type: 'room_state'; ts: number; data: { placeId: string; placeName: string; users: UserInfo[]; bubbles: BubbleInfo[] } }
  | { type: 'bubble_created'; ts: number; data: BubbleInfo }
  | { type: 'bubble_popped'; ts: number; data: { bubbleId: string; poppedBy: UserInfo } }
  | { type: 'bubble_expired'; ts: number; data: { bubbleId: string } }
  | { type: 'user_joined'; ts: number; data: UserInfo }
  | { type: 'user_left'; ts: number; data: { sessionId: string } }
  | { type: 'cursor_moved'; ts: number; data: { sessionId: string; x: number; y: number } }
  | { type: 'error'; ts: number; data: { code: string; message: string } }
  | { type: 'pong'; ts: number };
