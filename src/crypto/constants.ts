// Metal Cryptographic Constants
export const CRYPTO_CONSTANTS = {
  // Key sizes (bytes)
  AES_KEY_SIZE: 32,           // 256 bits
  NONCE_SIZE: 12,             // 96 bits for AES-GCM
  AUTH_TAG_SIZE: 16,          // 128 bits
  X25519_KEY_SIZE: 32,        // 256 bits
  ED25519_KEY_SIZE: 32,       // 256 bits
  SALT_SIZE: 16,              // 128 bits
  
  // Argon2id parameters (simulated with PBKDF2 for browser)
  KDF_ITERATIONS: 100000,
  
  // Protocol parameters
  MAX_MESSAGE_SIZE: 65536,    // 64 KB
  PADDED_SIZE: 4096,          // Fixed padding size
  
  // Timeouts (ms)
  SESSION_TIMEOUT: 86400000,  // 24 hours
  IDLE_TIMEOUT: 900000,       // 15 minutes
} as const;

export const STORAGE_KEYS = {
  IDENTITY: 'metal_identity',
  CONTACTS: 'metal_contacts',
  MESSAGES: 'metal_messages',
  SESSIONS: 'metal_sessions',
  SETTINGS: 'metal_settings',
} as const;
