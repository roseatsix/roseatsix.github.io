/* ==========================================================
   Client-side encryption (Web Crypto API only).

   Key hierarchy:
     master secret (32 random bytes, never stored in the clear)
       ├─ sealed with your passphrase   (PBKDF2-SHA256 → AES-GCM)
       └─ sealed with a recovery key    (PBKDF2-SHA256 → AES-GCM)
     master ─HKDF→ data key  (AES-GCM-256, encrypts every item)
            ─HKDF→ id key    (HMAC-SHA256, makes opaque item IDs)
   ========================================================== */

const te = new TextEncoder();
const td = new TextDecoder();
const subtle = crypto.subtle;

export const PASSPHRASE_ITERATIONS = 600000;
export const RECOVERY_ITERATIONS = 100000;   // recovery keys are already high-entropy

export class WrongSecretError extends Error {
  constructor() { super('Wrong passphrase or recovery key'); this.name = 'WrongSecretError'; }
}

export function randomBytes(n) {
  return crypto.getRandomValues(new Uint8Array(n));
}

export function toB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

export function fromB64(str) {
  const s = atob(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function toB64Url(bytes) {
  return toB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function kekFrom(secret, salt, iterations) {
  const base = await subtle.importKey('raw', te.encode(secret.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

const MASTER_AAD = te.encode('ras/master/v1');

/** Encrypt the master secret under a passphrase or recovery key. */
export async function sealMaster(master, secret, iterations = PASSPHRASE_ITERATIONS) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const kek = await kekFrom(secret, salt, iterations);
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: MASTER_AAD }, kek, master));
  return { alg: 'PBKDF2-SHA256+AES-GCM', iterations, salt: toB64(salt), iv: toB64(iv), ct: toB64(ct) };
}

/** Decrypt the master secret; throws WrongSecretError on a bad secret. */
export async function openMaster(sealed, secret) {
  const kek = await kekFrom(secret, fromB64(sealed.salt), sealed.iterations);
  try {
    const plain = await subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(sealed.iv), additionalData: MASTER_AAD }, kek, fromB64(sealed.ct));
    return new Uint8Array(plain);
  } catch (e) {
    throw new WrongSecretError();
  }
}

/** Derive the working keys. They are non-extractable, so they can be
    kept in IndexedDB ("remember this device") without exposing raw bytes. */
export async function deriveKeys(master) {
  const hk = await subtle.importKey('raw', master, 'HKDF', false, ['deriveKey']);
  const params = info => ({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: te.encode(info) });
  const dataKey = await subtle.deriveKey(params('ras/data/v1'), hk,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const idKey = await subtle.deriveKey(params('ras/id/v1'), hk,
    { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign']);
  return { dataKey, idKey };
}

export async function encryptJSON(key, value, aad) {
  const iv = randomBytes(12);
  const ct = new Uint8Array(await subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: te.encode(aad) }, key, te.encode(JSON.stringify(value))));
  return { iv, ct };
}

export async function decryptJSON(key, iv, ct, aad) {
  const plain = await subtle.decrypt({ name: 'AES-GCM', iv, additionalData: te.encode(aad) }, key, ct);
  return JSON.parse(td.decode(plain));
}

/** Deterministic opaque identifier (base64url) for a piece of text. */
export async function tag(idKey, text, length = 24) {
  const sig = new Uint8Array(await subtle.sign('HMAC', idKey, te.encode(text)));
  return toB64Url(sig).slice(0, length);
}

/* ---------- Recovery key: 32 Crockford base32 chars, in groups of 4 ---------- */

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function makeRecoveryCode() {
  const bytes = randomBytes(20);   // 160 bits
  let bits = 0, value = 0, out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out.match(/.{4}/g).join('-');
}

export function normalizeRecoveryCode(s) {
  return String(s).toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0').replace(/[IL]/g, '1');
}

/* ---------- Password-protected files (backups) ---------- */

const FILE_AAD = te.encode('ras/backup/v1');

export async function encryptWithPassword(value, password, iterations = PASSPHRASE_ITERATIONS) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await kekFrom(password, salt, iterations);
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: FILE_AAD }, key, te.encode(JSON.stringify(value))));
  return { kdf: 'PBKDF2-SHA256', iterations, salt: toB64(salt), iv: toB64(iv), ct: toB64(ct) };
}

export async function decryptWithPassword(blob, password) {
  const key = await kekFrom(password, fromB64(blob.salt), blob.iterations);
  try {
    const plain = await subtle.decrypt({ name: 'AES-GCM', iv: fromB64(blob.iv), additionalData: FILE_AAD }, key, fromB64(blob.ct));
    return JSON.parse(td.decode(plain));
  } catch (e) {
    throw new WrongSecretError();
  }
}
