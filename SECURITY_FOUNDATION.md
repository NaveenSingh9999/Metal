# Metal Security Foundation

> **Metal** - A Zero-Trust, End-to-End Encrypted, Decentralized Messaging Platform

---

## Table of Contents

1. [Core Security Principles](#core-security-principles)
2. [Cryptographic Architecture](#cryptographic-architecture)
3. [Key Management](#key-management)
4. [Message Protocol](#message-protocol)
5. [Zero-Logging Policy](#zero-logging-policy)
6. [Decentralization Architecture](#decentralization-architecture)
7. [Client-Side Security](#client-side-security)
8. [Network Security](#network-security)
9. [Implementation Guidelines](#implementation-guidelines)
10. [Threat Model](#threat-model)
11. [Technology Stack](#technology-stack)

---

## Core Security Principles

### 1. Zero-Trust Architecture
- **Never trust, always verify** - Every component assumes breach
- No implicit trust between any system components
- All data is encrypted at rest and in transit
- Authentication required for every operation

### 2. Privacy by Design
- Collect minimum necessary data
- No metadata retention
- User data never leaves client unencrypted
- Forward secrecy for all communications

### 3. Defense in Depth
- Multiple layers of security controls
- Fail-secure defaults
- Cryptographic isolation between users

### 4. Open Security
- Security through robust cryptography, not obscurity
- Open-source cryptographic implementations
- Regular security audits

---

## Cryptographic Architecture

### Encryption Algorithms

| Purpose | Algorithm | Key Size | Notes |
|---------|-----------|----------|-------|
| Symmetric Encryption | AES-256-GCM | 256-bit | Messages, file encryption |
| Asymmetric Encryption | X25519 | 256-bit | Key exchange |
| Digital Signatures | Ed25519 | 256-bit | Identity verification |
| Key Derivation | Argon2id | - | Password-based key derivation |
| Hashing | BLAKE3 / SHA-256 | 256-bit | Integrity verification |
| HMAC | HMAC-SHA256 | 256-bit | Message authentication |

### End-to-End Encryption (E2EE)

```
┌─────────────────────────────────────────────────────────────────┐
│                    E2EE Message Flow                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Sender                                          Recipient      │
│  ┌─────┐                                         ┌─────┐       │
│  │Alice│                                         │ Bob │       │
│  └──┬──┘                                         └──┬──┘       │
│     │                                               │          │
│     │ 1. Generate ephemeral key pair               │          │
│     │ 2. Derive shared secret (X25519)             │          │
│     │ 3. Derive message key (HKDF)                 │          │
│     │ 4. Encrypt message (AES-256-GCM)             │          │
│     │                                               │          │
│     │────────── Encrypted Payload ─────────────────>│          │
│     │                                               │          │
│     │                    5. Derive shared secret    │          │
│     │                    6. Derive message key      │          │
│     │                    7. Decrypt message         │          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Double Ratchet Protocol (Signal Protocol Inspired)

Metal implements a Double Ratchet algorithm for:
- **Forward Secrecy**: Compromised keys don't expose past messages
- **Future Secrecy**: Recovery from key compromise
- **Deniability**: Cryptographic deniability of messages

#### Ratchet Components:

1. **Root Chain**: Derives new chain keys from DH ratchet
2. **Sending Chain**: Derives message keys for outgoing messages
3. **Receiving Chain**: Derives message keys for incoming messages

```typescript
interface RatchetState {
  rootKey: Uint8Array;           // 32 bytes
  sendingChainKey: Uint8Array;   // 32 bytes
  receivingChainKey: Uint8Array; // 32 bytes
  sendingEphemeralKey: KeyPair;
  receivingEphemeralPublicKey: Uint8Array;
  previousSendingChainLength: number;
  sendingChainLength: number;
  receivingChainLength: number;
  skippedMessageKeys: Map<string, Uint8Array>;
}
```

---

## Key Management

### Key Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│                      Key Hierarchy                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────┐                   │
│  │         Master Password (User)          │                   │
│  └────────────────────┬────────────────────┘                   │
│                       │ Argon2id                               │
│                       ▼                                        │
│  ┌─────────────────────────────────────────┐                   │
│  │      Master Encryption Key (MEK)        │                   │
│  └────────────────────┬────────────────────┘                   │
│                       │                                        │
│          ┌────────────┼────────────┐                          │
│          ▼            ▼            ▼                          │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐                   │
│  │ Identity  │ │  Storage  │ │  Backup   │                   │
│  │   Keys    │ │   Keys    │ │   Keys    │                   │
│  └─────┬─────┘ └───────────┘ └───────────┘                   │
│        │                                                       │
│        ▼                                                       │
│  ┌───────────────────────────────────────────────────┐        │
│  │              Per-Conversation Keys                │        │
│  │  (Session Keys, Chain Keys, Message Keys)         │        │
│  └───────────────────────────────────────────────────┘        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Identity Keys

```typescript
interface IdentityKeyPair {
  // Long-term identity key pair (Ed25519)
  identityPublicKey: Uint8Array;  // 32 bytes - shared publicly
  identityPrivateKey: Uint8Array; // 32 bytes - never leaves device
  
  // Signed pre-keys (X25519) - rotated periodically
  signedPreKey: {
    keyId: number;
    publicKey: Uint8Array;
    privateKey: Uint8Array;
    signature: Uint8Array; // Signed by identity key
    createdAt: number;
  };
  
  // One-time pre-keys (X25519) - used once per session
  oneTimePreKeys: Array<{
    keyId: number;
    publicKey: Uint8Array;
    privateKey: Uint8Array;
  }>;
}
```

### Key Generation

```typescript
// Password-based key derivation
interface KeyDerivationParams {
  algorithm: 'argon2id';
  memoryCost: 65536;     // 64 MB
  timeCost: 3;           // 3 iterations
  parallelism: 4;        // 4 threads
  saltLength: 16;        // 128-bit salt
  keyLength: 32;         // 256-bit output
}

// Key generation flow
async function deriveKeys(password: string, salt: Uint8Array): Promise<MasterKey> {
  // 1. Derive master key from password
  const masterKey = await argon2id(password, salt, keyDerivationParams);
  
  // 2. Derive sub-keys using HKDF
  const identityKey = await hkdf(masterKey, "identity-key");
  const storageKey = await hkdf(masterKey, "storage-key");
  const backupKey = await hkdf(masterKey, "backup-key");
  
  return { identityKey, storageKey, backupKey };
}
```

### Key Storage

- **Never store raw keys** - Always encrypt with derived key
- **Memory protection** - Zero memory after use
- **Secure enclave** - Use WebCrypto non-extractable keys when possible
- **Key rotation** - Automatic rotation policies

```typescript
interface SecureKeyStore {
  // Store encrypted key
  store(keyId: string, key: CryptoKey, encryptionKey: CryptoKey): Promise<void>;
  
  // Retrieve and decrypt key
  retrieve(keyId: string, decryptionKey: CryptoKey): Promise<CryptoKey>;
  
  // Securely delete key
  delete(keyId: string): Promise<void>;
  
  // Zero all keys from memory
  zeroize(): void;
}
```

---

## Message Protocol

### Message Structure

```typescript
interface EncryptedMessage {
  version: 1;                        // Protocol version
  messageId: string;                 // UUID v4
  timestamp: number;                 // Encrypted timestamp
  
  // Header (authenticated but not encrypted)
  header: {
    senderIdentityKey: Uint8Array;   // 32 bytes
    ephemeralKey: Uint8Array;        // 32 bytes
    previousChainLength: number;
    messageNumber: number;
  };
  
  // Encrypted payload
  ciphertext: Uint8Array;            // AES-256-GCM encrypted
  nonce: Uint8Array;                 // 12 bytes
  authTag: Uint8Array;               // 16 bytes
}

interface PlaintextMessage {
  type: 'text' | 'media' | 'file' | 'system';
  content: string | Uint8Array;
  contentType?: string;              // MIME type for media
  replyTo?: string;                  // Message ID
  expiresIn?: number;                // Self-destruct timer (seconds)
  metadata: {
    timestamp: number;
    edited: boolean;
    editedAt?: number;
  };
}
```

### Message Flow

```
┌────────────────────────────────────────────────────────────────────┐
│                     Secure Message Flow                            │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  1. COMPOSE                                                        │
│     └─> User types message                                         │
│                                                                    │
│  2. SERIALIZE                                                      │
│     └─> Convert to binary format (MessagePack/CBOR)               │
│                                                                    │
│  3. PAD                                                            │
│     └─> Add random padding to fixed length (hide message size)    │
│                                                                    │
│  4. ENCRYPT                                                        │
│     └─> AES-256-GCM with derived message key                      │
│                                                                    │
│  5. AUTHENTICATE                                                   │
│     └─> Attach HMAC for header authentication                     │
│                                                                    │
│  6. TRANSMIT                                                       │
│     └─> Send via encrypted channel (TLS 1.3 + Noise Protocol)    │
│                                                                    │
│  7. RECEIVE                                                        │
│     └─> Verify, decrypt, unpad, deserialize                       │
│                                                                    │
│  8. DISPLAY                                                        │
│     └─> Show to recipient                                         │
│                                                                    │
│  9. CLEANUP                                                        │
│     └─> Zero sensitive data from memory                           │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Perfect Forward Secrecy

Every message uses a unique key derived from the ratchet:

```typescript
async function deriveMessageKey(chainKey: Uint8Array, messageNumber: number): Promise<{
  messageKey: Uint8Array;
  newChainKey: Uint8Array;
}> {
  // Derive message key
  const messageKey = await hmac(chainKey, new Uint8Array([0x01]));
  
  // Advance chain key
  const newChainKey = await hmac(chainKey, new Uint8Array([0x02]));
  
  return { messageKey, newChainKey };
}
```

---

## Zero-Logging Policy

### What We NEVER Log

| Category | Items |
|----------|-------|
| **Message Content** | Plaintext, encrypted content, attachments |
| **Metadata** | Sender/recipient pairs, timestamps, frequency |
| **User Data** | Names, contacts, profile information |
| **Connection Data** | IP addresses, device fingerprints, locations |
| **Keys** | Any cryptographic material |
| **Session Data** | Login times, session durations |

### Technical Enforcement

```typescript
// Secure logging wrapper - only logs non-sensitive operational data
class SecureLogger {
  private static readonly FORBIDDEN_PATTERNS = [
    /key/i, /password/i, /secret/i, /token/i,
    /message/i, /content/i, /user/i, /ip/i,
    /address/i, /email/i, /phone/i
  ];

  static log(category: 'error' | 'debug' | 'perf', data: object): void {
    if (process.env.NODE_ENV === 'production') {
      return; // No logging in production
    }
    
    // Sanitize in development
    const sanitized = this.sanitize(data);
    console.log(`[${category}]`, sanitized);
  }

  private static sanitize(data: object): object {
    // Deep clone and redact sensitive fields
    return JSON.parse(JSON.stringify(data, (key, value) => {
      if (this.FORBIDDEN_PATTERNS.some(p => p.test(key))) {
        return '[REDACTED]';
      }
      return value;
    }));
  }
}
```

### Memory Protection

```typescript
// Secure memory handling
class SecureBuffer {
  private buffer: Uint8Array;
  private isZeroed: boolean = false;

  constructor(size: number) {
    this.buffer = new Uint8Array(size);
  }

  // Zero memory before deallocation
  zeroize(): void {
    if (!this.isZeroed) {
      crypto.getRandomValues(this.buffer); // Overwrite with random
      this.buffer.fill(0);                  // Then zero
      this.isZeroed = true;
    }
  }

  // Automatic cleanup
  [Symbol.dispose](): void {
    this.zeroize();
  }
}

// Usage with explicit resource management
async function processMessage(encryptedData: Uint8Array): Promise<void> {
  using decryptedBuffer = new SecureBuffer(encryptedData.length);
  // ... process message
  // Buffer automatically zeroed when scope exits
}
```

---

## Decentralization Architecture

### Network Topology

```
┌─────────────────────────────────────────────────────────────────┐
│                  Decentralized Network                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│    ┌─────┐         ┌─────┐         ┌─────┐                    │
│    │Node │◄───────►│Node │◄───────►│Node │                    │
│    │  A  │         │  B  │         │  C  │                    │
│    └──┬──┘         └──┬──┘         └──┬──┘                    │
│       │               │               │                        │
│       │    ┌─────┐    │    ┌─────┐   │                        │
│       └───►│Node │◄───┴───►│Node │◄──┘                        │
│            │  D  │         │  E  │                            │
│            └──┬──┘         └──┬──┘                            │
│               │               │                                │
│          ┌────┴────┐    ┌────┴────┐                           │
│          │ Client  │    │ Client  │                           │
│          │  Alice  │    │   Bob   │                           │
│          └─────────┘    └─────────┘                           │
│                                                                 │
│  • No central server                                           │
│  • Messages routed through multiple nodes                      │
│  • Each node only sees encrypted data                          │
│  • No single point of failure                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Peer Discovery

```typescript
interface PeerDiscovery {
  // DHT-based peer discovery
  dht: {
    protocol: 'Kademlia';
    bootstrap: string[];  // Bootstrap node addresses
    k: 20;                // Bucket size
    alpha: 3;             // Concurrency parameter
  };

  // WebRTC for direct P2P when possible
  webrtc: {
    iceServers: RTCIceServer[];
    dataChannelConfig: RTCDataChannelInit;
  };

  // Relay nodes for NAT traversal
  relay: {
    protocol: 'TURN-over-WebSocket';
    encryption: 'always';
  };
}
```

### Message Routing

```typescript
interface RoutingStrategy {
  // Onion routing for privacy
  onionRouting: {
    layers: 3;                    // Number of encryption layers
    pathLength: 3;                // Number of relay nodes
    pathSelectionStrategy: 'random' | 'latency-optimized';
  };

  // Message persistence
  persistence: {
    strategy: 'distributed-storage';
    redundancy: 3;                // Store on 3 nodes
    ttl: 604800;                  // 7 days max
    encryptedAtRest: true;
  };

  // Delivery confirmation
  delivery: {
    acknowledgments: true;
    retryStrategy: 'exponential-backoff';
    maxRetries: 10;
  };
}
```

### Distributed Storage

```typescript
interface DistributedStorage {
  // Encrypted message store
  interface MessageStore {
    // Store encrypted message blob
    put(
      messageId: string,
      encryptedBlob: Uint8Array,
      recipientKeyHash: string  // For routing, not decryption
    ): Promise<void>;

    // Retrieve by recipient key hash
    get(recipientKeyHash: string): Promise<EncryptedMessage[]>;

    // Delete after retrieval
    delete(messageId: string): Promise<void>;
  }

  // Content-addressed storage for files
  interface FileStore {
    // Store encrypted file chunks
    put(chunks: Uint8Array[]): Promise<string[]>; // Returns chunk hashes
    
    // Retrieve chunks
    get(chunkHashes: string[]): Promise<Uint8Array[]>;
  }
}
```

---

## Client-Side Security

### Browser Security Measures

```typescript
// Content Security Policy
const cspPolicy = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'wasm-unsafe-eval'"],  // For crypto WASM
  'style-src': ["'self'", "'unsafe-inline'"],      // For styled-components
  'connect-src': ["'self'", 'wss:', 'https:'],
  'img-src': ["'self'", 'blob:', 'data:'],
  'worker-src': ["'self'", 'blob:'],
  'frame-ancestors': ["'none'"],
  'form-action': ["'none'"],
  'base-uri': ["'self'"],
  'upgrade-insecure-requests': true
};

// Security headers
const securityHeaders = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin'
};
```

### Secure Storage

```typescript
// IndexedDB with encryption layer
class EncryptedStorage {
  private storageKey: CryptoKey;

  async set(key: string, value: unknown): Promise<void> {
    const serialized = JSON.stringify(value);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      this.storageKey,
      new TextEncoder().encode(serialized)
    );
    
    await this.db.put('store', {
      key,
      iv: Array.from(iv),
      data: Array.from(new Uint8Array(encrypted))
    });
  }

  async get<T>(key: string): Promise<T | null> {
    const record = await this.db.get('store', key);
    if (!record) return null;
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(record.iv) },
      this.storageKey,
      new Uint8Array(record.data)
    );
    
    return JSON.parse(new TextDecoder().decode(decrypted));
  }
}
```

### Input Sanitization

```typescript
// XSS prevention for message display
import DOMPurify from 'dompurify';

const sanitizeConfig = {
  ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'code', 'pre'],
  ALLOWED_ATTR: ['href', 'title'],
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form'],
  FORBID_ATTR: ['onclick', 'onerror', 'onload'],
  USE_PROFILES: { html: true }
};

function sanitizeMessage(content: string): string {
  return DOMPurify.sanitize(content, sanitizeConfig);
}
```

### Session Security

```typescript
interface SessionSecurity {
  // Session timeout
  idleTimeout: 900000;        // 15 minutes
  absoluteTimeout: 86400000;  // 24 hours
  
  // Screen lock
  screenLock: {
    enabled: true;
    timeout: 60000;           // 1 minute
    requireReauth: true;
  };
  
  // Clipboard security
  clipboard: {
    autoClear: true;
    clearTimeout: 60000;      // 1 minute
  };
  
  // Screenshot prevention (where supported)
  screenshotProtection: true;
}
```

---

## Network Security

### Transport Layer Security

```typescript
interface TransportSecurity {
  // TLS configuration
  tls: {
    minVersion: 'TLSv1.3';
    cipherSuites: [
      'TLS_AES_256_GCM_SHA384',
      'TLS_CHACHA20_POLY1305_SHA256'
    ];
    certificatePinning: true;
    ocspStapling: true;
  };

  // Additional Noise Protocol layer
  noise: {
    handshakePattern: 'IK';   // Static sender, known recipient
    dhFunction: 'X25519';
    cipherFunction: 'ChaChaPoly';
    hashFunction: 'BLAKE2b';
  };
}
```

### Traffic Analysis Prevention

```typescript
interface TrafficAnalysisPrevention {
  // Padding
  padding: {
    messageSize: 'fixed';     // All messages same size
    paddedSize: 4096;         // 4KB fixed size
    paddingScheme: 'random';
  };

  // Timing
  timing: {
    randomDelay: {
      min: 100,               // 100ms
      max: 3000               // 3s
    };
    batching: true;           // Batch messages
    batchInterval: 5000;      // 5s
  };

  // Dummy traffic
  dummyTraffic: {
    enabled: true;
    interval: 30000;          // Every 30s
    indistinguishable: true;  // Same as real messages
  };
}
```

### Certificate Pinning

```typescript
// Public key pins for node connections
const trustedPins = new Set([
  'sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  'sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=',
]);

async function verifyConnection(socket: WebSocket, cert: ArrayBuffer): Promise<boolean> {
  const hash = await crypto.subtle.digest('SHA-256', cert);
  const pin = btoa(String.fromCharCode(...new Uint8Array(hash)));
  return trustedPins.has(`sha256/${pin}`);
}
```

---

## Implementation Guidelines

### Cryptographic Best Practices

```typescript
// ✅ DO: Use Web Crypto API
const key = await crypto.subtle.generateKey(
  { name: 'AES-GCM', length: 256 },
  false,  // Non-extractable
  ['encrypt', 'decrypt']
);

// ❌ DON'T: Use Math.random() for crypto
const badKey = Math.random().toString(36); // NEVER DO THIS

// ✅ DO: Use cryptographically secure random
const nonce = crypto.getRandomValues(new Uint8Array(12));

// ✅ DO: Constant-time comparison for secrets
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

// ✅ DO: Zero sensitive data after use
function zeroArray(arr: Uint8Array): void {
  crypto.getRandomValues(arr);
  arr.fill(0);
}
```

### React Security Patterns

```tsx
// ✅ Secure state management for sensitive data
import { useEffect, useRef, useState } from 'react';

function useSecureState<T>(initialValue: T): [T, (value: T) => void] {
  const valueRef = useRef<T>(initialValue);
  const [, forceUpdate] = useState({});

  useEffect(() => {
    return () => {
      // Zero sensitive data on unmount
      if (valueRef.current instanceof Uint8Array) {
        zeroArray(valueRef.current);
      }
    };
  }, []);

  const setValue = (value: T) => {
    valueRef.current = value;
    forceUpdate({});
  };

  return [valueRef.current, setValue];
}

// ✅ Secure message display component
function SecureMessage({ encrypted, sessionKey }: Props) {
  const [decrypted, setDecrypted] = useSecureState<string>('');

  useEffect(() => {
    let mounted = true;
    
    decryptMessage(encrypted, sessionKey)
      .then(text => {
        if (mounted) setDecrypted(sanitizeMessage(text));
      });

    return () => {
      mounted = false;
      // Clear decrypted content
      setDecrypted('');
    };
  }, [encrypted, sessionKey]);

  return <div className="message">{decrypted}</div>;
}
```

### File Structure

```
metal/
├── src/
│   ├── crypto/
│   │   ├── aes.ts              # AES-256-GCM encryption
│   │   ├── x25519.ts           # X25519 key exchange
│   │   ├── ed25519.ts          # Ed25519 signatures
│   │   ├── ratchet.ts          # Double ratchet implementation
│   │   ├── kdf.ts              # Key derivation functions
│   │   └── random.ts           # Secure random generation
│   │
│   ├── protocol/
│   │   ├── message.ts          # Message encoding/decoding
│   │   ├── session.ts          # Session management
│   │   ├── handshake.ts        # Key exchange handshake
│   │   └── transport.ts        # Secure transport layer
│   │
│   ├── storage/
│   │   ├── encrypted-db.ts     # Encrypted IndexedDB wrapper
│   │   ├── key-store.ts        # Secure key storage
│   │   └── session-store.ts    # Session state storage
│   │
│   ├── network/
│   │   ├── peer.ts             # Peer connection management
│   │   ├── discovery.ts        # Peer discovery (DHT)
│   │   ├── relay.ts            # Relay node handling
│   │   └── sync.ts             # Message synchronization
│   │
│   ├── components/
│   │   ├── Chat/               # Chat UI components
│   │   ├── Auth/               # Authentication UI
│   │   └── Settings/           # Security settings
│   │
│   └── utils/
│       ├── sanitize.ts         # Input sanitization
│       ├── secure-memory.ts    # Memory protection
│       └── timing.ts           # Constant-time utilities
│
├── tests/
│   ├── crypto/                 # Crypto unit tests
│   ├── protocol/               # Protocol tests
│   └── integration/            # E2E tests
│
└── docs/
    ├── SECURITY.md             # Security documentation
    ├── PROTOCOL.md             # Protocol specification
    └── AUDIT.md                # Audit reports
```

---

## Threat Model

### Assets to Protect

| Asset | Sensitivity | Protection |
|-------|-------------|------------|
| Message content | Critical | E2EE, memory protection |
| User identity | Critical | Pseudonymous IDs, no PII |
| Contact list | High | Encrypted storage |
| Private keys | Critical | Secure enclave, derived keys |
| Metadata | High | Padding, onion routing |
| Session state | High | Encrypted storage, timeout |

### Threat Actors

| Actor | Capability | Mitigation |
|-------|------------|------------|
| Network attacker | Traffic interception | TLS 1.3 + Noise, E2EE |
| Malicious node | Message modification | Authentication, signatures |
| Compromised device | Key extraction | Key derivation, secure storage |
| State actor | Traffic analysis | Padding, dummy traffic, onion routing |
| Insider threat | Backend access | Zero-knowledge architecture |

### Attack Vectors & Mitigations

```
┌─────────────────────────────────────────────────────────────────┐
│                    Attack Surface Analysis                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  NETWORK LAYER                                                  │
│  ├── MITM Attack ──────────────> TLS 1.3 + Certificate Pinning │
│  ├── Traffic Analysis ─────────> Padding + Dummy Traffic       │
│  └── Node Compromise ──────────> E2EE + Onion Routing          │
│                                                                 │
│  APPLICATION LAYER                                              │
│  ├── XSS ──────────────────────> CSP + DOMPurify               │
│  ├── CSRF ─────────────────────> SameSite Cookies + Tokens     │
│  └── Injection ────────────────> Input Validation              │
│                                                                 │
│  CRYPTOGRAPHIC                                                  │
│  ├── Key Compromise ───────────> Forward Secrecy + Rotation    │
│  ├── Replay Attack ────────────> Nonces + Timestamps           │
│  └── Downgrade ────────────────> Protocol Version Pinning      │
│                                                                 │
│  CLIENT-SIDE                                                    │
│  ├── Memory Dump ──────────────> Secure Memory + Zeroization   │
│  ├── Storage Access ───────────> Encrypted Storage             │
│  └── Screenshot ───────────────> Screen Protection API         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

### Core Technologies

| Layer | Technology | Purpose |
|-------|------------|---------|
| **UI Framework** | React 18+ | Component-based UI |
| **Build Tool** | Vite | Fast development & builds |
| **Language** | TypeScript | Type safety |
| **Styling** | Tailwind CSS | Utility-first CSS |
| **State** | Zustand/Jotai | Minimal state management |

### Cryptographic Libraries

| Library | Purpose | Notes |
|---------|---------|-------|
| **Web Crypto API** | Core crypto operations | Browser native |
| **@noble/curves** | Ed25519, X25519 | Audited, no dependencies |
| **@noble/hashes** | SHA-256, BLAKE3 | Audited, no dependencies |
| **argon2-browser** | Password KDF | WASM implementation |

### Networking

| Technology | Purpose |
|------------|---------|
| **WebSocket** | Real-time messaging |
| **WebRTC** | P2P data channels |
| **libp2p** | Decentralized networking |
| **IPFS** | Distributed file storage |

### Development & Testing

| Tool | Purpose |
|------|---------|
| **Vitest** | Unit testing |
| **Playwright** | E2E testing |
| **ESLint** | Code linting |
| **TypeScript** | Static analysis |

---

## Security Checklist

### Before Launch

- [ ] Complete security audit by third party
- [ ] Penetration testing
- [ ] Cryptographic review
- [ ] Code review for sensitive components
- [ ] Dependency vulnerability scan
- [ ] CSP and security headers configured
- [ ] Rate limiting implemented
- [ ] Error handling doesn't leak information

### Ongoing

- [ ] Dependency updates (weekly)
- [ ] Security patch monitoring
- [ ] Incident response plan
- [ ] Bug bounty program
- [ ] Regular security reviews
- [ ] Key rotation procedures
- [ ] Backup and recovery testing

---

## Appendix: Cryptographic Constants

```typescript
export const CRYPTO_CONSTANTS = {
  // Key sizes (bytes)
  AES_KEY_SIZE: 32,           // 256 bits
  NONCE_SIZE: 12,             // 96 bits for AES-GCM
  AUTH_TAG_SIZE: 16,          // 128 bits
  X25519_KEY_SIZE: 32,        // 256 bits
  ED25519_KEY_SIZE: 32,       // 256 bits
  ED25519_SIG_SIZE: 64,       // 512 bits
  
  // KDF parameters
  ARGON2_MEMORY: 65536,       // 64 MB
  ARGON2_TIME: 3,             // 3 iterations
  ARGON2_PARALLELISM: 4,      // 4 lanes
  
  // Protocol parameters
  MAX_SKIP: 1000,             // Max skipped message keys
  MAX_CHAIN: 500,             // Max chain length before ratchet
  PREKEY_COUNT: 100,          // One-time prekeys to generate
  PREKEY_THRESHOLD: 25,       // Replenish when below this
  
  // Message parameters
  MAX_MESSAGE_SIZE: 65536,    // 64 KB
  PADDED_SIZE: 4096,          // Fixed padding size
  
  // Timeouts (ms)
  SESSION_TIMEOUT: 86400000,  // 24 hours
  IDLE_TIMEOUT: 900000,       // 15 minutes
  MESSAGE_TTL: 604800000,     // 7 days
} as const;
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-06 | Initial security foundation |

---

**Metal** - *Your conversations. Your privacy. Your control.*
