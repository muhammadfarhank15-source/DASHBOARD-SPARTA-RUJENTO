import React, { useState, useMemo } from 'react';
import {
  TrendingDown,
  Search,
  Printer,
  Trash2,
  Download,
  AlertCircle,
  CheckCircle,
  CreditCard,
  FileSpreadsheet,
  Save,
  Lock,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Transaksi } from '../../types';
import {
  formatRupiah,
  formatDateTimeIndo,
  generateTransactionNumber,
  exportToCsvWithBOM,
  exportToXlsx,
} from '../../utils/formatters';
import { ConfirmModal } from '../common/ConfirmModal';
import { ReceiptModal } from '../common/ReceiptModal';

export const PembelanjaanKantin: React.FC = () => {
  const {
    wbpList,
    transactions,
    addTransaction,
    deleteTransaction,
    categories,
    addCategory,
    uptSettings,
  } = useApp();

  // Filter only outgoing transactions
  const keluarTrx = transactions.filter((t) => t.jenisTransaksi === 'Uang Keluar');

  // Sorted WBP alphabetically (A-Z)
  const sortedWbpList = useMemo(() => {
    return [...wbpList].sort((a, b) => a.nama.localeCompare(b.nama, 'id', { sensitivity: 'base' }));
  }, [wbpList]);

  // Form State: Nominal Belanja (Minimal Rp 500, Maksimal Rp 1.000.000)
  const [wbpId, setWbpId] = useState(sortedWbpList.length > 0 ? sortedWbpList[0].id : '');
  const [tanggal, setTanggal] = useState(new Date().toISOString().substring(0, 10));
  const [kategori, setKategori] = useState('Belanja Makanan & Kantin');
  const [nominal, setNominal] = useState<number | ''>(500);
  const [tujuan, setTujuan] = useState('Kantin Koperasi Rutan');
  const [keterangan, setKeterangan] = useState('Pembelanjaan EDC kantin');
  const [petugas, setPetugas] = useState(
    uptSettings.bendaharaNama ? `${uptSettings.bendaharaNama} (Kasir Kantin EDC)` : 'Anre Sanri Krg Gising (Kasir Kantin EDC)'
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastSavedTrx, setLastSavedTrx] = useState<Transaksi | null>(null);

  // New Category State
  const [showNewCatInput, setShowNewCatInput] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  // Modals
  const [selectedTrxForReceipt, setSelectedTrxForReceipt] = useState<Transaksi | null>(null);
  const [deletingTrx, setDeletingTrx] = useState<Transaksi | null>(null);

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('Semua');

  // Status message
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const selectedWbp = wbpList.find((w) => w.id === wbpId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!selectedWbp) {
      setStatusMsg({ type: 'error', text: 'Pilih warga binaan yang berbelanja terlebih dahulu!' });
      return;
    }

    const numNominal = Number(nominal);
    if (!nominal || isNaN(numNominal) || numNominal < 500) {
      setStatusMsg({
        type: 'error',
        text: 'Nominal transaksi belanja minimal adalah Rp 500 per transaksi.',
      });
      return;
    }

    if (numNominal > 1000000) {
      setStatusMsg({
        type: 'error',
        text: 'Nominal transaksi belanja maksimal adalah Rp 1.000.000 per transaksi.',
      });
      return;
    }

    if (selectedWbp.saldoBerjalan < numNominal) {
      setStatusMsg({
        type: 'error',
        text: `Saldo WBP tidak mencukupi! Saldo saat ini: ${formatRupiah(selectedWbp.saldoBerjalan)}, dibutuhkan: ${formatRupiah(numNominal)}.`,
      });
      return;
    }

    setIsSubmitting(true);
    setStatusMsg(null);

    const nomorTransaksi = generateTransactionNumber('Uang Keluar');
    try {
      const result = await addTransaction({
        nomorTransaksi,
        tanggal,
        wbpId: selectedWbp.id,
        namaWbp: selectedWbp.nama,
        noIdBrizzi: selectedWbp.noIdBrizzi || '',
        jenisTransaksi: 'Uang Keluar',
        kategori,
        nominal: numNominal,
        sumberAtauTujuan: tujuan.trim() || 'Kantin Koperasi Rutan',
        keterangan: keterangan.trim() || 'Pembelanjaan EDC kantin',
        petugas: petugas.trim() || 'Kasir Kantin EDC',
      });

      if (result.success && result.transaction) {
        setStatusMsg({
          type: 'success',
          text: `Belanja ${formatRupiah(numNominal)} untuk ${selectedWbp.nama} berhasil disimpan ke database (No. Transaksi: ${nomorTransaksi})! Silakan klik 'Cetak Struk EDC' untuk mencetak bukti.`,
        });
        setLastSavedTrx(result.transaction);
      } else {
        setStatusMsg({ type: 'error', text: result.message });
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err?.message || 'Gagal menyimpan transaksi pembelanjaan.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddNewCategory = () => {
    if (!newCatName.trim()) return;
    addCategory(newCatName.trim(), 'Uang Keluar');
    setKategori(newCatName.trim());
    setNewCatName('');
    setShowNewCatInput(false);
  };

  const handleExportCsv = () => {
    const headers = [
      'No',
      'Tanggal & Waktu',
      'No Transaksi',
      'Nama Warga Binaan',
      'NO. ID BRIZZI',
      'Kategori',
      'Nominal Keluar (Rp)',
      'Merchant / Tujuan',
      'Sisa Saldo WBP',
      'Petugas EDC',
      'Keterangan',
    ];
    const rows = filteredList.map((t, idx) => {
      const wbp = wbpList.find((w) => w.id === t.wbpId);
      return [
        idx + 1,
        formatDateTimeIndo(t.waktuPencatatan),
        t.nomorTransaksi,
        t.namaWbp,
        t.noIdBrizzi || wbp?.noIdBrizzi || 'Belum diisi',
        t.kategori,
        t.nominal,
        t.sumberAtauTujuan,
        t.saldoSetelahTransaksi,
        t.petugas,
        t.keterangan,
      ];
    });

    exportToCsvWithBOM(
      `Riwayat_Pembelanjaan_EDC_${new Date().toISOString().substring(0, 10)}`,
      headers,
      rows,
      'Laporan Riwayat Pembelanjaan EDC Kantin & Pengeluaran WBP',
      uptSettings.namaUpt
    );
  };

  const handleExportXlsx = () => {
    const headers = [
      'No',
      'Tanggal & Waktu',
      'No Transaksi',
      'Nama Warga Binaan',
      'NO. ID BRIZZI',
      'Kategori',
      'Nominal Keluar (Rp)',
      'Merchant / Tujuan',
      'Sisa Saldo WBP',
      'Petugas EDC',
      'Keterangan',
    ];
    const rows = filteredList.map((t, idx) => {
      const wbp = wbpList.find((w) => w.id === t.wbpId);
      return [
        idx + 1,
        formatDateTimeIndo(t.waktuPencatatan),
        t.nomorTransaksi,
        t.namaWbp,
        t.noIdBrizzi || wbp?.noIdBrizzi || 'Belum diisi',
        t.kategori,
        t.nominal,
        t.sumberAtauTujuan,
        t.saldoSetelahTransaksi,
        t.petugas,
        t.keterangan,
      ];
    });

    exportToXlsx(
      `Riwayat_Pembelanjaan_EDC_${new Date().toISOString().substring(0, 10)}.xlsx`,
      headers,
      rows,
      'Pembelanjaan EDC',
      'Laporan Riwayat Pembelanjaan EDC Kantin & Pengeluaran WBP',
      uptSettings.namaUpt
    );
  };

  // Filtered list
  const filteredList = keluarTrx.filter((t) => {
    const wbp = wbpList.find((w) => w.id === t.wbpId);
    const brizziId = t.noIdBrizzi || wbp?.noIdBrizzi || '';
    const matchSearch =
      t.namaWbp.toLowerCase().includes(searchQuery.toLowerCase()) ||
      brizziId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.nomorTransaksi.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.sumberAtauTujuan.toLowerCase().includes(searchQuery.toLowerCase());
    const matchCategory = categoryFilter === 'Semua' || t.kategori === categoryFilter;
    return matchSearch && matchCategory;
  });

  const totalFilteredKeluar = filteredList.reduce((acc, t) => acc + t.nominal, 0);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-rose-950 via-slate-900 to-rose-950 text-white p-6 rounded-2xl border border-rose-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-rose-500/20 text-rose-300">
              <TrendingDown className="w-5 h-5" />
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-rose-300">
              Modul Pembelanjaan Kantin & EDC
            </span>
          </div>
          <h2 className="text-xl md:text-2xl font-black mt-1">
            Pencatatan Pembelanjaan Uang Keluar WBP
          </h2>
          <p className="text-xs text-slate-300 mt-0.5">
            Pencatatan pembelanjaan kantin dan kebutuhan WBP via EDC. Nominal belanja <strong>Minimal Rp 500</strong> s/d <strong>Maksimal Rp 1.000.000</strong> per transaksi.
          </p>
        </div>

        <div className="text-right bg-rose-900/40 p-3.5 rounded-xl border border-rose-500/30">
          <span className="text-[11px] text-rose-300 font-bold uppercase tracking-wider block">
            Total Seluruh Pembelanjaan
          </span>
          <div className="text-2xl font-black text-rose-400 mt-0.5">
            {formatRupiah(keluarTrx.reduce((a, b) => a + b.nominal, 0))}
          </div>
        </div>
      </div>

      {/* FORM INPUT TRANSAKSI BELANJA KANTIN */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-rose-600" />
            Formulir Pembelanjaan EDC Kantin Baru (Min. Rp 500 - Maks. Rp 1.000.000)
          </h3>
          {selectedWbp && (
            <span className="text-xs font-bold text-blue-900 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
              Saldo Tersedia: {formatRupiah(selectedWbp.saldoBerjalan)}
            </span>
          )}
        </div>

        {statusMsg && (
          <div
            className={`p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2 ${
              statusMsg.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            {statusMsg.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{statusMsg.text}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Tanggal */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tanggal Transaksi:
              </label>
              <input
                type="date"
                value={tanggal}
                onChange={(e) => setTanggal(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium"
                required
              />
            </div>

            {/* Nama WBP */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Warga Binaan yang Belanja:
              </label>
              <select
                value={wbpId}
                onChange={(e) => setWbpId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold bg-white text-slate-900"
                required
              >
                {sortedWbpList.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.nama} | NO. ID BRIZZI: {w.noIdBrizzi || 'Belum diisi'} ({w.blokHunian}) [Sisa Saldo: {formatRupiah(w.saldoBerjalan)}]
                  </option>
                ))}
              </select>
            </div>

            {/* Kategori */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700">Kategori Belanja:</label>
                <button
                  type="button"
                  onClick={() => setShowNewCatInput(!showNewCatInput)}
                  className="text-[10px] text-blue-900 hover:underline font-bold"
                >
                  + Tambah Kategori
                </button>
              </div>
              <select
                value={kategori}
                onChange={(e) => setKategori(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium"
              >
                {categories
                  .filter((c) => c.jenis === 'Uang Keluar')
                  .map((c) => (
                    <option key={c.id} value={c.nama}>
                      {c.nama}
                    </option>
                  ))}
              </select>
            </div>

            {/* Nominal Belanja Min Rp 500 - Maks Rp 1.000.000 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700">Nominal Belanja (Rp):</label>
                <span className="text-[10px] text-rose-700 font-bold bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                  Min Rp 500 • Maks Rp 1 Jt
                </span>
              </div>
              <div className="relative">
                <input
                  type="number"
                  min={500}
                  max={1000000}
                  step={500}
                  value={nominal}
                  onChange={(e) => setNominal(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="500 - 1000000"
                  className="w-full px-3 py-2 border border-rose-300 rounded-xl text-xs font-bold font-mono bg-rose-50/50 text-rose-950 focus:ring-2 focus:ring-rose-500 shadow-inner"
                  required
                />
              </div>
              <div className="flex items-center justify-between mt-1 text-[10px]">
                <span className="text-slate-500 font-medium">
                  {nominal !== '' && Number(nominal) >= 500 && Number(nominal) <= 1000000 ? (
                    `Terbilang: ${formatRupiah(Number(nominal))}`
                  ) : Number(nominal) > 1000000 ? (
                    <span className="text-rose-600 font-bold">Maksimal Rp 1.000.000!</span>
                  ) : (
                    <span className="text-amber-600 font-semibold">Minimal Rp 500</span>
                  )}
                </span>
                {selectedWbp && Number(nominal) > selectedWbp.saldoBerjalan && (
                  <span className="text-rose-600 font-bold">Saldo tidak cukup!</span>
                )}
              </div>
              {/* Tombol Cepat Nominal */}
              <div className="flex flex-wrap gap-1 mt-1.5">
                {[500, 2000, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setNominal(val)}
                    className={`px-1.5 py-0.5 text-[9px] font-bold rounded border transition-colors cursor-pointer ${
                      nominal === val
                        ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300'
                    }`}
                  >
                    {val === 1000000 ? '1 Juta' : val >= 1000 ? `${val / 1000}rb` : `${val}`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Quick Category Add Input if open */}
          {showNewCatInput && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-2">
              <input
                type="text"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="Ketik nama kategori pengeluaran baru..."
                className="px-3 py-1.5 border border-blue-300 rounded-lg text-xs flex-1"
              />
              <button
                type="button"
                onClick={handleAddNewCategory}
                className="px-3 py-1.5 bg-blue-900 text-white rounded-lg text-xs font-bold"
              >
                Simpan Kategori
              </button>
              <button
                type="button"
                onClick={() => setShowNewCatInput(false)}
                className="text-xs text-slate-500 hover:underline"
              >
                Batal
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Merchant / Lokasi Belanja:
              </label>
              <input
                type="text"
                value={tujuan}
                onChange={(e) => setTujuan(e.target.value)}
                placeholder="Contoh: Kantin Koperasi Rutan"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Petugas Kasir EDC:
              </label>
              <input
                type="text"
                value={petugas}
                onChange={(e) => setPetugas(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Keterangan Item Belanja:
              </label>
              <input
                type="text"
                value={keterangan}
                onChange={(e) => setKeterangan(e.target.value)}
                placeholder="Makan siang, deterjen, rokok/camilan..."
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs"
              />
            </div>
          </div>

          {/* DUA TOMBOL TERPISAH: SIMPAN & CETAK */}
          <div className="pt-3 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100">
            <div className="text-xs text-slate-500">
              {lastSavedTrx ? (
                <span className="text-emerald-700 font-semibold flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  Tersimpan di database: <strong>{lastSavedTrx.nomorTransaksi}</strong> ({lastSavedTrx.namaWbp} - {formatRupiah(lastSavedTrx.nominal)})
                </span>
              ) : (
                <span>Klik <strong>SIMPAN TRANSAKSI</strong> untuk memotong saldo & mencatat ke database. Tombol CETAK aktif setelah tersimpan.</span>
              )}
            </div>
            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 sm:flex-initial px-5 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-300 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                {isSubmitting ? 'Memproses...' : `SIMPAN BELANJA (${nominal !== '' && Number(nominal) > 0 ? formatRupiah(Number(nominal)) : 'Rp 0'})`}
              </button>
              <button
                type="button"
                disabled={!lastSavedTrx}
                onClick={() => {
                  if (lastSavedTrx) {
                    setSelectedTrxForReceipt(lastSavedTrx);
                  }
                }}
                className="flex-1 sm:flex-initial px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                title={lastSavedTrx ? 'Cetak Struk Transaksi Terakhir' : 'Simpan transaksi terlebih dahulu sebelum mencetak'}
              >
                <Printer className="w-4 h-4" />
                CETAK STRUK EDC
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* FILTER & TABEL RIWAYAT PEMBELANJAAN KANTIN */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden space-y-4 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-sm text-slate-900">
              Riwayat Pembelanjaan Kantin / Uang Keluar ({filteredList.length} Transaksi)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Subtotal yang ditampilkan: <strong className="text-rose-700">{formatRupiah(totalFilteredKeluar)}</strong>
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleExportXlsx}
              className="px-3.5 py-2 border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
              Ekspor Excel (.xlsx)
            </button>
            <button
              onClick={handleExportCsv}
              className="px-3.5 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4 text-rose-600" />
              Ekspor CSV
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama WBP, NO. ID BRIZZI, nomor transaksi, atau merchant..."
              className="w-full pl-10 pr-4 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white font-medium"
          >
            <option value="Semua">Semua Kategori</option>
            {categories
              .filter((c) => c.jenis === 'Uang Keluar')
              .map((c) => (
                <option key={c.id} value={c.nama}>
                  {c.nama}
                </option>
              ))}
          </select>
        </div>

        {/* Table */}
        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-900 text-white font-semibold">
                <tr>
                  <th className="px-4 py-3">No.</th>
                  <th className="px-4 py-3">Tanggal & Waktu</th>
                  <th className="px-4 py-3">No. Transaksi</th>
                  <th className="px-4 py-3">Warga Binaan</th>
                  <th className="px-4 py-3">NO. ID BRIZZI</th>
                  <th className="px-4 py-3">Kategori</th>
                  <th className="px-4 py-3">Merchant / Tempat</th>
                  <th className="px-4 py-3 text-right">Nominal Belanja</th>
                  <th className="px-4 py-3 text-right">Sisa Saldo</th>
                  <th className="px-4 py-3">Kasir EDC</th>
                  <th className="px-4 py-3 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredList.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="p-8 text-center text-slate-500">
                      Tidak ada transaksi pembelanjaan kantin yang cocok dengan kriteria pencarian.
                    </td>
                  </tr>
                ) : (
                  filteredList.map((trx, idx) => {
                    const wbp = wbpList.find((w) => w.id === trx.wbpId);
                    return (
                      <tr key={trx.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-500">{idx + 1}</td>
                        <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                          {formatDateTimeIndo(trx.waktuPencatatan)}
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-slate-700 whitespace-nowrap">
                          {trx.nomorTransaksi}
                        </td>
                        <td className="px-4 py-3 font-bold text-slate-900 whitespace-nowrap">
                          {trx.namaWbp}
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-slate-800 whitespace-nowrap">
                          {trx.noIdBrizzi || wbp?.noIdBrizzi || 'Belum diisi'}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                          {trx.kategori}
                        </td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                          {trx.sumberAtauTujuan}
                        </td>
                        <td className="px-4 py-3 text-right font-black text-rose-600 whitespace-nowrap">
                          - {formatRupiah(trx.nominal)}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-slate-900 whitespace-nowrap">
                          {formatRupiah(trx.saldoSetelahTransaksi)}
                        </td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{trx.petugas}</td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            {/* Print Struk Button */}
                            <button
                              onClick={() => setSelectedTrxForReceipt(trx)}
                              className="p-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors"
                              title="Cetak Struk Belanja EDC"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>

                            {/* TOMBOL HAPUS DENGAN KONFIRMASI */}
                            <button
                              onClick={() => setDeletingTrx(trx)}
                              className="p-1.5 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white transition-colors border border-rose-200"
                              title="Hapus Transaksi Belanja Ini"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* CONFIRM DELETE MODAL */}
      <ConfirmModal
        isOpen={Boolean(deletingTrx)}
        title="Konfirmasi Hapus Transaksi Belanja EDC"
        message={`Apakah Anda yakin ingin membatalkan/menghapus transaksi pembelanjaan kantin ${deletingTrx?.nomorTransaksi}?\n\nWBP: ${deletingTrx?.namaWbp}\nNominal: ${formatRupiah(
          deletingTrx?.nominal || 0
        )}\n\nSaldo WBP terkait akan dikembalikan (ditambahkan kembali) sebesar nominal ini.`}
        confirmText="Ya, Batalkan & Hapus Transaksi"
        isDanger={true}
        onConfirm={() => {
          if (deletingTrx) {
            deleteTransaction(deletingTrx.id);
            setDeletingTrx(null);
          }
        }}
        onCancel={() => setDeletingTrx(null)}
      />

      {/* RECEIPT MODAL */}
      <ReceiptModal
        isOpen={Boolean(selectedTrxForReceipt)}
        onClose={() => setSelectedTrxForReceipt(null)}
        transaction={selectedTrxForReceipt}
        wbp={wbpList.find((w) => w.id === selectedTrxForReceipt?.wbpId)}
      />
    </div>
  );
};
