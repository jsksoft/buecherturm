// AES-256-GCM encryption for PII — mandatory per DSGVO/GDPR (CLAUDE.md rule #1)
// Uses Web Crypto API, available in Node.js 18+ and all modern browsers.

const ALGORITHM = 'AES-GCM';
const KEY_BITS = 256;
const IV_BYTES = 12; // 96-bit IV is the recommended size for AES-GCM
const KDF_SALT = new TextEncoder().encode('buecherturm-kdf-v1');
const KDF_ITERATIONS = 100_000;

async function deriveKey(secret: string): Promise<CryptoKey> {
  const raw = new TextEncoder().encode(secret);
  const keyMaterial = await crypto.subtle.importKey('raw', raw, 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: KDF_SALT, iterations: KDF_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: ALGORITHM, length: KEY_BITS },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encrypt(plaintext: string, secret: string): Promise<string> {
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  const out = new Uint8Array(IV_BYTES + ciphertext.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ciphertext), IV_BYTES);
  return btoa(String.fromCharCode(...out));
}

export async function decrypt(encrypted: string, secret: string): Promise<string> {
  const key = await deriveKey(secret);
  const data = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: data.slice(0, IV_BYTES) },
    key,
    data.slice(IV_BYTES),
  );
  return new TextDecoder().decode(decrypted);
}

// Strip PII before sending to any external LLM provider (CLAUDE.md rule #4)
export function sanitizeForLLM(text: string): string {
  return text
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP]')
    .replace(/\+?[\d\s\-().]{8,}/g, '[PHONE]');
}
