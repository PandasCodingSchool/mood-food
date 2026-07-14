import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const KEY_ENV = "SWIGGY_TOKEN_ENCRYPTION_KEY";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const ALGORITHM = "aes-256-gcm";

function deriveKey() {
  const raw = process.env[KEY_ENV];
  if (!raw) {
    throw new Error(
      `Missing ${KEY_ENV}. Set a 32-byte key (base64 or hex) for Swiggy token encryption.`,
    );
  }

  // Try base64 first, then treat as a passphrase and derive a key.
  const buffer = Buffer.from(raw, "base64");
  if (buffer.length === KEY_LENGTH) {
    return buffer;
  }

  const hex = Buffer.from(raw, "hex");
  if (hex.length === KEY_LENGTH) {
    return hex;
  }

  // Fall back to deriving a deterministic key from the string using scrypt.
  // Not recommended for production, but keeps dev friction low.
  return scryptSync(raw, "moodfood-swiggy-salt", KEY_LENGTH);
}

let masterKey = null;
function getKey() {
  if (!masterKey) masterKey = deriveKey();
  return masterKey;
}

/**
 * Encrypt a plaintext string. Returns a base64-safe compact string.
 */
export function encrypt(text) {
  if (!text) return "";
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString("base64url");
}

/**
 * Decrypt a string produced by encrypt(). Returns the original plaintext.
 */
export function decrypt(encryptedText) {
  if (!encryptedText) return "";
  const combined = Buffer.from(encryptedText, "base64url");
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    "utf8",
  );
}

/**
 * Generate a random 32-byte base64 key suitable for SWIGGY_TOKEN_ENCRYPTION_KEY.
 */
export function generateEncryptionKey() {
  return randomBytes(KEY_LENGTH).toString("base64");
}
