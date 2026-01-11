// Metal Encrypted IndexedDB Storage
import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import { encrypt, decrypt, importAESKey } from '../crypto/aes';
import { encodeString, decodeString } from '../crypto/utils';

interface MetalDBSchema extends DBSchema {
  identity: {
    key: string;
    value: {
      id: string;
      data: string; // Encrypted JSON
    };
  };
  contacts: {
    key: string;
    value: {
      id: string;
      metalId: string;
      data: string; // Encrypted JSON
    };
    indexes: { 
      'by-id': string;
      'by-metalId': string;
    };
  };
  conversations: {
    key: string;
    value: {
      id: string;
      data: string; // Encrypted JSON
      updatedAt: number;
    };
    indexes: {
      'by-updatedAt': number;
    };
  };
  messages: {
    key: string;
    value: {
      id: string;
      conversationId: string;
      data: string; // Encrypted JSON
      timestamp: number;
    };
    indexes: { 
      'by-conversation': string;
      'by-timestamp': number;
    };
  };
  sessions: {
    key: string;
    value: {
      id: string;
      peerId: string;
      data: string; // Encrypted session state
    };
    indexes: { 'by-peer': string };
  };
  settings: {
    key: string;
    value: {
      key: string;
      value: string; // Encrypted
    };
  };
  syncQueue: {
    key: string;
    value: {
      id: string;
      type: 'message' | 'contact' | 'conversation';
      action: 'create' | 'update' | 'delete';
      data: string; // Encrypted JSON
      timestamp: number;
      retries: number;
    };
    indexes: {
      'by-timestamp': number;
    };
  };
}

const DB_NAME = 'metal-secure-db';
const DB_VERSION = 2;

class EncryptedStorage {
  private db: IDBPDatabase<MetalDBSchema> | null = null;
  private storageKey: CryptoKey | null = null;

  /**
   * Initialize storage with encryption key
   */
  async initialize(keyBytes: Uint8Array): Promise<void> {
    this.storageKey = await importAESKey(keyBytes);
    
    this.db = await openDB<MetalDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db: IDBPDatabase<MetalDBSchema>, oldVersion: number) {
        // Identity store
        if (!db.objectStoreNames.contains('identity')) {
          db.createObjectStore('identity', { keyPath: 'id' });
        }
        
        // Contacts store
        if (!db.objectStoreNames.contains('contacts')) {
          const contactStore = db.createObjectStore('contacts', { keyPath: 'id' });
          contactStore.createIndex('by-id', 'id');
          contactStore.createIndex('by-metalId', 'metalId');
        }
        
        // Conversations store (new in v2)
        if (!db.objectStoreNames.contains('conversations')) {
          const convStore = db.createObjectStore('conversations', { keyPath: 'id' });
          convStore.createIndex('by-updatedAt', 'updatedAt');
        }
        
        // Messages store
        if (!db.objectStoreNames.contains('messages')) {
          const messageStore = db.createObjectStore('messages', { keyPath: 'id' });
          messageStore.createIndex('by-conversation', 'conversationId');
          messageStore.createIndex('by-timestamp', 'timestamp');
        }
        
        // Sessions store
        if (!db.objectStoreNames.contains('sessions')) {
          const sessionStore = db.createObjectStore('sessions', { keyPath: 'id' });
          sessionStore.createIndex('by-peer', 'peerId');
        }
        
        // Settings store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
        
        // Sync queue store (new in v2)
        if (!db.objectStoreNames.contains('syncQueue')) {
          const syncStore = db.createObjectStore('syncQueue', { keyPath: 'id' });
          syncStore.createIndex('by-timestamp', 'timestamp');
        }
        
        // Migration from v1 to v2 - add metalId index to contacts
        if (oldVersion < 2 && db.objectStoreNames.contains('contacts')) {
          // Note: In a real migration, you'd need to add the metalId field to existing records
        }
      }
    });
  }

  /**
   * Check if storage is initialized
   */
  isInitialized(): boolean {
    return this.db !== null && this.storageKey !== null;
  }

  /**
   * Encrypt data for storage
   */
  private async encryptData(data: unknown): Promise<string> {
    if (!this.storageKey) throw new Error('Storage not initialized');
    const plaintext = encodeString(JSON.stringify(data));
    const encrypted = await encrypt(plaintext, this.storageKey);
    return btoa(String.fromCharCode(...encrypted));
  }

  /**
   * Decrypt data from storage
   */
  private async decryptData<T>(encryptedBase64: string): Promise<T> {
    if (!this.storageKey) throw new Error('Storage not initialized');
    const encrypted = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
    const decrypted = await decrypt(encrypted, this.storageKey);
    return JSON.parse(decodeString(decrypted));
  }

  // ==================== Identity ====================

  async saveIdentity(id: string, data: unknown): Promise<void> {
    if (!this.db) throw new Error('Storage not initialized');
    const encrypted = await this.encryptData(data);
    await this.db.put('identity', { id, data: encrypted });
  }

  async getIdentity<T>(id: string): Promise<T | null> {
    if (!this.db) throw new Error('Storage not initialized');
    const record = await this.db.get('identity', id);
    if (!record) return null;
    return this.decryptData<T>(record.data);
  }

  async deleteIdentity(id: string): Promise<void> {
    if (!this.db) throw new Error('Storage not initialized');
    await this.db.delete('identity', id);
  }

  // ==================== Contacts ====================

  async saveContact(id: string, metalId: string, data: unknown): Promise<void> {
    if (!this.db) throw new Error('Storage not initialized');
    const encrypted = await this.encryptData(data);
    await this.db.put('contacts', { id, metalId, data: encrypted });
  }

  async getContact<T>(id: string): Promise<T | null> {
    if (!this.db) throw new Error('Storage not initialized');
    const record = await this.db.get('contacts', id);
    if (!record) return null;
    return this.decryptData<T>(record.data);
  }

  async getContactByMetalId<T>(metalId: string): Promise<T | null> {
    if (!this.db) throw new Error('Storage not initialized');
    const record = await this.db.getFromIndex('contacts', 'by-metalId', metalId);
    if (!record) return null;
    return this.decryptData<T>(record.data);
  }

  async getAllContacts<T>(): Promise<T[]> {
    if (!this.db) throw new Error('Storage not initialized');
    const records = await this.db.getAll('contacts');
    const contacts: T[] = [];
    for (const record of records) {
      contacts.push(await this.decryptData<T>(record.data));
    }
    return contacts;
  }

  async deleteContact(id: string): Promise<void> {
    if (!this.db) throw new Error('Storage not initialized');
    await this.db.delete('contacts', id);
  }

  // ==================== Messages ====================

  async saveMessage(
    id: string,
    conversationId: string,
    data: unknown,
    timestamp: number
  ): Promise<void> {
    if (!this.db) throw new Error('Storage not initialized');
    const encrypted = await this.encryptData(data);
    await this.db.put('messages', { id, conversationId, data: encrypted, timestamp });
  }

  async getMessage<T>(id: string): Promise<T | null> {
    if (!this.db) throw new Error('Storage not initialized');
    const record = await this.db.get('messages', id);
    if (!record) return null;
    return this.decryptData<T>(record.data);
  }

  async getMessagesByConversation<T>(conversationId: string): Promise<T[]> {
    if (!this.db) throw new Error('Storage not initialized');
    const records = await this.db.getAllFromIndex('messages', 'by-conversation', conversationId);
    const messages: T[] = [];
    for (const record of records.sort((a: { timestamp: number }, b: { timestamp: number }) => a.timestamp - b.timestamp)) {
      messages.push(await this.decryptData<T>(record.data));
    }
    return messages;
  }

  async deleteMessage(id: string): Promise<void> {
    if (!this.db) throw new Error('Storage not initialized');
    await this.db.delete('messages', id);
  }

  async deleteConversationMessages(conversationId: string): Promise<void> {
    if (!this.db) throw new Error('Storage not initialized');
    const records = await this.db.getAllFromIndex('messages', 'by-conversation', conversationId);
    const tx = this.db.transaction('messages', 'readwrite');
    for (const record of records) {
      await tx.store.delete(record.id);
    }
    await tx.done;
  }

  // ==================== Conversations ====================

  async saveConversation(id: string, data: unknown, updatedAt: number): Promise<void> {
    if (!this.db) throw new Error('Storage not initialized');
    const encrypted = await this.encryptData(data);
    await this.db.put('conversations', { id, data: encrypted, updatedAt });
  }

  async getConversation<T>(id: string): Promise<T | null> {
    if (!this.db) throw new Error('Storage not initialized');
    const record = await this.db.get('conversations', id);
    if (!record) return null;
    return this.decryptData<T>(record.data);
  }

  async getAllConversations<T>(): Promise<T[]> {
    if (!this.db) throw new Error('Storage not initialized');
    const records = await this.db.getAllFromIndex('conversations', 'by-updatedAt');
    const conversations: T[] = [];
    // Sort by updatedAt descending (most recent first)
    for (const record of records.reverse()) {
      conversations.push(await this.decryptData<T>(record.data));
    }
    return conversations;
  }

  async deleteConversation(id: string): Promise<void> {
    if (!this.db) throw new Error('Storage not initialized');
    await this.db.delete('conversations', id);
    // Also delete all messages in this conversation
    await this.deleteConversationMessages(id);
  }

  // ==================== Sessions ====================

  async saveSession(id: string, peerId: string, data: unknown): Promise<void> {
    if (!this.db) throw new Error('Storage not initialized');
    const encrypted = await this.encryptData(data);
    await this.db.put('sessions', { id, peerId, data: encrypted });
  }

  async getSession<T>(id: string): Promise<T | null> {
    if (!this.db) throw new Error('Storage not initialized');
    const record = await this.db.get('sessions', id);
    if (!record) return null;
    return this.decryptData<T>(record.data);
  }

  async getSessionByPeer<T>(peerId: string): Promise<T | null> {
    if (!this.db) throw new Error('Storage not initialized');
    const record = await this.db.getFromIndex('sessions', 'by-peer', peerId);
    if (!record) return null;
    return this.decryptData<T>(record.data);
  }

  async deleteSession(id: string): Promise<void> {
    if (!this.db) throw new Error('Storage not initialized');
    await this.db.delete('sessions', id);
  }

  // ==================== Settings ====================

  async saveSetting(key: string, value: unknown): Promise<void> {
    if (!this.db) throw new Error('Storage not initialized');
    const encrypted = await this.encryptData(value);
    await this.db.put('settings', { key, value: encrypted });
  }

  async getSetting<T>(key: string): Promise<T | null> {
    if (!this.db) throw new Error('Storage not initialized');
    const record = await this.db.get('settings', key);
    if (!record) return null;
    return this.decryptData<T>(record.value);
  }

  async deleteSetting(key: string): Promise<void> {
    if (!this.db) throw new Error('Storage not initialized');
    await this.db.delete('settings', key);
  }

  // ==================== Sync Queue ====================

  async addToSyncQueue(
    id: string,
    type: 'message' | 'contact' | 'conversation',
    action: 'create' | 'update' | 'delete',
    data: unknown
  ): Promise<void> {
    if (!this.db) throw new Error('Storage not initialized');
    const encrypted = await this.encryptData(data);
    await this.db.put('syncQueue', {
      id,
      type,
      action,
      data: encrypted,
      timestamp: Date.now(),
      retries: 0
    });
  }

  async getSyncQueue(): Promise<Array<{
    id: string;
    type: 'message' | 'contact' | 'conversation';
    action: 'create' | 'update' | 'delete';
    data: unknown;
    timestamp: number;
    retries: number;
  }>> {
    if (!this.db) throw new Error('Storage not initialized');
    const records = await this.db.getAllFromIndex('syncQueue', 'by-timestamp');
    const items: Array<{
      id: string;
      type: 'message' | 'contact' | 'conversation';
      action: 'create' | 'update' | 'delete';
      data: unknown;
      timestamp: number;
      retries: number;
    }> = [];
    for (const record of records) {
      items.push({
        id: record.id,
        type: record.type as 'message' | 'contact' | 'conversation',
        action: record.action as 'create' | 'update' | 'delete',
        data: await this.decryptData(record.data),
        timestamp: record.timestamp,
        retries: record.retries
      });
    }
    return items;
  }

  async incrementSyncRetry(id: string): Promise<void> {
    if (!this.db) throw new Error('Storage not initialized');
    const record = await this.db.get('syncQueue', id);
    if (record) {
      record.retries += 1;
      await this.db.put('syncQueue', record);
    }
  }

  async removeFromSyncQueue(id: string): Promise<void> {
    if (!this.db) throw new Error('Storage not initialized');
    await this.db.delete('syncQueue', id);
  }

  async clearSyncQueue(): Promise<void> {
    if (!this.db) throw new Error('Storage not initialized');
    await this.db.clear('syncQueue');
  }

  // ==================== Cleanup ====================

  async clearAll(): Promise<void> {
    if (!this.db) return;
    await this.db.clear('identity');
    await this.db.clear('contacts');
    await this.db.clear('conversations');
    await this.db.clear('messages');
    await this.db.clear('sessions');
    await this.db.clear('settings');
    await this.db.clear('syncQueue');
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.storageKey = null;
  }
}

export const encryptedStorage = new EncryptedStorage();
export default encryptedStorage;
