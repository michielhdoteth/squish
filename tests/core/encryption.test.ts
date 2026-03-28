import { describe, it } from 'node:test';
import assert from 'node:assert';
import { encrypt, decrypt } from '../../core/security/encrypt.js';

describe('Encryption', () => {
  it('should encrypt and decrypt correctly', () => {
    const plaintext = 'Hello, World! This is a test message.';
    const passphrase = 'test-passphrase-123';
    
    const { ciphertext, nonce } = encrypt(plaintext, passphrase);
    
    assert.ok(ciphertext, 'should generate ciphertext');
    assert.ok(nonce, 'should generate nonce');
    assert.notEqual(ciphertext, plaintext, 'ciphertext should differ from plaintext');
    
    const decrypted = decrypt(ciphertext, nonce, passphrase);
    assert.strictEqual(decrypted, plaintext, 'should decrypt to original text');
  });

  it('should produce different ciphertext for same plaintext (due to random nonce)', () => {
    const plaintext = 'Same message';
    const passphrase = 'test-passphrase';
    
    const { ciphertext: ct1 } = encrypt(plaintext, passphrase);
    const { ciphertext: ct2 } = encrypt(plaintext, passphrase);
    
    assert.notStrictEqual(ct1, ct2, 'should produce different ciphertext each time');
  });

  it('should fail to decrypt with wrong passphrase', () => {
    const plaintext = 'Secret message';
    const passphrase = 'correct-passphrase';
    const wrongPassphrase = 'wrong-passphrase';
    
    const { ciphertext, nonce } = encrypt(plaintext, passphrase);
    
    assert.throws(
      () => decrypt(ciphertext, nonce, wrongPassphrase),
      /Unsupported state or unable to authenticate data/,
      'should throw on wrong passphrase'
    );
  });

  it('should handle empty string', () => {
    const plaintext = '';
    const passphrase = 'test';
    
    const { ciphertext, nonce } = encrypt(plaintext, passphrase);
    const decrypted = decrypt(ciphertext, nonce, passphrase);
    
    assert.strictEqual(decrypted, plaintext);
  });

  it('should handle unicode characters', () => {
    const plaintext = 'Hello 世界! 🌍 Emoji test';
    const passphrase = 'unicode-pass-日本語';
    
    const { ciphertext, nonce } = encrypt(plaintext, passphrase);
    const decrypted = decrypt(ciphertext, nonce, passphrase);
    
    assert.strictEqual(decrypted, plaintext);
  });
});
