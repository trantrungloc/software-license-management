# PROJECT RULES — HỆ THỐNG QUẢN LÝ BẢN QUYỀN PHẦN MỀM TRƯỜNG HỌC (SALM)

## 1. Tech Stack Cố Định
- **Runtime & Backend:** Node.js + Express.js (cấu hình Serverless cho Vercel) hoặc Next.js Fullstack.
- **Database:** SQL (MySQL / PostgreSQL) quản lý schema và migration qua **Prisma ORM**.
- **Authentication & Security:**
  - Xác thực bằng `jsonwebtoken` (JWT) + `bcryptjs` (hash mật khẩu).
  - Mã hóa khóa bản quyền (`license_key_encrypted`) bằng module `crypto` có sẵn của Node.js (thuật toán `aes-256-cbc` hoặc `aes-256-gcm` với `AES_SECRET_KEY` từ `.env`).
- **Deployment:** Vercel (kèm `vercel.json` định nghĩa routing và Vercel Cron Jobs).

## 2. Cấu Trúc 13 Bảng Cơ Sở Dữ Liệu Cốt Lõi (Không tự ý đổi tên bảng)
1. `roles` (`role_id`, `role_code`, `role_name`)
2. `departments` (`department_id`, `department_code`, `department_name`, `manager_user_id`, `is_active`)
3. `users` (`user_id`, `department_id`, `role_id`, `full_name`, `email`, `password_hash`, `is_active`)
4. `devices` (`device_id`, `department_id`, `manager_user_id`, `device_code`, `device_name`, `device_type`, `room_location`, `mac_address`, `ip_address`, `os_platform`, `hardware_specs`, `status`)
5. `vendors` (`vendor_id`, `vendor_name`, `contact_person`, `contact_email`, `phone`)
6. `softwares` (`software_id`, `software_name`, `version`, `platform`, `is_open_source`)
7. `license_requests` (`request_id`, `department_id`, `software_id`, `requested_by`, `approved_by`, `request_type`, `requested_seats`, `purpose`, `status`, `created_at`)
8. `contracts` (`contract_id`, `vendor_id`, `request_id`, `contract_number`, `signed_date`, `total_cost`)
9. `license_pools` (`license_id`, `software_id`, `contract_id`, `license_type`, `license_key_encrypted`, `total_seats`, `available_seats`, `start_date`, `expiry_date`, `status`)
10. `department_allocations` (`allocation_id`, `license_id`, `department_id`, `request_id`, `allocated_seats`, `used_seats`, `allocated_date`, `status`)
11. `license_assignments` (`assignment_id`, `allocation_id`, `target_type`, `assigned_user_id`, `device_id`, `seats_consumed`, `assigned_at`, `revoked_at`, `status`)
12. `renewal_histories` (`renewal_id`, `license_id`, `contract_id`, `renewed_by`, `old_expiry_date`, `new_expiry_date`, `renewal_cost`, `renewed_at`)
13. `audit_alert_logs` (`log_id`, `license_id`, `user_id`, `action_type`, `description`, `created_at`)

## 3. Quy Ước Đặt Tên & Code Style
- **Database (Bảng & Cột):** Sử dụng `snake_case` (ví dụ: `license_pools`, `allocated_seats`).
- **Biến & Hàm trong JS/TS:** Sử dụng `camelCase` (ví dụ: `allocateLicenseToDepartment`, `checkAvailableSeats`).
- **React Components:** Sử dụng `PascalCase` (ví dụ: `LicensePoolTable.jsx`, `ExpirationBadge.jsx`).
- **API Endpoints:** Chuẩn RESTful, tiền tố `/api/...` (ví dụ: `GET /api/license-pools`, `POST /api/allocations`).
- **Ngôn ngữ hiển thị:** Toàn bộ nhãn giao diện (UI Labels), thông báo lỗi trả về từ API (`message`) phải bằng **Tiếng Việt rõ ràng, lịch sự**.

## 4. Ràng Buộc Nghiệp Vụ Bắt Buộc (Business Rules)
- **BR01 (Bảo toàn hạn mức Cấp 1):** Khi phân bổ cho phòng ban, bắt buộc dùng Database Transaction kiểm tra `allocated_seats <= license_pools.available_seats` rồi mới trừ `available_seats`.
- **BR02 (Bảo toàn hạn mức Cấp 2):** Khi phòng ban gán seat cho User hoặc Device, bắt buộc kiểm tra `used_seats + seats_consumed <= department_allocations.allocated_seats`.
- **BR03 (Bảo mật Key):** API lấy danh sách `license_pools` tuyệt đối KHÔNG trả về chuỗi key giải mã, chỉ trả về chuỗi đã che (`XXXX-XXXX-****-1234`). Chỉ endpoint `POST /api/license-pools/:id/reveal-key` mới giải mã key và BẮT BUỘC ghi 1 dòng vào `audit_alert_logs` (`action_type = 'REVEAL_KEY'`).
- **BR04 (Khóa bản quyền hết hạn):** Không cho phép phân bổ hoặc cấp phát mới nếu `license_pools.status === 'EXPIRED'`.

## 5. Những Điều Tuyệt Đối KHÔNG ĐƯỢC LÀM (Strict Do-Nots)
- KHÔNG tự ý xóa file, xóa bảng hoặc xóa cột trong schema mà chưa xin phép.
- KHÔNG tự ý cài đặt các thư viện UI hoặc State Management nặng nề khi chưa được duyệt.
- KHÔNG sử dụng `node-cron` chạy ngầm liên tục (vì sẽ chết trên Vercel Serverless); hãy viết logic quét hạn dưới dạng API Controller để gọi qua Vercel Cron.
- KHÔNG thực hiện code trước khi người dùng duyệt Plan ở mỗi bước.
- KHÔNG chạy các lệnh phá hủy dữ liệu (`DROP`, `rm -rf`, `prisma migrate reset`) khi chưa có sự đồng ý rõ ràng.
- KHÔNG hardcode biến nhạy cảm ngoài file `.env`.