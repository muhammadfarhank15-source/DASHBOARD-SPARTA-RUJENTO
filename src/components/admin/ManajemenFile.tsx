import React, { useState, useRef, useMemo } from 'react';
import {
  FolderArchive,
  Upload,
  Search,
  Filter,
  Trash2,
  Download,
  Eye,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  Video,
  FileCode,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  ExternalLink,
  Loader2,
  User,
  Calendar,
  HardDrive,
  Info,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { StoredFileMetadata, StoredFileCategory } from '../../types';
import { ConfirmModal } from '../common/ConfirmModal';

export const ManajemenFile: React.FC = () => {
  const {
    storedFiles,
    uploadPermanentFile,
    deletePermanentFile,
    canDeleteFiles,
    wbpList,
    firebaseUser,
  } = useApp();

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('SEMUA');

  // Upload modal states
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  const [uploadCategory, setUploadCategory] = useState<StoredFileCategory>('dokumen_identitas');
  const [uploadWbpId, setUploadWbpId] = useState<string>('');
  const [uploadKeterangan, setUploadKeterangan] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Preview modal states
  const [previewFile, setPreviewFile] = useState<StoredFileMetadata | null>(null);

  // Delete confirmation modal states
  const [deletingFile, setDeletingFile] = useState<StoredFileMetadata | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Helper format file size
  const formatFileSize = (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Helper format date
  const formatDate = (isoStr: string): string => {
    if (!isoStr) return '-';
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoStr;
    }
  };

  // Helper category label & icon
  const getCategoryBadge = (cat: StoredFileCategory) => {
    switch (cat) {
      case 'foto_profil':
        return { label: 'Foto Profil WBP', icon: ImageIcon, color: 'bg-blue-100 text-blue-800 border-blue-300' };
      case 'dokumen_identitas':
        return { label: 'Dokumen Identitas', icon: FileText, color: 'bg-purple-100 text-purple-800 border-purple-300' };
      case 'arsip_excel':
        return { label: 'Arsip File Excel', icon: FileSpreadsheet, color: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
      case 'laporan_pdf':
        return { label: 'Laporan PDF', icon: FileText, color: 'bg-rose-100 text-rose-800 border-rose-300' };
      case 'video':
        return { label: 'Video Dokumentasi', icon: Video, color: 'bg-amber-100 text-amber-800 border-amber-300' };
      case 'logo_upt':
        return { label: 'Logo Resmi UPT', icon: ImageIcon, color: 'bg-indigo-100 text-indigo-800 border-indigo-300' };
      default:
        return { label: 'Dokumen Pendukung', icon: FileCode, color: 'bg-slate-100 text-slate-800 border-slate-300' };
    }
  };

  // Filtered files
  const filteredFiles = useMemo(() => {
    return storedFiles.filter((f) => {
      const matchCategory = selectedCategory === 'SEMUA' || f.jenisFile === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        f.namaFile.toLowerCase().includes(q) ||
        (f.adminUploader?.nama && f.adminUploader.nama.toLowerCase().includes(q)) ||
        (f.wbpNama && f.wbpNama.toLowerCase().includes(q)) ||
        (f.keterangan && f.keterangan.toLowerCase().includes(q));
      return matchCategory && matchSearch;
    });
  }, [storedFiles, selectedCategory, searchQuery]);

  // Handle file select for upload
  const handleSelectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      alert('Ukuran file maksimal yang didukung adalah 25MB.');
      return;
    }
    setFileToUpload(file);
    setUploadError(null);

    // Auto-detect category
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext || '')) {
      setUploadCategory('foto_profil');
    } else if (['xlsx', 'xls', 'csv'].includes(ext || '')) {
      setUploadCategory('arsip_excel');
    } else if (['pdf'].includes(ext || '')) {
      setUploadCategory('dokumen_identitas');
    } else if (['mp4', 'webm', 'mov'].includes(ext || '')) {
      setUploadCategory('video');
    } else {
      setUploadCategory('dokumen_pendukung');
    }
  };

  // Execute upload
  const handleExecuteUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileToUpload) {
      setUploadError('Silakan pilih file yang akan diunggah.');
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      const selectedWbp = wbpList.find((w) => w.id === uploadWbpId);
      await uploadPermanentFile(fileToUpload, fileToUpload.name, uploadCategory, {
        wbpId: uploadWbpId || undefined,
        wbpNama: selectedWbp?.nama,
        keterangan: uploadKeterangan,
      });

      // Reset modal
      setIsUploadModalOpen(false);
      setFileToUpload(null);
      setUploadKeterangan('');
      setUploadWbpId('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      setUploadError(err?.message || 'Gagal mengunggah file ke Firebase Storage.');
    } finally {
      setIsUploading(false);
    }
  };

  // Execute delete file
  const handleConfirmDelete = async () => {
    if (!deletingFile) return;
    setIsDeleting(true);
    try {
      await deletePermanentFile(deletingFile);
      setDeletingFile(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <span className="p-3 rounded-2xl bg-slate-950 text-amber-400 shadow-xs">
            <FolderArchive className="w-6 h-6" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900">
                Pusat Penyimpanan Dokumen &amp; File Permanen
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400/20 text-amber-800 border border-amber-300">
                Firebase Storage
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-300">
                Cloud Firestore
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Seluruh berkas foto WBP, identitas resmi, arsip Excel, dan dokumen pendukung tersimpan permanen di cloud dan terlindungi hak akses RBAC.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="px-4 py-2.5 bg-blue-900 hover:bg-blue-950 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer active:scale-98"
          >
            <Upload className="w-4 h-4" />
            Unggah Berkas Baru
          </button>
        </div>
      </div>

      {/* Otorisasi Administrator: Hak Hapus Berkas Permanen, Reset Total Keuangan, dan Pengelolaan Sistem */}
      <div className="p-4 bg-slate-900 text-white rounded-2xl border border-slate-800 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-400/20 text-amber-300 border border-amber-400/30 shrink-0">
            <ShieldCheck className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                Otorisasi Administrator Aktif
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-emerald-900/60 text-emerald-200 border border-emerald-500">
                Hak Akses Admin Penuh
              </span>
            </div>
            <p className="text-[11px] text-slate-300 mt-0.5">
              Sebagai Administrator terverifikasi, Anda memiliki hak istimewa penuh untuk <strong className="text-rose-300">Hapus Berkas Permanen</strong> dari Firebase Storage, melakukan <strong className="text-amber-300">Reset Total Keuangan</strong>, dan <strong className="text-blue-300">Kelola Hak Akses / Pengaturan Sistem</strong>.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700 text-[11px] text-slate-300 shrink-0">
          <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
          <span>Proteksi Konfirmasi Hapus Aktif</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama file, pengunggah, atau WBP..."
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-hidden focus:ring-2 focus:ring-blue-600"
          />
        </div>

        {/* Category Pills */}
        <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
          {[
            { id: 'SEMUA', label: 'Semua Berkas' },
            { id: 'foto_profil', label: 'Foto WBP' },
            { id: 'dokumen_identitas', label: 'Dokumen' },
            { id: 'arsip_excel', label: 'Arsip Excel' },
            { id: 'logo_upt', label: 'Logo UPT' },
            { id: 'video', label: 'Video' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                selectedCategory === cat.id
                  ? 'bg-blue-900 text-white font-bold shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* File List Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-sm text-slate-900">
              Daftar Berkas Tersimpan ({filteredFiles.length} File)
            </h3>
            <span className="text-xs text-slate-500 font-medium">
              • Tersimpan permanen di Firebase Storage
            </span>
          </div>
        </div>

        {filteredFiles.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
              <FolderArchive className="w-8 h-8" />
            </div>
            <p className="text-sm font-semibold text-slate-700">Belum ada file dalam kategori ini.</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Setiap kali Anda mengunggah foto profil WBP, logo resmi UPT, atau mengimpor file Excel, berkas akan otomatis tercatat dan tersimpan permanen di sini.
            </p>
            <button
              onClick={() => setIsUploadModalOpen(true)}
              className="mt-2 px-4 py-2 bg-blue-900 text-white rounded-xl text-xs font-bold hover:bg-blue-950 inline-flex items-center gap-2"
            >
              <Upload className="w-3.5 h-3.5" />
              Unggah File Sekarang
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-900 text-white font-semibold">
                <tr>
                  <th className="px-4 py-3">No.</th>
                  <th className="px-4 py-3">Nama Berkas</th>
                  <th className="px-4 py-3">Kategori</th>
                  <th className="px-4 py-3">Ukuran</th>
                  <th className="px-4 py-3">Terhubung ke WBP</th>
                  <th className="px-4 py-3">Diunggah Oleh</th>
                  <th className="px-4 py-3">Waktu Unggah</th>
                  <th className="px-4 py-3 text-center">Aksi Berkas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredFiles.map((f, idx) => {
                  const badge = getCategoryBadge(f.jenisFile);
                  const Icon = badge.icon;
                  const isImage = f.tipeMime.startsWith('image/') || f.urlPenyimpanan.includes('.png') || f.urlPenyimpanan.includes('.jpg');

                  return (
                    <tr key={f.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-500">{idx + 1}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          {isImage ? (
                            <img
                              src={f.urlPenyimpanan}
                              alt={f.namaFile}
                              className="w-8 h-8 rounded-lg object-cover border border-slate-300 shadow-2xs"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <span className="p-2 rounded-lg bg-slate-100 text-slate-700">
                              <Icon className="w-4 h-4" />
                            </span>
                          )}
                          <div>
                            <span className="font-bold text-slate-900 block truncate max-w-xs" title={f.namaFile}>
                              {f.namaFile}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {f.tipeMime || 'application/octet-stream'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${badge.color}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold text-slate-700">
                        {formatFileSize(f.ukuran)}
                      </td>
                      <td className="px-4 py-3">
                        {f.wbpNama ? (
                          <span className="font-semibold text-blue-900">
                            {f.wbpNama}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-slate-800 block">
                          {f.adminUploader?.nama || 'Administrator'}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          Peran: {f.adminUploader?.role || 'admin'}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                        {formatDate(f.tanggalUnggah)}
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {/* Pratinjau */}
                          <button
                            onClick={() => setPreviewFile(f)}
                            className="p-1.5 rounded-lg bg-blue-50 text-blue-900 hover:bg-blue-100 transition-colors"
                            title="Pratinjau Berkas"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {/* Unduh */}
                          <a
                            href={f.urlPenyimpanan}
                            target="_blank"
                            rel="noopener noreferrer"
                            download={f.namaFile}
                            className="p-1.5 rounded-lg bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition-colors inline-flex"
                            title="Unduh Berkas Permanen"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>

                          {/* Hapus (Hanya Admin yang Berwenang) */}
                          <button
                            disabled={!canDeleteFiles}
                            onClick={() => setDeletingFile(f)}
                            className={`p-1.5 rounded-lg border transition-colors ${
                              canDeleteFiles
                                ? 'bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white border-rose-200 cursor-pointer'
                                : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-50'
                            }`}
                            title={
                              canDeleteFiles
                                ? 'Hapus berkas ini secara permanen dari Firebase Storage'
                                : 'Akses Ditolak: Hanya Administrator yang berwenang menghapus file'
                            }
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* UPLOAD MODAL */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden my-8">
            <div className="p-5 bg-slate-950 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <Upload className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-sm text-white">
                  Unggah Berkas ke Firebase Storage
                </h3>
              </div>
              <button
                onClick={() => setIsUploadModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleExecuteUpload} className="p-6 space-y-4">
              {uploadError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{uploadError}</span>
                </div>
              )}

              {/* File Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Pilih File (Foto, Dokumen PDF, Excel, Video, dsb.): *
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleSelectFile}
                  required
                  className="w-full text-xs file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-900 hover:file:bg-blue-100 border border-slate-300 rounded-xl p-1.5"
                />
                {fileToUpload && (
                  <p className="text-[11px] text-emerald-700 font-semibold mt-1">
                    ✓ File terpilih: {fileToUpload.name} ({formatFileSize(fileToUpload.size)})
                  </p>
                )}
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Kategori Berkas:
                </label>
                <select
                  value={uploadCategory}
                  onChange={(e) => setUploadCategory(e.target.value as StoredFileCategory)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white text-slate-800"
                >
                  <option value="foto_profil">Foto Profil Warga Binaan</option>
                  <option value="dokumen_identitas">Dokumen Identitas / Berkas Hukum</option>
                  <option value="arsip_excel">Arsip File Excel / Rekap</option>
                  <option value="laporan_pdf">Laporan Resmi PDF</option>
                  <option value="logo_upt">Logo Resmi UPT</option>
                  <option value="video">Video Dokumentasi</option>
                  <option value="dokumen_pendukung">Dokumen Pendukung Lainnya</option>
                </select>
              </div>

              {/* Connect to WBP */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Hubungkan dengan Warga Binaan (Opsional):
                </label>
                <select
                  value={uploadWbpId}
                  onChange={(e) => setUploadWbpId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white text-slate-800"
                >
                  <option value="">-- Tidak Terhubung ke WBP Tertentu --</option>
                  {wbpList.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.nama} ({w.nomorRegistrasi})
                    </option>
                  ))}
                </select>
              </div>

              {/* Keterangan */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Keterangan Berkas / Catatan:
                </label>
                <textarea
                  value={uploadKeterangan}
                  onChange={(e) => setUploadKeterangan(e.target.value)}
                  placeholder="Contoh: Berkas identitas putusan pengadilan..."
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-hidden"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => setIsUploadModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isUploading || !fileToUpload}
                  className="px-5 py-2 bg-blue-900 hover:bg-blue-950 text-white font-bold text-xs rounded-xl shadow-md transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {isUploading ? 'Mengunggah ke Firebase Storage...' : 'Simpan Permanen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PREVIEW MODAL */}
      {previewFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden my-8">
            <div className="p-4 bg-slate-950 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-amber-400" />
                <h3 className="font-bold text-sm text-white truncate max-w-md">
                  Pratinjau: {previewFile.namaFile}
                </h3>
              </div>
              <button onClick={() => setPreviewFile(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Media viewer */}
              <div className="bg-slate-100 rounded-2xl p-4 flex items-center justify-center min-h-[200px] border border-slate-200">
                {previewFile.tipeMime.startsWith('image/') ||
                previewFile.urlPenyimpanan.includes('.png') ||
                previewFile.urlPenyimpanan.includes('.jpg') ? (
                  <img
                    src={previewFile.urlPenyimpanan}
                    alt={previewFile.namaFile}
                    className="max-h-96 max-w-full rounded-xl object-contain shadow-md"
                  />
                ) : previewFile.tipeMime.startsWith('video/') ? (
                  <video src={previewFile.urlPenyimpanan} controls className="max-h-96 max-w-full rounded-xl" />
                ) : (
                  <div className="text-center space-y-2 py-8">
                    <FileText className="w-12 h-12 text-blue-900 mx-auto" />
                    <p className="text-xs font-semibold text-slate-700">{previewFile.namaFile}</p>
                    <p className="text-[11px] text-slate-500">Berkas ini dapat diunduh atau dibuka langsung di tab baru.</p>
                  </div>
                )}
              </div>

              {/* Metadata Details */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase font-bold">Ukuran File</span>
                    <span className="font-semibold text-slate-800">{formatFileSize(previewFile.ukuran)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase font-bold">Waktu Pengunggahan</span>
                    <span className="font-semibold text-slate-800">{formatDate(previewFile.tanggalUnggah)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase font-bold">Diunggah Oleh</span>
                    <span className="font-semibold text-slate-800">
                      {previewFile.adminUploader?.nama} ({previewFile.adminUploader?.role})
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase font-bold">Status Penyimpanan</span>
                    <span className="font-semibold text-emerald-700">✓ Permanen di Firebase Storage</span>
                  </div>
                </div>

                {previewFile.keterangan && (
                  <div className="pt-2 border-t border-slate-200">
                    <span className="text-[10px] text-slate-400 block uppercase font-bold">Catatan Berkas</span>
                    <p className="text-slate-700">{previewFile.keterangan}</p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-2">
                <a
                  href={previewFile.urlPenyimpanan}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Buka di Tab Baru
                </a>
                <div className="flex items-center gap-2">
                  <a
                    href={previewFile.urlPenyimpanan}
                    download={previewFile.namaFile}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Unduh File
                  </a>
                  <button
                    onClick={() => setPreviewFile(null)}
                    className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold"
                  >
                    Tutup
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE MODAL WITH COMPLETE FILE DETAILS */}
      <ConfirmModal
        isOpen={Boolean(deletingFile)}
        title="Konfirmasi Hapus File Permanen dari Firebase Storage"
        message={`Apakah Anda yakin ingin menghapus file berikut secara permanen?\n\n• Nama Berkas: ${
          deletingFile?.namaFile
        }\n• Kategori: ${deletingFile?.jenisFile}\n• Ukuran: ${formatFileSize(
          deletingFile?.ukuran || 0
        )}\n• Diunggah Oleh: ${deletingFile?.adminUploader?.nama} (${
          deletingFile?.adminUploader?.role
        })\n• Tanggal Unggah: ${formatDate(
          deletingFile?.tanggalUnggah || ''
        )}\n\nPERINGATAN: Tindakan ini akan menghapus file fisik dari Firebase Storage dan metadata dari Firestore. Tindakan ini tidak dapat dibatalkan dan dicatat dalam Audit Trail Keamanan.`}
        confirmText={isDeleting ? 'Menghapus...' : 'Ya, Hapus File Permanen'}
        isDanger={true}
        requiredTypedConfirmation="HAPUS"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeletingFile(null)}
      />
    </div>
  );
};
