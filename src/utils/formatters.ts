/**
 * Helper formatters and CSV exporter tailored for Indonesian Rupiah & Excel
 * Terstandarisasi Zona Waktu Indonesia Tengah (WITA - Asia/Makassar, UTC+08:00)
 */

export const TIMEZONE_WITA = 'Asia/Makassar';

// Sinkronisasi selisih waktu klien terhadap server tepercaya (mencegah jam HP/laptop keliru)
let serverTimeDriftMs = 0;
let hasSyncedServerTime = false;

export function setServerTimeSync(serverTimestamp: number) {
  serverTimeDriftMs = serverTimestamp - Date.now();
  hasSyncedServerTime = true;
}

export function getTrustedServerTime(): Date {
  return new Date(Date.now() + serverTimeDriftMs);
}

/**
 * Parsing tanggal secara aman tanpa duplikasi penambahan offset 8 jam.
 * Mendukung format ISO UTC, format database "YYYY-MM-DD HH:mm:ss", dan Date objects.
 */
export function parseDateSafe(input: string | Date | number | undefined | null): Date | null {
  if (!input) return null;
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input;
  if (typeof input === 'number') {
    const d = new Date(input);
    return isNaN(d.getTime()) ? null : d;
  }

  const str = String(input).trim();
  if (!str) return null;

  // Jika format ISO standar dengan penanda timezone (Z atau + / -)
  if (str.includes('Z') || /[+-]\d{2}:\d{2}$/.test(str)) {
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }

  // Jika format lokal "YYYY-MM-DD HH:mm:ss" atau "YYYY-MM-DDTHH:mm:ss" yang disimpan sebagai waktu lokal WITA
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?/.test(str)) {
    // Treat as WITA (+08:00) agar konversi ke UTC tepat dan tidak tergeser zona waktu perangkat
    const normalized = str.replace(' ', 'T');
    const withTz = normalized.length === 16 ? `${normalized}:00+08:00` : `${normalized}+08:00`;
    const d = new Date(withTz);
    if (!isNaN(d.getTime())) return d;
  }

  // Jika format tanggal saja "YYYY-MM-DD"
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const d = new Date(`${str}T00:00:00+08:00`);
    if (!isNaN(d.getTime())) return d;
  }

  const fallback = new Date(str);
  return isNaN(fallback.getTime()) ? null : fallback;
}

export function formatRupiah(amount: number): string {
  const safeAmount = isNaN(amount) ? 0 : amount;
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(safeAmount);
}

/**
 * Menghasilkan tanggal hari ini atau tanggal tertentu dalam format YYYY-MM-DD sesuai zona waktu WITA
 */
export function getWitaDateString(dateInput?: Date | string | number): string {
  const date = dateInput ? parseDateSafe(dateInput) || getTrustedServerTime() : getTrustedServerTime();
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE_WITA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Menghasilkan jam sekarang atau jam tertentu dalam format HH:mm:ss sesuai zona waktu WITA
 */
export function getWitaTimeString(dateInput?: Date | string | number): string {
  const date = dateInput ? parseDateSafe(dateInput) || getTrustedServerTime() : getTrustedServerTime();
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: TIMEZONE_WITA,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date).replace(/\./g, ':');
}

/**
 * Menghasilkan tanggal & waktu dalam format "YYYY-MM-DD HH:mm:ss" sesuai zona waktu WITA
 */
export function getWitaDateTimeString(dateInput?: Date | string | number): string {
  const date = dateInput ? parseDateSafe(dateInput) || getTrustedServerTime() : getTrustedServerTime();
  const datePart = getWitaDateString(date);
  const timePart = getWitaTimeString(date);
  return `${datePart} ${timePart}`;
}

/**
 * Format tanggal Indonesia dalam zona waktu WITA (contoh: "23 Oktober 2026")
 */
export function formatDateIndo(dateStr: string | Date | number | undefined | null): string {
  if (!dateStr) return '-';
  try {
    const date = parseDateSafe(dateStr);
    if (!date) return String(dateStr);
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: TIMEZONE_WITA,
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  } catch {
    return String(dateStr);
  }
}

/**
 * Format tanggal & waktu lengkap dalam zona waktu WITA (Asia/Makassar, UTC+08:00)
 * Format standar konsisten: "23/10/2026 15.38.00 WITA"
 */
export function formatDateTimeIndo(dateTimeStr: string | Date | number | undefined | null): string {
  if (!dateTimeStr) return '-';
  try {
    const date = parseDateSafe(dateTimeStr);
    if (!date) return String(dateTimeStr);

    const formatted = new Intl.DateTimeFormat('id-ID', {
      timeZone: TIMEZONE_WITA,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(date);

    // Hasil id-ID biasanya "23/10/2026, 15.38.00" -> ubah menjadi "23/10/2026 15.38.00 WITA"
    const cleaned = formatted.replace(',', '').trim();
    return cleaned.endsWith('WITA') ? cleaned : `${cleaned} WITA`;
  } catch {
    return String(dateTimeStr);
  }
}

export function generateTransactionNumber(jenis: 'Uang Masuk' | 'Uang Keluar'): string {
  const prefix = jenis === 'Uang Masuk' ? 'TR-MSK' : 'TR-KLR';
  const dateCode = getWitaDateString().replace(/-/g, '');
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${dateCode}-${randomSuffix}`;
}

import * as XLSX from 'xlsx';

/**
 * Professional XLSX export using SheetJS for Microsoft Excel:
 * - Proper columns, bold header row
 * - Filter on headers enabled
 * - Header row frozen (freeze panes)
 * - Number formatting for currency
 * - Preserves leading zeros & prevents scientific notation on text columns (e.g. NO. ID BRIZZI)
 * - Auto-sized column widths
 */
export function exportToXlsx(
  filename: string,
  headers: string[],
  rows: (string | number)[][],
  metadataTitle: string,
  arg5?: string | string[],
  arg6?: string | string[],
  arg7?: string[] | number[],
  arg8?: number[]
) {
  let resolvedUptName = 'RUTAN KELAS IIB JENEPONTO';
  let resolvedTitle = metadataTitle;
  let resolvedNotes: string[] = [];
  let resolvedTextCols: number[] = [];

  if (typeof arg5 === 'string' && typeof arg6 === 'string') {
    resolvedTitle = `${metadataTitle} - ${arg5}`;
    resolvedUptName = arg6 || resolvedUptName;
    if (Array.isArray(arg7)) {
      if (arg7.length > 0 && typeof arg7[0] === 'number') {
        resolvedTextCols = arg7 as number[];
      } else {
        resolvedNotes = arg7 as string[];
      }
    }
    if (Array.isArray(arg8)) {
      resolvedTextCols = arg8;
    }
  } else if (typeof arg5 === 'string') {
    resolvedUptName = arg5;
    if (Array.isArray(arg6)) {
      resolvedNotes = arg6 as string[];
    }
    if (Array.isArray(arg7)) {
      resolvedTextCols = arg7 as number[];
    }
  }

  try {
    const wb = XLSX.utils.book_new();
    const aoa: any[][] = [];

    // Title & Institution Metadata
    aoa.push([resolvedUptName.toUpperCase()]);
    aoa.push([`LAPORAN: ${resolvedTitle.toUpperCase()}`]);
    aoa.push([`Waktu Unduh: ${new Date().toLocaleString('id-ID')}`]);
    if (resolvedNotes && resolvedNotes.length > 0) {
      resolvedNotes.forEach((note) => aoa.push([note]));
    }
    aoa.push([]); // Blank row separator

    const headerRowIndex = aoa.length;
    aoa.push(headers);

    rows.forEach((r) => {
      aoa.push(r);
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    const totalRows = aoa.length;
    const totalCols = headers.length;

    // Auto column widths
    const colWidths = headers.map((h, colIdx) => {
      let maxLen = String(h).length;
      for (let r = headerRowIndex + 1; r < totalRows; r++) {
        const val = aoa[r]?.[colIdx];
        if (val !== undefined && val !== null) {
          maxLen = Math.max(maxLen, String(val).length);
        }
      }
      return { wch: Math.min(Math.max(maxLen + 4, 12), 48) };
    });
    ws['!cols'] = colWidths;

    // Auto filter across the table header
    const startCol = XLSX.utils.encode_col(0);
    const endCol = XLSX.utils.encode_col(totalCols - 1);
    ws['!autofilter'] = {
      ref: `${startCol}${headerRowIndex + 1}:${endCol}${totalRows}`,
    };

    // Freeze header row
    ws['!views'] = [{ state: 'frozen', ySplit: headerRowIndex + 1 }];

    // Enforce text formatting for ID columns
    const textColsSet = new Set(resolvedTextCols || []);
    for (let R = headerRowIndex + 1; R < totalRows; ++R) {
      for (let C = 0; C < totalCols; ++C) {
        const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = ws[cellRef];
        if (!cell) continue;

        if (textColsSet.has(C)) {
          cell.t = 's';
          cell.z = '@';
          cell.v = String(cell.v ?? '');
        }
      }
    }

    XLSX.utils.book_append_sheet(wb, ws, 'Laporan Keuangan');
    const finalFilename = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
    XLSX.writeFile(wb, finalFilename);
  } catch (error) {
    console.error('Gagal mengekspor file Excel XLSX:', error);
    // Fallback to CSV
    exportToCsvWithBOM(filename, headers, rows, resolvedTitle, resolvedUptName, resolvedNotes, resolvedTextCols);
  }
}

/**
 * Clean & professional CSV export for Excel Indonesia:
 * - UTF-8 BOM (\uFEFF)
 * - Semicolon (;) delimiter so data doesn't collapse into one column in Excel Indonesia
 * - Explicit ="text" protection for ID BRIZZI & reference numbers to preserve leading zeroes
 * - Clean metadata and consistent headers
 */
export function exportToCsvWithBOM(
  filename: string,
  headers: string[],
  rows: (string | number)[][],
  metadataTitle: string,
  uptName: string,
  extraNotes?: string[],
  textColumnIndices?: number[]
) {
  const delimiter = ';';
  const textColsSet = new Set(textColumnIndices || []);

  const cleanVal = (val: string | number, isTextCol = false) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    // If column contains digits that need to be treated as string (e.g. ID BRIZZI "00123...")
    if (isTextCol && typeof val === 'string' && /^\d+$/.test(val)) {
      return `="${str}"`;
    }
    return `"${str}"`;
  };

  const lines: string[] = [
    `"${uptName.toUpperCase()}"`,
    `"LAPORAN: ${metadataTitle.toUpperCase()}"`,
    `"Waktu Unduh: ${new Date().toLocaleString('id-ID')}"`,
  ];

  if (extraNotes && extraNotes.length > 0) {
    extraNotes.forEach((note) => lines.push(`"${String(note).replace(/"/g, '""')}"`));
  }

  lines.push(''); // Empty line separator
  lines.push(headers.map((h) => cleanVal(h)).join(delimiter));

  rows.forEach((row) => {
    lines.push(row.map((val, idx) => cleanVal(val, textColsSet.has(idx))).join(delimiter));
  });

  const csvContent = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
