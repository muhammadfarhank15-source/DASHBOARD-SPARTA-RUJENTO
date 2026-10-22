import React, { useState, useMemo } from 'react';
import {
  RotateCcw,
  AlertTriangle,
  ShieldAlert,
  Database,
  Calendar,
  UserCheck,
  CheckCircle2,
  X,
  History,
  Info,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ResetType } from '../../types';
import { formatRupiah, formatDateTimeIndo } from '../../utils/formatters';

interface ResetDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultType?: ResetType;
}

export const ResetDataModal: React.FC<ResetDataModalProps> = ({
  isOpen,
  onClose,
  defaultType = 'RESET_ALL_TRANSACTIONS_AND_SALDO',
}) => {
  const {
    wbpList,
    transactions,
    executeSystemReset,
    restoreBackupSnapshot,
    hasBackupSnapshot,
    backupSnapshotTime,
  } = useApp();

  const [selectedType, setSelectedType] = useState<ResetType>(defaultType);
  const [targetScope, setTargetScope] = useState<'all' | 'single'>('all');
  const [selectedWbpId, setSelectedWbpId] = useState<string>('');
  const [deleteSourceTransactions, setDeleteSourceTransactions] = useState<boolean>(true);
  const [createBackup, setCreateBackup] = useState<boolean>(true);

  // Confirmation modal states
  const [step, setStep] = useState<'form' | 'confirm_step1' | 'confirm_step2'>('form');
  const [confirmationInput, setConfirmationInput] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [resultMessage, setResultMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Sorted WBP list alphabetically (A-Z)
  const sortedWbp = useMemo(() => {
    return [...wbpList].sort((a, b) => a.nama.localeCompare(b.nama, 'id', { sensitivity: 'base' }));
  }, [wbpList]);

  // 7-day calculations
  const sevenDaysStats = useMemo(() => {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startDateStr = sevenDaysAgo.toISOString().substring(0, 10);
    const endDateStr = now.toISOString().substring(0, 10);

    const affected = transactions.filter((t) => {
      const isKeluar = t.jenisTransaksi === 'Uang Keluar';
      const isWithin7Days = new Date(t.tanggal) >= sevenDaysAgo;
      const matchesWbp = targetScope === 'all' || !selectedWbpId || t.wbpId === selectedWbpId;
      return isKeluar && isWithin7Days && matchesWbp;
    });

    const totalNominal = affected.reduce((acc, curr) => acc + (curr.nominal || 0), 0);
    const affectedWbpIds = new Set(affected.map((t) => t.wbpId));

    return {
      startDate: sevenDaysAgo.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
      endDate: now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
      startDateStr,
      endDateStr,
      count: affected.length,
      totalNominal,
      affectedWbpCount: affectedWbpIds.size,
    };
  }, [transactions, targetScope, selectedWbpId]);

  // Summary counts for selected action
  const summary = useMemo(() => {
    const targetWbp = selectedWbpId ? wbpList.find((w) => w.id === selectedWbpId) : null;
    const targetWbpName = targetWbp ? `${targetWbp.nama} (${targetWbp.noIdBrizzi || 'No BRIZZI -'})` : 'Seluruh WBP';

    switch (selectedType) {
      case 'RESET_WBP_IDENTITY': {
        const count = targetScope === 'all' ? wbpList.length : 1;
        return {
          title: 'Reset Data Identitas WBP',
          description: targetScope === 'all'
            ? `Menghapus seluruh ${count} data profil Warga Binaan dari sistem.`
            : `Menghapus data profil WBP ${targetWbpName}.`,
          impact: `${count} profil WBP akan dihapus. Akun admin dan pengaturan sistem tetap aman.`,
          severity: 'high',
        };
      }
      case 'RESET_WBP_SALDO': {
        const count = targetScope === 'all' ? wbpList.length : 1;
        const totalSaldo = targetScope === 'all'
          ? wbpList.reduce((acc, w) => acc + (w.saldoBerjalan || 0), 0)
          : (targetWbp?.saldoBerjalan || 0);
        return {
          title: 'Reset Saldo WBP ke Rp 0',
          description: targetScope === 'all'
            ? `Mengosongkan saldo seluruh ${count} WBP menjadi Rp 0 (Total saldo dinolkan: ${formatRupiah(totalSaldo)}).`
            : `Mengosongkan saldo WBP ${targetWbpName} menjadi Rp 0 (Saldo saat ini: ${formatRupiah(totalSaldo)}).`,
          impact: `Saldo akan diubah menjadi Rp 0. Data transaksi tidak dihapus kecuali dipilih terpisah.`,
          severity: 'medium',
        };
      }
      case 'RESET_ALL_UANG_MASUK': {
        const relevantTrx = transactions.filter((t) =>
          t.jenisTransaksi === 'Uang Masuk' && (targetScope === 'all' || !selectedWbpId || t.wbpId === selectedWbpId)
        );
        const totalNominal = relevantTrx.reduce((acc, t) => acc + t.nominal, 0);
        return {
          title: 'Reset Seluruh Transaksi Uang Masuk',
          description: `Menghapus ${relevantTrx.length} transaksi titipan masuk (${formatRupiah(totalNominal)}) untuk ${targetWbpName}.`,
          impact: `Saldo WBP terkait akan disesuaikan otomatis (dikurangi uang masuk yang dihapus).`,
          severity: 'high',
        };
      }
      case 'RESET_ALL_UANG_KELUAR': {
        const relevantTrx = transactions.filter((t) =>
          t.jenisTransaksi === 'Uang Keluar' && (targetScope === 'all' || !selectedWbpId || t.wbpId === selectedWbpId)
        );
        const totalNominal = relevantTrx.reduce((acc, t) => acc + t.nominal, 0);
        return {
          title: 'Reset Seluruh Transaksi Uang Keluar',
          description: `Menghapus ${relevantTrx.length} transaksi belanja EDC (${formatRupiah(totalNominal)}) untuk ${targetWbpName}.`,
          impact: `Saldo WBP terkait akan disesuaikan otomatis (dikembalikan sejumlah pengeluaran yang dihapus).`,
          severity: 'high',
        };
      }
      case 'RESET_7_DAYS_EXPENSES': {
        return {
          title: 'Reset Rincian Pengeluaran 7 Hari Terakhir',
          description: `Periode: ${sevenDaysStats.startDate} s/d ${sevenDaysStats.endDate}. Menghapus ${sevenDaysStats.count} transaksi pengeluaran senilai ${formatRupiah(sevenDaysStats.totalNominal)} untuk ${sevenDaysStats.affectedWbpCount} WBP.`,
          impact: deleteSourceTransactions
            ? 'Transaksi pengeluaran sumber dihapus dan saldo WBP dikembalikan otomatis.'
            : 'Hanya rincian pengeluaran yang diarsipkan, saldo tidak berubah.',
          severity: 'medium',
        };
      }
      case 'RESET_ALL_TRANSACTIONS_AND_SALDO':
      default: {
        return {
          title: 'Reset Total: Seluruh Transaksi & Saldo WBP',
          description: `Menghapus seluruh ${transactions.length} riwayat transaksi dan mengembalikan saldo seluruh ${wbpList.length} WBP menjadi Rp 0.`,
          impact: 'Data transaksi akan dibersihkan total dan seluruh saldo dinolkan. Data profil WBP, akun Admin, dan konfigurasi UPT tetap aman.',
          severity: 'critical',
        };
      }
    }
  }, [selectedType, targetScope, selectedWbpId, wbpList, transactions, sevenDaysStats, deleteSourceTransactions]);

  if (!isOpen) return null;

  const handleStartReview = () => {
    if (targetScope === 'single' && !selectedWbpId && selectedType !== 'RESET_ALL_TRANSACTIONS_AND_SALDO') {
      alert('Silakan pilih salah satu WBP terlebih dahulu.');
      return;
    }
    setStep('confirm_step1');
  };

  const handleProceedToConfirmStep2 = () => {
    if (selectedType === 'RESET_ALL_TRANSACTIONS_AND_SALDO') {
      setStep('confirm_step2');
      setConfirmationInput('');
    } else {
      executeReset();
    }
  };

  const executeReset = async () => {
    setIsProcessing(true);
    setResultMessage(null);
    try {
      const res = await executeSystemReset({
        type: selectedType,
        targetWbpId: targetScope === 'single' ? selectedWbpId : undefined,
        mode: deleteSourceTransactions ? 'DELETE_SOURCE' : 'CLEAR_SUMMARY_ONLY',
        dateRange: selectedType === 'RESET_7_DAYS_EXPENSES' ? {
          startDate: sevenDaysStats.startDateStr,
          endDate: sevenDaysStats.endDateStr,
        } : undefined,
        backupBeforeReset: createBackup,
      });

      if (res.success) {
        setResultMessage({
          type: 'success',
          text: `Reset berhasil: ${res.message}. ${createBackup ? 'Pencadangan snapshot berhasil disimpan.' : ''}`,
        });
        setTimeout(() => {
          setIsProcessing(false);
          setStep('form');
          onClose();
        }, 2200);
      } else {
        setIsProcessing(false);
        setResultMessage({
          type: 'error',
          text: res.message || 'Gagal menjalankan reset data.',
        });
      }
    } catch (err: any) {
      setIsProcessing(false);
      setResultMessage({
        type: 'error',
        text: err?.message || 'Terjadi kesalahan sistem saat melakukan reset.',
      });
    }
  };

  const handleRestore = async () => {
    if (!window.confirm('Apakah Anda yakin ingin memulihkan data dari cadangan snapshot terakhir?')) {
      return;
    }
    setIsProcessing(true);
    try {
      const ok = await restoreBackupSnapshot();
      if (ok) {
        alert('Data berhasil dipulihkan dari cadangan snapshot!');
        onClose();
      } else {
        alert('Gagal memulihkan data dari cadangan.');
      }
    } catch (e: any) {
      alert(`Error memulihkan cadangan: ${e.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header Modal */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-rose-950 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-rose-500/20 text-rose-400 rounded-xl border border-rose-500/30">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base tracking-wide flex items-center gap-2">
                PUSAT RESET DATA SISTEM
                <span className="text-[10px] uppercase tracking-wider bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded-full border border-rose-500/30 font-semibold">
                  Admin Only
                </span>
              </h3>
              <p className="text-xs text-slate-300">
                Pembersihan, penyesuaian saldo, dan reset transaksi dengan audit trail & backup
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Status Message */}
          {resultMessage && (
            <div
              className={`p-4 rounded-xl flex items-start gap-3 border ${
                resultMessage.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              {resultMessage.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div className="text-sm font-medium">{resultMessage.text}</div>
            </div>
          )}

          {/* Backup & Restore Notification Banner */}
          {hasBackupSnapshot && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs text-amber-900">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-amber-700 shrink-0" />
                <span>
                  <strong>Snapshot Cadangan Tersedia:</strong> dibuat pada{' '}
                  {backupSnapshotTime ? formatDateTimeIndo(backupSnapshotTime) : 'sebelumnya'}
                </span>
              </div>
              <button
                type="button"
                onClick={handleRestore}
                disabled={isProcessing}
                className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold text-xs shadow-xs transition-colors shrink-0 ml-3"
              >
                Pulihkan Cadangan
              </button>
            </div>
          )}

          {step === 'form' && (
            <>
              {/* Opsi Jenis Reset (6 Pilihan Sesuai Ketentuan) */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                  Pilih Jenis Reset:
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {[
                    {
                      id: 'RESET_WBP_IDENTITY',
                      num: '1',
                      title: 'Reset Identitas WBP',
                      desc: 'Hapus data identitas/profil WBP dari sistem',
                    },
                    {
                      id: 'RESET_WBP_SALDO',
                      num: '2',
                      title: 'Reset Saldo WBP',
                      desc: 'Nol-kan (Rp 0) saldo WBP tanpa hapus profil',
                    },
                    {
                      id: 'RESET_ALL_UANG_MASUK',
                      num: '3',
                      title: 'Reset Seluruh Uang Masuk',
                      desc: 'Hapus riwayat uang titipan masuk & kurangi saldo',
                    },
                    {
                      id: 'RESET_ALL_UANG_KELUAR',
                      num: '4',
                      title: 'Reset Seluruh Uang Keluar',
                      desc: 'Hapus riwayat belanja kantin & kembalikan saldo',
                    },
                    {
                      id: 'RESET_7_DAYS_EXPENSES',
                      num: '5',
                      title: 'Reset Pengeluaran 7 Hari',
                      desc: 'Reset transaksi keluar dalam 7 hari terakhir',
                    },
                    {
                      id: 'RESET_ALL_TRANSACTIONS_AND_SALDO',
                      num: '6',
                      title: 'Reset Seluruh Transaksi & Saldo',
                      desc: 'Bersihkan seluruh riwayat transaksi & nol-kan saldo',
                    },
                  ].map((opt) => (
                    <label
                      key={opt.id}
                      className={`relative flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                        selectedType === opt.id
                          ? 'border-rose-500 bg-rose-50/50 shadow-xs ring-1 ring-rose-500/30'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <input
                        type="radio"
                        name="reset_type"
                        value={opt.id}
                        checked={selectedType === opt.id}
                        onChange={() => setSelectedType(opt.id as ResetType)}
                        className="mt-1 text-rose-600 focus:ring-rose-500"
                      />
                      <div className="flex-1">
                        <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                          <span className="w-4 h-4 rounded-full bg-slate-900 text-white text-[10px] flex items-center justify-center font-bold">
                            {opt.num}
                          </span>
                          {opt.title}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Target Scope: Seluruh WBP vs WBP Tertentu */}
              {selectedType !== 'RESET_ALL_TRANSACTIONS_AND_SALDO' && (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Target Data WBP:
                  </label>
                  <div className="flex items-center gap-4 text-xs font-semibold">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="target_scope"
                        checked={targetScope === 'all'}
                        onChange={() => setTargetScope('all')}
                        className="text-rose-600 focus:ring-rose-500"
                      />
                      <span>Terapkan ke Seluruh WBP ({wbpList.length} orang)</span>
                    </label>
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="target_scope"
                        checked={targetScope === 'single'}
                        onChange={() => setTargetScope('single')}
                        className="text-rose-600 focus:ring-rose-500"
                      />
                      <span>Pilih WBP Tertentu</span>
                    </label>
                  </div>

                  {targetScope === 'single' && (
                    <div className="pt-2">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Pilih WBP (Diurutkan A s/d Z):
                      </label>
                      <select
                        value={selectedWbpId}
                        onChange={(e) => setSelectedWbpId(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
                      >
                        <option value="">-- Pilih Warga Binaan --</option>
                        {sortedWbp.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.nama} | NO. ID BRIZZI: {w.noIdBrizzi || 'Belum diisi'} | Saldo: {formatRupiah(w.saldoBerjalan)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {/* Detail Khusus: Reset Pengeluaran 7 Hari */}
              {selectedType === 'RESET_7_DAYS_EXPENSES' && (
                <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-xl space-y-2.5">
                  <div className="flex items-center gap-2 text-amber-900 font-bold text-xs uppercase tracking-wider">
                    <Calendar className="w-4 h-4 text-amber-600" />
                    <span>Statistik Pengeluaran 7 Hari Terakhir</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center pt-1">
                    <div className="p-2 bg-white rounded-lg border border-amber-200">
                      <span className="text-[10px] text-slate-500 block">Rentang Tanggal</span>
                      <span className="text-xs font-bold text-slate-800">
                        {sevenDaysStats.startDate} - {sevenDaysStats.endDate}
                      </span>
                    </div>
                    <div className="p-2 bg-white rounded-lg border border-amber-200">
                      <span className="text-[10px] text-slate-500 block">Jumlah Transaksi</span>
                      <span className="text-xs font-bold text-rose-600">{sevenDaysStats.count} Transaksi</span>
                    </div>
                    <div className="p-2 bg-white rounded-lg border border-amber-200">
                      <span className="text-[10px] text-slate-500 block">Total Nominal</span>
                      <span className="text-xs font-bold text-rose-700">{formatRupiah(sevenDaysStats.totalNominal)}</span>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 pt-2 cursor-pointer text-xs font-semibold text-slate-800">
                    <input
                      type="checkbox"
                      checked={deleteSourceTransactions}
                      onChange={(e) => setDeleteSourceTransactions(e.target.checked)}
                      className="rounded text-rose-600 focus:ring-rose-500"
                    />
                    <span>Hapus transaksi sumber dan kembalikan saldo WBP secara otomatis</span>
                  </label>
                </div>
              )}

              {/* Opsi Pencadangan Snapshot */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                <label className="flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={createBackup}
                    onChange={(e) => setCreateBackup(e.target.checked)}
                    className="rounded text-rose-600 focus:ring-rose-500"
                  />
                  <span>Buat pencadangan snapshot sebelum reset (Dapat dipulihkan kapan saja)</span>
                </label>
                <Database className="w-4 h-4 text-slate-400" />
              </div>

              {/* Penjelasan Keamanan */}
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-[11px] text-blue-900 flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Keamanan Sistem Terjamin:</strong> Tindakan reset tidak akan pernah menghapus akun Admin,
                  pengaturan UPT, atau struktur database. Seluruh tindakan dicatat otomatis pada Riwayat Audit Log.
                </span>
              </div>
            </>
          )}

          {/* Konfirmasi Tahap 1 */}
          {step === 'confirm_step1' && (
            <div className="space-y-4">
              <div className="p-4 bg-rose-50 border-2 border-rose-300 rounded-xl space-y-3">
                <div className="flex items-center gap-2 text-rose-900 font-bold text-sm">
                  <AlertTriangle className="w-5 h-5 text-rose-600" />
                  <span>Konfirmasi Tindakan Reset Data</span>
                </div>
                <div className="text-xs space-y-1.5 text-slate-700">
                  <p>
                    <strong>Jenis Tindakan:</strong> {summary.title}
                  </p>
                  <p>
                    <strong>Cakupan:</strong> {summary.description}
                  </p>
                  <p className="text-rose-700 font-medium">
                    <strong>Dampak:</strong> {summary.impact}
                  </p>
                </div>
              </div>

              {selectedType === 'RESET_ALL_TRANSACTIONS_AND_SALDO' && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center gap-2 font-medium">
                  <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>
                    Karena Anda memilih Reset Total, sistem mewajibkan konfirmasi kedua dengan pengetikan kata kunci.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Konfirmasi Tahap 2: Khusus Reset Semua */}
          {step === 'confirm_step2' && (
            <div className="space-y-4">
              <div className="p-4 bg-rose-100 border-2 border-rose-400 rounded-xl text-rose-950 space-y-2">
                <div className="flex items-center gap-2 font-extrabold text-sm">
                  <ShieldAlert className="w-5 h-5 text-rose-700" />
                  <span>KONFIRMASI AKHIR - PEMBERSIHAN TOTAL</span>
                </div>
                <p className="text-xs leading-relaxed">
                  Tindakan ini akan mengosongkan seluruh riwayat transaksi dan mengembalikan saldo WBP ke Rp 0.
                  Ketik kata kunci <strong>RESET DATA</strong> di bawah ini untuk menyetujui eksekusi.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Ketik kata "RESET DATA" (huruf kapital):
                </label>
                <input
                  type="text"
                  value={confirmationInput}
                  onChange={(e) => setConfirmationInput(e.target.value)}
                  placeholder="RESET DATA"
                  className="w-full px-3 py-2.5 font-mono text-sm tracking-wider border-2 border-rose-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:border-rose-500 uppercase"
                />
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              if (step === 'confirm_step2') setStep('confirm_step1');
              else if (step === 'confirm_step1') setStep('form');
              else onClose();
            }}
            disabled={isProcessing}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-200 transition-colors"
          >
            {step === 'form' ? 'Batal' : 'Kembali'}
          </button>

          <div className="flex items-center gap-2">
            {step === 'form' && (
              <button
                type="button"
                onClick={handleStartReview}
                disabled={isProcessing}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition-all"
              >
                <RotateCcw className="w-4 h-4" />
                Lanjutkan ke Konfirmasi
              </button>
            )}

            {step === 'confirm_step1' && (
              <button
                type="button"
                onClick={handleProceedToConfirmStep2}
                disabled={isProcessing}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition-all"
              >
                {selectedType === 'RESET_ALL_TRANSACTIONS_AND_SALDO' ? (
                  <>
                    <ShieldAlert className="w-4 h-4" />
                    Lanjut ke Konfirmasi Kedua
                  </>
                ) : (
                  <>
                    <RotateCcw className={`w-4 h-4 ${isProcessing ? 'animate-spin' : ''}`} />
                    {isProcessing ? 'Memproses Reset...' : 'Ya, Eksekusi Reset'}
                  </>
                )}
              </button>
            )}

            {step === 'confirm_step2' && (
              <button
                type="button"
                onClick={executeReset}
                disabled={isProcessing || confirmationInput.trim() !== 'RESET DATA'}
                className="px-6 py-2.5 bg-rose-700 hover:bg-rose-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl text-xs font-black tracking-wide flex items-center gap-2 shadow-md transition-all"
              >
                <RotateCcw className={`w-4 h-4 ${isProcessing ? 'animate-spin' : ''}`} />
                {isProcessing ? 'Memproses...' : 'KONFIRMASI EKSEKUSI RESET DATA'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
