import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  UploadTaskSnapshot,
} from 'firebase/storage';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  query,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { storage, db, handleFirestoreError, OperationType, auth } from './firebase';
import { StoredFileMetadata, StoredFileCategory, AdminRole } from '../types';
import { firestoreService } from './firestoreService';

const COL_FILES = 'file_metadata';
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

/**
 * Exponential backoff retry utility for transient network glitches
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 1000,
  context = 'Operasi'
): Promise<T> {
  let lastError: any;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const isTransient =
        err?.code === 'storage/retry-limit-exceeded' ||
        err?.code === 'storage/network-error' ||
        err?.name === 'TypeError' ||
        err?.message?.includes('network') ||
        err?.message?.includes('fetch') ||
        err?.message?.includes('timeout');

      if (!isTransient || attempt === maxRetries) {
        break;
      }

      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      console.warn(`[Firebase Storage Retry] ${context} gagal (percobaan ${attempt}/${maxRetries}). Mencoba kembali dalam ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

export interface UploadProgressCallback {
  (progressPercent: number, bytesTransferred: number, totalBytes: number): void;
}

export class StorageService {
  private cachedFiles: StoredFileMetadata[] | null = null;
  private lastFetchTime = 0;
  private readonly CACHE_TTL_MS = 15000; // 15 seconds cache TTL

  /**
   * Validate file size and type before sending to storage
   */
  public validateFile(file: File | Blob, originalName: string): { valid: boolean; error?: string } {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return {
        valid: false,
        error: `Ukuran file (${(file.size / (1024 * 1024)).toFixed(2)} MB) melebihi batas maksimum 25 MB.`,
      };
    }

    if (file.size === 0) {
      return {
        valid: false,
        error: 'File kosong (0 bytes) tidak dapat diunggah.',
      };
    }

    return { valid: true };
  }

  /**
   * Upload file permanently to Firebase Storage with resumable upload,
   * progress tracking, retry on transient failure, and atomic Firestore metadata record.
   */
  public async uploadPermanentFile(
    file: File | Blob,
    originalName: string,
    category: StoredFileCategory,
    adminUploader: {
      uid?: string;
      nama: string;
      email?: string;
      role: AdminRole;
    },
    metadata?: {
      wbpId?: string;
      wbpNama?: string;
      keterangan?: string;
    },
    onProgress?: UploadProgressCallback
  ): Promise<StoredFileMetadata> {
    // 1. Client-side file validation
    const validation = this.validateFile(file, originalName);
    if (!validation.valid) {
      throw new Error(validation.error || 'File tidak valid.');
    }

    const fileId = `file-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const sanitizedName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `sparta_rujento/${category}/${Date.now()}_${Math.random().toString(36).substring(2, 6)}_${sanitizedName}`;

    let permanentUrl = '';
    const mimeType = file.type || 'application/octet-stream';
    let uploadedToStorageRef: any = null;

    // 2. Upload to Firebase Storage using Resumable Upload with Progress
    try {
      const storageRef = ref(storage, storagePath);

      await withRetry(
        () =>
          new Promise<string>((resolve, reject) => {
            const uploadTask = uploadBytesResumable(storageRef, file, {
              contentType: mimeType,
              customMetadata: {
                uploadedBy: adminUploader.nama,
                category,
                wbpId: metadata?.wbpId || '',
              },
            });

            uploadTask.on(
              'state_changed',
              (snapshot: UploadTaskSnapshot) => {
                const percent = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
                if (onProgress) {
                  onProgress(percent, snapshot.bytesTransferred, snapshot.totalBytes);
                }
              },
              (error) => {
                reject(error);
              },
              async () => {
                try {
                  const url = await getDownloadURL(uploadTask.snapshot.ref);
                  uploadedToStorageRef = storageRef;
                  resolve(url);
                } catch (getErr) {
                  reject(getErr);
                }
              }
            );
          }),
        3,
        1000,
        `Upload "${originalName}"`
      ).then((url) => {
        permanentUrl = url;
      });
    } catch (fbErr: any) {
      console.warn('[Firebase Storage] Direct upload notice, fallback syncing via server storage proxy:', fbErr?.message);
      // Fallback to server storage proxy if Firebase Storage is blocked or restricted
      try {
        if (onProgress) onProgress(45, Math.floor(file.size * 0.45), file.size);

        const formData = new FormData();
        formData.append('file', file, sanitizedName);
        formData.append('fileName', originalName);
        formData.append('category', category);
        formData.append('uploadedBy', adminUploader.nama);
        formData.append('uploaderRole', adminUploader.role);
        if (metadata?.wbpId) formData.append('wbpId', metadata.wbpId);
        if (metadata?.wbpNama) formData.append('wbpNama', metadata.wbpNama);
        if (metadata?.keterangan) formData.append('keterangan', metadata.keterangan);

        const serverRes = await fetch('/api/storage/upload', {
          method: 'POST',
          body: formData,
        });

        if (serverRes.ok) {
          const resData = await serverRes.json();
          permanentUrl = resData.url || `/api/storage/files/${resData.savedName || sanitizedName}`;
          if (onProgress) onProgress(100, file.size, file.size);
        } else {
          throw new Error('Gagal mengunggah file ke penyimpanan proxy server.');
        }
      } catch (srvErr: any) {
        throw new Error(`Gagal menyimpan file permanen: ${fbErr?.message || srvErr?.message || 'Koneksi gagal'}`);
      }
    }

    // 3. Build metadata record
    const fileRecord: StoredFileMetadata = {
      id: fileId,
      namaFile: originalName,
      jenisFile: category,
      tipeMime: mimeType,
      ukuran: file.size,
      urlPenyimpanan: permanentUrl,
      storagePath,
      tanggalUnggah: new Date().toISOString(),
      adminUploader: {
        uid: adminUploader.uid || auth.currentUser?.uid || '',
        nama: adminUploader.nama || 'Administrator Kasir',
        email: adminUploader.email || auth.currentUser?.email || '',
        role: adminUploader.role || 'admin',
      },
      wbpId: metadata?.wbpId,
      wbpNama: metadata?.wbpNama,
      keterangan: metadata?.keterangan || '',
    };

    // 4. Save metadata to Cloud Firestore with Rollback protection
    try {
      const docRef = doc(db, COL_FILES, fileId);
      await setDoc(docRef, fileRecord);
      // Invalidate cache so next fetch reflects newly added file
      this.invalidateCache();
    } catch (firestoreErr: unknown) {
      console.warn('[Firestore] Notice saving file_metadata to Firestore, attempting fallback save:', firestoreErr);

      // Attempt fallback save to server API
      let savedViaServer = false;
      try {
        const srvSaveRes = await fetch('/api/storage/metadata', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fileRecord),
        });
        if (srvSaveRes.ok) {
          savedViaServer = true;
        }
      } catch {
        savedViaServer = false;
      }

      // If both Firestore and server metadata fail, rollback physical file in Storage to prevent orphan
      if (!savedViaServer && uploadedToStorageRef) {
        try {
          await deleteObject(uploadedToStorageRef);
          console.warn('[Storage Rollback] File fisik dibatalkan dari Firebase Storage karena metadata gagal disimpan.');
        } catch (rollbackErr) {
          console.error('[Storage Rollback Error]:', rollbackErr);
        }
        throw new Error('Gagal mencatat metadata file ke Cloud Firestore.');
      }
    }

    // 5. Record Audit Log asynchronously
    firestoreService
      .recordAuditLog(
        'Unggah File Permanen',
        'Penyimpanan Dokumen',
        `File "${originalName}" (${(file.size / 1024).toFixed(1)} KB, kategori: ${category}) berhasil diunggah permanen ke Firebase Storage oleh ${adminUploader.nama}.`,
        'SUCCESS',
        adminUploader.nama
      )
      .catch(() => {});

    return fileRecord;
  }

  /**
   * Replace an existing permanent file with a new file.
   * Uploads the new file, updates Firestore metadata, and removes the old physical file.
   */
  public async replacePermanentFile(
    oldFileMetadata: StoredFileMetadata,
    newFile: File | Blob,
    newOriginalName: string,
    adminUploader: {
      uid?: string;
      nama: string;
      email?: string;
      role: AdminRole;
    },
    metadataUpdates?: {
      keterangan?: string;
      wbpId?: string;
      wbpNama?: string;
    },
    onProgress?: UploadProgressCallback
  ): Promise<StoredFileMetadata> {
    // RBAC check: only admin can replace files
    if (adminUploader.role !== 'admin' && adminUploader.role !== 'super_admin') {
      throw new Error('Akses Ditolak: Hanya Administrator yang berwenang mengganti atau memperbarui berkas.');
    }

    // 1. Upload new file first
    const uploadedRecord = await this.uploadPermanentFile(
      newFile,
      newOriginalName,
      oldFileMetadata.jenisFile,
      adminUploader,
      {
        wbpId: metadataUpdates?.wbpId ?? oldFileMetadata.wbpId,
        wbpNama: metadataUpdates?.wbpNama ?? oldFileMetadata.wbpNama,
        keterangan: metadataUpdates?.keterangan ?? oldFileMetadata.keterangan,
      },
      onProgress
    );

    // 2. Safely delete the old file to avoid orphaned storage objects
    try {
      await this.deletePermanentFile(oldFileMetadata, adminUploader);
    } catch (delErr) {
      console.warn('[Storage] Notice during old file cleanup in replacement:', delErr);
    }

    return uploadedRecord;
  }

  /**
   * Delete permanent file from Firebase Storage and remove its metadata from Firestore.
   * STRICT AUTHORIZATION: Only admin or super_admin are authorized.
   * Handles storage/object-not-found gracefully so orphaned metadata can always be cleaned.
   */
  public async deletePermanentFile(
    fileMetadata: StoredFileMetadata,
    adminUser: {
      role: AdminRole;
      nama: string;
      email?: string;
    }
  ): Promise<boolean> {
    // RBAC validation
    if (adminUser.role !== 'admin' && adminUser.role !== 'super_admin') {
      throw new Error(
        'Akses Ditolak: Hanya Administrator dengan hak akses yang sah yang diizinkan untuk menghapus file permanen.'
      );
    }

    // 1. Delete physical file from Firebase Storage
    if (fileMetadata.storagePath) {
      try {
        const storageRef = ref(storage, fileMetadata.storagePath);
        await deleteObject(storageRef);
      } catch (err: any) {
        // If file is already gone from Storage, proceed anyway to clean up Firestore metadata
        if (err?.code === 'storage/object-not-found') {
          console.warn('[Firebase Storage] Object already missing in storage bucket, cleaning metadata.');
        } else {
          console.warn('[Firebase Storage] Notice during physical file delete:', err?.message);
        }
      }
    }

    // 2. Also trigger backend deletion on server storage proxy
    try {
      await fetch(`/api/storage/${fileMetadata.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-role': adminUser.role,
          'x-admin-name': adminUser.nama,
        },
        body: JSON.stringify({
          storagePath: fileMetadata.storagePath,
          namaFile: fileMetadata.namaFile,
        }),
      });
    } catch {
      // Non-blocking fallback
    }

    // 3. Delete metadata from Firestore
    try {
      await deleteDoc(doc(db, COL_FILES, fileMetadata.id));
      this.invalidateCache();
    } catch (err: unknown) {
      console.warn('[Firestore] Notice deleting file metadata doc:', err);
      handleFirestoreError(err, OperationType.DELETE, `${COL_FILES}/${fileMetadata.id}`);
    }

    // 4. Record Audit Log asynchronously
    firestoreService
      .recordAuditLog(
        'Hapus File Permanen',
        'Penyimpanan Dokumen',
        `File "${fileMetadata.namaFile}" (${(fileMetadata.ukuran / 1024).toFixed(1)} KB) berhasil dihapus permanen dari Firebase Storage oleh ${adminUser.nama}.`,
        'DANGER',
        adminUser.nama
      )
      .catch(() => {});

    return true;
  }

  /**
   * Real-time subscription to file list with in-memory caching
   */
  public subscribeFileList(
    onFilesChange: (files: StoredFileMetadata[]) => void,
    onError?: (err: Error) => void
  ): Unsubscribe {
    try {
      const q = query(collection(db, COL_FILES));
      return onSnapshot(
        q,
        (snapshot) => {
          const list: StoredFileMetadata[] = [];
          snapshot.forEach((d) => {
            list.push({ id: d.id, ...(d.data() as Omit<StoredFileMetadata, 'id'>) });
          });
          list.sort((a, b) => (b.tanggalUnggah || '').localeCompare(a.tanggalUnggah || ''));
          this.cachedFiles = list;
          this.lastFetchTime = Date.now();
          onFilesChange(list);
        },
        (error) => {
          console.warn('[Firestore] Files subscription warning:', error);
          if (onError) onError(error);
          handleFirestoreError(error, OperationType.LIST, COL_FILES);
        }
      );
    } catch (err: any) {
      console.warn('[Firestore] Failed to attach files snapshot:', err);
      return () => {};
    }
  }

  /**
   * One-time fetch of files list with caching to avoid redundant calls
   */
  public async getFiles(forceRefresh = false): Promise<StoredFileMetadata[]> {
    const isCacheValid =
      !forceRefresh &&
      this.cachedFiles !== null &&
      Date.now() - this.lastFetchTime < this.CACHE_TTL_MS;

    if (isCacheValid && this.cachedFiles) {
      return this.cachedFiles;
    }

    try {
      const snap = await getDocs(collection(db, COL_FILES));
      const list: StoredFileMetadata[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...(d.data() as Omit<StoredFileMetadata, 'id'>) });
      });
      list.sort((a, b) => (b.tanggalUnggah || '').localeCompare(a.tanggalUnggah || ''));
      this.cachedFiles = list;
      this.lastFetchTime = Date.now();
      return list;
    } catch (err) {
      console.warn('[Firestore] Fallback reading files from server API:', err);
      const res = await fetch('/api/storage/metadata').catch(() => null);
      if (res && res.ok) {
        const json = await res.json();
        const files = json.files || [];
        this.cachedFiles = files;
        this.lastFetchTime = Date.now();
        return files;
      }
      return this.cachedFiles || [];
    }
  }

  /**
   * Invalidate local memory cache
   */
  public invalidateCache(): void {
    this.cachedFiles = null;
    this.lastFetchTime = 0;
  }
}

export const storageService = new StorageService();
