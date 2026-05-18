/**
 * AES-256-GCM verification script.
 * Run: pnpm --filter @buecherturm/shared verify:crypto
 *
 * Checks roundtrip correctness, IV randomness, auth-tag tamper detection,
 * wrong-key rejection, and the sanitizeForLLM PII stripper.
 */
import assert from 'node:assert/strict';
import { CryptoError, decrypt, encrypt, sanitizeForLLM } from './src/index.ts';

// 32-char secret mirrors the minimum ENCRYPTION_SECRET length enforced by .env.example
const SECRET = 'buecherturm-test-secret-32chars!';
const WRONG_SECRET = 'a-completely-different-secret!!!';

// ---------------------------------------------------------------------------
// Minimal test harness
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗  ${name}`);
    console.error(`     ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// Entry point — async IIFE so the file works under both CJS and ESM
// ---------------------------------------------------------------------------

(async () => {
  console.log('\nBücherturm — AES-256-GCM Crypto Verification');
  console.log('─'.repeat(52));

  // 1. Basic email roundtrip
  await test('Email: encrypt/decrypt roundtrip', async () => {
    const email = 'max.mustermann@example.de';
    const ciphertext = await encrypt(email, SECRET);

    assert.notEqual(ciphertext, email, 'ciphertext must not equal plaintext');
    assert.ok(!ciphertext.includes('@'), 'ciphertext must not contain @ character');

    const decrypted = await decrypt(ciphertext, SECRET);
    assert.equal(decrypted, email, 'decrypted value must equal original plaintext');
  });

  // 2. Private note with unicode
  await test('Private note: unicode & special characters roundtrip', async () => {
    const note = 'Dieses Buch hat mich tief berührt — besonders Seite 42. "Wie schön!" 📚🎉';
    const decrypted = await decrypt(await encrypt(note, SECRET), SECRET);
    assert.equal(decrypted, note, 'unicode note must survive roundtrip unchanged');
  });

  // 3. Empty string edge case
  await test('Empty string: valid encryption target', async () => {
    const decrypted = await decrypt(await encrypt('', SECRET), SECRET);
    assert.equal(decrypted, '', 'empty plaintext must roundtrip correctly');
  });

  // 4. IV uniqueness — each call must produce a different ciphertext
  await test('IV randomness: same plaintext → different ciphertext each time', async () => {
    const input = 'privat@example.de';
    const [c1, c2] = await Promise.all([encrypt(input, SECRET), encrypt(input, SECRET)]);
    assert.notEqual(c1, c2, 'fresh random IV must produce unique ciphertext per call');
  });

  // 5. Auth tag — single-bit modification must be detected
  await test('Auth tag: single-bit tamper in ciphertext throws CryptoError', async () => {
    const ciphertext = await encrypt('sensible-note@secret.de', SECRET);

    // Decode → flip last byte (within the 128-bit auth tag) → re-encode
    const bytes = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));
    const lastIdx = bytes.length - 1;
    const lastByte = bytes[lastIdx];
    assert.ok(lastByte !== undefined, 'ciphertext must be non-empty');
    bytes[lastIdx] = lastByte ^ 0xff;

    let tamperedBinary = '';
    for (let i = 0; i < bytes.length; i++) tamperedBinary += String.fromCharCode(bytes[i]!);
    const tampered = btoa(tamperedBinary);

    await assert.rejects(
      () => decrypt(tampered, SECRET),
      { name: 'CryptoError' },
      'tampered ciphertext must throw CryptoError',
    );
  });

  // 6. Wrong key must be rejected
  await test('Wrong key: decrypt with wrong secret throws CryptoError', async () => {
    const ciphertext = await encrypt('another-secret@example.de', SECRET);
    await assert.rejects(
      () => decrypt(ciphertext, WRONG_SECRET),
      { name: 'CryptoError' },
      'decryption with wrong secret must throw CryptoError',
    );
  });

  // 7. sanitizeForLLM strips PII patterns
  await test('sanitizeForLLM: redacts email, IPv4, and phone patterns', () => {
    const input = 'Nutzer: max@example.de, IP 192.168.1.1, Tel +49 89 12345678';
    const result = sanitizeForLLM(input);

    assert.ok(!result.includes('max@'), 'email must be redacted');
    assert.ok(!result.includes('192.168'), 'IP address must be redacted');
    assert.ok(result.includes('[EMAIL]'), 'must contain [EMAIL] placeholder');
    assert.ok(result.includes('[IP]'), 'must contain [IP] placeholder');
  });

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  const total = passed + failed;
  console.log('─'.repeat(52));
  console.log(`  ${total} tests — ${passed} passed, ${failed} failed\n`);

  if (failed > 0) process.exit(1);
})();
