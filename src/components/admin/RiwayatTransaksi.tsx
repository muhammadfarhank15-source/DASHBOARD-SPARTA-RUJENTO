import React, { useState } from 'react';
import {
  FileText,
  Search,
  Filter,
  Download,
  Printer,
  Edit3,
  Trash2,
  Calendar,
  CheckCircle,
  Eye,
  ArrowUpDown,
  FileSpreadsheet,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Transaksi } from '../../types';
import {
  formatRupiah,
  formatDateIndo,
  formatDateTimeIndo,
  exportToCsvWithBOM,
  exportToXlsx,
} from '../../utils/formatters';
import { ConfirmModal } from '../common/ConfirmModal';
import { ReceiptModal } from '../common/ReceiptModal';

export const RiwayatTransaksi: React.FC = () => {
  const {
    transactions,
    updateTransaction,
    deleteTransaction,
    categories,
    uptSettings,
    wbpList,
    cleanDuplicateTransactions,
  } = useApp();

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [jenisFilter, setJenisFilter] = useState<'Semua' | 'Uang Masuk' | 'Uang Keluar'>('Semua');
  const [categoryFilter, setCategoryFilter] = useState('Semua');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  // Modals
  const [selectedTrxForReceipt, setSelectedTrxForReceipt] = useState<Transaksi | null>(null);
  const [editingTrx, setEditingTrx] = useState<Transaksi | null>(null);
  const [deletingTrx, setDeletingTrx] = useState<Transaksi | null>(null);

  // Duplication Cleanup State
  const [isCleaningDuplicates, setIsCleaningDuplicates] = useState(false);
  const [cleanResultMsg, setCleanResultMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Edit fields
  const [editKategori, setEditKategori] = useState('');
  const [editKeterangan, setEditKeterangan] = useState('');

  // Duplication cleaner handler
  const handleCleanDuplicates = async () => {
    setIsCleaningDuplicates(true);
    try {
      const res = await cleanDuplicateTransactions();
      if (res.removedCount > 0) {
        setCleanResultMsg({
          type: 'success',
          text: `Berhasil mendeteksi dan membersihkan ${res.removedCount} transaksi duplikat!`,
        });
      } else {
        setCleanResultMsg({
          type: 'success',
          text: 'Pemeriksaan selesai: Tidak ditemukan transaksi duplikat. Seluruh transaksi sudah sah dan unik.',
        });
      }
      setTimeout(() => setCleanResultMsg(null), 5000);
    } catch (err: any) {
      setCleanResultMsg({
        type: 'error',
        text: `Gagal membersihkan duplikasi: ${err.message || 'Terjadi kesalahan'}`,
      });
      setTimeout(() => setCleanResultMsg(null), 5000);
    } finally {
      setIsCleaningDuplicates(false);
    }
  };

  // Filter logic
  const filteredList = transactions
    .filter((t) => {
      const wbp = wbpList.find((w) => w.id === t.wbpId);
      const brizzi = t.noIdBrizzi || wbp?.noIdBrizzi || '';
      const matchSearch =
        t.namaWbp.toLowerCase().includes(searchQuery.toLowerCase()) ||
        brizzi.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.nomorTransaksi.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.keterangan.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.petugas.toLowerCase().includes(searchQuery.toLowerCase());

      const matchJenis = jenisFilter === 'Semua' || t.jenisTransaksi === jenisFilter;
      const matchCategory = categoryFilter === 'Semua' || t.kategori === categoryFilter;

      let matchDate = true;
      if (startDate && t.tanggal < startDate) matchDate = false;
      if (endDate && t.tanggal > endDate) matchDate = false;

      return matchSearch && matchJenis && matchCategory && matchDate;
    })
    .sort((a, b) => {
      const timeA = new Date(a.waktuPencatatan).getTime();
      const timeB = new Date(b.waktuPencatatan).getTime();
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    });

  const totalMasukFiltered = filteredList
    .filter((t) => t.jenisTransaksi === 'Uang Masuk')
    .reduce((a, b) => a + b.nominal, 0);

  const totalKeluarFiltered = filteredList
    .filter((t) => t.jenisTransaksi === 'Uang Keluar')
    .reduce((a, b) => a + b.nominal, 0);

  const handleOpenEdit = (trx: Transaksi) => {
    setEditingTrx(trx);
    setEditKategori(trx.kategori);
    setEditKeterangan(trx.keterangan);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTrx) return;
    await updateTransaction(editingTrx.id, {
      kategori: editKategori,
      keterangan: editKeterangan,
    });
    setEditingTrx(null);
  };

  const handleExportCsv = () => {
    const headers = [
      'No',
      'Tanggal',
      'Waktu Pencatatan',
      'Nomor Transaksi',
      'Nama Pemilik/Penerima',
      'NO. ID BRIZZI',
      'Jenis Transaksi',
      'Kategori',
      'Uang Masuk (Rp)',
      'Uang Keluar (Rp)',
      'Saldo Setelah Transaksi (Rp)',
      'Keterangan',
      'Admin / Petugas',
    ];
    const rows = filteredList.map((t, idx) => {
      const wbp = wbpList.find((w) => w.id === t.wbpId);
      return [
        idx + 1,
        t.tanggal,
        t.waktuPencatatan,
        t.nomorTransaksi,
        t.namaWbp,
        t.noIdBrizzi || wbp?.noIdBrizzi || 'Belum diisi',
        t.jenisTransaksi,
        t.kategori,
        t.jenisTransaksi === 'Uang Masuk' ? t.nominal : 0,
        t.jenisTransaksi === 'Uang Keluar' ? t.nominal : 0,
        t.saldoSetelahTransaksi,
        t.keterangan,
        t.petugas,
      ];
    });

    exportToCsvWithBOM(
      `Riwayat_Seluruh_Transaksi_${new Date().toISOString().substring(0, 10)}`,
      headers,
      rows,
      'Buku Riwayat Transaksi Keuangan Digital Lengkap',
      uptSettings.namaUpt
    );
  };

  const handleExportXlsx = () => {
    const headers = [
      'No',
      'Tanggal',
      'Waktu Pencatatan',
      'Nomor Transaksi',
      'Nama Pemilik/Penerima',
      'NO. ID BRIZZI',
      'Jenis Transaksi',
      'Kategori',
      'Uang Masuk (Rp)',
      'Uang Keluar (Rp)',
      'Saldo Setelah Transaksi (Rp)',
      'Keterangan',
      'Admin / Petugas',
    ];
    const rows = filteredList.map((t, idx) => {
      const wbp = wbpList.find((w) => w.id === t.wbpId);
      return [
        idx + 1,
        t.tanggal,
        t.waktuPencatatan,
        t.nomorTransaksi,
        t.namaWbp,
        t.noIdBrizzi || wbp?.noIdBrizzi || 'Belum diisi',
        t.jenisTransaksi,
        t.kategori,
        t.jenisTransaksi === 'Uang Masuk' ? t.nominal : 0,
        t.jenisTransaksi === 'Uang Keluar' ? t.nominal : 0,
        t.saldoSetelahTransaksi,
        t.keterangan,
        t.petugas,
      ];
    });

    exportToXlsx(
      `Riwayat_Seluruh_Transaksi_${new Date().toISOString().substring(0, 10)}`,
      headers,
      rows,
      'Riwayat Transaksi Lengkap',
      uptSettings.namaUpt
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-blue-100 text-blue-900">
              <FileText className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Riwayat Transaksi Keuangan (Buku Kas Umum)
              </h2>
              <p className="text-xs text-slate-500">
                Catatan mutasi pemasukan titipan dan pengeluaran belanja EDC secara transparan dan kronologis.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleCleanDuplicates}
            disabled={isCleaningDuplicates}
            className="px-3.5 py-2.5 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
            title="Pindai dan bersihkan transaksi ganda yang tidak sah"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-amber-700 ${isCleaningDuplicates ? 'animate-spin' : ''}`} />
            {isCleaningDuplicates ? 'Memeriksa Duplikasi...' : 'Deteksi & Bersihkan Duplikasi'}
          </button>

          <button
            onClick={handleExportCsv}
            className="px-3.5 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600" />
            Ekspor CSV
          </button>

          <button
            onClick={handleExportXlsx}
            className="px-3.5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-white" />
            Ekspor Excel (.XLSX)
          </button>
        </div>
      </div>

      {/* Clean Duplicates Feedback Notification */}
      {cleanResultMsg && (
        <div
          className={`p-3.5 rounded-xl text-xs font-medium flex items-center gap-2 border ${
            cleanResultMsg.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <Sparkles className="w-4 h-4 shrink-0" />
          <span>{cleanResultMsg.text}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Keyword Search */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama, NO. ID BRIZZI, no trx, keterangan..."
              className="w-full pl-10 pr-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-900"
            />
          </div>

          {/* Jenis Transaksi */}
          <select
            value={jenisFilter}
            onChange={(e) => setJenisFilter(e.target.value as 'Semua' | 'Uang Masuk' | 'Uang Keluar')}
            className="px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white font-medium"
          >
            <option value="Semua">Semua Jenis Transaksi</option>
            <option value="Uang Masuk">Hanya Uang Masuk (Titipan)</option>
            <option value="Uang Keluar">Hanya Uang Keluar (Belanja)</option>
          </select>

          {/* Kategori */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white font-medium"
          >
            <option value="Semua">Semua Kategori</option>
            {categories.map((c) => (
              <option key={c.id} value={c.nama}>
                {c.nama} ({c.jenis})
              </option>
            ))}
          </select>

          {/* Sort Order */}
          <button
            onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
            className="px-3 py-2 text-xs border border-slate-300 rounded-xl bg-slate-50 hover:bg-slate-100 font-semibold text-slate-700 flex items-center justify-between"
          >
            <span>Urutan: {sortOrder === 'desc' ? 'Terbaru ke Terlama' : 'Terlama ke Terbaru'}</span>
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>

        {/* Date Range Row */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-2 border-t border-slate-100 text-xs">
          <span className="text-slate-500 font-medium">Rentang Tanggal:</span>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
            />
            <span className="text-slate-400">s/d</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
            />
          </div>
          {(startDate || endDate || searchQuery || jenisFilter !== 'Semua' || categoryFilter !== 'Semua') && (
            <button
              onClick={() => {
                setStartDate('');
                setEndDate('');
                setSearchQuery('');
                setJenisFilter('Semua');
                setCategoryFilter('Semua');
              }}
              className="text-xs text-rose-600 hover:underline font-semibold ml-auto"
            >
              Reset Filter
            </button>
          )}
        </div>

        {/* Summary of Filtered Items */}
        <div className="flex items-center gap-4 text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-200">
          <span className="font-semibold text-slate-700">
            Ditemukan: <strong>{filteredList.length}</strong> transaksi
          </span>
          <span>•</span>
          <span className="text-emerald-700 font-bold">
            Total Masuk: {formatRupiah(totalMasukFiltered)}
          </span>
          <span>•</span>
          <span className="text-rose-700 font-bold">
            Total Keluar: {formatRupiah(totalKeluarFiltered)}
          </span>
        </div>
      </div>

      {/* Main Transactions Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-900 text-white font-semibold">
              <tr>
                <th className="px-3.5 py-3">No.</th>
                <th className="px-3.5 py-3">Tanggal & Waktu</th>
                <th className="px-3.5 py-3">No. Transaksi</th>
                <th className="px-3.5 py-3">Nama Pemilik/Penerima</th>
                <th className="px-3.5 py-3">NO. ID BRIZZI</th>
                <th className="px-3.5 py-3">Jenis</th>
                <th className="px-3.5 py-3">Kategori</th>
                <th className="px-3.5 py-3 text-right">Uang Masuk</th>
                <th className="px-3.5 py-3 text-right">Uang Keluar</th>
                <th className="px-3.5 py-3 text-right">Saldo Sesudah</th>
                <th className="px-3.5 py-3">Admin</th>
                <th className="px-3.5 py-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={12} className="p-8 text-center text-slate-500">
                    Tidak ada data transaksi yang sesuai filter yang dipilih.
                  </td>
                </tr>
              ) : (
                filteredList.map((trx, idx) => {
                  const isMasuk = trx.jenisTransaksi === 'Uang Masuk';
                  const wbp = wbpList.find((w) => w.id === trx.wbpId);
                  const brizziId = trx.noIdBrizzi || wbp?.noIdBrizzi;
                  return (
                    <tr key={trx.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-3.5 py-3 font-medium text-slate-500">{idx + 1}</td>
                      <td className="px-3.5 py-3 whitespace-nowrap text-slate-800">
                        {formatDateTimeIndo(trx.waktuPencatatan)}
                      </td>
                      <td className="px-3.5 py-3 font-mono font-bold text-slate-700 whitespace-nowrap">
                        {trx.nomorTransaksi}
                      </td>
                      <td className="px-3.5 py-3 font-bold text-slate-900 whitespace-nowrap">
                        {trx.namaWbp}
                      </td>
                      <td className="px-3.5 py-3 font-mono font-bold text-slate-800 whitespace-nowrap">
                        {brizziId || <span className="text-slate-400 font-normal italic">Belum diisi</span>}
                      </td>
                      <td className="px-3.5 py-3 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isMasuk
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {trx.jenisTransaksi}
                        </span>
                      </td>
                      <td className="px-3.5 py-3 font-medium text-slate-800 whitespace-nowrap">
                        {trx.kategori}
                      </td>
                      <td className="px-3.5 py-3 text-right font-black text-emerald-600 whitespace-nowrap">
                        {isMasuk ? `+ ${formatRupiah(trx.nominal)}` : '-'}
                      </td>
                      <td className="px-3.5 py-3 text-right font-black text-rose-600 whitespace-nowrap">
                        {!isMasuk ? `- ${formatRupiah(trx.nominal)}` : '-'}
                      </td>
                      <td className="px-3.5 py-3 text-right font-bold text-slate-900 whitespace-nowrap">
                        {formatRupiah(trx.saldoSetelahTransaksi)}
                      </td>
                      <td className="px-3.5 py-3 text-slate-600 whitespace-nowrap">{trx.petugas}</td>
                      <td className="px-3.5 py-3 text-center whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {/* Lihat Detail / Struk */}
                          <button
                            onClick={() => setSelectedTrxForReceipt(trx)}
                            className="p-1.5 rounded-lg bg-blue-50 text-blue-900 hover:bg-blue-100 transition-colors"
                            title="Lihat Detail & Cetak Struk"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {/* Edit Transaksi */}
                          <button
                            onClick={() => handleOpenEdit(trx)}
                            className="p-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                            title="Edit Kategori & Keterangan Transaksi"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          {/* TOMBOL HAPUS DENGAN KONFIRMASI */}
                          <button
                            onClick={() => setDeletingTrx(trx)}
                            className="p-1.5 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white transition-colors border border-rose-200"
                            title="Hapus Transaksi Ini"
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

      {/* EDIT MODAL */}
      {editingTrx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full border border-slate-200 overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-bold text-xs uppercase tracking-wider">
                Koreksi Catatan Transaksi: {editingTrx.nomorTransaksi}
              </h3>
              <button onClick={() => setEditingTrx(null)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>
            <form onSubmit={handleSaveEdit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Warga Binaan & Nominal:
                </label>
                <div className="p-2.5 bg-slate-50 rounded-xl text-xs font-bold text-slate-800 border border-slate-200">
                  {editingTrx.namaWbp} • {formatRupiah(editingTrx.nominal)} ({editingTrx.jenisTransaksi})
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Kategori Transaksi:
                </label>
                <select
                  value={editKategori}
                  onChange={(e) => setEditKategori(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium"
                >
                  {categories
                    .filter((c) => c.jenis === editingTrx.jenisTransaksi)
                    .map((c) => (
                      <option key={c.id} value={c.nama}>
                        {c.nama}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Keterangan:
                </label>
                <textarea
                  value={editKeterangan}
                  onChange={(e) => setEditKeterangan(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium"
                  required
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingTrx(null)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-900 hover:bg-blue-950 text-white rounded-xl text-xs font-bold"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE MODAL */}
      <ConfirmModal
        isOpen={Boolean(deletingTrx)}
        title="Hapus Transaksi dari Riwayat Kas"
        message={`Apakah Anda yakin ingin menghapus transaksi ${deletingTrx?.nomorTransaksi}?\n\nWarga Binaan: ${deletingTrx?.namaWbp}\nJenis: ${deletingTrx?.jenisTransaksi}\nNominal: ${formatRupiah(
          deletingTrx?.nominal || 0
        )}\n\nSaldo WBP dan pembukuan kas akan disesuaikan secara otomatis, dan tindakan ini dicatat ke Audit Trail.`}
        confirmText="Ya, Hapus Transaksi"
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
