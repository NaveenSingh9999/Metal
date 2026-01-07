// Metal AES-256-GCM Encryption
import { CRYPTO_CONSTANTS } from './constants';
import { randomBytes, concatBytes } from './utils';

export interface EncryptedData {
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  authTag?: Uint8Array; // Included in ciphertext for GCM
}

/**
 * Generate a new AES-256 key
 */
export async function generateAESKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Import raw bytes as AES key
 */
export async function importAESKey(keyBytes: Uint8Array): Promise<CryptoKey> {
  // Create a proper ArrayBuffer copy to avoid SharedArrayBuffer issues
  const buffer = new ArrayBuffer(keyBytes.length);
  new Uint8Array(buffer).set(keyBytes);
  
  return crypto.subtle.importKey(
    'raw',
    buffer,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Export AES key to raw bytes
 */
export async function exportAESKey(key: CryptoKey): Promise<Uint8Array> {
  const exported = await crypto.subtle.exportKey('raw', key);
  return new Uint8Array(exported);
}

/**
 * Encrypt data with AES-256-GCM
 */
export async function encrypt(
  plaintext: Uint8Array,
  key: CryptoKey,
  additionalData?: Uint8Array
): Promise<Uint8Array> {
  const nonce = randomBytes(CRYPTO_CONSTANTS.NONCE_SIZE);
  
  // Create proper ArrayBuffer copies
  const nonceBuffer = new ArrayBuffer(nonce.length);
  new Uint8Array(nonceBuffer).set(nonce);
  
  const encryptOptions: AesGcmParams = {
    name: 'AES-GCM',
    iv: nonceBuffer,
    tagLength: 128
  };
  
  if (additionalData) {
    const adBuffer = new ArrayBuffer(additionalData.length);
    new Uint8Array(adBuffer).set(additionalData);
    encryptOptions.additionalData = adBuffer;
  }
  
  // Create proper ArrayBuffer for plaintext
  const plaintextBuffer = new ArrayBuffer(plaintext.length);
  new Uint8Array(plaintextBuffer).set(plaintext);
  
  const ciphertext = await crypto.subtle.encrypt(
    encryptOptions,
    key,
    plaintextBuffer
  );
  
  // Format: nonce (12 bytes) + ciphertext + authTag
  return concatBytes(nonce, new Uint8Array(ciphertext));
}

/**
 * Decrypt data with AES-256-GCM
 */
export async function decrypt(
  encryptedData: Uint8Array,
  key: CryptoKey,
  additionalData?: Uint8Array
): Promise<Uint8Array> {
  const nonce = encryptedData.slice(0, CRYPTO_CONSTANTS.NONCE_SIZE);
  const ciphertext = encryptedData.slice(CRYPTO_CONSTANTS.NONCE_SIZE);
  
  // Create proper ArrayBuffer copies
  const nonceBuffer = new ArrayBuffer(nonce.length);
  new Uint8Array(nonceBuffer).set(nonce);
  
  const decryptOptions: AesGcmParams = {
    name: 'AES-GCM',
    iv: nonceBuffer,
    tagLength: 128
  };
  
  if (additionalData) {
    const adBuffer = new ArrayBuffer(additionalData.length);
    new Uint8Array(adBuffer).set(additionalData);
    decryptOptions.additionalData = adBuffer;
  }
  
  // Create proper ArrayBuffer for ciphertext
  const ciphertextBuffer = new ArrayBuffer(ciphertext.length);
  new Uint8Array(ciphertextBuffer).set(ciphertext);
  
  const plaintext = await crypto.subtle.decrypt(
    decryptOptions,
    key,
    ciphertextBuffer
  );
  
  return new Uint8Array(plaintext);
}

/**
 * Encrypt a string message
 */
export async function encryptMessage(
  message: string,
  key: CryptoKey
): Promise<string> {
  const plaintext = new TextEncoder().encode(message);
  const encrypted = await encrypt(plaintext, key);
  return btoa(String.fromCharCode(...encrypted));
}

/**
 * Decrypt a string message
 */
export async function decryptMessage(
  encryptedBase64: string,
  key: CryptoKey
): Promise<string> {
  const encrypted = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
  const decrypted = await decrypt(encrypted, key);
  return new TextDecoder().decode(decrypted);
}
