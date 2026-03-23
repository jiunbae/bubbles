import { getCollection } from '../db/mongo';
import type { BubblesUser } from '../middleware/auth';

export type ActionType = 'blow' | 'pop' | 'join' | 'leave' | 'create_place';

interface ActionLogDoc {
  action: ActionType;
  placeId: string;
  sessionId: string;
  displayName: string;
  isAuthenticated: boolean;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export async function logAction(
  action: ActionType,
  placeId: string,
  sessionId: string,
  user: BubblesUser,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    const col = getCollection<ActionLogDoc>('action_logs');
    await col.insertOne({
      action,
      placeId,
      sessionId,
      displayName: user.displayName,
      isAuthenticated: user.isAuthenticated,
      metadata,
      createdAt: new Date(),
    });
  } catch (err) {
    console.error('[actions] Failed to log action:', err);
  }
}
