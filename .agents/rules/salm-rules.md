---
description: Quy tắc kiến trúc, cơ sở dữ liệu và quy trình làm việc cố định cho dự án Quản lý Bản quyền Phần mềm Trường học (SALM)
globs: "**/*"
alwaysApply: true
---

# LUẬT CỐ ĐỊNH DỰ ÁN SALM (NODE.JS + SQL + VERCEL)

## 1. Quy trình làm việc trên Antigravity (Bắt buộc)
- **Luôn tạo Implementation Plan trước:** Trước khi viết hoặc sửa code cho bất kỳ tính năng nào, phải lập kế hoạch chi tiết (danh sách file tạo/sửa, luồng xử lý, câu lệnh cần chạy) và DỪNG LẠI chờ người dùng nhấn Approve/Duyệt.
- **Tự động điều phối Anthropic Skills trong `.agents/skills/`:**
  - Khi làm việc với UI/UX (React, Tailwind, Dashboard, Modal, Table): BẮT BUỘC đọc và tuân thủ `.agents/skills/frontend-design/SKILL.md`.
  - Khi kiểm thử tính năng hoặc sửa bug giao diện: BẮT BUỘC đọc `.agents/skills/webapp-testing/SKILL.md` và kết hợp công cụ Browser để kiểm tra Console/Network logs.
  - Khi làm tính năng Nhập/Xuất danh sách thiết bị hoặc báo cáo: Đọc `.agents/skills/xlsx/SKILL.md` và `.agents/skills/pdf/SKILL.md`.

## 2. Ràng buộc Kỹ thuật & Môi trường Deploy (Vercel)
- **Backend:** Node.js + Prisma ORM kết nối SQL (MySQL/PostgreSQL).
- **Tương thích Vercel Serverless:**
  - Khởi tạo PrismaClient theo mẫu Singleton (`globalForPrisma`) để không làm tràn Connection Pool.
  - KHÔNG dùng `node-cron` chạy ngầm. Tính năng quét hạn bản quyền phải viết thành API endpoint `GET /api/cron/check-expirations` (bảo vệ bằng `CRON_SECRET`) để kích hoạt qua Vercel Cron (`vercel.json`).
- **Ngôn ngữ hiển thị:** 100% giao diện, nhãn trạng thái, thông báo lỗi trả về từ API sử dụng Tiếng Việt chuẩn học thuật.

## 3. Ràng buộc Nghiệp vụ & Cơ sở dữ liệu (Chuẩn 3NF)
- **Bảo mật Khóa kích hoạt (`license_pools`):**
  - Mã hóa `license_key_encrypted` bằng `crypto` (`aes-256-cbc`) trước khi lưu DB.
  - API danh sách chỉ trả về `key_mask` (`XXXX-XXXX-****-9A2F`).
  - Khi gọi API giải mã xem key (`/reveal-key`), BẮT BUỘC ghi 1 bản ghi vào `key_access_logs` (kèm `user_id`, `assignment_id`, `ip_address`).
- **Kiểm soát hạn mức 2 cấp bằng Database Transaction (`prisma.$transaction`):**
  - *Cấp 1 (`department_allocations`):* Kiểm tra `allocated_seats <= license_pools.available_seats`, sau đó trừ `available_seats` và cộng `allocated_seats` ở kho tổng.
  - *Cấp 2 (`license_assignments`):* Hỗ trợ gán cho Giảng viên (`assigned_user_id`), Thiết bị (`device_id` thuộc bảng `devices`) hoặc Phòng máy (`lab_room_id`). Kiểm tra `used_seats + seats_consumed <= department_allocations.allocated_seats`.
  - Chặn cấp phát nếu gói bản quyền có `status = 'expired'` hoặc thiết bị trong bảng `devices` có `status IN ('broken', 'decommissioned')`.

## 4. Những điều cấm kỵ (Strict Do-Nots)
- Không tự ý xóa bảng/cột trong schema đã chốt.
- Không chạy lệnh xóa dữ liệu (`prisma migrate reset`, `DROP TABLE`, `rm -rf`) nếu chưa được xác nhận.
- Không hardcode biến nhạy cảm ngoài file `.env`.
