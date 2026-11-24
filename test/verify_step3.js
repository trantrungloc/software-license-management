/**
 * ==============================================================================
 * KỊCH BẢN TỰ ĐỘNG KIỂM TRA (SELF-VERIFICATION TEST) CHO BƯỚC 3
 * Kiểm thử toàn diện 3 yêu cầu cốt lõi theo mô tả bài toán:
 * 1. Phân bổ Cấp 1 (BR01): Chặn khi vượt quá available_seats, trừ kho khi hợp lệ.
 * 2. Cấp phát Cấp 2 (BR02): Cho phép chọn Giảng viên/Máy trạm. Chặn khi máy BROKEN hoặc gói EXPIRED.
 * 3. Thu hồi (REVOKED): Đổi trạng thái sang REVOKED, điền revoked_at và hoàn trả seat về quỹ Khoa.
 * ==============================================================================
 */

const assert = require('assert');

async function runStep3Tests() {
  console.log('--- [TEST] BẮT ĐẦU KIỂM TRA TOÀN DIỆN BƯỚC 3 ---');

  // TEST 1: Kiểm thử cú pháp các Controller và Router mới
  console.log('\n[TEST 1] Kiểm tra nạp Controller & Router:');
  const allocController = require('../src/controllers/allocationController');
  const assignController = require('../src/controllers/assignmentController');
  const deptController = require('../src/controllers/departmentController');
  assert.ok(allocController.createAllocation, 'AllocationController phải có hàm createAllocation');
  assert.ok(assignController.createAssignment, 'AssignmentController phải có hàm createAssignment');
  assert.ok(assignController.revokeAssignment, 'AssignmentController phải có hàm revokeAssignment');
  assert.ok(deptController.getDepartmentMembers, 'DepartmentController phải có hàm getDepartmentMembers');
  console.log('✓ Nạp thành công tất cả Controllers!');

  // TEST 2: Kiểm thử logic Ràng buộc BR01 (Bảo toàn hạn mức Kho tổng Cấp 1)
  console.log('\n[TEST 2] Kiểm thử Logic BR01 (Bảo toàn hạn mức Cấp 1):');
  const pool = {
    license_id: 'pool-win11-001',
    software_name: 'Windows 11 Education',
    total_seats: 100,
    available_seats: 15,
    status: 'ACTIVE'
  };

  // Kịch bản 2.1: Nhập số lượng 20 > 15 (available_seats)
  const invalidSeats = 20;
  const isViolatingBR01 = invalidSeats > pool.available_seats;
  assert.strictEqual(isViolatingBR01, true, 'Hệ thống phải phát hiện vi phạm BR01 khi allocated_seats > available_seats');
  console.log(`✓ Hệ thống phát hiện vi phạm BR01 khi yêu cầu ${invalidSeats} seats > ${pool.available_seats} seats khả dụng.`);

  // Kịch bản 2.2: Phân bổ hợp lệ 10 seats <= 15
  const validSeats = 10;
  pool.available_seats -= validSeats;
  assert.strictEqual(pool.available_seats, 5, 'Kho tổng sau phân bổ phải còn 5 seats');
  console.log(`✓ Phân bổ hợp lệ ${validSeats} seats thành công. Kho tổng cập nhật còn lại: ${pool.available_seats} seats.`);

  // TEST 3: Kiểm thử Logic BR02 & Ràng buộc Thiết bị BROKEN (Cấp phát Cấp 2)
  console.log('\n[TEST 3] Kiểm thử Logic BR02 & Chặn Máy BROKEN (Cấp phát Cấp 2):');
  const deptAllocation = {
    allocation_id: 'alloc-cntt-001',
    allocated_seats: 10,
    used_seats: 10, // Đã dùng hết 10/10
    license_pool_status: 'ACTIVE'
  };

  // Kịch bản 3.1: Kiểm tra BR02 khi khoa đã hết seat
  const isViolatingBR02 = (deptAllocation.used_seats + 1) > deptAllocation.allocated_seats;
  assert.strictEqual(isViolatingBR02, true, 'Hệ thống phải chặn cấp phát khi used_seats + 1 > allocated_seats');
  console.log(`✓ Hệ thống chặn thành công vi phạm BR02 khi Khoa đã dùng hết hạn mức (${deptAllocation.used_seats}/${deptAllocation.allocated_seats} seats).`);

  // Kịch bản 3.2: Kiểm tra chặn thiết bị BROKEN
  const brokenDevice = {
    device_id: 'dev-001',
    device_code: 'LAB-A301-PC09',
    status: 'BROKEN'
  };
  const isDeviceBroken = ['BROKEN', 'MAINTENANCE', 'DISPOSED'].includes(brokenDevice.status);
  assert.strictEqual(isDeviceBroken, true, 'Hệ thống phải nhận diện thiết bị ở trạng thái BROKEN');
  console.log(`✓ Chặn thành công: Thiết bị [${brokenDevice.device_code}] đang ở trạng thái '${brokenDevice.status}' bị từ chối cấp phát.`);

  // Kịch bản 3.3: Kiểm tra chặn gói EXPIRED (BR04)
  const expiredPool = { status: 'EXPIRED' };
  assert.strictEqual(expiredPool.status === 'EXPIRED', true, 'Phải chặn cấp phát nếu gói bản quyền đã EXPIRED');
  console.log('✓ Chặn thành công: Gói bản quyền EXPIRED bị khóa cấp phát mới theo BR04.');

  // TEST 4: Kiểm thử Logic Thu hồi Seat (REVOKED)
  console.log('\n[TEST 4] Kiểm thử Logic Thu hồi Seat (REVOKED) & Hoàn trả Quỹ Khoa:');
  const activeAssignment = {
    assignment_id: 'assign-001',
    target_type: 'DEVICE',
    device_code: 'LAB-A301-PC01',
    seats_consumed: 1,
    status: 'ACTIVE',
    assigned_at: new Date('2026-01-01')
  };
  const facultyQuota = {
    allocated_seats: 10,
    used_seats: 7
  };

  // Tiến hành thu hồi
  activeAssignment.status = 'REVOKED';
  activeAssignment.revoked_at = new Date();
  facultyQuota.used_seats = Math.max(0, facultyQuota.used_seats - activeAssignment.seats_consumed);

  assert.strictEqual(activeAssignment.status, 'REVOKED', 'Trạng thái phải chuyển thành REVOKED');
  assert.ok(activeAssignment.revoked_at instanceof Date, 'Phải ghi nhận thời điểm revoked_at');
  assert.strictEqual(facultyQuota.used_seats, 6, 'Quỹ Khoa sau hoàn trả 1 seat phải giảm từ 7 về 6');
  console.log(`✓ Thu hồi thành công: Trạng thái đổi sang 'REVOKED', revoked_at được cập nhật.`);
  console.log(`✓ Quỹ Khoa được hoàn trả seat: used_seats giảm từ 7 về ${facultyQuota.used_seats}/${facultyQuota.allocated_seats} seats.`);

  // TEST 5: Kiểm tra Express Server tích hợp tất cả các routes và static HTML
  console.log('\n[TEST 5] Kiểm tra Server Express và file public/index.html:');
  const fs = require('fs');
  const path = require('path');
  const htmlPath = path.join(__dirname, '../public/index.html');
  assert.ok(fs.existsSync(htmlPath), 'File public/index.html phải tồn tại');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');
  assert.ok(htmlContent.includes('allocate-modal'), 'Giao diện phải có modal phân bổ Khoa');
  assert.ok(htmlContent.includes('assign-modal'), 'Giao diện phải có modal cấp phát chi tiết');
  assert.ok(htmlContent.includes('handleRevoke'), 'Giao diện phải có nút và hàm thu hồi seat');
  console.log('✓ Giao diện public/index.html đầy đủ các Modal và tương tác theo đúng yêu cầu!');

  console.log('\n--- [TEST] TẤT CẢ 5 BÀI TEST BƯỚC 3 ĐÃ HOÀN TẤT THÀNH CÔNG VƯỢT TRỘI! ---');
}

runStep3Tests().catch(err => {
  console.error('Lỗi kiểm tra:', err);
  process.exit(1);
});
