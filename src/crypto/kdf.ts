// Metal Key Derivation Functions
import { sha256 } from '@noble/hashes/sha256';
import { hkdf } from '@noble/hashes/hkdf';
import { CRYPTO_CONSTANTS } from './constants';
import { randomBytes, encodeString } from './utils';

export interface DerivedKeys {
  masterKey: Uint8Array;
  identityKey: Uint8Array;
  storageKey: Uint8Array;
  salt: Uint8Array;
}

/**
 * Derive keys from password using PBKDF2 (browser-native)
 * For production, use Argon2id via WASM
 */
export async function deriveFromPassword(
  password: string,
  salt?: Uint8Array
): Promise<DerivedKeys> {
  const actualSalt = salt || randomBytes(CRYPTO_CONSTANTS.SALT_SIZE);
  
  // Convert password to ArrayBuffer
  const passwordBytes = encodeString(password);
  
  // Create proper ArrayBuffer copies to avoid SharedArrayBuffer issues
  const passwordBuffer = new ArrayBuffer(passwordBytes.length);
  new Uint8Array(passwordBuffer).set(passwordBytes);
  
  const saltBuffer = new ArrayBuffer(actualSalt.length);
  new Uint8Array(saltBuffer).set(actualSalt);
  
  // Import password as key material
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveBits']
  );
  
  // Derive master key using PBKDF2
  const masterKeyBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: CRYPTO_CONSTANTS.KDF_ITERATIONS,
      hash: 'SHA-256'
    },
    passwordKey,
    256
  );
  
  const masterKey = new Uint8Array(masterKeyBits);
  
  // Derive sub-keys using HKDF
  const identityKey = hkdf(sha256, masterKey, actualSalt, encodeString('metal-identity'), 32);
  const storageKey = hkdf(sha256, masterKey, actualSalt, encodeString('metal-storage'), 32);
  
  return {
    masterKey,
    identityKey,
    storageKey,
    salt: actualSalt
  };
}

/**
 * Derive a shared secret for message encryption
 */
export function deriveMessageKey(
  sharedSecret: Uint8Array,
  messageId: string
): Uint8Array {
  return hkdf(
    sha256,
    sharedSecret,
    encodeString(messageId),
    encodeString('metal-message'),
    32
  );
}

/**
 * Derive chain key for ratchet
 */
export function deriveChainKey(
  rootKey: Uint8Array,
  dhOutput: Uint8Array
): { rootKey: Uint8Array; chainKey: Uint8Array } {
  const derived = hkdf(sha256, dhOutput, rootKey, encodeString('metal-chain'), 64);
  return {
    rootKey: derived.slice(0, 32),
    chainKey: derived.slice(32, 64)
  };
}

/**
 * Advance chain key and derive message key
 */
export function advanceChainKey(
  chainKey: Uint8Array
): { messageKey: Uint8Array; nextChainKey: Uint8Array } {
  const messageKey = hkdf(sha256, chainKey, new Uint8Array(), encodeString('metal-msg-key'), 32);
  const nextChainKey = hkdf(sha256, chainKey, new Uint8Array(), encodeString('metal-chain-next'), 32);
  return { messageKey, nextChainKey };
}
