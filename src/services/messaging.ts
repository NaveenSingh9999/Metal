// Metal Messaging Service - Real-time encrypted messaging via Squid Cloud
import { squidCloud } from '../api/squid-cloud';
import { encrypt, decrypt, importAESKey } from '../crypto/aes';
import { computeSharedSecret } from '../crypto/x25519';
import { generateId, bytesToBase64, base64ToBytes } from '../crypto/utils';
import type { Message } from '../types';

export interface EncryptedEnvelope {
  id: string;
  fromMetalId: string;
  toMetalId: string;
  encryptedContent: string;  // Base64 encrypted message
  nonce: string;             // Base64 nonce
  timestamp: number;
  type: 'message' | 'typing' | 'read' | 'delivered';
}

export interface MessageCallback {
  (message: Message): void;
}

export interface TypingCallback {
  (metalId: string, isTyping: boolean): void;
}

class MessagingService {
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private myMetalId: string | null = null;
  private myPrivateKey: Uint8Array | null = null;
  private contactPublicKeys: Map<string, Uint8Array> = new Map();
  private lastPollTime: number = 0;
  private onMessage: MessageCallback | null = null;
  private onTyping: TypingCallback | null = null;
  private processedMessageIds: Set<string> = new Set();

  /**
   * Initialize the messaging service
   */
  initialize(
    metalId: string,
    privateKey: Uint8Array,
    onMessage: MessageCallback,
    onTyping: TypingCallback
  ): void {
    this.myMetalId = metalId;
    this.myPrivateKey = privateKey;
    this.onMessage = onMessage;
    this.onTyping = onTyping;
    this.lastPollTime = Date.now() - 60000; // Start from 1 minute ago
    
    // Start polling for messages
    this.startPolling();
  }

  /**
   * Add a contact's public key for encryption/decryption
   */
  addContactKey(metalId: string, publicKeyBase64: string): void {
    this.contactPublicKeys.set(metalId, base64ToBytes(publicKeyBase64));
  }

  /**
   * Remove a contact's public key
   */
  removeContactKey(metalId: string): void {
    this.contactPublicKeys.delete(metalId);
  }

  /**
   * Send an encrypted message
   */
  async sendMessage(
    toMetalId: string,
    toPublicKey: string,
    content: string,
    conversationId: string
  ): Promise<Message> {
    if (!this.myMetalId || !this.myPrivateKey) {
      throw new Error('Messaging service not initialized');
    }

    if (!squidCloud.isAuthenticated()) {
      throw new Error('Not connected to Metal network');
    }

    // Derive shared secret
    const recipientPubKey = base64ToBytes(toPublicKey);
    const sharedSecret = computeSharedSecret(this.myPrivateKey, recipientPubKey);

    // Create message object
    const message: Message = {
      id: generateId(),
      conversationId,
      senderId: this.myMetalId,
      senderMetalId: this.myMetalId,
      content,
      timestamp: Date.now(),
      type: 'text',
      status: 'sending',
      isEncrypted: true
    };

    // Encrypt the message content
    const messageData = JSON.stringify({
      content,
      conversationId,
      timestamp: message.timestamp
    });
    
    // Import shared secret as AES key and encrypt
    const aesKey = await importAESKey(sharedSecret.slice(0, 32));
    const encrypted = await encrypt(
      new TextEncoder().encode(messageData),
      aesKey
    );

    // Create envelope (encrypted data contains nonce + ciphertext)
    const envelope: EncryptedEnvelope = {
      id: message.id,
      fromMetalId: this.myMetalId,
      toMetalId,
      encryptedContent: bytesToBase64(encrypted),
      nonce: '', // Nonce is included in encrypted data
      timestamp: Date.now(),
      type: 'message'
    };

    // Upload to Squid Cloud as a message file
    const envelopeData = new TextEncoder().encode(JSON.stringify(envelope));
    const fileName = `messages/${toMetalId}/${Date.now()}_${message.id}.json`;
    
    await squidCloud.uploadEncryptedData(envelopeData, fileName, 'application/json');

    message.status = 'sent';
    return message;
  }

  /**
   * Send typing indicator
   */
  async sendTypingIndicator(toMetalId: string, isTyping: boolean): Promise<void> {
    if (!this.myMetalId || !squidCloud.isAuthenticated()) return;

    const envelope: EncryptedEnvelope = {
      id: generateId(),
      fromMetalId: this.myMetalId,
      toMetalId,
      encryptedContent: '',
      nonce: '',
      timestamp: Date.now(),
      type: 'typing'
    };

    // Only send if typing (not when stopped, to reduce traffic)
    if (isTyping) {
      const envelopeData = new TextEncoder().encode(JSON.stringify(envelope));
      const fileName = `typing/${toMetalId}/${this.myMetalId}.json`;
      
      try {
        await squidCloud.uploadEncryptedData(envelopeData, fileName, 'application/json');
      } catch {
        // Ignore typing indicator failures
      }
    }
  }

  /**
   * Send read receipt
   */
  async sendReadReceipt(toMetalId: string, messageIds: string[]): Promise<void> {
    if (!this.myMetalId || !squidCloud.isAuthenticated()) return;

    const envelope: EncryptedEnvelope = {
      id: generateId(),
      fromMetalId: this.myMetalId,
      toMetalId,
      encryptedContent: JSON.stringify(messageIds),
      nonce: '',
      timestamp: Date.now(),
      type: 'read'
    };

    const envelopeData = new TextEncoder().encode(JSON.stringify(envelope));
    const fileName = `receipts/${toMetalId}/${Date.now()}_read.json`;
    
    try {
      await squidCloud.uploadEncryptedData(envelopeData, fileName, 'application/json');
    } catch {
      // Ignore receipt failures
    }
  }

  /**
   * Start polling for new messages
   */
  private startPolling(): void {
    if (this.pollInterval) return;

    // Poll every 2 seconds for real-time feel
    this.pollInterval = setInterval(() => {
      this.pollMessages();
    }, 2000);

    // Initial poll
    this.pollMessages();
  }

  /**
   * Stop polling
   */
  stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /**
   * Poll for new messages
   */
  private async pollMessages(): Promise<void> {
    if (!this.myMetalId || !squidCloud.isAuthenticated()) return;

    try {
      const files = await squidCloud.listFiles();
      
      // Get messages for me
      const messageFiles = files.files.filter(f => 
        f.name.startsWith(`messages/${this.myMetalId}/`) && 
        f.name.endsWith('.json')
      );

      // Get typing indicators for me
      const typingFiles = files.files.filter(f =>
        f.name.startsWith(`typing/${this.myMetalId}/`) &&
        f.name.endsWith('.json')
      );

      // Process messages
      for (const file of messageFiles) {
        await this.processMessageFile(file.id, file.name);
      }

      // Process typing indicators
      for (const file of typingFiles) {
        await this.processTypingFile(file.id);
      }

      this.lastPollTime = Date.now();
    } catch (error) {
      console.error('Failed to poll messages:', error);
    }
  }

  /**
   * Process a message file
   */
  private async processMessageFile(fileId: string, fileName: string): Promise<void> {
    try {
      const data = await squidCloud.downloadAsBytes(fileId);
      const envelope = JSON.parse(new TextDecoder().decode(data)) as EncryptedEnvelope;

      // Skip if already processed
      if (this.processedMessageIds.has(envelope.id)) {
        return;
      }

      // Get sender's public key
      const senderPubKey = this.contactPublicKeys.get(envelope.fromMetalId);
      if (!senderPubKey || !this.myPrivateKey) {
        console.warn('Unknown sender or not initialized:', envelope.fromMetalId);
        return;
      }

      // Derive shared secret
      const sharedSecret = computeSharedSecret(this.myPrivateKey, senderPubKey);

      // Decrypt message (encrypted data contains nonce + ciphertext)
      const aesKey = await importAESKey(sharedSecret.slice(0, 32));
      const decrypted = await decrypt(
        base64ToBytes(envelope.encryptedContent),
        aesKey
      );

      const messageData = JSON.parse(new TextDecoder().decode(decrypted));

      // Create message object
      const message: Message = {
        id: envelope.id,
        conversationId: messageData.conversationId,
        senderId: envelope.fromMetalId,
        senderMetalId: envelope.fromMetalId,
        content: messageData.content,
        timestamp: messageData.timestamp,
        type: 'text',
        status: 'delivered',
        isEncrypted: true
      };

      this.processedMessageIds.add(envelope.id);

      // Notify callback
      if (this.onMessage) {
        this.onMessage(message);
      }

      // Delete the message file after processing
      try {
        await squidCloud.deleteFile(fileId);
      } catch {
        // Ignore delete failures
      }
    } catch (error) {
      console.error('Failed to process message:', error);
    }
  }

  /**
   * Process a typing indicator file
   */
  private async processTypingFile(fileId: string): Promise<void> {
    try {
      const data = await squidCloud.downloadAsBytes(fileId);
      const envelope = JSON.parse(new TextDecoder().decode(data)) as EncryptedEnvelope;

      // Check if typing indicator is recent (within 5 seconds)
      const isRecent = Date.now() - envelope.timestamp < 5000;

      if (this.onTyping) {
        this.onTyping(envelope.fromMetalId, isRecent);
      }

      // Delete old typing indicators
      if (!isRecent) {
        try {
          await squidCloud.deleteFile(fileId);
        } catch {
          // Ignore
        }
      }
    } catch (error) {
      console.error('Failed to process typing:', error);
    }
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.stopPolling();
    this.myMetalId = null;
    this.myPrivateKey = null;
    this.contactPublicKeys.clear();
    this.processedMessageIds.clear();
    this.onMessage = null;
    this.onTyping = null;
  }

  /**
   * Decrypt a message from the server
   */
  async decryptServerMessage(
    encryptedContent: string,
    senderPublicKey: string,
    myPrivateKey: Uint8Array
  ): Promise<string> {
    // Derive shared secret
    const senderPubKey = base64ToBytes(senderPublicKey);
    const sharedSecret = computeSharedSecret(myPrivateKey, senderPubKey);

    // Decrypt
    const aesKey = await importAESKey(sharedSecret.slice(0, 32));
    const decrypted = await decrypt(
      base64ToBytes(encryptedContent),
      aesKey
    );

    const messageData = JSON.parse(new TextDecoder().decode(decrypted));
    return messageData.content;
  }

  /**
   * Encrypt a message for the server
   */
  async encryptForServer(
    content: string,
    recipientPublicKey: string,
    myPrivateKey: Uint8Array,
    conversationId: string
  ): Promise<string> {
    // Derive shared secret
    const recipientPubKey = base64ToBytes(recipientPublicKey);
    const sharedSecret = computeSharedSecret(myPrivateKey, recipientPubKey);

    // Encrypt message content
    const messageData = JSON.stringify({
      content,
      conversationId,
      timestamp: Date.now()
    });

    const aesKey = await importAESKey(sharedSecret.slice(0, 32));
    const encrypted = await encrypt(
      new TextEncoder().encode(messageData),
      aesKey
    );

    return bytesToBase64(encrypted);
  }
}

export const messagingService = new MessagingService();
export default messagingService;
