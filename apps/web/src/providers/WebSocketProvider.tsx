import {
  createContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { WsClient, globalWsClient, type ConnectionStatus } from '@/lib/ws-client';
import type { ClientMessage, ServerMessage } from '@bubbles/shared';
import { useBubbleStore } from '@/stores/bubble-store';
import { usePlaceStore } from '@/stores/place-store';
import { useUIStore } from '@/stores/ui-store';
import { useCursorStore } from '@/stores/cursor-store';
import { playPop, playJoin } from '@/lib/sounds';
import { showToast } from '@/components/shared/Toast';
import i18n from '@/i18n';

const MILESTONE_THRESHOLDS = [100, 500, 1000, 5000] as const;

export interface WebSocketContextValue {
  wsClient: WsClient;
  connectionStatus: ConnectionStatus;
  send: (msg: ClientMessage) => void;
  connect: (placeId: string, token?: string) => void;
  disconnect: () => void;
}

export const WebSocketContext = createContext<WebSocketContextValue | null>(
  null,
);

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const wsClientRef = useRef(globalWsClient);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>('disconnected');

  const { addBubble, removeBubble, popBubble, setBubbles } =
    useBubbleStore();
  const { setMySessionId, setOnlineUsers, addOnlineUser, removeOnlineUser, renameOnlineUser, updateOnlineUserColor } = usePlaceStore();

  // Milestone tracking
  const totalBubbleCountRef = useRef(0);
  const shownMilestonesRef = useRef(new Set<number>());

  useEffect(() => {
    const client = wsClientRef.current;

    client.onConnectionChange = (status) => {
      setConnectionStatus(status);
    };

    client.onMessage = (msg: ServerMessage) => {
      switch (msg.type) {
        case 'room_state': {
          setMySessionId(msg.data.mySessionId);
          setOnlineUsers(msg.data.users);
          setBubbles(msg.data.bubbles);
          // Reset milestone tracking for the new room
          totalBubbleCountRef.current = 0;
          shownMilestonesRef.current = new Set<number>();
          // Sync selected color to my server-assigned user color
          const myUser = msg.data.users.find(
            (u: { sessionId: string }) => u.sessionId === msg.data.mySessionId
          );
          if (myUser?.color) {
            useUIStore.getState().setSelectedColor(myUser.color);
          }
          break;
        }
        case 'bubble_created': {
          // From another user — server handles expiry via bubble_expired event
          addBubble(msg.data);
          // Milestone check
          totalBubbleCountRef.current += 1;
          const count = totalBubbleCountRef.current;
          for (const threshold of MILESTONE_THRESHOLDS) {
            if (count >= threshold && !shownMilestonesRef.current.has(threshold)) {
              shownMilestonesRef.current.add(threshold);
              showToast(
                i18n.t('place.milestone', { count: threshold.toLocaleString() }),
                'success',
              );
            }
          }
          break;
        }
        case 'bubble_popped':
          popBubble(msg.data.bubbleId);
          playPop();
          break;
        case 'bubble_expired':
          popBubble(msg.data.bubbleId);
          break;
        case 'user_joined':
          addOnlineUser(msg.data);
          playJoin();
          break;
        case 'user_renamed':
          renameOnlineUser(msg.data.sessionId, msg.data.displayName);
          break;
        case 'user_color_changed':
          updateOnlineUserColor(msg.data.sessionId, msg.data.color);
          // If it's my color change confirmed by server, sync local selection
          if (msg.data.sessionId === usePlaceStore.getState().mySessionId) {
            useUIStore.getState().setSelectedColor(msg.data.color);
          }
          break;
        case 'user_left':
          removeOnlineUser(msg.data.sessionId);
          useCursorStore.getState().removeCursor(msg.data.sessionId);
          break;
        case 'cursor_moved': {
          const myId = usePlaceStore.getState().mySessionId;
          if (msg.data.sessionId === myId) break;
          const users = usePlaceStore.getState().onlineUsers;
          const cursorUser = users.find((u) => u.sessionId === msg.data.sessionId);
          useCursorStore.getState().updateCursor(
            msg.data.sessionId,
            msg.data.x,
            msg.data.y,
            cursorUser?.color ?? '#ffffff',
            cursorUser?.displayName ?? 'Guest',
          );
          break;
        }
        case 'pong':
          // heartbeat acknowledged
          break;
        case 'error':
          console.error('[WS] Server error:', msg.data.message);
          break;
      }
    };

    return () => {
      client.disconnect();
    };
  }, [
    addBubble,
    removeBubble,
    popBubble,
    setBubbles,
    setMySessionId,
    setOnlineUsers,
    addOnlineUser,
    removeOnlineUser,
    renameOnlineUser,
    updateOnlineUserColor,
  ]);

  const send = useCallback((msg: ClientMessage) => {
    wsClientRef.current.send(msg);
  }, []);

  const connect = useCallback((placeId: string, token?: string) => {
    wsClientRef.current.connect(placeId, token);
  }, []);

  const disconnect = useCallback(() => {
    wsClientRef.current.disconnect();
  }, []);

  return (
    <WebSocketContext.Provider
      value={{
        wsClient: wsClientRef.current,
        connectionStatus,
        send,
        connect,
        disconnect,
      }}
    >
      {children}
    </WebSocketContext.Provider>
  );
}
