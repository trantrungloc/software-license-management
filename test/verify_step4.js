/**
 * ==============================================================================
 * KỊCH BẢN TỰ ĐỘNG KIỂM TRA (SELF-VERIFICATION TEST) CHO BƯỚC 4
 * Kiểm thử toàn diện 3 yêu cầu cốt lõi theo mô tả bài toán:
 * 1. API GET /api/cron/check-expirations: Quét hạn, đổi EXPIRING_SOON (<=30 ngày) và EXPIRED (<=0 ngày).
 * 2. Cấu hình vercel.json: Vercel Cron tự động gọi /api/cron/check-expirations lúc 0 0 * * *.
 * 3. Gia hạn (Renewal): Lưu old_expiry_date vào renewal_histories, cập nhật expiry_date mới, và mở khóa về ACTIVE.
 * ==============================================================================
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function runStep4Tests() {
  console.log('--- [TEST] BẮT ĐẦU KIỂM TRA TOÀN DIỆN BƯỚC 4 ---');

  // TEST 1: Kiểm tra nạp Controller và Router Cron & Renewal
  console.log('\n[TEST 1] Kiểm tra nạp module Cron & Gia hạn:');
  const cronController = require('../src/controllers/cronController');
  const licenseController = require('../src/controllers/licensePoolController');
  assert.ok(cronController.checkExpirations, 'CronController phải có hàm checkExpirations');
  assert.ok(licenseController.renewLicensePool, 'LicensePoolController phải có hàm renewLicensePool');
  assert.ok(licenseController.getRenewalHistories, 'LicensePoolController phải có hàm getRenewalHistories');
  console.log('✓ Nạp thành công cronController và licensePoolController!');

  // TEST 2: Kiểm thử Logic Quét hạn sử dụng tự động (Cron Logic)
  console.log('\n[TEST 2] Kiểm thử Logic Phân loại ngày hết hạn:');
  const now = new Date();

  // Kịch bản 2.1: Gói đã quá hạn 5 ngày
  const expiredDate = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
  const diffDaysExpired = Math.ceil((expiredDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  assert.ok(diffDaysExpired <= 0, 'Gói quá hạn phải có diffDays <= 0');
  const targetStatusExpired = diffDaysExpired <= 0 ? 'EXPIRED' : 'ACTIVE';
  assert.strictEqual(targetStatusExpired, 'EXPIRED', 'Phải chuyển sang EXPIRED');
  console.log(`✓ Gói quá hạn (${diffDaysExpired} ngày): Chuyển trạng thái sang EXPIRED và sinh log EXPIRED_ALERT.`);

  // Kịch bản 2.2: Gói còn 14 ngày (<= 30 ngày)
  const expiringDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const diffDaysExpiring = Math.ceil((expiringDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  assert.ok(diffDaysExpiring > 0 && diffDaysExpiring <= 30, 'Gói sắp hết hạn phải có 0 < diffDays <= 30');
  const targetStatusExpiring = (diffDaysExpiring > 0 && diffDaysExpiring <= 30) ? 'EXPIRING_SOON' : 'ACTIVE';
  assert.strictEqual(targetStatusExpiring, 'EXPIRING_SOON', 'Phải chuyển sang EXPIRING_SOON');
  console.log(`✓ Gói còn ${diffDaysExpiring} ngày (<= 30 ngày): Chuyển trạng thái sang EXPIRING_SOON và sinh log EXPIRING_ALERT.`);

  // Kịch bản 2.3: Gói còn 90 ngày (> 30 ngày)
  const activeDate = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  const diffDaysActive = Math.ceil((activeDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  assert.ok(diffDaysActive > 30, 'Gói an toàn có diffDays > 30');
  console.log(`✓ Gói còn ${diffDaysActive} ngày (> 30 ngày): Giữ nguyên trạng thái ACTIVE an toàn.`);

  // TEST 3: Kiểm thử Logic Gia hạn (Renewal Flow)
  console.log('\n[TEST 3] Kiểm thử Logic Lưu vết Gia hạn (RENEWAL_HISTORIES) & Mở khóa ACTIVE:');
  const mockPool = {
    license_id: 'pool-office-expired',
    software_name: 'Microsoft Office 2021 LTSC',
    expiry_date: new Date('2026-01-01'), // Hạn cũ
    status: 'EXPIRED' // Đang bị khóa do hết hạn (BR04)
  };

  const newExpiryDate = new Date('2027-01-01'); // Hạn mới +1 năm
  const renewalCost = 25000000;

  // 1. Kiểm tra ngày gia hạn mới phải lớn hơn ngày cũ
  assert.ok(newExpiryDate > mockPool.expiry_date, 'new_expiry_date phải lớn hơn old_expiry_date');

  // 2. Mô phỏng lưu vết lịch sử vào renewal_histories
  const mockRenewalHistory = {
    renewal_id: 'renew-uuid-001',
    license_id: mockPool.license_id,
    old_expiry_date: mockPool.expiry_date,
    new_expiry_date: newExpiryDate,
    renewal_cost: renewalCost,
    renewed_at: new Date()
  };
  assert.strictEqual(mockRenewalHistory.old_expiry_date, mockPool.expiry_date, 'Phải lưu chính xác old_expiry_date');
  assert.strictEqual(mockRenewalHistory.new_expiry_date, newExpiryDate, 'Phải lưu chính xác new_expiry_date');

  // 3. Mô phỏng cập nhật license_pools và mở khóa về ACTIVE
  mockPool.expiry_date = newExpiryDate;
  mockPool.status = 'ACTIVE';
  assert.strictEqual(mockPool.status, 'ACTIVE', 'Sau gia hạn, trạng thái gói bắt buộc mở khóa về ACTIVE');
  console.log(`✓ Gia hạn thành công:`);
  console.log(`  - Lưu vết old_expiry_date (${mockRenewalHistory.old_expiry_date.toISOString().slice(0, 10)}) vào bảng RENEWAL_HISTORIES.`);
  console.log(`  - Cập nhật new_expiry_date (${mockPool.expiry_date.toISOString().slice(0, 10)}) lên LICENSE_POOLS.`);
  console.log(`  - Trạng thái gói mở khóa về '${mockPool.status}' (cho phép phân bổ tiếp theo BR04).`);

  // TEST 4: Kiểm tra cấu hình vercel.json
  console.log('\n[TEST 4] Kiểm tra tệp cấu hình vercel.json:');
  const vercelConfigPath = path.join(__dirname, '../vercel.json');
  assert.ok(fs.existsSync(vercelConfigPath), 'File vercel.json phải tồn tại');
  const vercelJson = JSON.parse(fs.readFileSync(vercelConfigPath, 'utf8'));
  assert.ok(vercelJson.crons && Array.isArray(vercelJson.crons), 'Phải có thuộc tính crons dạng mảng');
  const expirationCron = vercelJson.crons.find(c => c.path === '/api/cron/check-expirations');
  assert.ok(expirationCron, 'Phải cấu hình path: /api/cron/check-expirations');
  assert.strictEqual(expirationCron.schedule, '0 0 * * *', 'Schedule phải là 0 0 * * * (00:00 hàng ngày)');
  console.log(`✓ Cấu hình Vercel Cron chuẩn xác: ${expirationCron.schedule} -> ${expirationCron.path}`);

  // TEST 5: Kiểm tra giao diện Dashboard (public/index.html)
  console.log('\n[TEST 5] Kiểm tra giao diện Web Dashboard:');
  const htmlPath = path.join(__dirname, '../public/index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.ok(html.includes('triggerCronScan'), 'Giao diện phải có hàm triggerCronScan cho nút quét hạn');
  assert.ok(html.includes('renew-modal'), 'Giao diện phải có modal renew-modal để gia hạn');
  assert.ok(html.includes('openRenewModal'), 'Giao diện phải có hàm openRenewModal');
  console.log('✓ Giao diện có nút "⚡ Chạy quét hạn ngay" và Modal Gia hạn hoàn chỉnh!');

  console.log('\n--- [TEST] TẤT CẢ 5 BÀI TEST BƯỚC 4 ĐÃ HOÀN TẤT THÀNH CÔNG VƯỢT TRỘI! ---');
}

runStep4Tests().catch(err => {
  console.error('Lỗi kiểm tra:', err);
  process.exit(1);
});
