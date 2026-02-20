/**
 * AES-256-GCM encryption/decryption using Web Crypto API.
 * Used to protect the mnemonic in localStorage with a user password.
 */

const SALT_LEN = 16;
const IV_LEN = 12;
const ITERATIONS = 600000;

async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function toBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function fromBase64(str) {
  const bin = atob(str);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf;
}

/**
 * Encrypts plaintext with a password. Returns a base64 string (salt + iv + ciphertext).
 */
export async function encrypt(plaintext, password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const key = await deriveKey(password, salt);
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext)
  );
  const combined = new Uint8Array(SALT_LEN + IV_LEN + ciphertext.byteLength);
  combined.set(salt, 0);
  combined.set(iv, SALT_LEN);
  combined.set(new Uint8Array(ciphertext), SALT_LEN + IV_LEN);
  return toBase64(combined);
}

/**
 * Decrypts base64 ciphertext with a password. Returns plaintext string.
 * Throws on wrong password.
 */
export async function decrypt(base64Cipher, password) {
  const data = fromBase64(base64Cipher);
  const salt = data.slice(0, SALT_LEN);
  const iv = data.slice(SALT_LEN, SALT_LEN + IV_LEN);
  const ciphertext = data.slice(SALT_LEN + IV_LEN);
  const key = await deriveKey(password, salt);
  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  return new TextDecoder().decode(plainBuf);
}
