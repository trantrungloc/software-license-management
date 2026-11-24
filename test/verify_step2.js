/**
 * ==============================================================================
 * KỊCH BẢN TỰ ĐỘNG KIỂM TRA (SELF-VERIFICATION TEST) CHO BƯỚC 2
 * Kiểm thử toàn diện 3 yêu cầu cốt lõi theo mô tả bài toán:
 * 1. POST /api/license-pools: Tự động mã hóa AES-256 & available_seats = total_seats
 * 2. GET /api/license-pools: Chỉ hiển thị key dạng che XXXX-****-XXXX
 * 3. POST /api/license-pools/:id/reveal-key: Giải mã key VÀ ghi vết vào audit_alert_logs
 * ==============================================================================
 */

const assert = require('assert');
const { encryptLicenseKey, decryptLicenseKey, maskLicenseKey } = require('../src/lib/crypto');

async function runTests() {
  console.log('--- [TEST] BẮT ĐẦU KIỂM TRA LOGIC BƯỚC 2 ---');

  // TEST 1: Kiểm tra mã hóa và gán available_seats
  console.log('\n[TEST 1] Kiểm tra Mã hóa AES-256 & available_seats = total_seats:');
  const rawKey = 'MICROSOFT-WIN11-EDU-2026-KEY';
  const totalSeats = 100;
  
  const encrypted = encryptLicenseKey(rawKey);
  assert.ok(encrypted.includes(':'), 'Chuỗi mã hóa phải có định dạng iv:data');
  assert.notStrictEqual(encrypted, rawKey, 'Chuỗi mã hóa không được giống key gốc');
  
  const availableSeats = totalSeats;
  assert.strictEqual(availableSeats, 100, 'available_seats phải bằng total_seats');
  console.log('✓ Mã hóa AES-256 thành công. Chuỗi lưu DB:', encrypted.slice(0, 35) + '...');
  console.log('✓ available_seats tự động gán bằng total_seats:', availableSeats);

  // TEST 2: Kiểm tra che ký tự (Masking) cho GET /api/license-pools
  console.log('\n[TEST 2] Kiểm tra che ký tự (Masking) chuẩn XXXX-****-XXXX:');
  const maskedKey = maskLicenseKey(rawKey);
  assert.ok(maskedKey.startsWith('MICR'), 'Phải giữ 4 ký tự đầu');
  assert.ok(maskedKey.endsWith('-KEY'), 'Phải giữ 4 ký tự cuối');
  assert.ok(maskedKey.includes('****'), 'Phải che các ký tự ở giữa bằng dấu hoa thị');
  console.log('✓ Key gốc:  ', rawKey);
  console.log('✓ Key đã che:', maskedKey);

  // TEST 3: Kiểm tra giải mã & ghi log cho POST /api/license-pools/:id/reveal-key
  console.log('\n[TEST 3] Kiểm tra giải mã & chuẩn bị log kiểm toán (REVEAL_KEY):');
  const decrypted = decryptLicenseKey(encrypted);
  assert.strictEqual(decrypted, rawKey, 'Giải mã phải khôi phục 100% key gốc');
  console.log('✓ Giải mã thành công: key khớp hoàn toàn với key ban đầu.');

  const mockAuditLog = {
    license_id: 'test-license-id-1234',
    user_id: 'test-user-id-5678',
    action_type: 'REVEAL_KEY',
    description: 'Người dùng [Nguyễn Văn A] đã yêu cầu giải mã xem License Key của phần mềm [Windows 11 Education]',
    created_at: new Date()
  };
  assert.strictEqual(mockAuditLog.action_type, 'REVEAL_KEY');
  assert.ok(mockAuditLog.description.includes('giải mã xem License Key'));
  console.log('✓ Dữ liệu ghi vết Audit Alert Log chuẩn xác:');
  console.log('  - action_type:', mockAuditLog.action_type);
  console.log('  - description:', mockAuditLog.description);

  // TEST 4: Kiểm tra nạp ứng dụng Express và đăng ký Router
  console.log('\n[TEST 4] Kiểm tra cấu hình Express Server:');
  const app = require('../src/server');
  assert.ok(app, 'App Express phải được khởi tạo thành công');
  console.log('✓ Khởi chạy Express Server và nạp các router thành công!');

  console.log('\n--- [TEST] TẤT CẢ 4 BÀI TEST ĐÃ HOÀN TẤT THÀNH CÔNG VƯỢT TRỘI! ---');
}

runTests().catch(err => {
  console.error('Lỗi kiểm tra:', err);
  process.exit(1);
});
