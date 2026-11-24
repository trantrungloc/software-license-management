/**
 * ==============================================================================
 * KỊCH BẢN TẠO DỮ LIỆU MẪU (SEED DATA) — HỆ THỐNG SALM
 * Đáp ứng đầy đủ các yêu cầu tại Bước 1:
 * - 4 Vai trò: ADMIN, IT_MANAGER, IT_STAFF, DEPT_REP
 * - 3 Khoa: CNTT, Kinh tế, Ngoại ngữ
 * - 5 Tài khoản mẫu ứng với các vai trò
 * - 5 Máy trạm phòng Lab A301 (gắn với Khoa CNTT)
 * - 3 Nhà cung cấp: Microsoft, JetBrains, Adobe
 * - 4 Gói bản quyền có hạn dùng khác nhau (Còn 60 ngày, 15 ngày, 7 ngày, Quá hạn)
 * - Khóa bản quyền được mã hóa chuẩn AES-256-CBC qua module crypto
 * ==============================================================================
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { encryptLicenseKey } = require('../src/lib/crypto');

const prisma = new PrismaClient();

async function main() {
  console.log('--- [SALM] BẮT ĐẦU NẠP DỮ LIỆU MẪU TIẾNG VIỆT ---');

  // Mật khẩu mặc định chung cho các tài khoản thử nghiệm
  const defaultPasswordHash = bcrypt.hashSync('MatKhau@123', 10);

  // 1. TẠO 4 VAI TRÒ (ROLES)
  console.log('1. Đang khởi tạo 4 vai trò...');
  const roleAdmin = await prisma.role.upsert({
    where: { role_code: 'ADMIN' },
    update: {},
    create: {
      role_code: 'ADMIN',
      role_name: 'Quản trị viên hệ thống'
    }
  });

  const roleItManager = await prisma.role.upsert({
    where: { role_code: 'IT_MANAGER' },
    update: {},
    create: {
      role_code: 'IT_MANAGER',
      role_name: 'Quản lý CNTT'
    }
  });

  const roleItStaff = await prisma.role.upsert({
    where: { role_code: 'IT_STAFF' },
    update: {},
    create: {
      role_code: 'IT_STAFF',
      role_name: 'Chuyên viên CNTT'
    }
  });

  const roleDeptRep = await prisma.role.upsert({
    where: { role_code: 'DEPT_REP' },
    update: {},
    create: {
      role_code: 'DEPT_REP',
      role_name: 'Đại diện phòng ban / Trưởng khoa'
    }
  });

  // 2. TẠO 3 KHOA (DEPARTMENTS)
  console.log('2. Đang khởi tạo 3 khoa...');
  const deptCntt = await prisma.department.upsert({
    where: { department_code: 'CNTT' },
    update: {},
    create: {
      department_code: 'CNTT',
      department_name: 'Khoa Công nghệ Thông tin',
      is_active: true
    }
  });

  const deptKt = await prisma.department.upsert({
    where: { department_code: 'KT' },
    update: {},
    create: {
      department_code: 'KT',
      department_name: 'Khoa Kinh tế',
      is_active: true
    }
  });

  const deptNn = await prisma.department.upsert({
    where: { department_code: 'NN' },
    update: {},
    create: {
      department_code: 'NN',
      department_name: 'Khoa Ngoại ngữ',
      is_active: true
    }
  });

  // 3. TẠO 5 TÀI KHOẢN MẪU (USERS)
  console.log('3. Đang khởi tạo 5 tài khoản mẫu ứng với các vai trò...');
  const userAdmin = await prisma.user.upsert({
    where: { email: 'admin@salm.edu.vn' },
    update: {},
    create: {
      email: 'admin@salm.edu.vn',
      full_name: 'Nguyễn Văn Quản Trị',
      password_hash: defaultPasswordHash,
      role_id: roleAdmin.role_id,
      department_id: deptCntt.department_id,
      is_active: true
    }
  });

  const userItManager = await prisma.user.upsert({
    where: { email: 'itmanager@salm.edu.vn' },
    update: {},
    create: {
      email: 'itmanager@salm.edu.vn',
      full_name: 'Trần Thị Trưởng Phòng',
      password_hash: defaultPasswordHash,
      role_id: roleItManager.role_id,
      department_id: deptCntt.department_id,
      is_active: true
    }
  });

  const userItStaff = await prisma.user.upsert({
    where: { email: 'itstaff@salm.edu.vn' },
    update: {},
    create: {
      email: 'itstaff@salm.edu.vn',
      full_name: 'Lê Hoàng Chuyên Viên',
      password_hash: defaultPasswordHash,
      role_id: roleItStaff.role_id,
      department_id: deptCntt.department_id,
      is_active: true
    }
  });

  const userDeptRepCntt = await prisma.user.upsert({
    where: { email: 'deptrep.cntt@salm.edu.vn' },
    update: {},
    create: {
      email: 'deptrep.cntt@salm.edu.vn',
      full_name: 'Phạm Minh Trưởng Khoa CNTT',
      password_hash: defaultPasswordHash,
      role_id: roleDeptRep.role_id,
      department_id: deptCntt.department_id,
      is_active: true
    }
  });

  const userDeptRepKt = await prisma.user.upsert({
    where: { email: 'deptrep.kt@salm.edu.vn' },
    update: {},
    create: {
      email: 'deptrep.kt@salm.edu.vn',
      full_name: 'Hoàng Anh Trưởng Khoa Kinh Tế',
      password_hash: defaultPasswordHash,
      role_id: roleDeptRep.role_id,
      department_id: deptKt.department_id,
      is_active: true
    }
  });

  // Cập nhật người phụ trách (manager_user_id) cho 2 khoa
  await prisma.department.update({
    where: { department_id: deptCntt.department_id },
    data: { manager_user_id: userDeptRepCntt.user_id }
  });

  await prisma.department.update({
    where: { department_id: deptKt.department_id },
    data: { manager_user_id: userDeptRepKt.user_id }
  });

  // 4. TẠO 5 MÁY TRẠM PHÒNG LAB A301 (DEVICES) GẮN VỚI KHOA CNTT
  console.log('4. Đang khởi tạo 5 máy trạm phòng Lab A301...');
  for (let i = 1; i <= 5; i++) {
    const padIndex = String(i).padStart(2, '0');
    const deviceCode = `LAB-A301-PC${padIndex}`;
    await prisma.device.upsert({
      where: { device_code: deviceCode },
      update: {},
      create: {
        device_code: deviceCode,
        device_name: `Máy tính Trạm Lab A301 số ${i}`,
        device_type: 'DESKTOP',
        room_location: 'Phòng Lab A301 - Tòa nhà A',
        department_id: deptCntt.department_id,
        manager_user_id: userDeptRepCntt.user_id,
        ip_address: `192.168.10.10${i}`,
        mac_address: `00:1A:2B:3C:4D:0${i}`,
        os_platform: 'Windows 11 Pro 64-bit',
        hardware_specs: 'Intel Core i7-12700, 16GB RAM DDR4, 512GB NVMe SSD',
        status: 'ACTIVE'
      }
    });
  }

  // 5. TẠO 3 NHÀ CUNG CẤP (VENDORS)
  console.log('5. Đang khởi tạo 3 nhà cung cấp...');
  const vendorMicrosoft = await prisma.vendor.create({
    data: {
      vendor_name: 'Tập đoàn Microsoft Việt Nam',
      contact_person: 'Nguyễn Tuấn Anh',
      contact_email: 'tuananh@microsoft.com',
      phone: '02439351000'
    }
  });

  const vendorJetBrains = await prisma.vendor.create({
    data: {
      vendor_name: 'JetBrains s.r.o',
      contact_person: 'Elena Petrova',
      contact_email: 'sales@jetbrains.com',
      phone: '+420241722501'
    }
  });

  const vendorAdobe = await prisma.vendor.create({
    data: {
      vendor_name: 'Adobe Systems Incorporated',
      contact_person: 'David Miller',
      contact_email: 'apac-sales@adobe.com',
      phone: '+6565115500'
    }
  });

  // 6. TẠO DANH MỤC PHẦN MỀM (SOFTWARES)
  console.log('6. Đang khởi tạo danh mục phần mềm...');
  const softWin11 = await prisma.software.create({
    data: {
      software_name: 'Windows 11 Education',
      version: '23H2',
      platform: 'Windows',
      is_open_source: false
    }
  });

  const softJetBrains = await prisma.software.create({
    data: {
      software_name: 'JetBrains All Products Pack',
      version: '2024.1',
      platform: 'Cross-platform',
      is_open_source: false
    }
  });

  const softAdobe = await prisma.software.create({
    data: {
      software_name: 'Adobe Creative Cloud All Apps',
      version: '2024',
      platform: 'Windows / macOS',
      is_open_source: false
    }
  });

  const softOffice = await prisma.software.create({
    data: {
      software_name: 'Microsoft Office 2021 LTSC',
      version: '2021',
      platform: 'Windows / macOS',
      is_open_source: false
    }
  });

  // 7. TẠO HỢP ĐỒNG MẪU (CONTRACTS)
  console.log('7. Đang khởi tạo hợp đồng mẫu...');
  const contractMs = await prisma.contract.create({
    data: {
      contract_number: 'HD-MS-2024-001',
      vendor_id: vendorMicrosoft.vendor_id,
      signed_date: new Date('2024-01-15'),
      total_cost: 150000000 // 150 triệu VNĐ
    }
  });

  const contractJb = await prisma.contract.create({
    data: {
      contract_number: 'HD-JB-2024-002',
      vendor_id: vendorJetBrains.vendor_id,
      signed_date: new Date('2024-03-01'),
      total_cost: 85000000 // 85 triệu VNĐ
    }
  });

  const contractAd = await prisma.contract.create({
    data: {
      contract_number: 'HD-AD-2024-003',
      vendor_id: vendorAdobe.vendor_id,
      signed_date: new Date('2024-02-20'),
      total_cost: 120000000 // 120 triệu VNĐ
    }
  });

  // 8. TẠO 4 GÓI BẢN QUYỀN VỚI CÁC MỐC HẠN DÙNG KHÁC NHAU (LICENSE_POOLS)
  // Tính toán thời gian tương đối tính từ ngày hôm nay (now)
  console.log('8. Đang khởi tạo 4 gói bản quyền với các mốc hạn dùng khác nhau...');
  const now = new Date();

  // Mốc 1: Còn 60 ngày (> 30 ngày -> ACTIVE)
  const expiryIn60Days = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const start60DaysAgo = new Date(now.getTime() - 305 * 24 * 60 * 60 * 1000);
  const rawKey1 = 'W269N-WFGWX-YVC9B-4J6C9-T83GX';

  await prisma.licensePool.create({
    data: {
      software_id: softWin11.software_id,
      contract_id: contractMs.contract_id,
      license_type: 'ACADEMIC',
      license_key_encrypted: encryptLicenseKey(rawKey1),
      total_seats: 100,
      available_seats: 100,
      start_date: start60DaysAgo,
      expiry_date: expiryIn60Days,
      status: 'ACTIVE'
    }
  });

  // Mốc 2: Còn 15 ngày (Mốc cảnh báo 15 ngày -> EXPIRING_SOON)
  const expiryIn15Days = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
  const start350DaysAgo = new Date(now.getTime() - 350 * 24 * 60 * 60 * 1000);
  const rawKey2 = 'JBAPP-2024-EDU-99482-VN';

  await prisma.licensePool.create({
    data: {
      software_id: softJetBrains.software_id,
      contract_id: contractJb.contract_id,
      license_type: 'SUBSCRIPTION',
      license_key_encrypted: encryptLicenseKey(rawKey2),
      total_seats: 50,
      available_seats: 50,
      start_date: start350DaysAgo,
      expiry_date: expiryIn15Days,
      status: 'EXPIRING_SOON'
    }
  });

  // Mốc 3: Còn 7 ngày (Mốc cảnh báo 7 ngày -> EXPIRING_SOON)
  const expiryIn7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const start358DaysAgo = new Date(now.getTime() - 358 * 24 * 60 * 60 * 1000);
  const rawKey3 = 'ADOBE-CC24-CAMPUS-77123-K';

  await prisma.licensePool.create({
    data: {
      software_id: softAdobe.software_id,
      contract_id: contractAd.contract_id,
      license_type: 'SUBSCRIPTION',
      license_key_encrypted: encryptLicenseKey(rawKey3),
      total_seats: 30,
      available_seats: 30,
      start_date: start358DaysAgo,
      expiry_date: expiryIn7Days,
      status: 'EXPIRING_SOON'
    }
  });

  // Mốc 4: Đã quá hạn 10 ngày (-> EXPIRED)
  const expiry10DaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
  const start375DaysAgo = new Date(now.getTime() - 375 * 24 * 60 * 60 * 1000);
  const rawKey4 = 'OFF21-PRO-LTSC-EXPIRED-9901';

  await prisma.licensePool.create({
    data: {
      software_id: softOffice.software_id,
      contract_id: contractMs.contract_id,
      license_type: 'PERPETUAL',
      license_key_encrypted: encryptLicenseKey(rawKey4),
      total_seats: 20,
      available_seats: 20,
      start_date: start375DaysAgo,
      expiry_date: expiry10DaysAgo,
      status: 'EXPIRED'
    }
  });

  console.log('--- [SALM] KHỞI TẠO DỮ LIỆU MẪU HOÀN TẤT THÀNH CÔNG! ---');
}

main()
  .catch((e) => {
    console.error('Lỗi khi chạy kịch bản seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
