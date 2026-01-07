// Metal Crypto Utilities
import { CRYPTO_CONSTANTS } from './constants';

/**
 * Generate cryptographically secure random bytes
 */
export function randomBytes(size: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(size));
}

/**
 * Convert Uint8Array to hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert hex string to Uint8Array
 */
export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Convert Uint8Array to base64
 */
export function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Convert base64 to Uint8Array
 */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Constant-time comparison of two byte arrays
 */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

/**
 * Securely zero a byte array
 */
export function zeroBytes(arr: Uint8Array): void {
  crypto.getRandomValues(arr);
  arr.fill(0);
}

/**
 * Pad message to fixed length to hide actual size
 */
export function padMessage(data: Uint8Array): Uint8Array {
  const paddedSize = Math.max(CRYPTO_CONSTANTS.PADDED_SIZE, data.length + 4);
  const padded = new Uint8Array(paddedSize);
  
  // First 4 bytes are the actual message length (big-endian)
  const view = new DataView(padded.buffer);
  view.setUint32(0, data.length, false);
  
  // Copy message data
  padded.set(data, 4);
  
  // Fill rest with random padding
  const padding = randomBytes(paddedSize - 4 - data.length);
  padded.set(padding, 4 + data.length);
  
  return padded;
}

/**
 * Unpad message
 */
export function unpadMessage(padded: Uint8Array): Uint8Array {
  const view = new DataView(padded.buffer, padded.byteOffset);
  const length = view.getUint32(0, false);
  return padded.slice(4, 4 + length);
}

/**
 * Generate a UUID v4
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Encode string to Uint8Array
 */
export function encodeString(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/**
 * Decode Uint8Array to string
 */
export function decodeString(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/**
 * Concatenate multiple Uint8Arrays
 */
export function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}
