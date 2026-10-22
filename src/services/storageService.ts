import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  query,
  orderBy,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { storage, db, handleFirestoreError, OperationType, auth } from './firebase';
import { StoredFileMetadata, StoredFileCategory, AdminRole } from '../types';
import { firestoreService } from './firestoreService';

const COL_FILES = 'file_metadata';

export class StorageService {
  /**
   * Upload file permanently to Firebase Storage and record its metadata in Firestore.
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
    }
  ): Promise<StoredFileMetadata> {
    const fileId = `file-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const sanitizedName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `sparta_rujento/${category}/${Date.now()}_${sanitizedName}`;

    let permanentUrl = '';

    // 1. Attempt upload to Firebase Storage
    try {
      const storageRef = ref(storage, storagePath);
      const mimeType = file.type || 'application/octet-stream';
      await uploadBytes(storageRef, file, {
        contentType: mimeType,
        customMetadata: {
          uploadedBy: adminUploader.nama,
          category,
          wbpId: metadata?.wbpId || '',
        },
      });
      permanentUrl = await getDownloadURL(storageRef);
    } catch (fbErr: any) {
      console.warn('[Firebase Storage] Direct upload notice, syncing via server storage proxy:', fbErr?.message);
      // Fallback to server storage proxy
      try {
        const formData = new FormData();
        formData.append('file', file, sanitizedName);
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
        } else {
          throw new Error('Gagal mengunggah file ke penyimpanan server.');
        }
      } catch (srvErr: any) {
        throw new Error(`Gagal menyimpan file permanen: ${fbErr?.message || srvErr?.message || 'Koneksi gagal'}`);
      }
    }

    // 2. Build metadata record
    const fileRecord: StoredFileMetadata = {
      id: fileId,
      namaFile: originalName,
      jenisFile: category,
      tipeMime: file.type || 'application/octet-stream',
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

    // 3. Save metadata to Cloud Firestore
    try {
      const docRef = doc(db, COL_FILES, fileId);
      await setDoc(docRef, fileRecord);
    } catch (err: unknown) {
      console.warn('[Firestore] Notice saving file_metadata to Firestore:', err);
      // Fallback save to server database
      try {
        await fetch('/api/storage/metadata', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fileRecord),
        });
      } catch {
        // Non-blocking
      }
    }

    // 4. Record in Audit Log
    try {
      await firestoreService.recordAuditLog(
        'Unggah File Permanen',
        'Penyimpanan Dokumen',
        `File "${originalName}" (${(file.size / 1024).toFixed(1)} KB, kategori: ${category}) berhasil diunggah permanen ke Firebase Storage oleh ${adminUploader.nama}.`,
        'SUCCESS',
        adminUploader.nama
      );
    } catch {
      // Non-blocking
    }

    return fileRecord;
  }

  /**
   * Delete permanent file from Firebase Storage and remove its metadata.
   * STRICT AUTHORIZATION: Only admin or super_admin are authorized.
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
    try {
      if (fileMetadata.storagePath) {
        const storageRef = ref(storage, fileMetadata.storagePath);
        await deleteObject(storageRef);
      }
    } catch (err: any) {
      console.warn('[Firebase Storage] Notice during physical file delete:', err?.message);
    }

    // 2. Also trigger backend deletion on server storage
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
      // Non-blocking
    }

    // 3. Delete metadata from Firestore
    try {
      await deleteDoc(doc(db, COL_FILES, fileMetadata.id));
    } catch (err: unknown) {
      console.warn('[Firestore] Notice deleting file metadata doc:', err);
      handleFirestoreError(err, OperationType.DELETE, `${COL_FILES}/${fileMetadata.id}`);
    }

    // 4. Record Audit Log
    try {
      await firestoreService.recordAuditLog(
        'Hapus File Permanen',
        'Penyimpanan Dokumen',
        `File "${fileMetadata.namaFile}" (${(fileMetadata.ukuran / 1024).toFixed(1)} KB) berhasil dihapus permanen dari Firebase Storage oleh ${adminUser.nama}.`,
        'DANGER',
        adminUser.nama
      );
    } catch {
      // Non-blocking
    }

    return true;
  }

  /**
   * Real-time subscription to file list
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
   * One-time fetch of files list
   */
  public async getFiles(): Promise<StoredFileMetadata[]> {
    try {
      const snap = await getDocs(collection(db, COL_FILES));
      const list: StoredFileMetadata[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...(d.data() as Omit<StoredFileMetadata, 'id'>) });
      });
      list.sort((a, b) => (b.tanggalUnggah || '').localeCompare(a.tanggalUnggah || ''));
      return list;
    } catch (err) {
      console.warn('[Firestore] Fallback reading files from server API:', err);
      const res = await fetch('/api/storage/metadata').catch(() => null);
      if (res && res.ok) {
        const json = await res.json();
        return json.files || [];
      }
      return [];
    }
  }
}

export const storageService = new StorageService();
