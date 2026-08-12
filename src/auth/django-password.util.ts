import * as crypto from 'crypto';

/**
 * Django pbkdf2_sha256 format:
 * pbkdf2_sha256$iterations$salt$hash
 */
export function verifyDjangoPBKDF2(plain: string, djangoHash: string): boolean {
  try {
    const [algo, iterStr, salt, hashB64] = djangoHash.split('$');
    if (algo !== 'pbkdf2_sha256') return false;

    const iterations = Number(iterStr);
    if (!iterations || !salt || !hashB64) return false;

    const derived = crypto.pbkdf2Sync(plain, salt, iterations, 32, 'sha256');
    const derivedB64 = derived.toString('base64');

    return crypto.timingSafeEqual(
      Buffer.from(derivedB64),
      Buffer.from(hashB64),
    );
  } catch {
    return false;
  }
}
