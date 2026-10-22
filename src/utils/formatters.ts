/**
 * Helper formatters and CSV exporter tailored for Indonesian Rupiah & Excel
 */

export function formatRupiah(amount: number): string {
  const safeAmount = isNaN(amount) ? 0 : amount;
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(safeAmount);
}

export function formatDateIndo(dateStr: string): string {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  } catch {
    return dateStr;
  }
}

export function formatDateTimeIndo(dateTimeStr: string): string {
  if (!dateTimeStr) return '-';
  try {
    const date = new Date(dateTimeStr);
    if (isNaN(date.getTime())) return dateTimeStr;
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(date);
  } catch {
    return dateTimeStr;
  }
}

export function generateTransactionNumber(jenis: 'Uang Masuk' | 'Uang Keluar'): string {
  const prefix = jenis === 'Uang Masuk' ? 'TR-MSK' : 'TR-KLR';
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${year}${month}${day}-${randomSuffix}`;
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
