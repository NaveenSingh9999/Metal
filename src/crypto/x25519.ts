// Metal X25519 Key Exchange
import { x25519 } from '@noble/curves/ed25519';
import { randomBytes, bytesToBase64, base64ToBytes } from './utils';

export interface KeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface SerializedKeyPair {
  publicKey: string;
  privateKey: string;
}

/**
 * Generate a new X25519 key pair
 */
export function generateKeyPair(): KeyPair {
  const privateKey = randomBytes(32);
  const publicKey = x25519.getPublicKey(privateKey);
  return { publicKey, privateKey };
}

/**
 * Compute shared secret from private key and peer's public key
 */
export function computeSharedSecret(
  privateKey: Uint8Array,
  peerPublicKey: Uint8Array
): Uint8Array {
  return x25519.getSharedSecret(privateKey, peerPublicKey);
}

/**
 * Serialize key pair for storage
 */
export function serializeKeyPair(keyPair: KeyPair): SerializedKeyPair {
  return {
    publicKey: bytesToBase64(keyPair.publicKey),
    privateKey: bytesToBase64(keyPair.privateKey)
  };
}

/**
 * Deserialize key pair from storage
 */
export function deserializeKeyPair(serialized: SerializedKeyPair): KeyPair {
  return {
    publicKey: base64ToBytes(serialized.publicKey),
    privateKey: base64ToBytes(serialized.privateKey)
  };
}

/**
 * Generate ephemeral key pair for a single message
 */
export function generateEphemeralKeyPair(): KeyPair {
  return generateKeyPair();
}

/**
 * Perform X3DH key agreement (simplified)
 * In production, implement full X3DH with pre-keys
 */
export function performKeyExchange(
  ourIdentityPrivate: Uint8Array,
  ourEphemeralPrivate: Uint8Array,
  theirIdentityPublic: Uint8Array,
  theirEphemeralPublic: Uint8Array
): Uint8Array {
  // DH1 = DH(ourIdentity, theirEphemeral)
  const dh1 = computeSharedSecret(ourIdentityPrivate, theirEphemeralPublic);
  
  // DH2 = DH(ourEphemeral, theirIdentity)
  const dh2 = computeSharedSecret(ourEphemeralPrivate, theirIdentityPublic);
  
  // DH3 = DH(ourEphemeral, theirEphemeral)
  const dh3 = computeSharedSecret(ourEphemeralPrivate, theirEphemeralPublic);
  
  // Concatenate all DH outputs
  const combined = new Uint8Array(96);
  combined.set(dh1, 0);
  combined.set(dh2, 32);
  combined.set(dh3, 64);
  
  return combined;
}
