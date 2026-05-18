// AES-256-GCM application-layer encryption for PII — GDPR/DSGVO mandatory (CLAUDE.md rule #1).
// Uses the Web Crypto API (Node.js 18+ and all modern browsers).
//
// Wire format (base64-encoded):
//   [version: 1 byte][IV: 12 bytes][ciphertext + auth-tag: N + 16 bytes]
//
// AES-GCM auth-tag behaviour:
//   crypto.subtle.encrypt() appends a 128-bit (16-byte) authentication tag to
//   the ciphertext automatically. crypto.subtle.decrypt() verifies it and throws
//   a DOMException if the payload has been tampered with. There is no separate
//   step needed — the combined ciphertext+tag slice is passed directly.

const ALGORITHM = 'AES-GCM' as const;
const KEY_BITS = 256;
const IV_BYTES = 12;        // 96-bit IV — NIST recommended for AES-GCM
const AUTH_TAG_BYTES = 16;  // 128-bit auth tag — maximum GCM tag length
const VERSION = 0x01;       // Bumped if KDF or cipher params change
const VERSION_BYTES = 1;
const MIN_PAYLOAD_BYTES = VERSION_BYTES + IV_BYTES + AUTH_TAG_BYTES; // 29 bytes minimum

// Application KDF salt — version-tagged so we can rotate without silent breakage.
const KDF_SALT = new TextEncoder().encode('buecherturm-kdf-v1');
const KDF_ITERATIONS = 210_000; // OWASP 2023 recommendation for PBKDF2-SHA256

// ---------------------------------------------------------------------------
// Custom error type
// ---------------------------------------------------------------------------

export class CryptoError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'CryptoError';
  }
}

// ---------------------------------------------------------------------------
// Key derivation (PBKDF2-SHA256 → AES-256-GCM key)
// The derived key is cached per secret to amortise the expensive KDF across
// the lifetime of the process. The CryptoKey object is non-extractable so
// caching it does not expose key material.
// ---------------------------------------------------------------------------

const keyCache = new Map<string, CryptoKey>();

async function deriveKey(secret: string): Promise<CryptoKey> {
  const cached = keyCache.get(secret);
  if (cached !== undefined) return cached;

  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: KDF_SALT, iterations: KDF_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: ALGORITHM, length: KEY_BITS },
    false,          // non-extractable — key material never leaves the SubtleCrypto context
    ['encrypt', 'decrypt'],
  );
  keyCache.set(secret, key);
  return key;
}

// ---------------------------------------------------------------------------
// Safe base64 helpers — avoids the spread-operator stack-overflow that occurs
// with String.fromCharCode(...largeArray) on inputs > ~65K bytes.
// ---------------------------------------------------------------------------

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const result = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    result[i] = binary.charCodeAt(i);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * The secret is typically process.env.ENCRYPTION_SECRET (min 32 chars).
 * Returns a base64 string safe for storage in a database TEXT column.
 */
export async function encrypt(plaintext: string, secret: string): Promise<string> {
  const key = await deriveKey(secret);

  // A fresh random IV per encryption guarantees ciphertext uniqueness even
  // for identical plaintexts. Never reuse an IV with the same key.
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));

  // AES-GCM encrypt. tagLength defaults to 128 bits; we state it explicitly
  // so the intent is clear when reading the wire-format comment above.
  const ciphertextWithTag = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv, tagLength: AUTH_TAG_BYTES * 8 },
    key,
    new TextEncoder().encode(plaintext),
  );

  // Assemble wire format: [version][iv][ciphertext+auth_tag]
  const payload = new Uint8Array(VERSION_BYTES + IV_BYTES + ciphertextWithTag.byteLength);
  payload[0] = VERSION;
  payload.set(iv, VERSION_BYTES);
  payload.set(new Uint8Array(ciphertextWithTag), VERSION_BYTES + IV_BYTES);

  return toBase64(payload);
}

/**
 * Decrypts a base64 string produced by `encrypt()`.
 * Throws `CryptoError` if:
 *   - The version byte is unrecognised
 *   - The payload is too short to be valid
 *   - The auth tag fails verification (tampered ciphertext or wrong key)
 */
export async function decrypt(encrypted: string, secret: string): Promise<string> {
  let payload: Uint8Array;
  try {
    payload = fromBase64(encrypted);
  } catch {
    throw new CryptoError('Ciphertext is not valid base64');
  }

  if (payload.length < MIN_PAYLOAD_BYTES) {
    throw new CryptoError(`Ciphertext too short (${payload.length} bytes, min ${MIN_PAYLOAD_BYTES})`);
  }

  const version = payload[0];
  if (version !== VERSION) {
    throw new CryptoError(`Unsupported cipher version: 0x${version?.toString(16) ?? '??'}`);
  }

  const key = await deriveKey(secret);
  const iv = payload.slice(VERSION_BYTES, VERSION_BYTES + IV_BYTES);
  const ciphertextWithTag = payload.slice(VERSION_BYTES + IV_BYTES);

  // decrypt() verifies the auth tag before returning plaintext.
  // Any single-bit modification to the ciphertext or tag causes it to throw.
  let decrypted: ArrayBuffer;
  try {
    decrypted = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv, tagLength: AUTH_TAG_BYTES * 8 },
      key,
      ciphertextWithTag,
    );
  } catch (cause) {
    // Re-wrap as CryptoError so callers can catch without knowing DOMException
    throw new CryptoError('Decryption failed — payload tampered or wrong secret', { cause });
  }

  return new TextDecoder().decode(decrypted);
}

// ---------------------------------------------------------------------------
// LLM safety
// ---------------------------------------------------------------------------

/**
 * Strips PII patterns from text before forwarding to an external LLM.
 * Must be called on every user-sourced string sent to AI providers (CLAUDE.md rule #4).
 */
export function sanitizeForLLM(text: string): string {
  return text
    // Email addresses
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]')
    // IPv4 addresses
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP]')
    // Phone numbers (international and local formats)
    .replace(/\+?[\d\s\-().]{8,}/g, '[PHONE]');
}
