/** One uploaded log file, as listed by GET /api/files. */
export interface FileInfo {
  /** SHA-256 of the file's content; also the id used in ?files=. */
  id: string;
  fileName: string;
  /** ISO time the file was processed. */
  at: string;
  /** Log records in the file (absent for files uploaded before file tracking). */
  totalLogs?: number;
  totalErrors?: number;
  /** Error records currently stored for this file. */
  storedRecords: number;
}
