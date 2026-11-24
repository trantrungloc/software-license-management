/**
 * KỊCH BẢN KIỂM THỬ TỰ ĐỘNG: RÀNG BUỘC GIA HẠN 2 BƯỚC (SALM)
 * 1. Kiểm tra chặn gia hạn trực tiếp khi chưa có Hợp đồng (BR: 400 Bad Request).
 * 2. Kiểm tra API renewal-check khi chưa có phiếu đề xuất.
 * 3. Tạo Phiếu đề xuất gia hạn (request_type: RENEWAL).
 * 4. Kiểm tra API renewal-check ghi nhận trạng thái PENDING.
 * 5. Nhà trường / Quản lý CNTT Phê duyệt Phiếu đề xuất -> Tự động sinh Hợp đồng mua sắm đã ký.
 * 6. Kiểm tra API renewal-check mở khóa can_renew: true.
 * 7. Thực thi Gia hạn với Hợp đồng mới -> Thành công, mở khóa ACTIVE, lưu RENEWAL_HISTORIES và AUDIT_LOGS.
 */

const http = require('http');
const prisma = require('../src/lib/prisma');

async function runVerification() {
  console.log('================================================================');
  console.log('BẮT ĐẦU KIỂM THỬ: RÀNG BUỘC QUY TRÌNH GIA HẠN 2 BƯỚC');
  console.log('================================================================');

  // Khởi động server backend nội bộ để test API HTTP
  const app = require('../src/server');
  const server = http.createServer(app);
  const PORT = 5555;

  await new Promise((resolve) => server.listen(PORT, resolve));
  const BASE_URL = `http://localhost:${PORT}/api`;

  try {
    // 1. Tìm gói bản quyền đang hết hạn hoặc sắp hết hạn
    let pool = await prisma.licensePool.findFirst({
      where: { software: { software_name: 'Microsoft Office 2021 LTSC' } },
      include: { software: true, contract: true }
    });

    if (!pool) {
      throw new Error('Không tìm thấy gói Microsoft Office 2021 LTSC để kiểm thử.');
    }

    console.log(`\n[Bước 1] Gói bản quyền kiểm thử: [${pool.software.software_name}]`);
    console.log(`- Mã gói: ${pool.license_id}`);
    console.log(`- Trạng thái hiện tại: ${pool.status}`);
    console.log(`- Ngày hết hạn hiện tại: ${new Date(pool.expiry_date).toLocaleDateString('vi-VN')}`);

    // Dọn dẹp dữ liệu kiểm thử cũ nếu có để đảm bảo tính lặp lại (idempotent)
    const oldRenewalRequests = await prisma.licenseRequest.findMany({
      where: { software_id: pool.software_id, request_type: 'RENEWAL' },
      select: { request_id: true }
    });
    const oldRequestIds = oldRenewalRequests.map(r => r.request_id);

    if (oldRequestIds.length > 0) {
      await prisma.renewalHistory.deleteMany({
        where: { license_id: pool.license_id, renewal_cost: 25000000 }
      });
      // Đặt lại contract ban đầu cho pool nếu đang trỏ vào contract test
      const originalContract = await prisma.contract.findFirst({
        where: { contract_number: 'HD-MS-2024-001' }
      });
      if (originalContract) {
        await prisma.licensePool.update({
          where: { license_id: pool.license_id },
          data: {
            contract_id: originalContract.contract_id,
            status: 'EXPIRED',
            expiry_date: new Date('2026-11-01T00:00:00.000Z')
          }
        });
      }
      await prisma.contract.deleteMany({
        where: { request_id: { in: oldRequestIds } }
      });
      await prisma.licenseRequest.deleteMany({
        where: { request_id: { in: oldRequestIds } }
      });
    }

    // Refresh lại thông tin pool sau dọn dẹp
    pool = await prisma.licensePool.findUnique({
      where: { license_id: pool.license_id },
      include: { software: true, contract: true }
    });

    // 2. TEST 1: Thử gia hạn ngay mà KHÔNG có contract_id -> Bắt buộc bị chặn
    console.log('\n[Bước 2] Thử gọi API Gia hạn trực tiếp không kèm contract_id...');
    const renewWithoutContractRes = await fetch(`${BASE_URL}/license-pools/${pool.license_id}/renew`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        new_expiry_date: '2027-10-31',
        renewal_cost: 25000000
      })
    });
    const renewWithoutContractJson = await renewWithoutContractRes.json();
    console.log(`-> HTTP Status: ${renewWithoutContractRes.status}`);
    console.log(`-> Thông báo từ hệ thống: "${renewWithoutContractJson.message}"`);

    if (renewWithoutContractRes.status !== 400 || !renewWithoutContractJson.message.includes('Hợp đồng')) {
      throw new Error('THẤT BẠI: Hệ thống không chặn gia hạn thiếu Hợp đồng!');
    }
    console.log('✅ XÁC NHẬN: Hệ thống đã chặn gia hạn trực tiếp theo đúng nghiệp vụ!');

    // 3. TEST 2: Kiểm tra API /renewal-check
    console.log('\n[Bước 3] Kiểm tra điều kiện qua GET /renewal-check...');
    const check1Res = await fetch(`${BASE_URL}/license-pools/${pool.license_id}/renewal-check`);
    const check1Json = await check1Res.json();
    console.log(`-> can_renew: ${check1Json.data.can_renew}`);
    console.log(`-> has_pending_request: ${check1Json.data.has_pending_request}`);
    console.log(`-> Số hợp đồng khả dụng: ${check1Json.data.available_contracts.length}`);

    if (check1Json.data.can_renew !== false || check1Json.data.has_pending_request !== false) {
      throw new Error('THẤT BẠI: Trạng thái ban đầu không khớp.');
    }
    console.log('✅ XÁC NHẬN: API phản hồi chính xác trạng thái chưa đủ điều kiện gia hạn.');

    // 4. TEST 3: Gửi Phiếu đề xuất gia hạn về Nhà trường
    console.log('\n[Bước 4] Đại diện Khoa gửi Phiếu đề xuất gia hạn về Nhà trường...');
    const dept = await prisma.department.findFirst();
    const createReqRes = await fetch(`${BASE_URL}/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        department_id: dept.department_id,
        software_id: pool.software_id,
        request_type: 'RENEWAL',
        requested_seats: pool.total_seats,
        purpose: 'Đề xuất Nhà trường thẩm định gia hạn bản quyền Office phục vụ năm học mới.'
      })
    });
    const createReqJson = await createReqRes.json();
    console.log(`-> HTTP Status: ${createReqRes.status}`);
    console.log(`-> Mã phiếu đề xuất: #${createReqJson.data.request_id.slice(0, 8)}`);
    console.log(`-> Trạng thái phiếu: ${createReqJson.data.status}`);

    const newRequestId = createReqJson.data.request_id;

    // 5. TEST 4: Kiểm tra lại /renewal-check xem đã ghi nhận PENDING chưa
    console.log('\n[Bước 5] Kiểm tra lại GET /renewal-check sau khi gửi đề xuất...');
    const check2Res = await fetch(`${BASE_URL}/license-pools/${pool.license_id}/renewal-check`);
    const check2Json = await check2Res.json();
    console.log(`-> has_pending_request: ${check2Json.data.has_pending_request}`);
    console.log(`-> can_renew: ${check2Json.data.can_renew}`);

    if (!check2Json.data.has_pending_request) {
      throw new Error('THẤT BẠI: Chưa ghi nhận phiếu đề xuất gia hạn PENDING!');
    }
    console.log('✅ XÁC NHẬN: Hệ thống hiển thị trạng thái chờ Nhà trường phê duyệt.');

    // 6. TEST 5: Nhà trường / Quản lý CNTT Duyệt đề xuất & Ký kết Hợp đồng mua sắm
    console.log('\n[Bước 6] Nhà trường / Quản lý CNTT phê duyệt đề xuất gia hạn...');
    const approveRes = await fetch(`${BASE_URL}/requests/${newRequestId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: 'Đã hoàn tất thương thảo và ký kết hợp đồng mua sắm với Microsoft' })
    });
    const approveJson = await approveRes.json();
    console.log(`-> Kết quả duyệt: "${approveJson.message}"`);

    // 7. TEST 6: Kiểm tra /renewal-check để xác nhận Hợp đồng đã ký kết mở khóa can_renew
    console.log('\n[Bước 7] Kiểm tra lại GET /renewal-check sau khi Hợp đồng được ký kết...');
    const check3Res = await fetch(`${BASE_URL}/license-pools/${pool.license_id}/renewal-check`);
    const check3Json = await check3Res.json();
    console.log(`-> can_renew: ${check3Json.data.can_renew}`);
    console.log(`-> Hợp đồng khả dụng:`, check3Json.data.available_contracts.map(c => ({
      number: c.contract_number,
      cost: c.total_cost,
      signed: c.signed_date
    })));

    if (!check3Json.data.can_renew || check3Json.data.available_contracts.length === 0) {
      throw new Error('THẤT BẠI: Sau khi ký hợp đồng, can_renew vẫn chưa được mở khóa!');
    }
    const signedContract = check3Json.data.available_contracts[0];
    console.log(`✅ XÁC NHẬN: Đã mở khóa quyền gia hạn với Hợp đồng [${signedContract.contract_number}]!`);

    // 8. TEST 7: Tiến hành Gia hạn bản quyền với Hợp đồng mới
    console.log('\n[Bước 8] Thực thi Kích hoạt Gia hạn với Hợp đồng mới...');
    const newExpiry = new Date();
    newExpiry.setFullYear(newExpiry.getFullYear() + 2); // Gia hạn 2 năm

    const renewRes = await fetch(`${BASE_URL}/license-pools/${pool.license_id}/renew`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contract_id: signedContract.contract_id,
        new_expiry_date: newExpiry.toISOString().split('T')[0],
        renewal_cost: 25000000,
        notes: `Gia hạn theo HĐ ${signedContract.contract_number} đã được Nhà trường phê duyệt.`
      })
    });
    const renewJson = await renewRes.json();
    console.log(`-> HTTP Status: ${renewRes.status}`);
    console.log(`-> Thông báo: "${renewJson.message}"`);

    if (renewRes.status !== 200 || !renewJson.success) {
      throw new Error(`THẤT BẠI: Lỗi khi thực thi gia hạn: ${renewJson.message}`);
    }

    // 9. Xác minh dữ liệu trong CSDL sau gia hạn
    console.log('\n[Bước 9] Xác minh tính toàn vẹn trong Cơ sở dữ liệu...');
    const updatedPool = await prisma.licensePool.findUnique({
      where: { license_id: pool.license_id },
      include: { contract: true }
    });
    console.log(`- Trạng thái gói mới: ${updatedPool.status}`);
    console.log(`- Ngày hết hạn mới: ${new Date(updatedPool.expiry_date).toLocaleDateString('vi-VN')}`);
    console.log(`- Hợp đồng liên kết mới: ${updatedPool.contract.contract_number}`);

    const latestRenewal = await prisma.renewalHistory.findFirst({
      where: { license_id: pool.license_id },
      orderBy: { renewed_at: 'desc' }
    });
    console.log(`- Bản ghi RENEWAL_HISTORIES: Chi phí ${Number(latestRenewal.renewal_cost).toLocaleString('vi-VN')} đ, ngày gia hạn: ${new Date(latestRenewal.renewed_at).toLocaleString('vi-VN')}`);

    const latestAuditLog = await prisma.auditAlertLog.findFirst({
      where: { license_id: pool.license_id, action_type: 'RENEW' },
      orderBy: { created_at: 'desc' }
    });
    console.log(`- Bản ghi AUDIT_ALERT_LOGS: "${latestAuditLog.description}"`);

    if (updatedPool.status !== 'ACTIVE') {
      throw new Error('THẤT BẠI: Trạng thái gói không được mở khóa về ACTIVE sau gia hạn!');
    }

    console.log('\n================================================================');
    console.log('🎉 TẤT CẢ 7 BƯỚC KIỂM THỬ RÀNG BUỘC GIA HẠN ĐÃ THÀNH CÔNG 100%!');
    console.log('================================================================');

  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runVerification().catch(err => {
  console.error('\n❌ LỖI TRONG QUÁ TRÌNH KIỂM THỬ:', err);
  process.exit(1);
});
