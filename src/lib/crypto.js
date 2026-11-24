/**
 * ==============================================================================
 * MODULE MÃ HÓA & GIẢI MÃ BẢN QUYỀN (AES-256-CBC)
 * Tuân thủ quy định BR03 trong AGENTS.md:
 * - Mã hóa khóa bản quyền trước khi lưu vào CSDL (bảng license_pools)
 * - Che ký tự khi trả về danh sách giao diện (Masking)
 * - Giải mã khi có yêu cầu được duyệt và ghi Audit Log
 * ==============================================================================
 */

const crypto = require('crypto');
require('dotenv').config();

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16; // 16 bytes IV cho AES-CBC

/**
 * Trích xuất hoặc băm khóa bí mật thành chuẩn 32 bytes (256 bits)
 * @returns {Buffer} Buffer 32 bytes
 */
function getSecretKey() {
  const secret = process.env.AES_SECRET_KEY || 'salm_aes_secret_key_32_chars!!';
  // Luôn đảm bảo đúng 32 bytes bằng thuật toán băm sha256
  return crypto.createHash('sha256').update(String(secret)).digest();
}

/**
 * Mã hóa chuỗi văn bản thuần (License Key) sang chuỗi mã hóa dạng 'iv_hex:cipher_hex'
 * @param {string} plainText Chuỗi license key gốc
 * @returns {string} Chuỗi đã mã hóa kèm IV
 */
function encryptLicenseKey(plainText) {
  if (!plainText || typeof plainText !== 'string') {
    return plainText;
  }
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getSecretKey(), iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  // Lưu kết quả theo định dạng iv_hex:encrypted_hex
  return `${iv.toString('hex')}:${encrypted}`;
}

/**
 * Giải mã chuỗi đã mã hóa về lại License Key gốc
 * @param {string} encryptedText Chuỗi dạng 'iv_hex:cipher_hex'
 * @returns {string} License key thuần sau giải mã
 */
function decryptLicenseKey(encryptedText) {
  if (!encryptedText || typeof encryptedText !== 'string') {
    return encryptedText;
  }
  const parts = encryptedText.split(':');
  if (parts.length !== 2) {
    throw new Error('Định dạng chuỗi mã hóa không hợp lệ (yêu cầu iv:data)');
  }
  const iv = Buffer.from(parts[0], 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, getSecretKey(), iv);
  let decrypted = decipher.update(parts[1], 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Che ký tự chuỗi License Key khi hiển thị trên danh sách bảng (Masking)
 * Ví dụ: 'XXXX-XXXX-****-1234' hoặc giữ lại 4 ký tự đầu và 4 ký tự cuối
 * @param {string} rawKey Chuỗi license key gốc
 * @returns {string} Chuỗi đã che
 */
function maskLicenseKey(rawKey) {
  if (!rawKey || typeof rawKey !== 'string') {
    return '****-****-****-****';
  }
  const trimmed = rawKey.trim();
  if (trimmed.length <= 8) {
    return '****-****';
  }
  const firstFour = trimmed.slice(0, 4);
  const lastFour = trimmed.slice(-4);
  return `${firstFour}-****-****-${lastFour}`;
}

module.exports = {
  encryptLicenseKey,
  decryptLicenseKey,
  maskLicenseKey
};
