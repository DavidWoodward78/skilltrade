import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Bot tokens are encrypted with AES-256-GCM before they reach the database.
 * Key: SLACK_TOKEN_ENCRYPTION_KEY, 32 random bytes, base64 (`openssl rand -base64 32`).
 * Stored format: v1.<iv>.<auth tag>.<ciphertext>, each base64url.
 */
function key(keyB64: string | undefined): Buffer {
  const k = Buffer.from((keyB64 ?? "").trim(), "base64");
  if (k.length !== 32) throw new Error("SLACK_TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  return k;
}

export function encryptToken(plain: string, keyB64: string | undefined): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(keyB64), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptToken(stored: string, keyB64: string | undefined): string {
  const [v, iv, tag, ct] = stored.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Unrecognised token format");
  const decipher = createDecipheriv("aes-256-gcm", key(keyB64), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}
