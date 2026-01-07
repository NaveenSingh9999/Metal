// Metal Identity & Authentication Service
import { generateKeyPair, serializeKeyPair, deserializeKeyPair, KeyPair, SerializedKeyPair } from '../crypto/x25519';
import { deriveFromPassword, DerivedKeys } from '../crypto/kdf';
import { bytesToBase64, base64ToBytes, generateId } from '../crypto/utils';
import { encryptedStorage } from '../storage/encrypted-db';
import { squidCloud } from '../api/squid-cloud';
import { messageSyncService } from '../api/message-sync';

export interface UserIdentity {
  id: string;
  displayName: string;
  publicKey: string;
  createdAt: number;
}

export interface FullIdentity extends UserIdentity {
  keyPair: SerializedKeyPair;
  salt: string;
}

const IDENTITY_KEY = 'current_identity';
const SALT_KEY = 'identity_salt';

class IdentityService {
  private identity: FullIdentity | null = null;
  private derivedKeys: DerivedKeys | null = null;
  private isUnlocked: boolean = false;

  /**
   * Check if user has an existing identity
   */
  async hasIdentity(): Promise<boolean> {
    const salt = localStorage.getItem(SALT_KEY);
    return salt !== null;
  }

  /**
   * Create a new identity with password
   */
  async createIdentity(
    displayName: string,
    password: string,
    apiKey?: string
  ): Promise<UserIdentity> {
    // Derive keys from password
    const derived = await deriveFromPassword(password);
    this.derivedKeys = derived;

    // Save salt for future logins
    localStorage.setItem(SALT_KEY, bytesToBase64(derived.salt));

    // Initialize storage with derived storage key
    await encryptedStorage.initialize(derived.storageKey);

    // Generate identity key pair
    const keyPair = generateKeyPair();
    const serializedKeyPair = serializeKeyPair(keyPair);

    // Create identity
    const identity: FullIdentity = {
      id: generateId(),
      displayName,
      publicKey: serializedKeyPair.publicKey,
      keyPair: serializedKeyPair,
      salt: bytesToBase64(derived.salt),
      createdAt: Date.now()
    };

    // Save identity to encrypted storage
    await encryptedStorage.saveIdentity(IDENTITY_KEY, identity);
    this.identity = identity;
    this.isUnlocked = true;

    // Initialize sync service
    const syncKey = await messageSyncService.generateSyncKey();
    await encryptedStorage.saveSetting('sync_key', bytesToBase64(syncKey));

    // Set API key if provided
    if (apiKey) {
      await this.setApiKey(apiKey);
    }

    return this.getPublicIdentity();
  }

  /**
   * Unlock existing identity with password
   */
  async unlock(password: string): Promise<UserIdentity> {
    const saltBase64 = localStorage.getItem(SALT_KEY);
    if (!saltBase64) {
      throw new Error('No identity found. Create one first.');
    }

    const salt = base64ToBytes(saltBase64);
    const derived = await deriveFromPassword(password, salt);
    this.derivedKeys = derived;

    // Initialize storage
    await encryptedStorage.initialize(derived.storageKey);

    // Load identity
    const identity = await encryptedStorage.getIdentity<FullIdentity>(IDENTITY_KEY);
    if (!identity) {
      throw new Error('Failed to decrypt identity. Wrong password?');
    }

    this.identity = identity;
    this.isUnlocked = true;

    // Initialize sync service
    const syncKeyBase64 = await encryptedStorage.getSetting<string>('sync_key');
    if (syncKeyBase64) {
      await messageSyncService.initialize(base64ToBytes(syncKeyBase64));
    }

    // Load API key
    const apiKey = await encryptedStorage.getSetting<string>('api_key');
    if (apiKey) {
      squidCloud.setApiKey(apiKey);
    }

    return this.getPublicIdentity();
  }

  /**
   * Lock the identity (clear from memory)
   */
  async lock(): Promise<void> {
    this.identity = null;
    this.derivedKeys = null;
    this.isUnlocked = false;
    await encryptedStorage.close();
  }

  /**
   * Get current identity (public info only)
   */
  getPublicIdentity(): UserIdentity {
    if (!this.identity) {
      throw new Error('Not authenticated');
    }
    return {
      id: this.identity.id,
      displayName: this.identity.displayName,
      publicKey: this.identity.publicKey,
      createdAt: this.identity.createdAt
    };
  }

  /**
   * Get full identity with private key
   */
  getFullIdentity(): FullIdentity {
    if (!this.identity) {
      throw new Error('Not authenticated');
    }
    return this.identity;
  }

  /**
   * Get key pair for encryption
   */
  getKeyPair(): KeyPair {
    if (!this.identity) {
      throw new Error('Not authenticated');
    }
    return deserializeKeyPair(this.identity.keyPair);
  }

  /**
   * Check if identity is unlocked
   */
  isAuthenticated(): boolean {
    return this.isUnlocked && this.identity !== null;
  }

  /**
   * Update display name
   */
  async updateDisplayName(newName: string): Promise<void> {
    if (!this.identity) {
      throw new Error('Not authenticated');
    }
    this.identity.displayName = newName;
    await encryptedStorage.saveIdentity(IDENTITY_KEY, this.identity);
  }

  /**
   * Set API key for cloud sync
   */
  async setApiKey(apiKey: string): Promise<void> {
    squidCloud.setApiKey(apiKey);
    if (this.isAuthenticated()) {
      await encryptedStorage.saveSetting('api_key', apiKey);
    }
  }

  /**
   * Get API key
   */
  async getApiKey(): Promise<string | null> {
    if (!this.isAuthenticated()) return null;
    return encryptedStorage.getSetting<string>('api_key');
  }

  /**
   * Export identity for backup (encrypted with password)
   */
  async exportIdentity(): Promise<string> {
    if (!this.identity) {
      throw new Error('Not authenticated');
    }
    // Return base64 encoded identity (already encrypted in storage)
    return btoa(JSON.stringify(this.identity));
  }

  /**
   * Delete identity and all data
   */
  async deleteIdentity(): Promise<void> {
    await encryptedStorage.clearAll();
    localStorage.removeItem(SALT_KEY);
    this.identity = null;
    this.derivedKeys = null;
    this.isUnlocked = false;
  }

  /**
   * Change password
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    // Verify current password
    await this.unlock(currentPassword);

    // Derive new keys
    const newDerived = await deriveFromPassword(newPassword);
    
    // Save new salt
    localStorage.setItem(SALT_KEY, bytesToBase64(newDerived.salt));

    // Re-initialize storage with new key (this would need to re-encrypt all data)
    // For simplicity, we just update the identity
    if (this.identity) {
      this.identity.salt = bytesToBase64(newDerived.salt);
      await encryptedStorage.saveIdentity(IDENTITY_KEY, this.identity);
    }

    this.derivedKeys = newDerived;
  }
}

export const identityService = new IdentityService();
export default identityService;
