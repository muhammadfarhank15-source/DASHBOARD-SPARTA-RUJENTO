/**
 * SPARTA RUJENTO - Modul Keamanan & Kriptografi Autentikasi Admin
 * Sesuai Standar Keamanan Bebas Kredensial Default, Hashing Tersalt, dan Kebijakan Kata Sandi Kuat.
 */

export interface PasswordValidationResult {
  isValid: boolean;
  hasMinLength: boolean;
  hasUpper: boolean;
  hasLower: boolean;
  hasNumber: boolean;
  hasSymbol: boolean;
  score: number; // 0 - 100
  errors: string[];
}

/**
 * Validasi kekuatan password:
 * - Minimal 12 karakter
 * - Kombinasi huruf besar (A-Z), huruf kecil (a-z), angka (0-9), dan simbol khusus
 */
export function validatePasswordStrength(password: string): PasswordValidationResult {
  const p = password || '';
  const hasMinLength = p.length >= 12;
  const hasUpper = /[A-Z]/.test(p);
  const hasLower = /[a-z]/.test(p);
  const hasNumber = /[0-9]/.test(p);
  const hasSymbol = /[^A-Za-z0-9]/.test(p);

  const errors: string[] = [];
  if (!hasMinLength) errors.push('Panjang minimal 12 karakter');
  if (!hasUpper) errors.push('Minimal 1 huruf kapital / besar (A-Z)');
  if (!hasLower) errors.push('Minimal 1 huruf kecil (a-z)');
  if (!hasNumber) errors.push('Minimal 1 digit angka (0-9)');
  if (!hasSymbol) errors.push('Minimal 1 karakter khusus / simbol (!@#$%^&*...)');

  let score = 0;
  if (p.length >= 8) score += 20;
  if (p.length >= 12) score += 20;
  if (hasUpper) score += 15;
  if (hasLower) score += 15;
  if (hasNumber) score += 15;
  if (hasSymbol) score += 15;

  return {
    isValid: hasMinLength && hasUpper && hasLower && hasNumber && hasSymbol,
    hasMinLength,
    hasUpper,
    hasLower,
    hasNumber,
    hasSymbol,
    score: Math.min(score, 100),
    errors,
  };
}

/**
 * Membuat kata sandi acak kuat dan aman untuk setup awal admin
 */
export function generateSecureRandomPassword(length: number = 16): string {
  const uppers = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lowers = 'abcdefghijkmnopqrstuvwxyz';
  const numbers = '23456789';
  const symbols = '!@#$%^&*-_=+';
  const allChars = uppers + lowers + numbers + symbols;

  // Pastikan ada setidaknya satu dari setiap kelompok karakter
  const randomBytes = new Uint8Array(length);
  crypto.getRandomValues(randomBytes);

  const result: string[] = [
    uppers[randomBytes[0] % uppers.length],
    lowers[randomBytes[1] % lowers.length],
    numbers[randomBytes[2] % numbers.length],
    symbols[randomBytes[3] % symbols.length],
  ];

  for (let i = 4; i < length; i++) {
    result.push(allChars[randomBytes[i] % allChars.length]);
  }

  // Acak urutan karakter
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result.join('');
}

/**
 * Hashing password dengan Salt menggunakan WebCrypto SHA-256 (5000 rounds)
 * Mencegah penyimpanan password dalam bentuk teks biasa di Firestore / database.
 */
export async function hashPasswordWithSalt(
  password: string,
  existingSalt?: string
): Promise<{ hash: string; salt: string }> {
  const salt =
    existingSalt ||
    Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

  const encoder = new TextEncoder();
  let buffer = encoder.encode(`${salt}:${password}:sparta_rujento_secure_v2`);

  for (let i = 0; i < 5000; i++) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    buffer = new Uint8Array(hashBuffer);
  }

  const hash = Array.from(buffer)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return { hash, salt };
}

/**
 * Verifikasi kecocokan password terhadap hash yang tersimpan
 */
export async function verifyPasswordHash(
  passwordInput: string,
  storedHash?: string,
  storedSalt?: string
): Promise<boolean> {
  if (!passwordInput || !storedHash || !storedSalt) {
    return false;
  }
  // Tolak mutlak kredensial default bawaan
  if (passwordInput === 'adminpassword123' || passwordInput === 'admin') {
    return false;
  }

  const { hash } = await hashPasswordWithSalt(passwordInput, storedSalt);
  return hash === storedHash;
}

/**
 * Memeriksa apakah kata sandi admin telah melewati masa berlaku (misal 90 hari)
 */
export function checkPasswordExpired(
  passwordUpdatedAt?: string,
  expiryDays: number = 90
): { isExpired: boolean; daysRemaining: number } {
  if (!passwordUpdatedAt) {
    return { isExpired: false, daysRemaining: expiryDays };
  }

  const updatedTime = new Date(passwordUpdatedAt).getTime();
  if (isNaN(updatedTime)) {
    return { isExpired: false, daysRemaining: expiryDays };
  }

  const now = Date.now();
  const ageMs = now - updatedTime;
  const maxAgeMs = expiryDays * 24 * 60 * 60 * 1000;
  const isExpired = ageMs > maxAgeMs;
  const daysRemaining = Math.max(0, Math.ceil((maxAgeMs - ageMs) / (24 * 60 * 60 * 1000)));

  return { isExpired, daysRemaining };
}
