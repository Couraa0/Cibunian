import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 64);
  return `${salt.toString('hex')}:${key.toString('hex')}`;
}

/**
 * Nilai untuk kolom users.passwordChangedAt saat password diganti: token yang terbit sebelum
 * waktu ini ditolak AuthGuard. Dibulatkan ke detik karena klaim `iat` JWT berpresisi detik;
 * tanpa pembulatan, token baru yang terbit pada detik yang sama ikut tertolak.
 */
export const passwordChangedNow = () =>
  new Date(Math.floor(Date.now() / 1000) * 1000);

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const key = await scryptAsync(password, Buffer.from(salt, 'hex'), 64);
  return key.length === expected.length && timingSafeEqual(key, expected);
}
