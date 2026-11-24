---
name: salm-serverless-guard
description: >-
  Bộ quy chuẩn bắt buộc khi thiết kế, lập trình hoặc sửa đổi API Backend, Controller, Route, Service và Prisma Database Transactions cho dự án SALM (Node.js, Express, Prisma ORM, SQL Server, Vercel Serverless). Kích hoạt bất cứ khi nào viết API phân bổ hạn mức 2 cấp, cấp phát/thu hồi seat, gia hạn bản quyền, giải mã key (BR03), quét hạn định kỳ (Vercel Cron), hoặc cấu hình kết nối CSDL theo đúng cấu trúc 23 bảng chuẩn hóa 3NF.
---

# SALM Serverless Guard — Quy Chuẩn Backend & Quản Lý Giao Dịch

Tài liệu quy định bắt buộc đối với mọi mã nguồn Backend (Controller, Service, Route, Database Access) trong Hệ thống Quản lý Bản quyền Phần mềm Trường học (SALM).

---

## 1. Ràng Buộc Transaction Bảo Toàn Hạn Mức 2 Cấp

Mọi thao tác làm thay đổi số lượng ghế (seats), thay đổi trạng thái phân bổ, cấp phát hoặc gia hạn **BẮT BUỘC** phải được bọc trong một **Database Transaction** (`prisma.$transaction`) để ngăn chặn tình trạng bất đồng bộ dữ liệu (Race Conditions) hoặc thất thoát hạn mức.

### 1.1. Phân Bổ Cấp 1 (Kho Tổng Trường -> Quỹ Khoa) — Quy Tắc BR01
- **Endpoint:** `POST /api/allocations`
- **Ràng buộc:** Kiểm tra `allocated_seats <= license_pools.available_seats`.
- **Mã chuẩn:**
  ```javascript
  const result = await prisma.$transaction(async (tx) => {
    // 1. Kiểm tra tồn kho tổng
    const pool = await tx.licensePool.findUnique({
      where: { license_id },
      include: { software: true }
    });

    if (!pool || pool.status === 'EXPIRED') {
      throw new Error('Gói bản quyền không tồn tại hoặc đã hết hạn (BR04). Không thể phân bổ.');
    }

    if (pool.available_seats < allocated_seats) {
      throw new Error(`Kho tổng chỉ còn ${pool.available_seats} seats khả dụng. Không đủ để phân bổ ${allocated_seats} seats.`);
    }

    // 2. Giảm trừ kho tổng
    await tx.licensePool.update({
      where: { license_id },
      data: { available_seats: { decrement: allocated_seats } }
    });

    // 3. Tạo bản ghi phân bổ cho Khoa
    const allocation = await tx.departmentAllocation.create({
      data: {
        license_id,
        department_id,
        request_id: request_id || null,
        allocated_seats,
        used_seats: 0,
        status: 'ACTIVE'
      }
    });

    // 4. Ghi vết kiểm toán
    await tx.auditAlertLog.create({
      data: {
        license_id,
        user_id,
        action_type: 'ALLOCATE',
        description: `Đã phân bổ ${allocated_seats} seats cho Khoa [${department_id}]`
      }
    });

    return allocation;
  });
  ```

### 1.2. Cấp Phát Cấp 2 (Quỹ Khoa -> Giảng Viên / Máy Lab) — Quy Tắc BR02
- **Endpoint:** `POST /api/assignments`
- **Ràng buộc:**
  1. Kiểm tra `used_seats + seats_consumed <= department_allocations.allocated_seats`.
  2. Gói bản quyền gốc không được ở trạng thái `EXPIRED`.
  3. Nếu gán cho Thiết bị (`DEVICE`), thiết bị đó **KHÔNG ĐƯỢC** có trạng thái hỏng hóc (`BROKEN`, `MAINTENANCE`, `DISPOSED`).
- **Mã chuẩn:**
  ```javascript
  const assignment = await prisma.$transaction(async (tx) => {
    const allocation = await tx.departmentAllocation.findUnique({
      where: { allocation_id },
      include: { license_pool: true }
    });

    if (!allocation || allocation.status !== 'ACTIVE') {
      throw new Error('Hạn mức phân bổ của Khoa không khả dụng.');
    }

    if (allocation.license_pool.status === 'EXPIRED') {
      throw new Error('Gói bản quyền gốc đã hết hạn. Chức năng cấp phát mới đã bị khóa.');
    }

    const availableInDept = allocation.allocated_seats - allocation.used_seats;
    if (availableInDept < seats_consumed) {
      throw new Error(`Quỹ Khoa chỉ còn ${availableInDept} seats khả dụng. Vui lòng thu hồi ghế không dùng trước khi gán mới.`);
    }

    // Kiểm tra tính khả dụng của thiết bị
    if (target_type === 'DEVICE' && device_id) {
      const device = await tx.device.findUnique({ where: { device_id } });
      if (['BROKEN', 'MAINTENANCE', 'DISPOSED'].includes(device.status.toUpperCase())) {
        throw new Error(`Thiết bị [${device.device_code}] đang gặp sự cố (${device.status}). Không thể cấp phát bản quyền.`);
      }
    }

    // Tăng used_seats của Khoa
    await tx.departmentAllocation.update({
      where: { allocation_id },
      data: { used_seats: { increment: seats_consumed } }
    });

    // Tạo bản ghi cấp phát
    const newAssignment = await tx.licenseAssignment.create({
      data: {
        allocation_id,
        target_type,
        assigned_user_id: target_type === 'USER' ? assigned_user_id : null,
        device_id: target_type === 'DEVICE' ? device_id : null,
        seats_consumed,
        status: 'ACTIVE'
      }
    });

    return newAssignment;
  });
  ```

### 1.3. Thu Hồi Seat Cấp 2 (`REVOKED`)
- **Endpoint:** `POST /api/assignments/:id/revoke`
- **Nghiệp vụ:** Bọc trong Transaction: chuyển trạng thái gán thành `REVOKED`, ghi nhận `revoked_at`, và **giảm trừ `used_seats`** tương ứng trong `department_allocations` để hoàn trả ngay về quỹ của Khoa.

### 1.4. Gia Hạn Gói Bản Quyền (Renewal)
- **Endpoint:** `POST /api/license-pools/:id/renew`
- **Nghiệp vụ:** Bọc trong Transaction: ghi lại lịch sử vào `renewal_histories` (`old_expiry_date`, `new_expiry_date`, `renewal_cost`), cập nhật ngày hết hạn mới trong `license_pools` và tự động mở lại trạng thái `ACTIVE` nếu gói đang bị đánh dấu `EXPIRED`.

---

## 2. Ràng Buộc Tương Thích Vercel Serverless

Kiến trúc Serverless trên Vercel thực thi các hàm trong môi trường tạm thời (Ephemeral Lambdas/Functions), do đó phải tuân thủ nghiêm ngặt 3 quy tắc sau:

### 2.1. Khởi Tạo PrismaClient Dạng Singleton
Tuyệt đối không tạo `new PrismaClient()` bên trong các hàm xử lý Route hay Controller. Phải sử dụng mẫu thiết kế Singleton thông qua biến `globalForPrisma`:

```javascript
// src/lib/prisma.js
const { PrismaClient } = require('@prisma/client');

const globalForPrisma = global;

const prisma = globalForPrisma.prisma || new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error']
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

module.exports = prisma;
```

### 2.2. Tuyệt Đối Cấm `node-cron` Thường Trực
- Trên Vercel Serverless, tiến trình nền chạy bằng `node-cron` (hoặc `setInterval`) sẽ bị đóng băng hoặc tiêu hủy ngay khi function phản hồi kết thúc (freeze/terminate).
- **Giải pháp chuẩn:** Viết tác vụ quét hạn thành một API Route:
  `GET /api/cron/check-expirations`
- **Bảo mật:** Kiểm tra Header `Authorization: Bearer ${process.env.CRON_SECRET}` trước khi thực thi để ngăn chặn bên ngoài gọi phá hoại.
- **Kích hoạt:** Khai báo cấu hình trong tệp `vercel.json`:
  ```json
  {
    "crons": [
      {
        "path": "/api/cron/check-expirations",
        "schedule": "0 0 * * *"
      }
    ]
  }
  ```

### 2.3. Kiểm Soát Timeout & Tối Ưu Hóa Truy Vấn
- Giới hạn thời gian thực thi của Vercel Serverless là từ 10s đến 15s.
- Luôn sử dụng Indexing cho các trường truy vấn lọc (`status`, `expiry_date`, `department_id`, `allocation_id`).
- Tránh các truy vấn lồng nhau không kiểm soát (`N+1 Query Problem`), ưu tiên sử dụng `include` hoặc `select` cụ thể các cột cần lấy.

---

## 3. Bảo Mật Khóa Bản Quyền Chuẩn Doanh Nghiệp (BR03)

1. **Lưu trữ:** Cột `license_key_encrypted` trong bảng `license_pools` **bắt buộc** phải được mã hóa bằng thuật toán `aes-256-cbc` thông qua module `crypto` có sẵn của Node.js cùng khóa bí mật `AES_SECRET_KEY` từ file `.env`.
2. **Ẩn danh:** Mọi API trả về danh sách gói bản quyền (`GET /api/license-pools`) tuyệt đối **KHÔNG ĐƯỢC** chứa chuỗi khóa giải mã, chỉ trả về chuỗi đã che mặt nạ: `XXXX-XXXX-****-9A2F`.
3. **Giải mã & Thanh tra:** Chỉ duy nhất endpoint:
   `POST /api/license-pools/:id/reveal-key`
   mới được phép giải mã khóa gốc. Khi thực thi, endpoint này **BẮT BUỘC** phải ghi 1 bản ghi vào bảng `audit_alert_logs` và `key_access_logs` với `action_type = 'REVEAL_KEY'` kèm định danh tài khoản, IP address và thời điểm giải mã.

---

## 4. Chuẩn Hóa Cấu Trúc 23 Bảng Dữ Liệu (Chuẩn 3NF)

Toàn bộ hệ thống Backend và các câu lệnh truy vấn Prisma/T-SQL phải tuân thủ nghiêm ngặt danh mục **23 bảng dữ liệu chuẩn hóa 3NF**, chia theo 6 phân hệ nghiệp vụ:

### Phân Hệ 1: Tổ Chức & Người Dùng (3 Bảng)
1. **`roles`**: Vai trò người dùng (`role_id`, `role_code`, `role_name`).
2. **`departments`**: Khoa / Phòng ban chức năng (`department_id`, `department_code`, `department_name`, `manager_user_id`, `is_active`).
3. **`users`**: Tài khoản người dùng (`user_id`, `department_id`, `role_id`, `full_name`, `email`, `password_hash`, `is_active`).

### Phân Hệ 2: Phòng Máy & Hạ Tầng Thiết Bị (3 Bảng)
4. **`lab_rooms`**: Phòng thực hành máy tính (`room_id`, `room_code`, `room_name`, `department_id`, `building_location`, `capacity`, `is_active`).
5. **`devices`**: Thiết bị / Máy trạm phòng Lab (`device_id`, `room_id`, `department_id`, `manager_user_id`, `device_code`, `device_name`, `device_type`, `mac_address`, `ip_address`, `os_platform`, `hardware_specs`, `status`).
6. **`device_maintenances`**: Nhật ký sự cố & bảo trì máy tính (`maintenance_id`, `device_id`, `reported_by`, `fault_description`, `start_date`, `end_date`, `status`).

### Phân Hệ 3: Danh Mục Phần Mềm & Nhà Cung Cấp (3 Bảng)
7. **`vendors`**: Nhà cung cấp bản quyền (`vendor_id`, `vendor_name`, `contact_person`, `contact_email`, `phone`).
8. **`software_categories`**: Phân loại phần mềm (`category_id`, `category_code`, `category_name`, `description`).
9. **`softwares`**: Danh mục phần mềm (`software_id`, `category_id`, `software_name`, `version`, `platform`, `is_open_source`).

### Phân Hệ 4: Đề Xuất, Mua Sắm & Ngân Sách (4 Bảng)
10. **`license_requests`**: Phiếu đề xuất bản quyền từ các khoa (`request_id`, `department_id`, `software_id`, `requested_by`, `approved_by`, `request_type`, `requested_seats`, `purpose`, `status`, `created_at`).
11. **`contracts`**: Hợp đồng mua sắm ký kết với vendor (`contract_id`, `vendor_id`, `request_id`, `contract_number`, `signed_date`, `total_cost`).
12. **`department_budgets`**: Ngân sách phần mềm cấp cho từng Khoa theo năm tài khóa (`budget_id`, `department_id`, `fiscal_year`, `allocated_budget`, `used_budget`).
13. **`renewal_histories`**: Lịch sử các đợt gia hạn gói bản quyền (`renewal_id`, `license_id`, `contract_id`, `renewed_by`, `old_expiry_date`, `new_expiry_date`, `renewal_cost`, `renewed_at`).

### Phân Hệ 5: Kho Bản Quyền & Hạn Mức 2 Cấp (4 Bảng)
14. **`license_pools`**: Kho gói bản quyền tổng của trường (`license_id`, `software_id`, `contract_id`, `license_type`, `license_key_encrypted`, `total_seats`, `available_seats`, `start_date`, `expiry_date`, `status`).
15. **`department_allocations`**: Phân bổ Cấp 1 (Trường -> Khoa) (`allocation_id`, `license_id`, `department_id`, `request_id`, `allocated_seats`, `used_seats`, `allocated_date`, `status`).
16. **`license_assignments`**: Cấp phát Cấp 2 (Khoa -> GV / Lab / Phòng máy) (`assignment_id`, `allocation_id`, `target_type`, `assigned_user_id`, `device_id`, `lab_room_id`, `seats_consumed`, `assigned_at`, `revoked_at`, `status`).
17. **`software_installations`**: Lịch sử và thông số cài đặt phần mềm trên thiết bị (`install_id`, `device_id`, `software_id`, `installed_by`, `install_date`, `version_installed`, `status`).

### Phân Hệ 6: An Toàn Thông Tin, Kiểm Toán & Tuân Thủ (6 Bảng)
18. **`audit_alert_logs`**: Nhật ký kiểm toán hệ thống & cảnh báo quét hạn (`log_id`, `license_id`, `user_id`, `action_type`, `description`, `created_at`).
19. **`key_access_logs`**: Nhật ký chuyên biệt ghi vết giải mã khóa (BR03) (`access_id`, `license_id`, `user_id`, `ip_address`, `accessed_at`, `reason`).
20. **`compliance_audits`**: Đợt thanh tra rà soát tuân thủ bản quyền định kỳ (`audit_id`, `conducted_by`, `audit_date`, `scope_description`, `overall_status`).
21. **`compliance_audit_items`**: Chi tiết kết quả thanh tra trên từng khoa/máy trạm (`item_id`, `audit_id`, `device_id`, `software_id`, `is_licensed`, `notes`).
22. **`notifications`**: Hệ thống thông báo cảnh báo hạn dùng gửi tới người dùng (`notification_id`, `user_id`, `title`, `message`, `is_read`, `created_at`).
23. **`license_pools_archive`**: Kho lưu trữ các gói bản quyền đã thanh lý/hết hạn lâu năm (`archive_id`, `original_license_id`, `software_name`, `total_seats`, `archived_at`, `archive_reason`).

---

## 5. Quy Ước Code & Phản Hồi API (UX Copywriting)

- **Quy ước đặt tên:** Tên bảng và tên cột luôn là `snake_case`. Tên biến và hàm trong JavaScript/TypeScript luôn là `camelCase`.
- **API Response JSON đồng nhất:**
  ```json
  {
    "success": true,
    "statusCode": 200,
    "message": "Lấy danh sách phân bổ của khoa thành công.",
    "data": { ... }
  }
  ```
- **100% Thông báo lỗi bằng Tiếng Việt học thuật**, nêu rõ nguyên nhân và hướng dẫn thao tác khắc phục:
  * ❌ *Tránh:* "Lỗi cấp phát thất bại."
  * ✅ *Đúng:* "Khoa Công nghệ Thông tin đã dùng hết 50/50 seats được giao. Hãy thu hồi bản quyền từ thiết bị không còn dùng trước khi gán mới."
