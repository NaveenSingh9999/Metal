// Metal Message Sync Service
// Handles encrypted message synchronization via Squid Cloud

import { squidCloud, SquidFile } from './squid-cloud';
import { encrypt, decrypt, importAESKey, exportAESKey, generateAESKey } from '../crypto/aes';
import { bytesToBase64, base64ToBytes, encodeString, decodeString } from '../crypto/utils';

export interface SyncedMessage {
  id: string;
  conversationId: string;
  senderId: string;
  recipientId: string;
  encryptedContent: string;
  timestamp: number;
  type: 'text' | 'file' | 'system';
}

export interface MessageBundle {
  version: 1;
  messages: SyncedMessage[];
  lastSync: number;
}

const MESSAGE_FILE_PREFIX = 'metal_msgs_';
const INBOX_PREFIX = 'metal_inbox_';

class MessageSyncService {
  private syncKey: CryptoKey | null = null;

  /**
   * Initialize sync service with encryption key
   */
  async initialize(keyBytes: Uint8Array): Promise<void> {
    this.syncKey = await importAESKey(keyBytes);
  }

  /**
   * Generate a new sync key
   */
  async generateSyncKey(): Promise<Uint8Array> {
    const key = await generateAESKey();
    this.syncKey = key;
    return exportAESKey(key);
  }

  /**
   * Upload encrypted messages to cloud
   */
  async uploadMessages(
    conversationId: string,
    messages: SyncedMessage[]
  ): Promise<string> {
    if (!this.syncKey) {
      throw new Error('Sync service not initialized');
    }

    const bundle: MessageBundle = {
      version: 1,
      messages,
      lastSync: Date.now()
    };

    const plaintext = encodeString(JSON.stringify(bundle));
    const encrypted = await encrypt(plaintext, this.syncKey);

    const fileName = `${MESSAGE_FILE_PREFIX}${conversationId}_${Date.now()}.enc`;
    const result = await squidCloud.uploadEncryptedData(encrypted, fileName);

    return result.file.id;
  }

  /**
   * Upload message to recipient's inbox
   */
  async sendToInbox(
    recipientId: string,
    message: SyncedMessage,
    recipientPublicKey: Uint8Array
  ): Promise<string> {
    // In production, encrypt with recipient's public key
    // For now, use sync key (simplified)
    if (!this.syncKey) {
      throw new Error('Sync service not initialized');
    }

    const plaintext = encodeString(JSON.stringify(message));
    const encrypted = await encrypt(plaintext, this.syncKey);

    const fileName = `${INBOX_PREFIX}${recipientId}_${message.id}.enc`;
    const result = await squidCloud.uploadEncryptedData(encrypted, fileName);

    return result.file.id;
  }

  /**
   * Download and decrypt messages from cloud
   */
  async downloadMessages(fileId: string): Promise<MessageBundle> {
    if (!this.syncKey) {
      throw new Error('Sync service not initialized');
    }

    const encrypted = await squidCloud.downloadAsBytes(fileId);
    const decrypted = await decrypt(encrypted, this.syncKey);
    const bundle: MessageBundle = JSON.parse(decodeString(decrypted));

    return bundle;
  }

  /**
   * List all message files for a conversation
   */
  async listMessageFiles(conversationId?: string): Promise<SquidFile[]> {
    const { files } = await squidCloud.listFiles();
    
    const prefix = conversationId 
      ? `${MESSAGE_FILE_PREFIX}${conversationId}`
      : MESSAGE_FILE_PREFIX;
    
    return files.filter(f => f.name.startsWith(prefix));
  }

  /**
   * List inbox messages for current user
   */
  async listInboxMessages(userId: string): Promise<SquidFile[]> {
    const { files } = await squidCloud.listFiles();
    return files.filter(f => f.name.startsWith(`${INBOX_PREFIX}${userId}`));
  }

  /**
   * Fetch all messages for a user's inbox
   */
  async fetchInbox(userId: string): Promise<SyncedMessage[]> {
    if (!this.syncKey) {
      throw new Error('Sync service not initialized');
    }

    const inboxFiles = await this.listInboxMessages(userId);
    const messages: SyncedMessage[] = [];

    for (const file of inboxFiles) {
      try {
        const encrypted = await squidCloud.downloadAsBytes(file.id);
        const decrypted = await decrypt(encrypted, this.syncKey);
        const message: SyncedMessage = JSON.parse(decodeString(decrypted));
        messages.push(message);
      } catch (error) {
        console.error(`Failed to decrypt message ${file.id}:`, error);
      }
    }

    return messages.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Delete a message file from cloud
   */
  async deleteMessageFile(fileId: string): Promise<void> {
    await squidCloud.deleteFile(fileId);
  }

  /**
   * Sync all messages for a conversation
   */
  async syncConversation(conversationId: string): Promise<SyncedMessage[]> {
    const files = await this.listMessageFiles(conversationId);
    const allMessages: SyncedMessage[] = [];

    for (const file of files) {
      try {
        const bundle = await this.downloadMessages(file.id);
        allMessages.push(...bundle.messages);
      } catch (error) {
        console.error(`Failed to sync file ${file.id}:`, error);
      }
    }

    // Sort by timestamp and deduplicate
    const messageMap = new Map<string, SyncedMessage>();
    for (const msg of allMessages) {
      messageMap.set(msg.id, msg);
    }

    return Array.from(messageMap.values()).sort((a, b) => a.timestamp - b.timestamp);
  }
}

export const messageSyncService = new MessageSyncService();
export default messageSyncService;
