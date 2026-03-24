import type { ClientMessage, ServerMessage } from '@bubbles/shared';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

/** WebSocket close code sent by server during graceful shutdown / rolling deploy. */
const CLOSE_CODE_SERVICE_RESTART = 1012;

export class WsClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private maxRetries = 5;
  private retryCount = 0;
  private placeId: string | null = null;
  private token: string | undefined;
  private intentionalClose = false;

  onMessage: ((msg: ServerMessage) => void) | null = null;
  onConnectionChange: ((status: ConnectionStatus) => void) | null = null;

  connect(placeId: string, token?: string): void {
    this.intentionalClose = false;
    this.placeId = placeId;
    this.token = token;
    this.reconnectDelay = 1000;
    this.retryCount = 0;
    this.doConnect();
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.cleanup();
    this.onConnectionChange?.('disconnected');
  }

  send(message: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private async doConnect(): Promise<void> {
    this.cleanup();

    this.onConnectionChange?.('connecting');

    // Exchange JWT for a short-lived one-time ticket (avoids token in URL logs)
    let ticketParam = '';
    if (this.token) {
      try {
        const res = await fetch('/api/auth/ws-ticket', {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.token}` },
        });
        if (res.ok) {
          const { ticket } = await res.json();
          ticketParam = `?ticket=${ticket}`;
        }
      } catch {
        // Fall through — connect anonymously
      }
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws/place/${this.placeId!}${ticketParam}`;

    const ws = new WebSocket(url);

    ws.onopen = () => {
      this.reconnectDelay = 1000;
      this.retryCount = 0;
      this.onConnectionChange?.('connected');
      this.startPingInterval();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as ServerMessage;
        this.onMessage?.(msg);
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = (event) => {
      this.stopPingInterval();
      if (!this.intentionalClose) {
        this.onConnectionChange?.('reconnecting');
        this.handleReconnect(event.code);
      }
    };

    ws.onerror = () => {
      // onclose will fire after onerror
    };

    this.ws = ws;
  }

  private handleReconnect(closeCode?: number): void {
    if (this.intentionalClose) return;

    // Server restart (rolling deploy) — reconnect immediately, no retry count
    if (closeCode === CLOSE_CODE_SERVICE_RESTART) {
      console.log('[WsClient] Server restarting, reconnecting immediately...');
      const jitter = 200 + Math.random() * 1300; // 200-1500ms to avoid thundering herd
      this.reconnectTimer = setTimeout(() => {
        this.doConnect();
      }, jitter);
      return;
    }

    if (this.retryCount >= this.maxRetries) {
      console.warn('[WsClient] Max retries reached, giving up');
      this.onConnectionChange?.('disconnected');
      return;
    }
    this.retryCount++;

    this.reconnectTimer = setTimeout(() => {
      this.doConnect();
    }, this.reconnectDelay);

    this.reconnectDelay = Math.min(
      this.reconnectDelay * 2,
      this.maxReconnectDelay,
    );
  }

  private startPingInterval(): void {
    this.stopPingInterval();
    this.pingTimer = setInterval(() => {
      this.send({ type: 'ping' });
    }, 20000);
  }

  private stopPingInterval(): void {
    if (this.pingTimer != null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private cleanup(): void {
    this.stopPingInterval();
    if (this.reconnectTimer != null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      if (
        this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING
      ) {
        this.ws.close();
      }
      this.ws = null;
    }
  }
}

// Global singleton on window — survives code splitting, single instance guaranteed
declare global {
  interface Window {
    __bubbleWsClient?: WsClient;
  }
}

if (!window.__bubbleWsClient) {
  window.__bubbleWsClient = new WsClient();
}

export const globalWsClient: WsClient = window.__bubbleWsClient;
