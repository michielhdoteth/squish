import { randomBytes, pbkdf2Sync, createCipheriv, createDecipheriv } from 'crypto';
import { config } from '../../config.js';

const ITERATIONS = 100_000;
const KEY_LEN = 32; // 256-bit
const DIGEST = 'sha256';
const ALGO = 'aes-256-gcm';
const NONCE_LEN = 12;

/**
 * Derive a symmetric key from the passphrase and a salt.
 * The salt is stored in `.squish/salt` (plain text) and is generated once.
 */
function getSalt(): Buffer {
  const fs = require('fs');
  const path = require('path');
  const saltPath = path.join(config.dataDir, 'salt');
  fs.mkdirSync(path.dirname(saltPath), { recursive: true });
  if (!fs.existsSync(saltPath)) {
    const salt = randomBytes(16).toString('hex');
    fs.writeFileSync(saltPath, salt);
    return Buffer.from(salt, 'hex');
  }
  return Buffer.from(fs.readFileSync(saltPath, 'utf-8'), 'hex');
}

function deriveKey(passphrase: string): Buffer {
  const salt = getSalt();
  return pbkdf2Sync(passphrase, salt, ITERATIONS, KEY_LEN, DIGEST);
}

export function encrypt(plain: string, passphrase?: string): { ciphertext: string; nonce: string } {
  const key = deriveKey(passphrase || config.encryptionPassphrase);
  const nonce = randomBytes(NONCE_LEN);
  const cipher = createCipheriv(ALGO, key, nonce);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const ciphertext = Buffer.concat([encrypted, tag]).toString('base64');
  return { ciphertext, nonce: nonce.toString('base64') };
}

export function decrypt(ciphertext: string, nonceB64: string, passphrase?: string): string {
  const key = deriveKey(passphrase || config.encryptionPassphrase);
  const nonce = Buffer.from(nonceB64, 'base64');
  const data = Buffer.from(ciphertext, 'base64');
  const tag = data.slice(data.length - 16);
  const encrypted = data.slice(0, data.length - 16);
  const decipher = createDecipheriv(ALGO, key, nonce);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}
