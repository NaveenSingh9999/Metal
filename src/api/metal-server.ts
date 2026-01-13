// Metal Server API Client
// Main server for user registration, discovery, and message relay

const API_BASE_URL = import.meta.env.VITE_METAL_SERVER_URL || 'http://0.0.0.0:3001/api';
const WS_URL = import.meta.env.VITE_METAL_WS_URL || 'ws://0.0.0.0:3001/ws';

// ============ Types ============

export interface ServerUser {
  metalId: string;
  displayName: string;
  publicKey: string;
  createdAt: number;
  lastSeen: number;
  isOnline: boolean;
}

export interface ServerMessage {
  id: string;
  fromMetalId: string;
  toMetalId: string;
  encryptedContent: string;
  timestamp: number;
  type: 'message' | 'typing' | 'read' | 'delivered';
}

export interface SearchResult {
  users: ServerUser[];
  total: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ============ WebSocket Events ============

export interface WSMessage {
  type: 'message' | 'typing' | 'presence' | 'ack';
  payload: unknown;
}

export type MessageHandler = (message: ServerMessage) => void;
export type TypingHandler = (metalId: string, isTyping: boolean) => void;
export type PresenceHandler = (metalId: string, isOnline: boolean) => void;

// ============ Metal Server Client ============

class MetalServerClient {
  private authToken: string | null = null;
  private myMetalId: string | null = null;
  private ws: WebSocket | null = null;
  private wsReconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private wsReconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  
  // Event handlers
  private onMessage: MessageHandler | null = null;
  private onTyping: TypingHandler | null = null;
  private onPresence: PresenceHandler | null = null;
  
  // Pending messages queue (for offline support)
  private pendingMessages: ServerMessage[] = [];
  private isOnline = navigator.onLine;

  constructor() {
    // Listen for online/offline events
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.flushPendingMessages();
      this.connectWebSocket();
    });
    
    window.addEventListener('offline', () => {
      this.isOnline = false;
    });
  }

  // ============ Authentication ============

  /**
   * Set authentication token (derived from user's keys)
   */
  setAuth(metalId: string, token: string): void {
    this.myMetalId = metalId;
    this.authToken = token;
  }

  /**
   * Check if authenticated
   */
  isAuthenticated(): boolean {
    return this.authToken !== null && this.myMetalId !== null;
  }

  /**
   * Clear authentication
   */
  clearAuth(): void {
    this.authToken = null;
    this.myMetalId = null;
    this.disconnectWebSocket();
  }

  // ============ HTTP Requests ============

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const headers = new Headers(options.headers);
    headers.set('Content-Type', 'application/json');
    
    if (this.authToken) {
      headers.set('Authorization', `Bearer ${this.authToken}`);
    }

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers
      });

      const data = await response.json();
      
      if (!response.ok) {
        return { success: false, error: data.error || `Request failed: ${response.status}` };
      }

      return { success: true, data: data as T };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Network error' 
      };
    }
  }

  // ============ User Registration & Profile ============

  /**
   * Register a new user on the server
   */
  async registerUser(
    metalId: string,
    displayName: string,
    publicKey: string,
    signature: string // Signature proving ownership of private key
  ): Promise<ApiResponse<{ token: string; user: ServerUser }>> {
    return this.request('/users/register', {
      method: 'POST',
      body: JSON.stringify({
        metalId,
        displayName,
        publicKey,
        signature
      })
    });
  }

  /**
   * Authenticate existing user
   */
  async authenticate(
    metalId: string,
    signature: string,
    timestamp: number
  ): Promise<ApiResponse<{ token: string; user: ServerUser }>> {
    return this.request('/users/auth', {
      method: 'POST',
      body: JSON.stringify({
        metalId,
        signature,
        timestamp
      })
    });
  }

  /**
   * Update user profile
   */
  async updateProfile(
    displayName?: string
  ): Promise<ApiResponse<ServerUser>> {
    return this.request('/users/profile', {
      method: 'PATCH',
      body: JSON.stringify({ displayName })
    });
  }

  /**
   * Update online status / heartbeat
   */
  async heartbeat(): Promise<ApiResponse<void>> {
    return this.request('/users/heartbeat', {
      method: 'POST'
    });
  }

  // ============ User Discovery ============

  /**
   * Find user by exact Metal ID
   */
  async findUserByMetalId(metalId: string): Promise<ApiResponse<ServerUser>> {
    return this.request(`/users/${metalId}`);
  }

  /**
   * Search users by name or Metal ID
   */
  async searchUsers(
    query: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<ApiResponse<SearchResult>> {
    const params = new URLSearchParams({
      q: query,
      limit: limit.toString(),
      offset: offset.toString()
    });
    return this.request(`/users/search?${params}`);
  }

  /**
   * Get multiple users by Metal IDs
   */
  async getUsers(metalIds: string[]): Promise<ApiResponse<ServerUser[]>> {
    return this.request('/users/batch', {
      method: 'POST',
      body: JSON.stringify({ metalIds })
    });
  }

  // ============ Messaging ============

  /**
   * Send a message via HTTP (fallback when WebSocket unavailable)
   */
  async sendMessage(message: ServerMessage): Promise<ApiResponse<{ id: string }>> {
    if (!this.isOnline) {
      // Queue for later
      this.pendingMessages.push(message);
      return { success: true, data: { id: message.id } };
    }

    return this.request('/messages/send', {
      method: 'POST',
      body: JSON.stringify(message)
    });
  }

  /**
   * Get pending messages for current user
   */
  async getMessages(
    since?: number,
    limit: number = 100
  ): Promise<ApiResponse<ServerMessage[]>> {
    const params = new URLSearchParams({ limit: limit.toString() });
    if (since) {
      params.set('since', since.toString());
    }
    return this.request(`/messages?${params}`);
  }

  /**
   * Mark messages as delivered
   */
  async markDelivered(messageIds: string[]): Promise<ApiResponse<void>> {
    return this.request('/messages/delivered', {
      method: 'POST',
      body: JSON.stringify({ messageIds })
    });
  }

  /**
   * Flush pending messages when coming back online
   */
  private async flushPendingMessages(): Promise<void> {
    if (this.pendingMessages.length === 0) return;

    const messages = [...this.pendingMessages];
    this.pendingMessages = [];

    for (const message of messages) {
      try {
        await this.sendMessage(message);
      } catch {
        // Re-queue failed messages
        this.pendingMessages.push(message);
      }
    }
  }

  // ============ WebSocket Connection ============

  /**
   * Connect to WebSocket for real-time messaging
   */
  connectWebSocket(): void {
    if (!this.authToken || !this.myMetalId) {
      console.warn('Cannot connect WebSocket: not authenticated');
      return;
    }

    if (this.ws?.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    try {
      this.ws = new WebSocket(`${WS_URL}?token=${this.authToken}`);

      this.ws.onopen = () => {
        console.log('Metal WebSocket connected');
        this.wsReconnectAttempts = 0;
        
        // Send presence update
        this.sendWSMessage({
          type: 'presence',
          payload: { isOnline: true }
        });
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WSMessage;
          this.handleWSMessage(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      this.ws.onclose = () => {
        console.log('Metal WebSocket disconnected');
        this.scheduleReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('Metal WebSocket error:', error);
      };
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
      this.scheduleReconnect();
    }
  }

  /**
   * Check if WebSocket is connected
   */
  isWebSocketConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Disconnect WebSocket
   */
  disconnectWebSocket(): void {
    if (this.wsReconnectTimeout) {
      clearTimeout(this.wsReconnectTimeout);
      this.wsReconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Schedule WebSocket reconnection
   */
  private scheduleReconnect(): void {
    if (this.wsReconnectAttempts >= this.maxReconnectAttempts) {
      console.warn('Max WebSocket reconnect attempts reached');
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.wsReconnectAttempts), 30000);
    this.wsReconnectAttempts++;

    this.wsReconnectTimeout = setTimeout(() => {
      if (this.isOnline && this.isAuthenticated()) {
        this.connectWebSocket();
      }
    }, delay);
  }

  /**
   * Send message via WebSocket
   */
  private sendWSMessage(message: WSMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleWSMessage(message: WSMessage): void {
    switch (message.type) {
      case 'message':
        if (this.onMessage) {
          this.onMessage(message.payload as ServerMessage);
        }
        break;

      case 'typing':
        if (this.onTyping) {
          const { metalId, isTyping } = message.payload as { metalId: string; isTyping: boolean };
          this.onTyping(metalId, isTyping);
        }
        break;

      case 'presence':
        if (this.onPresence) {
          const { metalId, isOnline } = message.payload as { metalId: string; isOnline: boolean };
          this.onPresence(metalId, isOnline);
        }
        break;

      case 'ack':
        // Message acknowledgment - could update message status
        break;
    }
  }

  // ============ Real-time Event Handlers ============

  /**
   * Set handler for incoming messages
   */
  setMessageHandler(handler: MessageHandler): void {
    this.onMessage = handler;
  }

  /**
   * Set handler for typing indicators
   */
  setTypingHandler(handler: TypingHandler): void {
    this.onTyping = handler;
  }

  /**
   * Set handler for presence updates
   */
  setPresenceHandler(handler: PresenceHandler): void {
    this.onPresence = handler;
  }

  // ============ Real-time Actions ============

  /**
   * Send typing indicator
   */
  sendTypingIndicator(toMetalId: string, isTyping: boolean): void {
    this.sendWSMessage({
      type: 'typing',
      payload: { toMetalId, isTyping }
    });
  }

  /**
   * Send message via WebSocket (preferred) or HTTP (fallback)
   */
  async sendRealTimeMessage(message: ServerMessage): Promise<boolean> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendWSMessage({
        type: 'message',
        payload: message
      });
      return true;
    }

    // Fallback to HTTP
    const result = await this.sendMessage(message);
    return result.success;
  }

  // ============ Utility ============

  /**
   * Get connection status
   */
  getConnectionStatus(): 'connected' | 'connecting' | 'disconnected' {
    if (!this.ws) return 'disconnected';
    
    switch (this.ws.readyState) {
      case WebSocket.OPEN: return 'connected';
      case WebSocket.CONNECTING: return 'connecting';
      default: return 'disconnected';
    }
  }

  /**
   * Check if online (network available)
   */
  isNetworkOnline(): boolean {
    return this.isOnline;
  }
}

// Singleton instance
export const metalServer = new MetalServerClient();
export default metalServer;
