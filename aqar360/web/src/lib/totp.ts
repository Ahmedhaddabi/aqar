// Two-step sign-in (TOTP, RFC 6238): works with Google Authenticator, Microsoft Authenticator, 1Password, etc.
// The shared key is stored encrypted (AES-256-GCM with a key derived from AUTH_SECRET).
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32(bytes: Buffer) {
  let bits = 0, value = 0, out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  return bits > 0 ? out + ALPHABET[(value << (5 - bits)) & 31] : out;
}

function unbase32(text: string) {
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const char of text.replace(/=+$/, "").toUpperCase()) {
    const i = ALPHABET.indexOf(char);
    if (i < 0) continue;
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export const newSecret = () => base32(randomBytes(20));

function code(secret: string, counter: number) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hash = createHmac("sha1", unbase32(secret)).update(msg).digest();
  const offset = hash[hash.length - 1] & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

/** Accepts the current 30-second code and one step either side (phone clocks drift). */
export function verifyCode(secret: string, given: string, now = Date.now()) {
  const clean = given.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  const step = Math.floor(now / 30_000);
  return [-1, 0, 1].some((d) => timingSafeEqual(Buffer.from(code(secret, step + d)), Buffer.from(clean)));
}

export const otpauthUri = (secret: string, account: string, issuer = "Aqar 360") =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

const key = () => {
  if (!process.env.AUTH_SECRET) throw new Error("AUTH_SECRET is required for two-step sign-in");
  return createHash("sha256").update(`mfa:${process.env.AUTH_SECRET}`).digest();
};

export function sealSecret(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

export function openSecret(sealed: string) {
  const [iv, tag, data] = sealed.split(".").map((p) => Buffer.from(p, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
