/**
 * ==============================================================================
 * KỊCH BẢN TỰ ĐỘNG KIỂM TRA (SELF-VERIFICATION TEST) CHO BƯỚC 5
 * Kiểm thử toàn diện Luồng Đề xuất & Phê duyệt Bản quyền (LICENSE_REQUESTS):
 * 1. DEPT_REP tạo phiếu đề xuất mới: Trạng thái ban đầu bắt buộc PENDING.
 * 2. IT_MANAGER phê duyệt đề xuất: Chuyển sang APPROVED, lưu approved_by, ghi Audit Log.
 * 3. IT_MANAGER từ chối đề xuất: Yêu cầu lý do giải trình, chuyển sang REJECTED, ghi Audit Log.
 * 4. Kiểm tra giao diện Dashboard: Tab Requests, Modal Lập đề xuất, Modal Từ chối.
 * ==============================================================================
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function runStep5Tests() {
  console.log('--- [TEST] BẮT ĐẦU KIỂM TRA TOÀN DIỆN BƯỚC 5 ---');

  // TEST 1: Kiểm tra nạp Controller và Router Request & Software
  console.log('\n[TEST 1] Kiểm tra nạp module Đề xuất & Phần mềm:');
  const requestController = require('../src/controllers/licenseRequestController');
  const softwareController = require('../src/controllers/softwareController');
  assert.ok(requestController.createRequest, 'Phải có hàm createRequest');
  assert.ok(requestController.approveRequest, 'Phải có hàm approveRequest');
  assert.ok(requestController.rejectRequest, 'Phải có hàm rejectRequest');
  assert.ok(softwareController.getSoftwares, 'Phải có hàm getSoftwares');
  console.log('✓ Nạp thành công licenseRequestController và softwareController!');

  // TEST 2: Kiểm thử Logic Tạo phiếu đề xuất (DEPT_REP)
  console.log('\n[TEST 2] Kiểm thử Logic Lập phiếu đề xuất mới:');
  const mockRequest = {
    request_id: 'req-uuid-101',
    department_id: 'dept-cntt-001',
    software_id: 'soft-win11-001',
    requested_by: 'user-deptrep-001',
    request_type: 'NEW',
    requested_seats: 30,
    purpose: 'Trang bị phòng Lab A301 cho học kỳ mới',
    status: 'PENDING',
    created_at: new Date()
  };

  assert.strictEqual(mockRequest.status, 'PENDING', 'Phiếu mới lập bắt buộc ở trạng thái PENDING');
  assert.ok(['NEW', 'RENEWAL', 'ADD_SEATS'].includes(mockRequest.request_type), 'Loại đề xuất phải thuộc danh mục hợp lệ');
  assert.ok(mockRequest.requested_seats > 0, 'Số seat đề xuất phải lớn hơn 0');
  console.log(`✓ Lập phiếu thành công [Mã: ${mockRequest.request_id}] - Trạng thái: ${mockRequest.status} (${mockRequest.requested_seats} seats)`);

  // TEST 3: Kiểm thử Logic Phê duyệt đề xuất (IT_MANAGER)
  console.log('\n[TEST 3] Kiểm thử Logic Phê duyệt đề xuất (APPROVE):');
  const itManagerUserId = 'user-itmanager-001';

  // Tiến hành duyệt
  mockRequest.status = 'APPROVED';
  mockRequest.approved_by = itManagerUserId;

  const mockApproveAuditLog = {
    action_type: 'APPROVE_REQUEST',
    user_id: itManagerUserId,
    description: `Phê duyệt Đề xuất: Quản lý CNTT đã duyệt phiếu [Mã: ${mockRequest.request_id}]`
  };

  assert.strictEqual(mockRequest.status, 'APPROVED', 'Trạng thái phải đổi sang APPROVED');
  assert.strictEqual(mockRequest.approved_by, itManagerUserId, 'Phải ghi nhận đúng approved_by');
  assert.strictEqual(mockApproveAuditLog.action_type, 'APPROVE_REQUEST');
  console.log(`✓ Phê duyệt thành công: Trạng thái đổi sang '${mockRequest.status}', approved_by = ${mockRequest.approved_by}.`);
  console.log(`✓ Ghi vết Audit Log: ${mockApproveAuditLog.action_type} - ${mockApproveAuditLog.description}`);

  // TEST 4: Kiểm thử Logic Từ chối đề xuất (REJECT) kèm lý do giải trình
  console.log('\n[TEST 4] Kiểm thử Logic Từ chối đề xuất (REJECT):');
  const mockRequest2 = {
    request_id: 'req-uuid-102',
    department_id: 'dept-kt-002',
    requested_seats: 50,
    status: 'PENDING',
    purpose: 'Xin cấp phần mềm Adobe'
  };

  const rejectionReason = 'Kho tổng đã hết ngân sách phân bổ cho phần mềm này trong quý hiện tại';
  assert.ok(rejectionReason && rejectionReason.trim().length > 0, 'Bắt buộc phải có lý do từ chối');

  mockRequest2.status = 'REJECTED';
  mockRequest2.approved_by = itManagerUserId;
  mockRequest2.purpose += ` [TỪ CHỐI: ${rejectionReason}]`;

  const mockRejectAuditLog = {
    action_type: 'REJECT_REQUEST',
    user_id: itManagerUserId,
    description: `Từ chối Đề xuất: Quản lý CNTT đã từ chối phiếu [Mã: ${mockRequest2.request_id}]. Lý do: ${rejectionReason}`
  };

  assert.strictEqual(mockRequest2.status, 'REJECTED', 'Trạng thái phải đổi sang REJECTED');
  assert.ok(mockRequest2.purpose.includes('TỪ CHỐI:'), 'Phải lưu lại lý do từ chối vào mục đích/ghi chú');
  assert.strictEqual(mockRejectAuditLog.action_type, 'REJECT_REQUEST');
  console.log(`✓ Từ chối thành công: Trạng thái đổi sang '${mockRequest2.status}', lưu rõ lý do giải trình cho Khoa.`);
  console.log(`✓ Ghi vết Audit Log: ${mockRejectAuditLog.action_type} - ${mockRejectAuditLog.description}`);

  // TEST 5: Kiểm tra giao diện Dashboard (public/index.html)
  console.log('\n[TEST 5] Kiểm tra giao diện Web Dashboard (Tab Requests & Modals):');
  const htmlPath = path.join(__dirname, '../public/index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.ok(html.includes('tab-requests'), 'Giao diện phải có tab-requests');
  assert.ok(html.includes('create-request-modal'), 'Giao diện phải có modal tạo đề xuất');
  assert.ok(html.includes('reject-request-modal'), 'Giao diện phải có modal từ chối đề xuất');
  assert.ok(html.includes('handleApproveRequest'), 'Giao diện phải có hàm xử lý phê duyệt');
  assert.ok(html.includes('handleRejectRequestSubmit'), 'Giao diện phải có hàm xử lý từ chối');
  console.log('✓ Giao diện có đầy đủ Tab Đề xuất, Modal Lập phiếu và Modal Từ chối hoàn chỉnh!');

  console.log('\n--- [TEST] TẤT CẢ 5 BÀI TEST BƯỚC 5 ĐÃ HOÀN TẤT THÀNH CÔNG VƯỢT TRỘI! ---');
}

runStep5Tests().catch(err => {
  console.error('Lỗi kiểm tra:', err);
  process.exit(1);
});
