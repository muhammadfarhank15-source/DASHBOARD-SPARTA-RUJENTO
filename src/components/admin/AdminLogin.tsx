import React, { useState, useEffect } from 'react';
import {
  Lock,
  ArrowLeft,
  ShieldAlert,
  KeyRound,
  User,
  Flame,
  ShieldCheck,
  RefreshCw,
  Copy,
  Check,
  Sparkles,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { OfficialLogo } from '../common/OfficialLogo';
import { WindEffectOverlay } from '../common/WindEffectOverlay';
import { PasswordInput } from '../common/PasswordInput';
import { validatePasswordStrength, generateSecureRandomPassword } from '../../utils/security';

interface AdminLoginProps {
  onBackToLanding: () => void;
}

export const AdminLogin: React.FC<AdminLoginProps> = ({ onBackToLanding }) => {
  const { loginAdmin, loginWithGoogle, setupInitialAdminPassword, uptSettings } = useApp();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // Rate Limiting & Lockout Guard
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);

  // Initial Setup State (Jika belum pernah inisialisasi password)
  const isSetupNeeded = !uptSettings.isPasswordInitialized && !uptSettings.passwordHash;
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [setupNewPass, setSetupNewPass] = useState('');
  const [setupConfirmPass, setSetupConfirmPass] = useState('');
  const [setupMsg, setSetupMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [copiedPass, setCopiedPass] = useState(false);

  const passwordStrength = validatePasswordStrength(setupNewPass);

  // Countdown timer untuk pembatasan percobaan gagal
  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const timer = setInterval(() => {
      setLockoutSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutSeconds]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockoutSeconds > 0) {
      setErrorMsg(`Percobaan login ditangguhkan. Silakan tunggu ${lockoutSeconds} detik.`);
      return;
    }

    if (!password) {
      setErrorMsg('Kata sandi harus diisi!');
      return;
    }

    // Deteksi dan tolak tegas kredensial default bawaan
    if (password === 'adminpassword123' || password === 'admin') {
      const nextFail = failedAttempts + 1;
      setFailedAttempts(nextFail);
      if (nextFail >= 5) {
        setLockoutSeconds(30);
      }
      setErrorMsg('Kredensial default telah dinonaktifkan permanen demi keamanan. Harap gunakan kata sandi sah.');
      return;
    }

    setIsLoggingIn(true);
    setErrorMsg('');
    try {
      const success = await loginAdmin(password, username);
      if (!success) {
        const nextFail = failedAttempts + 1;
        setFailedAttempts(nextFail);
        if (nextFail >= 5) {
          setLockoutSeconds(30);
          setErrorMsg('Terlalu banyak percobaan login gagal. Akses ditangguhkan selama 30 detik demi keamanan.');
        } else {
          setErrorMsg('Username atau password tidak valid.');
        }
      } else {
        setFailedAttempts(0);
      }
    } catch {
      setErrorMsg('Gagal memverifikasi akun ke server.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    setErrorMsg('');
    try {
      const ok = await loginWithGoogle();
      if (!ok) {
        setErrorMsg('Login dengan Google dibatalkan atau akun tidak diizinkan.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal login via Google.');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleGenerateRandomPass = () => {
    const randomPass = generateSecureRandomPassword(16);
    setSetupNewPass(randomPass);
    setSetupConfirmPass(randomPass);
    navigator.clipboard?.writeText(randomPass).catch(() => {});
    setCopiedPass(true);
    setTimeout(() => setCopiedPass(false), 3000);
  };

  const handleExecuteInitialSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (setupNewPass !== setupConfirmPass) {
      setSetupMsg({ type: 'error', text: 'Konfirmasi kata sandi tidak cocok!' });
      return;
    }
    if (!passwordStrength.isValid) {
      setSetupMsg({
        type: 'error',
        text: `Kata sandi belum memenuhi kriteria: ${passwordStrength.errors.join(', ')}`,
      });
      return;
    }

    setIsSettingUp(true);
    setSetupMsg(null);
    try {
      const res = await setupInitialAdminPassword(setupNewPass, setupConfirmPass);
      if (res.success) {
        setSetupMsg({
          type: 'success',
          text: 'Kata sandi awal administrator berhasil dibuat! Silakan masuk.',
        });
        setTimeout(() => {
          setShowSetupModal(false);
          setPassword(setupNewPass);
        }, 1500);
      } else {
        setSetupMsg({ type: 'error', text: res.message });
      }
    } catch (err: any) {
      setSetupMsg({ type: 'error', text: err?.message || 'Gagal menyimpan kata sandi awal.' });
    } finally {
      setIsSettingUp(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 selection:bg-amber-400 selection:text-slate-950 overflow-hidden">
      {/* Background Gambar Rutan Jeneponto dengan Efek Angin */}
      <WindEffectOverlay showControl={false} />

      <div className="relative z-10 max-w-md w-full space-y-6">
        {/* Back Link */}
        <button
          onClick={onBackToLanding}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-300 hover:text-white transition-colors bg-slate-900/70 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-slate-700/80 shadow-md cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali ke Halaman Utama
        </button>

        {/* Card */}
        <div className="bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none"></div>

          {/* Header with Logo SPARTA RUJENTO */}
          <div className="text-center space-y-2 mb-6 flex flex-col items-center">
            <OfficialLogo size="xl" />
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-montserrat-extrabold uppercase tracking-wider bg-amber-400/20 text-amber-300 border border-amber-400/30">
                SPARTA RUJENTO
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-orange-500/20 text-orange-400 border border-orange-500/30 flex items-center gap-1">
                <Flame className="w-3 h-3 text-orange-400 inline" />
                Firebase Auth
              </span>
            </div>
            <div className="space-y-0.5 mt-1">
              <h1 className="font-montserrat-extrabold text-xs sm:text-sm text-white uppercase tracking-tight leading-tight">
                STRATEGI PENGAWASAN TRANSAKSI KEUANGAN YANG TERINTEGRASI
              </h1>
              <p className="font-montserrat-extrabold text-[10px] sm:text-[11px] text-amber-400 uppercase tracking-wide">
                RUMAH TAHANAN NEGARA KELAS IIB JENEPONTO
              </p>
            </div>
            <div className="pt-2">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-widest bg-slate-800/80 px-3 py-1 rounded-full border border-slate-700">
                PORTAL ADMIN &amp; KASIR
              </span>
            </div>
          </div>

          {errorMsg && (
            <div className="mb-4 p-3.5 bg-rose-950/60 border border-rose-800/80 rounded-xl text-rose-300 text-xs flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {lockoutSeconds > 0 && (
            <div className="mb-4 p-3.5 bg-amber-950/60 border border-amber-700/80 rounded-xl text-amber-300 text-xs flex items-start gap-2.5 animate-pulse">
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Akses Ditangguhkan Sementara</p>
                <p className="text-[11px] text-amber-200 mt-0.5">
                  Tunggu <strong className="text-white">{lockoutSeconds} detik</strong> sebelum mencoba lagi.
                </p>
              </div>
            </div>
          )}

          {/* Setup Awal Password Alert (jika belum pernah diinisialisasi) */}
          {isSetupNeeded && (
            <div className="mb-4 p-3 bg-amber-500/15 border border-amber-500/40 rounded-xl text-amber-200 text-xs space-y-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="font-bold text-amber-300">Inisialisasi Kata Sandi Admin</span>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-300">
                Kata sandi awal belum ditetapkan. Buat kata sandi administrator pertama kali dengan standar keamanan tinggi.
              </p>
              <button
                type="button"
                onClick={() => setShowSetupModal(true)}
                className="w-full py-2 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Tetapkan Kata Sandi Awal Sekarang
              </button>
            </div>
          )}

          {/* Google Sign In Button */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={isGoogleLoading || lockoutSeconds > 0}
            className="w-full mb-4 py-3 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-800 font-semibold text-xs sm:text-sm shadow-md flex items-center justify-center gap-3 transition-all active:scale-98 cursor-pointer disabled:opacity-60"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
              />
            </svg>
            {isGoogleLoading ? 'Menghubungkan Akun Google...' : 'Masuk dengan Google (Firebase Auth)'}
          </button>

          <div className="relative flex items-center justify-center my-4">
            <div className="border-t border-slate-800 w-full"></div>
            <span className="bg-slate-900 px-3 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
              atau kredensial petugas
            </span>
            <div className="border-t border-slate-800 w-full"></div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-amber-400" />
                Username / Email Petugas:
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Masukkan username atau email resmi..."
                className="w-full px-4 py-3 bg-slate-800/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-400"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                Kata Sandi Admin:
              </label>
              <PasswordInput
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErrorMsg('');
                }}
                placeholder="Masukkan kata sandi..."
                className="px-4 py-3 bg-slate-800/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-400"
                buttonClassName="hover:bg-slate-700/60"
                iconClassName="text-amber-400"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoggingIn || lockoutSeconds > 0}
              className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-sm tracking-wide shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition-all active:scale-98 disabled:opacity-60 cursor-pointer"
            >
              <Lock className="w-4 h-4" />
              {isLoggingIn
                ? 'Memverifikasi Sesi Server...'
                : lockoutSeconds > 0
                ? `Terkunci (${lockoutSeconds}s)`
                : 'Masuk ke Dashboard Admin'}
            </button>
          </form>

          {/* Info Standar Keamanan */}
          <div className="mt-6 pt-4 border-t border-slate-800 text-center">
            <div className="inline-flex items-center gap-1.5 text-[11px] text-slate-400">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Autentikasi Aman Berbasis SHA-256 Tersalt &amp; Firebase</span>
            </div>
          </div>
        </div>

        <p className="text-center text-[11px] text-slate-400">
          Data tersimpan di Cloud Firestore online &amp; disinkronkan real-time antarperangkat dengan enkripsi TLS.
        </p>
      </div>

      {/* MODAL SETUP KATA SANDI AWAL ADMINISTRATOR */}
      {showSetupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-amber-400/20 text-amber-400">
                  <KeyRound className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="font-bold text-sm text-white">Setup Kata Sandi Admin Awal</h3>
                  <p className="text-[11px] text-slate-400">Inisialisasi satu kali oleh pihak berwenang</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSetupModal(false)}
                className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded-lg bg-slate-800"
              >
                Tutup
              </button>
            </div>

            {setupMsg && (
              <div
                className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                  setupMsg.type === 'success'
                    ? 'bg-emerald-950/60 border border-emerald-700 text-emerald-300'
                    : 'bg-rose-950/60 border border-rose-700 text-rose-300'
                }`}
              >
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{setupMsg.text}</span>
              </div>
            )}

            <form onSubmit={handleExecuteInitialSetup} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-300">Kata Sandi Baru:</label>
                  <button
                    type="button"
                    onClick={handleGenerateRandomPass}
                    className="text-[11px] text-amber-400 hover:text-amber-300 font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    {copiedPass ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    {copiedPass ? 'Disalin ke Clipboard!' : 'Buat Password Acak Aman'}
                  </button>
                </div>
                <PasswordInput
                  value={setupNewPass}
                  onChange={(e) => setSetupNewPass(e.target.value)}
                  placeholder="Minimal 12 karakter kombinasi..."
                  className="px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs"
                  buttonClassName="hover:bg-slate-700"
                  iconClassName="text-amber-400"
                  required
                />
              </div>

              {/* Real-time Password Strength Check */}
              <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60 space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between text-slate-300 font-semibold mb-1">
                  <span>Kekuatan Kata Sandi:</span>
                  <span
                    className={
                      passwordStrength.isValid
                        ? 'text-emerald-400 font-bold'
                        : passwordStrength.score >= 60
                        ? 'text-amber-400'
                        : 'text-rose-400'
                    }
                  >
                    {passwordStrength.isValid ? 'Sangat Kuat' : `${passwordStrength.score}%`}
                  </span>
                </div>
                <div className="w-full bg-slate-700 h-1.5 rounded-full overflow-hidden mb-2">
                  <div
                    className={`h-full transition-all duration-300 ${
                      passwordStrength.isValid
                        ? 'bg-emerald-500'
                        : passwordStrength.score >= 60
                        ? 'bg-amber-500'
                        : 'bg-rose-500'
                    }`}
                    style={{ width: `${passwordStrength.score}%` }}
                  ></div>
                </div>

                <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                  <span className={passwordStrength.hasMinLength ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                    ✓ Min. 12 Karakter
                  </span>
                  <span className={passwordStrength.hasUpper ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                    ✓ Huruf Besar (A-Z)
                  </span>
                  <span className={passwordStrength.hasLower ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                    ✓ Huruf Kecil (a-z)
                  </span>
                  <span className={passwordStrength.hasNumber ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                    ✓ Digit Angka (0-9)
                  </span>
                  <span className={passwordStrength.hasSymbol ? 'text-emerald-400 font-bold col-span-2' : 'text-slate-400 col-span-2'}>
                    ✓ Karakter Khusus / Simbol (@$!%*?&#)
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Konfirmasi Kata Sandi Baru:
                </label>
                <PasswordInput
                  value={setupConfirmPass}
                  onChange={(e) => setSetupConfirmPass(e.target.value)}
                  placeholder="Ketik ulang kata sandi baru..."
                  className="px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs"
                  buttonClassName="hover:bg-slate-700"
                  iconClassName="text-amber-400"
                  required
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowSetupModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSettingUp || !passwordStrength.isValid}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-bold shadow-md cursor-pointer transition-colors"
                >
                  {isSettingUp ? 'Menyimpan...' : 'Simpan & Aktifkan Kata Sandi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
