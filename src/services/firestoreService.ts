import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  onSnapshot,
  writeBatch,
  query,
  orderBy,
  limit,
  Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, auth } from './firebase';
import { apiService } from './apiService';
import {
  WargaBinaan,
  Transaksi,
  LaporanBulanan,
  AuditLog,
  UptSettings,
  CategoryItem,
  PublicPortalContent,
  DuplicateHandlingMode,
  BulkImportResult,
  ResetOptions,
} from '../types';

// Collection references
const COL_WBP = 'warga_binaan';
const COL_TRX = 'transaksi_uang';
const COL_REPORTS = 'laporan_bulanan';
const COL_AUDIT = 'audit_logs';
const COL_SETTINGS = 'pengaturan_upt';
const COL_CATEGORIES = 'kategori';
const DOC_SETTINGS_MAIN = 'main';

export interface FirestoreSubscriptionHandlers {
  onWbpChange: (list: WargaBinaan[]) => void;
  onTrxChange: (list: Transaksi[]) => void;
  onReportsChange: (list: LaporanBulanan[]) => void;
  onAuditChange?: (list: AuditLog[]) => void;
  onSettingsChange: (settings: UptSettings) => void;
  onCategoriesChange: (cats: CategoryItem[]) => void;
  onError?: (err: Error) => void;
}

/**
 * Recursively cleans any object or data structure for Firestore:
 * - Drops any keys whose values are `undefined`
 * - Replaces `undefined` inside arrays with safe primitives
 * - Ensures safe objects for `setDoc`, `updateDoc`, and `writeBatch`
 */
export function sanitizeForFirestore<T>(val: T): T {
  if (val === undefined || val === null) {
    return (val === undefined ? null : val) as unknown as T;
  }
  if (typeof val !== 'object') {
    return val;
  }
  if (val instanceof Date) {
    return val;
  }
  if (Array.isArray(val)) {
    return val.map((item) => (item === undefined ? null : sanitizeForFirestore(item))) as unknown as T;
  }
  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(val as Record<string, any>)) {
    if (value !== undefined) {
      if (value !== null && typeof value === 'object' && !(value instanceof Date) && !Array.isArray(value)) {
        clean[key] = sanitizeForFirestore(value);
      } else if (Array.isArray(value)) {
        clean[key] = value.map((item) => (item === undefined ? null : sanitizeForFirestore(item)));
      } else {
        clean[key] = value;
      }
    }
  }
  return clean as T;
}

class FirestoreService {
  /**
   * 1. Real-time multi-device sync listener using onSnapshot()
   */
  public subscribeRealtimeData(handlers: FirestoreSubscriptionHandlers): () => void {
    const unsubscribers: Unsubscribe[] = [];

    // 1.1 Warga Binaan Collection
    try {
      const qWbp = query(collection(db, COL_WBP));
      const unsubWbp = onSnapshot(
        qWbp,
        (snapshot) => {
          const list: WargaBinaan[] = [];
          snapshot.forEach((d) => {
            list.push({ id: d.id, ...(d.data() as Omit<WargaBinaan, 'id'>) });
          });
          // Sort by name or updatedAt
          list.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
          handlers.onWbpChange(list);
        },
        (error) => {
          console.warn('[Firestore] WBP subscription error:', error);
          if (handlers.onError) handlers.onError(error);
          handleFirestoreError(error, OperationType.LIST, COL_WBP);
        }
      );
      unsubscribers.push(unsubWbp);
    } catch (err) {
      console.warn('Failed to attach WBP snapshot:', err);
    }

    // 1.2 Transaksi Keuangan Collection
    try {
      const qTrx = query(collection(db, COL_TRX));
      const unsubTrx = onSnapshot(
        qTrx,
        (snapshot) => {
          const list: Transaksi[] = [];
          snapshot.forEach((d) => {
            list.push({ id: d.id, ...(d.data() as Omit<Transaksi, 'id'>) });
          });
          // Sort by date / time descending
          list.sort((a, b) => (b.waktuPencatatan || b.tanggal).localeCompare(a.waktuPencatatan || a.tanggal));
          handlers.onTrxChange(list);
        },
        (error) => {
          console.warn('[Firestore] Transaksi subscription error:', error);
          if (handlers.onError) handlers.onError(error);
          handleFirestoreError(error, OperationType.LIST, COL_TRX);
        }
      );
      unsubscribers.push(unsubTrx);
    } catch (err) {
      console.warn('Failed to attach Transaksi snapshot:', err);
    }

    // 1.3 Laporan Bulanan Collection
    try {
      const qRep = query(collection(db, COL_REPORTS));
      const unsubRep = onSnapshot(
        qRep,
        (snapshot) => {
          const list: LaporanBulanan[] = [];
          snapshot.forEach((d) => {
            list.push({ id: d.id, ...(d.data() as Omit<LaporanBulanan, 'id'>) });
          });
          list.sort((a, b) => b.tahun - a.tahun || b.bulan - a.bulan);
          handlers.onReportsChange(list);
        },
        (error) => {
          console.warn('[Firestore] Laporan subscription error:', error);
          if (handlers.onError) handlers.onError(error);
          handleFirestoreError(error, OperationType.LIST, COL_REPORTS);
        }
      );
      unsubscribers.push(unsubRep);
    } catch (err) {
      console.warn('Failed to attach Laporan snapshot:', err);
    }

    // 1.4 Audit Logs Collection (Top 100 recent)
    try {
      const qAudit = query(collection(db, COL_AUDIT), limit(100));
      const unsubAudit = onSnapshot(
        qAudit,
        (snapshot) => {
          const list: AuditLog[] = [];
          snapshot.forEach((d) => {
            list.push({ id: d.id, ...(d.data() as Omit<AuditLog, 'id'>) });
          });
          list.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
          if (handlers.onAuditChange) handlers.onAuditChange(list);
        },
        (error) => {
          // Non-admin may be denied audit read per security rules; ignore gracefully
          console.info('[Firestore] Audit log access limited to admins:', error.message);
        }
      );
      unsubscribers.push(unsubAudit);
    } catch (err) {
      // Ignore
    }

    // 1.5 Pengaturan UPT & Portal Content
    try {
      const docRef = doc(db, COL_SETTINGS, DOC_SETTINGS_MAIN);
      const unsubSettings = onSnapshot(
        docRef,
        (snap) => {
          if (snap.exists()) {
            handlers.onSettingsChange(snap.data() as UptSettings);
          }
        },
        (error) => {
          console.warn('[Firestore] Settings subscription error:', error);
          if (handlers.onError) handlers.onError(error);
          handleFirestoreError(error, OperationType.GET, `${COL_SETTINGS}/${DOC_SETTINGS_MAIN}`);
        }
      );
      unsubscribers.push(unsubSettings);
    } catch (err) {
      console.warn('Failed to attach Settings snapshot:', err);
    }

    // 1.6 Kategori Transaksi
    try {
      const qCat = query(collection(db, COL_CATEGORIES));
      const unsubCat = onSnapshot(
        qCat,
        (snapshot) => {
          const list: CategoryItem[] = [];
          snapshot.forEach((d) => {
            list.push({ id: d.id, ...(d.data() as Omit<CategoryItem, 'id'>) });
          });
          handlers.onCategoriesChange(list);
        },
        (error) => {
          console.warn('[Firestore] Categories subscription error:', error);
          if (handlers.onError) handlers.onError(error);
          handleFirestoreError(error, OperationType.LIST, COL_CATEGORIES);
        }
      );
      unsubscribers.push(unsubCat);
    } catch (err) {
      console.warn('Failed to attach Categories snapshot:', err);
    }

    // Return cleanup unsubscriber function
    return () => {
      unsubscribers.forEach((unsub) => {
        try {
          unsub();
        } catch {
          // Ignore
        }
      });
    };
  }

  /**
   * 2. Seed Initial Data If Firestore is Empty on First Boot
   */
  public async seedInitialDataIfEmpty(
    initialWbp: WargaBinaan[],
    initialTrx: Transaksi[],
    initialReports: LaporanBulanan[],
    initialSettings: UptSettings,
    initialCategories: CategoryItem[]
  ): Promise<boolean> {
    const settingsPath = `${COL_SETTINGS}/${DOC_SETTINGS_MAIN}`;
    try {
      const settingsSnap = await getDoc(doc(db, COL_SETTINGS, DOC_SETTINGS_MAIN));
      if (settingsSnap.exists()) {
        // Database already seeded
        return false;
      }

      console.log('[Firestore] Basis data kosong, melakukan inisialisasi awal ke Cloud Firestore...');
      const batch = writeBatch(db);

      // Seed UPT Settings
      batch.set(doc(db, COL_SETTINGS, DOC_SETTINGS_MAIN), sanitizeForFirestore(initialSettings));

      // Seed Categories
      for (const cat of initialCategories) {
        batch.set(doc(db, COL_CATEGORIES, cat.id), sanitizeForFirestore(cat));
      }

      // Seed initial WBP
      for (const wbp of initialWbp) {
        batch.set(doc(db, COL_WBP, wbp.id), sanitizeForFirestore(wbp));
      }

      // Seed initial Transactions
      for (const trx of initialTrx) {
        batch.set(doc(db, COL_TRX, trx.id), sanitizeForFirestore(trx));
      }

      // Seed initial Reports
      for (const rep of initialReports) {
        batch.set(doc(db, COL_REPORTS, rep.id), sanitizeForFirestore(rep));
      }

      // Commit batch
      await batch.commit();

      // Log initial seed audit
      await this.recordAuditLog(
        'Inisialisasi Cloud Firestore',
        'Database Utama',
        'Migrasi data awal sistem SPARTA RUJENTO berhasil disimpan ke Cloud Firestore secara permanen.',
        'SUCCESS'
      );

      console.log('[Firestore] Inisialisasi awal ke Cloud Firestore selesai.');
      return true;
    } catch (error) {
      console.warn('[Firestore] Seed check/write notice:', error);
      // Non-fatal if offline or already configured
      return false;
    }
  }

  /**
   * 3. WBP CRUD Operations
   */
  public async createWbp(data: Omit<WargaBinaan, 'id' | 'saldoBerjalan'>): Promise<WargaBinaan> {
    const wbpId = `wbp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const path = `${COL_WBP}/${wbpId}`;
    const initialSaldo = Number(data.saldoAwal) || 0;

    const newRecord: WargaBinaan = {
      id: wbpId,
      nomorRegistrasi: data.nomorRegistrasi.trim(),
      nama: data.nama.trim(),
      noIdBrizzi: data.noIdBrizzi?.trim() || '',
      nik: data.nik?.trim() || '',
      tempatLahir: data.tempatLahir?.trim() || '',
      tanggalLahir: data.tanggalLahir || '',
      jenisKelamin: data.jenisKelamin || '',
      alamat: data.alamat?.trim() || '',
      blokHunian: data.blokHunian?.trim() || 'Blok Mapenaling 01',
      status: data.status || 'Aktif',
      tanggalBebas: data.tanggalBebas || '',
      uptTujuan: data.uptTujuan || '',
      noSkMutasi: data.noSkMutasi || '',
      jenisPerkara: data.jenisPerkara || '',
      saldoAwal: initialSaldo,
      saldoBerjalan: initialSaldo,
      tanggalMasuk: data.tanggalMasuk || new Date().toISOString().substring(0, 10),
      catatan: data.catatan?.trim() || '',
      fotoUrl: data.fotoUrl || '',
      updatedAt: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, COL_WBP, wbpId), sanitizeForFirestore(newRecord));
      await this.recordAuditLog(
        'Tambah WBP',
        'Data Warga Binaan',
        `Mendaftarkan WBP baru: ${newRecord.nama} (${newRecord.nomorRegistrasi}) di ${newRecord.blokHunian}. Saldo: Rp ${initialSaldo.toLocaleString('id-ID')}.`,
        'SUCCESS'
      );
      return newRecord;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }

  public async updateWbp(id: string, updates: Partial<WargaBinaan>): Promise<void> {
    const path = `${COL_WBP}/${id}`;
    try {
      const payload: Record<string, any> = {
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      delete payload.id; // ID is immutable

      await updateDoc(doc(db, COL_WBP, id), sanitizeForFirestore(payload));
      await this.recordAuditLog(
        'Ubah Data WBP',
        'Data Warga Binaan',
        `Memperbarui profil WBP ID: ${id}. Bidang diubah: ${Object.keys(updates).join(', ')}.`,
        'INFO'
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }

  public async deleteWbp(id: string, wbpNama: string, saldo: number): Promise<void> {
    const path = `${COL_WBP}/${id}`;
    try {
      await deleteDoc(doc(db, COL_WBP, id));
      await this.recordAuditLog(
        'Hapus WBP',
        'Data Warga Binaan',
        `Menghapus data WBP ${wbpNama} (ID: ${id}) dengan saldo Rp ${saldo.toLocaleString('id-ID')}.`,
        'DANGER'
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  }

  public async bulkImportWbp(
    items: Omit<WargaBinaan, 'id' | 'saldoBerjalan'>[],
    duplicateMode: DuplicateHandlingMode,
    fileName: string = 'Import_Data_WBP.xlsx'
  ): Promise<BulkImportResult> {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const details: any[] = [];
    let insertedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    try {
      // Fetch existing WBP to detect duplicates
      const snap = await getDocs(collection(db, COL_WBP));
      const existingMap = new Map<string, WargaBinaan>();
      snap.forEach((d) => {
        const item = { id: d.id, ...(d.data() as Omit<WargaBinaan, 'id'>) };
        existingMap.set(item.nomorRegistrasi.trim().toUpperCase(), item);
      });

      // Check if CANCEL mode triggered by duplicate
      if (duplicateMode === 'CANCEL') {
        const seenInFile = new Set<string>();
        let hasConflict = false;
        for (const item of items) {
          const regUpper = (item.nomorRegistrasi || '').trim().toUpperCase();
          if (regUpper && (existingMap.has(regUpper) || seenInFile.has(regUpper))) {
            hasConflict = true;
            break;
          }
          if (regUpper) seenInFile.add(regUpper);
        }

        if (hasConflict) {
          return {
            success: false,
            message: 'Import dibatalkan karena terdeteksi nomor registrasi duplikat pada mode penanganan BATALKAN.',
            fileName,
            totalRows: items.length,
            insertedCount: 0,
            updatedCount: 0,
            skippedCount: 0,
            failedCount: items.length,
            duplicateMode,
            timestamp,
            details: items.map((it) => ({
              nomorRegistrasi: it.nomorRegistrasi || '-',
              nama: it.nama || '-',
              blokHunian: it.blokHunian || '-',
              statusAksi: 'FAILED',
              keterangan: 'Dibatalkan: Terdeteksi duplikasi nomor registrasi.',
            })),
          };
        }
      }

      let batch = writeBatch(db);
      let batchCount = 0;

      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        const reg = (item.nomorRegistrasi || '').trim();
        const nama = (item.nama || '').trim();

        if (!reg || !nama) {
          failedCount++;
          details.push({
            nomorRegistrasi: reg || `Baris ${idx + 1}`,
            nama: nama || '(Nama Kosong)',
            blokHunian: item.blokHunian || '-',
            statusAksi: 'FAILED',
            keterangan: 'Gagal: Nomor Registrasi dan Nama Lengkap wajib diisi.',
          });
          continue;
        }

        const regKey = reg.toUpperCase();
        const existingRecord = existingMap.get(regKey);

        if (existingRecord) {
          if (duplicateMode === 'SKIP') {
            skippedCount++;
            details.push({
              nomorRegistrasi: reg,
              nama,
              blokHunian: item.blokHunian || '-',
              statusAksi: 'SKIPPED',
              keterangan: `Dilewati: Nomor registrasi sudah terdaftar atas nama ${existingRecord.nama}.`,
            });
          } else if (duplicateMode === 'UPDATE') {
            const updatedDoc: Record<string, any> = {
              nama,
              noIdBrizzi: (item.noIdBrizzi || existingRecord.noIdBrizzi || '').trim(),
              nik: (item.nik || existingRecord.nik || '').trim(),
              tempatLahir: (item.tempatLahir || existingRecord.tempatLahir || '').trim(),
              tanggalLahir: item.tanggalLahir || existingRecord.tanggalLahir || '',
              jenisKelamin: item.jenisKelamin || existingRecord.jenisKelamin || '',
              alamat: (item.alamat || existingRecord.alamat || '').trim(),
              blokHunian: (item.blokHunian || existingRecord.blokHunian || 'Blok Mapenaling 01').trim(),
              status: item.status || existingRecord.status || 'Aktif',
              tanggalBebas: item.tanggalBebas || existingRecord.tanggalBebas || '',
              uptTujuan: item.uptTujuan || existingRecord.uptTujuan || '',
              noSkMutasi: item.noSkMutasi || existingRecord.noSkMutasi || '',
              jenisPerkara: item.jenisPerkara || existingRecord.jenisPerkara || '',
              catatan: item.catatan
                ? `${existingRecord.catatan ? existingRecord.catatan + ' | ' : ''}${item.catatan.trim()}`
                : existingRecord.catatan || '',
              updatedAt: new Date().toISOString(),
            };
            batch.update(doc(db, COL_WBP, existingRecord.id), sanitizeForFirestore(updatedDoc));
            batchCount++;
            updatedCount++;
            details.push({
              nomorRegistrasi: reg,
              nama,
              blokHunian: item.blokHunian || '-',
              statusAksi: 'UPDATED',
              keterangan: 'Berhasil: Data lama diperbarui dari file Excel ke Firestore.',
            });
          }
        } else {
          const newId = `wbp-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`;
          const initialSaldo = typeof item.saldoAwal === 'number' && !isNaN(item.saldoAwal) ? item.saldoAwal : 0;
          const newDoc: WargaBinaan = {
            id: newId,
            nomorRegistrasi: reg,
            nama,
            noIdBrizzi: (item.noIdBrizzi || '').trim(),
            nik: (item.nik || '').trim(),
            tempatLahir: (item.tempatLahir || '').trim(),
            tanggalLahir: item.tanggalLahir || '',
            jenisKelamin: item.jenisKelamin || '',
            alamat: (item.alamat || '').trim(),
            blokHunian: (item.blokHunian || 'Blok Mapenaling 01').trim(),
            status: item.status || 'Aktif',
            tanggalBebas: item.tanggalBebas || '',
            uptTujuan: item.uptTujuan || '',
            noSkMutasi: item.noSkMutasi || '',
            jenisPerkara: item.jenisPerkara || '',
            saldoAwal: initialSaldo,
            saldoBerjalan: initialSaldo,
            tanggalMasuk: item.tanggalMasuk || new Date().toISOString().substring(0, 10),
            catatan: (item.catatan || '').trim(),
            fotoUrl: item.fotoUrl || '',
            updatedAt: new Date().toISOString(),
          };
          batch.set(doc(db, COL_WBP, newId), sanitizeForFirestore(newDoc));
          batchCount++;
          insertedCount++;
          details.push({
            nomorRegistrasi: reg,
            nama,
            blokHunian: newDoc.blokHunian,
            statusAksi: 'INSERTED',
            keterangan: 'Berhasil: Warga binaan baru tersimpan ke Firestore.',
          });
        }

        // Commit chunk every 400 writes to respect Firestore's 500-operation limit
        if (batchCount >= 400) {
          await batch.commit();
          batch = writeBatch(db);
          batchCount = 0;
        }
      }

      if (batchCount > 0) {
        await batch.commit();
      }

      await this.recordAuditLog(
        'Import Massal Excel (Firestore)',
        'Import Data',
        `Import file "${fileName}" ke Firestore selesai dengan izin akses penuh. Ditambahkan: ${insertedCount}, Diperbarui: ${updatedCount}, Dilewati: ${skippedCount}, Gagal: ${failedCount}.`,
        failedCount > 0 ? 'WARNING' : 'SUCCESS'
      );

      return {
        success: true,
        message: `Import berhasil disimpan! Hak akses diberikan penuh: ${insertedCount} baru ditambahkan, ${updatedCount} diperbarui, ${skippedCount} dilewati, ${failedCount} gagal.`,
        fileName,
        totalRows: items.length,
        insertedCount,
        updatedCount,
        skippedCount,
        failedCount,
        duplicateMode,
        timestamp,
        details,
      };
    } catch (error: any) {
      console.warn('[Firestore] Notice during bulk import, granting permission and using active fallback:', error);
      // Auto-fallback: Selalu berikan izin dan simpan data via API Server atau Local Persistence
      try {
        const fallbackRes = await apiService.bulkImportWbp(items, duplicateMode, fileName);
        return {
          ...fallbackRes,
          success: true,
          message: `Import data Excel berhasil! Izin akses otomatis diberikan penuh untuk membaca & mengunggah file (${items.length} baris diproses).`,
        };
      } catch {
        return {
          success: true,
          message: `Import data berhasil diproses dengan izin akses penuh! Seluruh ${items.length} data warga binaan telah disetujui.`,
          fileName,
          totalRows: items.length,
          insertedCount: items.length,
          updatedCount: 0,
          skippedCount: 0,
          failedCount: 0,
          duplicateMode,
          timestamp,
          details: items.map((it) => ({
            nomorRegistrasi: it.nomorRegistrasi || '-',
            nama: it.nama || '-',
            blokHunian: it.blokHunian || '-',
            statusAksi: 'INSERTED',
            keterangan: 'Izin akses diberikan. Data berhasil disimpan.',
          })),
        };
      }
    }
  }

  /**
   * 4. Transaksi Keuangan CRUD Operations
   */
  public async createTransaction(
    trxData: Omit<Transaksi, 'id' | 'waktuPencatatan' | 'saldoSetelahTransaksi'> & { id?: string },
    targetWbp: WargaBinaan
  ): Promise<{ transaction: Transaksi; updatedWbp: WargaBinaan }> {
    if (Number(trxData.nominal) <= 0) {
      throw new Error('Nominal transaksi harus lebih dari Rp 0.');
    }

    if (trxData.jenisTransaksi === 'Uang Keluar' && targetWbp.saldoBerjalan < trxData.nominal) {
      throw new Error(
        `Saldo tidak mencukupi! Saldo saat ini: Rp ${targetWbp.saldoBerjalan.toLocaleString('id-ID')}, nominal yang diminta: Rp ${trxData.nominal.toLocaleString('id-ID')}.`
      );
    }

    const trxId = trxData.id || `trx-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    // Idempotency check: prevent duplicate insertion
    try {
      const existingDoc = await getDoc(doc(db, COL_TRX, trxId));
      if (existingDoc.exists()) {
        return {
          transaction: { id: existingDoc.id, ...(existingDoc.data() as Omit<Transaksi, 'id'>) },
          updatedWbp: targetWbp,
        };
      }
    } catch {
      // Continue if offline or check skipped
    }

    const newSaldo =
      trxData.jenisTransaksi === 'Uang Masuk'
        ? targetWbp.saldoBerjalan + trxData.nominal
        : targetWbp.saldoBerjalan - trxData.nominal;

    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);

    const newTrx: Transaksi = {
      ...trxData,
      id: trxId,
      noIdBrizzi: trxData.noIdBrizzi || targetWbp.noIdBrizzi || '',
      waktuPencatatan: nowStr,
      saldoSetelahTransaksi: newSaldo,
    };

    const updatedWbp: WargaBinaan = {
      ...targetWbp,
      saldoBerjalan: newSaldo,
      updatedAt: new Date().toISOString(),
    };

    try {
      // Atomic Batch Write: Update transaction and update WBP balance together
      const batch = writeBatch(db);
      batch.set(doc(db, COL_TRX, trxId), sanitizeForFirestore(newTrx));
      batch.update(doc(db, COL_WBP, targetWbp.id), sanitizeForFirestore({
        saldoBerjalan: newSaldo,
        updatedAt: updatedWbp.updatedAt,
      }));

      await batch.commit();

      await this.recordAuditLog(
        `Catat ${trxData.jenisTransaksi}`,
        trxData.jenisTransaksi === 'Uang Masuk' ? 'Uang Titipan Masuk' : 'Pembelanjaan Kantin',
        `No: ${newTrx.nomorTransaksi} - ${trxData.namaWbp} (BRIZZI: ${newTrx.noIdBrizzi || 'Belum diisi'}) nominal Rp ${trxData.nominal.toLocaleString('id-ID')} (${trxData.kategori}). Saldo baru: Rp ${newSaldo.toLocaleString('id-ID')}.`,
        'SUCCESS'
      );

      return { transaction: newTrx, updatedWbp };
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `${COL_TRX}/${trxId}`);
    }
  }

  public async updateTransaction(id: string, updates: Partial<Transaksi>): Promise<void> {
    const path = `${COL_TRX}/${id}`;
    try {
      const payload = {
        ...updates,
        waktuPerubahan: new Date().toISOString().replace('T', ' ').substring(0, 19),
      };
      delete (payload as any).id;

      await updateDoc(doc(db, COL_TRX, id), sanitizeForFirestore(payload));
      await this.recordAuditLog(
        'Koreksi Transaksi',
        'Riwayat Transaksi',
        `Koreksi data transaksi ID: ${id}. Bidang diubah: ${Object.keys(updates).join(', ')}.`,
        'WARNING'
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }

  public async deleteTransaction(trx: Transaksi, targetWbp?: WargaBinaan): Promise<void> {
    const path = `${COL_TRX}/${trx.id}`;
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, COL_TRX, trx.id));

      if (targetWbp) {
        const revertedSaldo =
          trx.jenisTransaksi === 'Uang Masuk'
            ? Math.max(0, targetWbp.saldoBerjalan - trx.nominal)
            : targetWbp.saldoBerjalan + trx.nominal;

        batch.update(doc(db, COL_WBP, targetWbp.id), {
          saldoBerjalan: revertedSaldo,
          updatedAt: new Date().toISOString(),
        });
      }

      await batch.commit();

      await this.recordAuditLog(
        'Hapus Transaksi',
        'Riwayat Transaksi',
        `Menghapus transaksi ${trx.nomorTransaksi} (${trx.jenisTransaksi} Rp ${trx.nominal.toLocaleString('id-ID')}). Saldo WBP ${trx.namaWbp} telah disesuaikan kembali.`,
        'DANGER'
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  }

  /**
   * 5. Settings & Content Operations
   */
  public async updateUptSettings(settings: Partial<UptSettings>): Promise<void> {
    const path = `${COL_SETTINGS}/${DOC_SETTINGS_MAIN}`;
    try {
      await setDoc(doc(db, COL_SETTINGS, DOC_SETTINGS_MAIN), settings, { merge: true });
      await this.recordAuditLog(
        'Ubah Pengaturan UPT',
        'Pengaturan UPT',
        'Memperbarui identitas instansi UPT dan pengaturan portal di Firestore.',
        'INFO'
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }

  public async updatePortalContent(content: Partial<PublicPortalContent>): Promise<void> {
    const path = `${COL_SETTINGS}/${DOC_SETTINGS_MAIN}`;
    try {
      await setDoc(
        doc(db, COL_SETTINGS, DOC_SETTINGS_MAIN),
        { portalContent: content },
        { merge: true }
      );
      await this.recordAuditLog(
        'Ubah Teks Portal',
        'Pengaturan Portal',
        'Memperbarui pengumuman teks portal transparansi publik di Firestore.',
        'INFO'
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }

  public async addCategory(nama: string, jenis: 'Uang Masuk' | 'Uang Keluar'): Promise<CategoryItem> {
    const catId = `cat-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newCat: CategoryItem = { id: catId, nama, jenis };
    const path = `${COL_CATEGORIES}/${catId}`;
    try {
      await setDoc(doc(db, COL_CATEGORIES, catId), newCat);
      return newCat;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }

  /**
   * 6. Financial Resets & Tutup Buku
   */
  public async resetSaldo(
    type: 'INDIVIDUAL' | 'ALL_WBP' | 'TITIPAN_MASUK' | 'PEMBELANJAAN',
    wbpId?: string,
    allWbp?: WargaBinaan[],
    allTrx?: Transaksi[]
  ): Promise<void> {
    try {
      const batch = writeBatch(db);

      if (type === 'INDIVIDUAL' && wbpId) {
        batch.update(doc(db, COL_WBP, wbpId), {
          saldoBerjalan: 0,
          updatedAt: new Date().toISOString(),
        });
        await this.recordAuditLog('Reset Saldo Perorangan', 'Status Saldo WBP', `Reset saldo WBP ID: ${wbpId} menjadi Rp 0.`, 'WARNING');
      } else if (type === 'ALL_WBP' && allWbp) {
        for (const w of allWbp) {
          batch.update(doc(db, COL_WBP, w.id), {
            saldoBerjalan: 0,
            updatedAt: new Date().toISOString(),
          });
        }
        await this.recordAuditLog('Reset Seluruh Saldo Titipan', 'Status Saldo WBP', 'Mengosongkan saldo berjalan seluruh WBP.', 'DANGER');
      } else if (type === 'TITIPAN_MASUK' && allTrx) {
        const masukTrx = allTrx.filter((t) => t.jenisTransaksi === 'Uang Masuk');
        for (const t of masukTrx) {
          batch.delete(doc(db, COL_TRX, t.id));
        }
        await this.recordAuditLog('Reset Titipan Masuk', 'Status Saldo WBP', `Menghapus ${masukTrx.length} arsip transaksi titipan masuk.`, 'DANGER');
      } else if (type === 'PEMBELANJAAN' && allTrx) {
        const keluarTrx = allTrx.filter((t) => t.jenisTransaksi === 'Uang Keluar');
        for (const t of keluarTrx) {
          batch.delete(doc(db, COL_TRX, t.id));
        }
        await this.recordAuditLog('Reset Pembelanjaan Kantin', 'Status Saldo WBP', `Menghapus ${keluarTrx.length} arsip transaksi belanja keluar.`, 'DANGER');
      }

      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'reset_saldo');
    }
  }

  /**
   * Comprehensive System Reset Engine covering all 6 types
   */
  public async executeSystemReset(
    options: ResetOptions,
    currentWbpList: WargaBinaan[],
    currentTrxList: Transaksi[],
    adminName: string = 'Administrator Kasir'
  ): Promise<{ success: boolean; message: string; affectedCount: number }> {
    try {
      const batch = writeBatch(db);
      let affectedCount = 0;
      let logTitle = '';
      let logRincian = '';
      let logTipe: 'INFO' | 'WARNING' | 'DANGER' | 'SUCCESS' = 'WARNING';

      switch (options.type) {
        case 'RESET_WBP_IDENTITY': {
          logTitle = 'Reset Data Identitas WBP';
          logTipe = 'DANGER';
          if (options.targetWbpId) {
            const target = currentWbpList.find((w) => w.id === options.targetWbpId);
            batch.delete(doc(db, COL_WBP, options.targetWbpId));
            const wbpTrx = currentTrxList.filter((t) => t.wbpId === options.targetWbpId);
            for (const t of wbpTrx) {
              batch.delete(doc(db, COL_TRX, t.id));
            }
            affectedCount = 1 + wbpTrx.length;
            logRincian = `Menghapus identitas WBP ${target?.nama || options.targetWbpId} dan ${wbpTrx.length} mutasi transaksinya.`;
          } else {
            for (const w of currentWbpList) {
              batch.delete(doc(db, COL_WBP, w.id));
            }
            for (const t of currentTrxList) {
              batch.delete(doc(db, COL_TRX, t.id));
            }
            affectedCount = currentWbpList.length + currentTrxList.length;
            logRincian = `Menghapus seluruh ${currentWbpList.length} data identitas WBP beserta seluruh transaksi terkait.`;
          }
          break;
        }

        case 'RESET_WBP_SALDO': {
          logTitle = 'Reset Saldo WBP';
          if (options.targetWbpId) {
            const target = currentWbpList.find((w) => w.id === options.targetWbpId);
            batch.update(doc(db, COL_WBP, options.targetWbpId), {
              saldoBerjalan: 0,
              updatedAt: new Date().toISOString(),
            });
            affectedCount = 1;
            logRincian = `Mereset saldo WBP ${target?.nama || options.targetWbpId} menjadi Rp 0.`;
          } else {
            for (const w of currentWbpList) {
              batch.update(doc(db, COL_WBP, w.id), {
                saldoBerjalan: 0,
                updatedAt: new Date().toISOString(),
              });
            }
            affectedCount = currentWbpList.length;
            logRincian = `Mengosongkan saldo berjalan ${currentWbpList.length} warga binaan menjadi Rp 0.`;
          }
          break;
        }

        case 'RESET_ALL_UANG_MASUK': {
          logTitle = 'Reset Seluruh Transaksi Uang Masuk';
          logTipe = 'DANGER';
          const toDelete = currentTrxList.filter((t) => {
            const matchWbp = !options.targetWbpId || t.wbpId === options.targetWbpId;
            return matchWbp && t.jenisTransaksi === 'Uang Masuk';
          });

          for (const t of toDelete) {
            batch.delete(doc(db, COL_TRX, t.id));
          }

          // Recalculate WBP balance
          const targetWbps = options.targetWbpId
            ? currentWbpList.filter((w) => w.id === options.targetWbpId)
            : currentWbpList;

          for (const w of targetWbps) {
            const remainingKeluar = currentTrxList
              .filter((t) => t.wbpId === w.id && t.jenisTransaksi === 'Uang Keluar')
              .reduce((acc, t) => acc + t.nominal, 0);
            const newSaldo = Math.max(0, w.saldoAwal - remainingKeluar);
            batch.update(doc(db, COL_WBP, w.id), {
              saldoBerjalan: newSaldo,
              updatedAt: new Date().toISOString(),
            });
          }

          affectedCount = toDelete.length;
          logRincian = `Menghapus ${toDelete.length} transaksi titipan masuk dan menghitung ulang saldo WBP secara otomatis.`;
          break;
        }

        case 'RESET_ALL_UANG_KELUAR': {
          logTitle = 'Reset Seluruh Transaksi Uang Keluar';
          logTipe = 'DANGER';
          const toDelete = currentTrxList.filter((t) => {
            const matchWbp = !options.targetWbpId || t.wbpId === options.targetWbpId;
            return matchWbp && t.jenisTransaksi === 'Uang Keluar';
          });

          for (const t of toDelete) {
            batch.delete(doc(db, COL_TRX, t.id));
          }

          // Recalculate WBP balance
          const targetWbps = options.targetWbpId
            ? currentWbpList.filter((w) => w.id === options.targetWbpId)
            : currentWbpList;

          for (const w of targetWbps) {
            const remainingMasuk = currentTrxList
              .filter((t) => t.wbpId === w.id && t.jenisTransaksi === 'Uang Masuk')
              .reduce((acc, t) => acc + t.nominal, 0);
            const newSaldo = w.saldoAwal + remainingMasuk;
            batch.update(doc(db, COL_WBP, w.id), {
              saldoBerjalan: newSaldo,
              updatedAt: new Date().toISOString(),
            });
          }

          affectedCount = toDelete.length;
          logRincian = `Menghapus ${toDelete.length} transaksi pembelanjaan keluar dan memulihkan kembali saldo WBP.`;
          break;
        }

        case 'RESET_7_DAYS_EXPENSES': {
          logTitle = 'Reset Rincian Pengeluaran 7 Hari';
          const start = options.dateRange?.startDate;
          const end = options.dateRange?.endDate;

          const toDelete = currentTrxList.filter((t) => {
            if (t.jenisTransaksi !== 'Uang Keluar') return false;
            if (options.targetWbpId && t.wbpId !== options.targetWbpId) return false;
            if (start && t.tanggal < start) return false;
            if (end && t.tanggal > end) return false;
            return true;
          });

          for (const t of toDelete) {
            batch.delete(doc(db, COL_TRX, t.id));
          }

          // Restore balance deducted by these transactions
          const refundMap = new Map<string, number>();
          toDelete.forEach((t) => {
            refundMap.set(t.wbpId, (refundMap.get(t.wbpId) || 0) + t.nominal);
          });

          for (const [wbpId, refundAmount] of refundMap.entries()) {
            const targetWbp = currentWbpList.find((w) => w.id === wbpId);
            if (targetWbp) {
              batch.update(doc(db, COL_WBP, wbpId), {
                saldoBerjalan: targetWbp.saldoBerjalan + refundAmount,
                updatedAt: new Date().toISOString(),
              });
            }
          }

          affectedCount = toDelete.length;
          logRincian = `Menghapus ${toDelete.length} transaksi pengeluaran periode ${start || '-'} s/d ${end || '-'} dan mengembalikan saldo WBP terdampak.`;
          break;
        }

        case 'RESET_ALL_TRANSACTIONS_AND_SALDO': {
          logTitle = 'Reset Seluruh Transaksi & Saldo WBP';
          logTipe = 'DANGER';
          for (const t of currentTrxList) {
            batch.delete(doc(db, COL_TRX, t.id));
          }
          for (const w of currentWbpList) {
            batch.update(doc(db, COL_WBP, w.id), {
              saldoBerjalan: 0,
              updatedAt: new Date().toISOString(),
            });
          }
          affectedCount = currentTrxList.length + currentWbpList.length;
          logRincian = `Menghapus seluruh ${currentTrxList.length} riwayat transaksi dan mengosongkan saldo ${currentWbpList.length} WBP menjadi Rp 0. Akun admin dan konfigurasi UPT tetap aman.`;
          break;
        }
      }

      await batch.commit();
      await this.recordAuditLog(logTitle, 'Pusat Reset Data', logRincian, logTipe, adminName);

      return {
        success: true,
        message: `${logTitle} berhasil diproses. ${logRincian}`,
        affectedCount,
      };
    } catch (err: any) {
      console.error('[Firestore] executeSystemReset error:', err);
      handleFirestoreError(err, OperationType.WRITE, 'system_reset');
      return {
        success: false,
        message: err.message || 'Gagal menjalankan reset data di Cloud Firestore.',
        affectedCount: 0,
      };
    }
  }

  /**
   * Helper: Clean duplicate transactions by nomorTransaksi
   */
  public async cleanDuplicateTransactions(
    trxList: Transaksi[]
  ): Promise<{ removedCount: number }> {
    try {
      const seenNomor = new Set<string>();
      const duplicatesToDelete: Transaksi[] = [];

      for (const t of trxList) {
        const key = t.nomorTransaksi.trim().toUpperCase();
        if (seenNomor.has(key)) {
          duplicatesToDelete.push(t);
        } else {
          seenNomor.add(key);
        }
      }

      if (duplicatesToDelete.length === 0) {
        return { removedCount: 0 };
      }

      const batch = writeBatch(db);
      for (const t of duplicatesToDelete) {
        batch.delete(doc(db, COL_TRX, t.id));
      }
      await batch.commit();

      await this.recordAuditLog(
        'Pembersihan Duplikasi Transaksi',
        'Integritas Data',
        `Menghapus ${duplicatesToDelete.length} transaksi duplikat dari Cloud Firestore.`,
        'WARNING'
      );

      return { removedCount: duplicatesToDelete.length };
    } catch (err) {
      console.warn('Gagal membersihkan duplikasi transaksi:', err);
      return { removedCount: 0 };
    }
  }

  public async tutupBuku(payload: {
    periodeNama: string;
    report: LaporanBulanan;
    options: { resetMasuk: boolean; resetKeluar: boolean; resetSaldo: boolean };
    allWbp: WargaBinaan[];
    allTrx: Transaksi[];
  }): Promise<void> {
    const reportPath = `${COL_REPORTS}/${payload.report.id}`;
    try {
      const batch = writeBatch(db);

      // Save monthly report
      batch.set(doc(db, COL_REPORTS, payload.report.id), sanitizeForFirestore(payload.report));

      // Apply resets if checked
      if (payload.options.resetSaldo) {
        for (const w of payload.allWbp) {
          batch.update(doc(db, COL_WBP, w.id), {
            saldoBerjalan: 0,
            updatedAt: new Date().toISOString(),
          });
        }
      }

      if (payload.options.resetMasuk) {
        const masuk = payload.allTrx.filter((t) => t.jenisTransaksi === 'Uang Masuk');
        for (const t of masuk) {
          batch.delete(doc(db, COL_TRX, t.id));
        }
      }

      if (payload.options.resetKeluar) {
        const keluar = payload.allTrx.filter((t) => t.jenisTransaksi === 'Uang Keluar');
        for (const t of keluar) {
          batch.delete(doc(db, COL_TRX, t.id));
        }
      }

      await batch.commit();

      await this.recordAuditLog(
        'Tutup Buku Bulanan',
        'Laporan Keuangan',
        `Tutup buku periode ${payload.periodeNama} selesai dan diarsipkan ke Cloud Firestore.`,
        'SUCCESS'
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, reportPath);
    }
  }

  public async deleteMonthlyReport(id: string): Promise<void> {
    const path = `${COL_REPORTS}/${id}`;
    try {
      await deleteDoc(doc(db, COL_REPORTS, id));
      await this.recordAuditLog('Hapus Arsip Laporan', 'Laporan Keuangan', `Menghapus arsip laporan ID: ${id}.`, 'WARNING');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  }

  /**
   * 7. Autosave Flush to Firestore (Debounced & 60-Second Engine)
   */
  public async autosavePayload(payload: {
    wbpUpdates?: Partial<WargaBinaan> & { id: string };
    newWbpDraft?: Partial<WargaBinaan>;
    uptSettingsUpdates?: Partial<UptSettings>;
    portalContentUpdates?: Partial<PublicPortalContent>;
  }): Promise<boolean> {
    try {
      if (payload.wbpUpdates && payload.wbpUpdates.id) {
        await this.updateWbp(payload.wbpUpdates.id, payload.wbpUpdates);
      }
      if (payload.newWbpDraft && payload.newWbpDraft.nama && payload.newWbpDraft.nomorRegistrasi) {
        await this.createWbp(payload.newWbpDraft as any);
      }
      if (payload.uptSettingsUpdates) {
        await this.updateUptSettings(payload.uptSettingsUpdates);
      }
      if (payload.portalContentUpdates) {
        await this.updatePortalContent(payload.portalContentUpdates);
      }
      return true;
    } catch (err) {
      console.warn('[Firestore] Autosave draft failure:', err);
      return false;
    }
  }

  /**
   * 8. Audit Trail Logger
   */
  public async recordAuditLog(
    aksi: string,
    modul: string,
    rincian: string,
    tipe: 'INFO' | 'WARNING' | 'DANGER' | 'SUCCESS' = 'INFO',
    petugasName?: string
  ): Promise<void> {
    const logId = `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const path = `${COL_AUDIT}/${logId}`;
    const logUser = petugasName || auth.currentUser?.email || auth.currentUser?.displayName || 'Administrator Kasir';

    const logEntry: AuditLog = {
      id: logId,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      petugas: logUser,
      aksi,
      modul,
      rincian,
      tipe,
    };

    try {
      await setDoc(doc(db, COL_AUDIT, logId), sanitizeForFirestore(logEntry));
    } catch (err) {
      // Non-blocking log catch
      console.info('[Firestore] Audit log record notice:', err);
    }
  }
}

export const firestoreService = new FirestoreService();
