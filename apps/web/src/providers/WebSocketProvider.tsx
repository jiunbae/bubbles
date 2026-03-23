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

  const { addBubble, removeBubble, setBubbles, clearBubbles } =
    useBubbleStore();
  const { setOnlineUsers, addOnlineUser, removeOnlineUser } = usePlaceStore();

  useEffect(() => {
    const client = wsClientRef.current;

    client.onConnectionChange = (status) => {
      setConnectionStatus(status);
    };

    client.onMessage = (msg: ServerMessage) => {
      switch (msg.type) {
        case 'room_state':
          setOnlineUsers(msg.data.users);
          setBubbles(msg.data.bubbles);
          break;
        case 'bubble_created': {
          // From another user — add and auto-expire
          addBubble(msg.data);
          const ttl = msg.data.expiresAt - Date.now();
          if (ttl > 0) {
            setTimeout(() => removeBubble(msg.data.bubbleId), ttl);
          }
          break;
        }
        case 'bubble_popped':
          removeBubble(msg.data.bubbleId);
          break;
        case 'bubble_expired':
          removeBubble(msg.data.bubbleId);
          break;
        case 'user_joined':
          addOnlineUser(msg.data);
          break;
        case 'user_left':
          removeOnlineUser(msg.data.sessionId);
          break;
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
    setBubbles,
    clearBubbles,
    setOnlineUsers,
    addOnlineUser,
    removeOnlineUser,
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
