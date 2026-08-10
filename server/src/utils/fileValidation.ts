import fs from 'node:fs';
import path from 'node:path';
import { AppError } from '../errors';

const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.pdf', '.webp']);
const DANGEROUS_EXTENSIONS = new Set(['.exe', '.js', '.html', '.htm', '.php', '.py', '.sh', '.bat', '.cmd', '.vbs', '.ps1', '.jar']);

export function isAllowedExtension(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  if (DANGEROUS_EXTENSIONS.has(ext)) return false;
  return ALLOWED_EXTENSIONS.has(ext);
}

export function validateFileMagicNumber(buffer: Buffer): boolean {
  if (!buffer || buffer.length < 4) return false;

  // PDF: %PDF- (0x25 0x50 0x44 0x46 0x2D)
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return true;
  }

  // PNG: 0x89 0x50 0x4E 0x47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return true;
  }

  // JPEG: 0xFF 0xD8 0xFF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return true;
  }

  // WEBP: Starts with 'RIFF' (0x52 0x49 0x46 0x46) and contains 'WEBP' at index 8 (0x57 0x45 0x42 0x50)
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    return true;
  }

  return false;
}

export function validateUploadedFile(file: Express.Multer.File): void {
  if (!file) throw new AppError(400, 'No file provided.', 'FILE_REQUIRED');

  if (!isAllowedExtension(file.originalname)) {
    throw new AppError(400, 'Invalid file type. Only PNG, JPG, JPEG, WEBP, and PDF files are allowed.', 'INVALID_FILE_EXTENSION');
  }

  // Check magic numbers in buffer (if memory storage) or read header from disk (if disk storage)
  let headerBuffer: Buffer;
  if (file.buffer && file.buffer.length > 0) {
    headerBuffer = file.buffer.subarray(0, 16);
  } else if (file.path && fs.existsSync(file.path)) {
    const fd = fs.openSync(file.path, 'r');
    headerBuffer = Buffer.alloc(16);
    fs.readSync(fd, headerBuffer, 0, 16, 0);
    fs.closeSync(fd);
  } else {
    throw new AppError(400, 'File content cannot be read.', 'FILE_READ_ERROR');
  }

  if (!validateFileMagicNumber(headerBuffer)) {
    // If file was written to disk, delete it immediately
    if (file.path && fs.existsSync(file.path)) {
      try { fs.unlinkSync(file.path); } catch {}
    }
    throw new AppError(
      400,
      'File content validation failed. Magic number header does not match expected image or PDF binary signature.',
      'INVALID_FILE_CONTENT',
    );
  }
}
