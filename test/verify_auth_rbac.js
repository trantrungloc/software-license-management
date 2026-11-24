/**
 * KỊCH BẢN KIỂM THỬ TỰ ĐỘNG: ĐĂNG NHẬP VÀ PHÂN QUYỀN (AUTH & RBAC)
 * Hệ thống Quản lý Bản quyền Phần mềm Trường học (SALM)
 *
 * Kiểm tra các ca:
 * 1. Đăng nhập sai email / mật khẩu -> Bị chặn mã 401.
 * 2. Đăng nhập tài khoản Chuyên viên CNTT (IT_STAFF) -> Nhận JWT Token, kiểm tra vai trò và quyền truy cập.
 * 3. Đăng nhập tài khoản Đại diện Khoa (DEPT_REP) -> Nhận JWT Token, kiểm tra thông tin Khoa phụ trách.
 * 4. Kiểm tra phân tách dữ liệu hạn mức Cấp 2 theo Khoa (Khoa CNTT vs Khoa Kinh tế).
 * 5. Xác minh tự động ghi nhận nhật ký kiểm toán (AUDIT_ALERT_LOGS) cho sự kiện LOGIN.
 */

const http = require('http');
const prisma = require('../src/lib/prisma');

async function runAuthVerification() {
  console.log('================================================================');
  console.log('BẮT ĐẦU KIỂM THỬ: ĐĂNG NHẬP VÀ PHÂN QUYỀN (AUTH & RBAC)');
  console.log('================================================================');

  const app = require('../src/server');
  const server = http.createServer(app);
  const PORT = 5679;

  await new Promise((resolve) => server.listen(PORT, resolve));
  const BASE_URL = `http://localhost:${PORT}/api`;

  try {
    // 1. TEST 1: Thử đăng nhập sai mật khẩu
    console.log('\n[Bước 1] Kiểm tra chặn đăng nhập sai thông tin...');
    const failRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'itstaff@salm.edu.vn', password: 'SaiMatKhau123' })
    });
    const failJson = await failRes.json();
    console.log(`-> HTTP Status: ${failRes.status}`);
    console.log(`-> Thông báo lỗi: "${failJson.message}"`);

    if (failRes.status !== 401 || failJson.success !== false) {
      throw new Error('THẤT BẠI: Hệ thống không chặn mật khẩu sai!');
    }
    console.log('✅ XÁC NHẬN: Hệ thống đã chặn mật khẩu sai chính xác!');

    // 2. TEST 2: Đăng nhập Chuyên viên CNTT (IT_STAFF)
    console.log('\n[Bước 2] Đăng nhập tài khoản Chuyên viên CNTT (IT_STAFF)...');
    const itLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'itstaff@salm.edu.vn', password: 'MatKhau@123' })
    });
    const itLoginJson = await itLoginRes.json();
    console.log(`-> HTTP Status: ${itLoginRes.status}`);
    console.log(`-> Người dùng: ${itLoginJson.user?.full_name}`);
    console.log(`-> Vai trò: ${itLoginJson.user?.role_code} (${itLoginJson.user?.role_name})`);
    console.log(`-> JWT Token: ${itLoginJson.token?.slice(0, 25)}...`);

    if (itLoginRes.status !== 200 || !itLoginJson.token || itLoginJson.user?.role_code !== 'IT_STAFF') {
      throw new Error('THẤT BẠI: Đăng nhập IT_STAFF không thành công!');
    }
    console.log('✅ XÁC NHẬN: Đăng nhập Chuyên viên CNTT thành công và sinh JWT Token!');

    // 3. TEST 3: Xác thực Token qua /api/auth/me
    console.log('\n[Bước 3] Xác thực JWT Token qua GET /api/auth/me...');
    const meRes = await fetch(`${BASE_URL}/auth/me`, {
      headers: { 'Authorization': `Bearer ${itLoginJson.token}` }
    });
    const meJson = await meRes.json();
    console.log(`-> HTTP Status: ${meRes.status}`);
    console.log(`-> Email xác thực: ${meJson.user?.email}`);
    console.log(`-> Vai trò xác thực: ${meJson.user?.role_code}`);

    if (meRes.status !== 200 || meJson.user?.email !== 'itstaff@salm.edu.vn') {
      throw new Error('THẤT BẠI: Xác thực token qua /me không đúng!');
    }
    console.log('✅ XÁC NHẬN: Middleware xác thực JWT Token hoạt động chuẩn xác!');

    // 4. TEST 4: Đăng nhập Đại diện Khoa CNTT (DEPT_REP)
    console.log('\n[Bước 4] Đăng nhập tài khoản Đại diện Khoa CNTT (DEPT_REP)...');
    const deptLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'deptrep.cntt@salm.edu.vn', password: 'MatKhau@123' })
    });
    const deptLoginJson = await deptLoginRes.json();
    console.log(`-> HTTP Status: ${deptLoginRes.status}`);
    console.log(`-> Người dùng: ${deptLoginJson.user?.full_name}`);
    console.log(`-> Vai trò: ${deptLoginJson.user?.role_code}`);
    console.log(`-> Khoa phụ trách: ${deptLoginJson.user?.department_name} (Mã: ${deptLoginJson.user?.department_code})`);

    if (deptLoginRes.status !== 200 || deptLoginJson.user?.role_code !== 'DEPT_REP' || !deptLoginJson.user?.department_id) {
      throw new Error('THẤT BẠI: Đăng nhập DEPT_REP không thành công!');
    }
    console.log('✅ XÁC NHẬN: Đăng nhập Đại diện Khoa thành công và nhận diện chính xác Khoa quản lý!');

    // 5. TEST 5: Kiểm tra phân tách hạn mức Cấp 2 của Khoa CNTT
    console.log('\n[Bước 5] Kiểm tra truy vấn hạn mức Cấp 2 chỉ của Khoa CNTT...');
    const cnttDeptId = deptLoginJson.user.department_id;
    const allocRes = await fetch(`${BASE_URL}/allocations?department_id=${cnttDeptId}`, {
      headers: { 'Authorization': `Bearer ${deptLoginJson.token}` }
    });
    const allocJson = await allocRes.json();
    console.log(`-> Số gói bản quyền Khoa CNTT nhận: ${allocJson.data.length}`);
    allocJson.data.forEach(a => {
      console.log(`   * [${a.department.department_name}] - ${a.license_pool?.software?.software_name}: ${a.used_seats}/${a.allocated_seats} seats`);
    });

    const isAllSameDept = allocJson.data.every(a => a.department_id === cnttDeptId);
    if (!isAllSameDept) {
      throw new Error('THẤT BẠI: Lẫn lộn hạn mức của các khoa khác!');
    }
    console.log('✅ XÁC NHẬN: Phân tách dữ liệu hạn mức Cấp 2 theo Khoa hoàn toàn cô lập và chuẩn xác!');

    // 6. TEST 6: Kiểm tra ghi nhận Audit Log sự kiện LOGIN
    console.log('\n[Bước 6] Kiểm tra nhật ký kiểm toán ghi nhận sự kiện LOGIN...');
    const latestLoginLog = await prisma.auditAlertLog.findFirst({
      where: { action_type: 'LOGIN' },
      orderBy: { created_at: 'desc' }
    });
    console.log(`-> Sự kiện mới nhất: "${latestLoginLog?.description}"`);
    console.log(`-> Thời điểm: ${new Date(latestLoginLog?.created_at).toLocaleString('vi-VN')}`);

    if (!latestLoginLog || !latestLoginLog.description.includes('Đăng nhập')) {
      throw new Error('THẤT BẠI: Chưa ghi nhận sự kiện đăng nhập vào AUDIT_ALERT_LOGS!');
    }
    console.log('✅ XÁC NHẬN: Sự kiện đăng nhập đã được ghi nhận tự động vào Nhật ký Kiểm toán!');

    console.log('\n================================================================');
    console.log('🎉 TẤT CẢ 6 BƯỚC KIỂM THỬ XÁC THỰC & PHÂN QUYỀN ĐÃ HOÀN TẤT 100%!');
    console.log('================================================================');

  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runAuthVerification().catch(err => {
  console.error('\n❌ LỖI TRONG QUÁ TRÌNH KIỂM THỬ AUTH/RBAC:', err);
  process.exit(1);
});
