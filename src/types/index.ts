// Metal Type Definitions

export interface Contact {
  id: string;
  displayName: string;
  publicKey: string;
  avatar?: string;
  addedAt: number;
  lastSeen?: number;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  timestamp: number;
  type: 'text' | 'file' | 'system';
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  replyTo?: string;
  expiresAt?: number;
  isEncrypted: boolean;
}

export interface Conversation {
  id: string;
  participantIds: string[];
  lastMessage?: Message;
  unreadCount: number;
  createdAt: number;
  updatedAt: number;
  isGroup: boolean;
  groupName?: string;
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  notifications: boolean;
  soundEnabled: boolean;
  autoLockTimeout: number; // minutes
  messageExpiry: number; // hours, 0 = never
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  notifications: true,
  soundEnabled: true,
  autoLockTimeout: 15,
  messageExpiry: 0
};
