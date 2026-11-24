# HỆ THỐNG QUẢN LÝ HẠN SỬ DỤNG BẢN QUYỀN PHẦN MỀM TRƯỜNG HỌC (SALM)
> **Đồ án Luận văn Tốt nghiệp Đại học — Chuyên ngành Công nghệ Thông tin**  
> **Tác giả:** Đội ngũ phát triển SALM  
> **Kiến trúc:** Node.js + Express.js Serverless + Prisma ORM + Microsoft SQL Server + Tailwind CSS

---

## 1. Giới thiệu Đề tài
Trong các trường đại học hiện nay, việc quản lý hạn sử dụng bản quyền phần mềm (Microsoft, Autodesk, JetBrains, Adobe,...) còn phân tán và thủ công bằng bảng tính Excel. Điều này dẫn đến các rủi ro:
1. **Bỏ quên kỳ hạn gia hạn:** Dẫn đến gián đoạn việc giảng dạy trong phòng Lab và học tập của sinh viên.
2. **Thất thoát hạn mức (Seats):** Không kiểm soát được số lượng seat đã cấp cho từng khoa và việc thu hồi khi giảng viên chuyển công tác hoặc máy tính phòng Lab bị hỏng.
3. **Lộ lọt License Key:** Khóa bản quyền lưu dưới dạng văn bản thuần (plain-text) không được mã hóa và không có nhật ký truy cập (Audit Trail).

**Hệ thống SALM (Software Asset & License Management)** giải quyết triệt để các vấn đề trên với mô hình phân bổ 2 cấp minh bạch, bảo mật khóa bằng thuật toán AES-256-CBC, và tự động hóa việc quét hạn sử dụng qua Vercel Cron.

---

## 2. Các Tính năng Cốt lõi (MVP)

1. **Bảo mật Khóa Bản quyền Chuẩn Doanh nghiệp (BR03):**
   - Tự động mã hóa License Key bằng thuật toán `AES-256-CBC` với IV ngẫu nhiên trước khi lưu vào CSDL.
   - Giao diện và API danh sách luôn che khóa dưới dạng `XXXX-****-XXXX`.
   - Bắt buộc ghi 1 dòng sự kiện vào `AUDIT_ALERT_LOGS` (`action_type = 'REVEAL_KEY'`) mỗi khi người dùng giải mã xem key.

2. **Phân bổ Hạn mức 2 Cấp & Bảo toàn Toàn vẹn (BR01 & BR02):**
   - **Cấp 1 (Trường -> Khoa):** Chuyên viên CNTT trích số lượng seat từ Kho tổng về cho Khoa. Bắt buộc kiểm tra `allocated_seats <= available_seats` bằng Database Transaction trước khi trừ kho tổng.
   - **Cấp 2 (Khoa -> Giảng viên / Máy Lab):** Đại diện khoa gán seat cho từng Giảng viên hoặc Máy trạm phòng Lab. Bắt buộc kiểm tra `used_seats + seats_consumed <= allocated_seats`.
   - **Chặn máy hỏng:** Không cho phép cấp phát vào các thiết bị có trạng thái `BROKEN`, `MAINTENANCE`.
   - **Thu hồi Seat (`REVOKED`):** Hoàn trả số lượng seat về lại quỹ của Khoa khi giảng viên nghỉ việc hoặc thiết bị thanh lý.

3. **Tự động hóa Quét hạn sử dụng & Cảnh báo (BR04):**
   - API `/api/cron/check-expirations` cấu hình chạy định kỳ lúc 00:00 hàng ngày qua Vercel Cron (`vercel.json`).
   - Tự động chuyển trạng thái `EXPIRING_SOON` khi còn `<= 30 ngày` và `EXPIRED` khi `<= 0 ngày`.
   - Tự động khóa cấp phát mới khi gói bản quyền đã hết hạn.

4. **Quy trình Gia hạn Bản quyền (Renewal):**
   - Lưu vết lịch sử `old_expiry_date` và chi phí vào bảng `RENEWAL_HISTORIES`.
   - Cập nhật hạn mới và tự động mở khóa trạng thái gói bản quyền về lại `ACTIVE`.

5. **Luồng Phiếu Đề xuất & Phê duyệt:**
   - Đại diện khoa (`DEPT_REP`) lập phiếu xin cấp mới, gia hạn hoặc bổ sung seat.
   - Quản lý CNTT (`IT_MANAGER`) đối chiếu tồn kho để Duyệt (`APPROVED`) hoặc Từ chối (`REJECTED`) kèm lý do giải trình.

6. **Dashboard Báo cáo Thống kê & Nhật ký Kiểm toán:**
   - 4 Thẻ KPI: Tổng ngân sách đầu tư, Tổng seat toàn trường, Tỷ lệ lấp đầy thực tế, Cảnh báo hạn dùng.
   - Biểu đồ tiến độ sử dụng seat của từng Khoa (CNTT, Kinh tế, Ngoại ngữ).
   - Cơ cấu chi phí đầu tư theo Nhà cung cấp (Microsoft, JetBrains, Adobe).
   - Tra cứu dòng sự kiện kiểm toán bảo mật bất biến (Audit Trail).

---

## 3. Kiến trúc Cơ sở Dữ liệu (13 Bảng Cốt lõi)

Hệ thống được thiết kế theo chuẩn 3NF trên **Microsoft SQL Server** quản lý qua **Prisma ORM**:

1. `roles`: Vai trò người dùng (`ADMIN`, `IT_MANAGER`, `IT_STAFF`, `DEPT_REP`).
2. `departments`: Khoa / Ban / Phòng chức năng (`CNTT`, `KT`, `NN`).
3. `users`: Tài khoản người dùng trong trường đại học.
4. `devices`: Máy tính / Máy trạm phòng Lab của các khoa.
5. `vendors`: Nhà cung cấp bản quyền (Microsoft, JetBrains, Adobe).
6. `softwares`: Danh mục phần mềm cần quản lý bản quyền.
7. `contracts`: Hợp đồng mua sắm bản quyền ký kết với nhà cung cấp.
8. `license_pools`: Kho gói bản quyền tổng của trường (chứa key mã hóa AES-256).
9. `department_allocations`: Phân bổ Cấp 1 (Kho tổng -> Quỹ Khoa).
10. `license_assignments`: Phân bổ Cấp 2 (Quỹ Khoa -> Giảng viên / Máy Lab).
11. `license_requests`: Phiếu đề xuất bản quyền từ Khoa gửi Quản lý CNTT.
12. `renewal_histories`: Lịch sử các kỳ gia hạn bản quyền.
13. `audit_alert_logs`: Nhật ký kiểm toán an toàn thông tin & cảnh báo tự động.

---

## 4. Hướng dẫn Cài đặt & Chạy Thử nghiệm

### Yêu cầu hệ thống:
- Node.js version 18 trở lên (đã kiểm thử mượt mà trên Node v22.22).
- Microsoft SQL Server (Local hoặc Cloud Serverless).

### Bước 1: Cấu hình biến môi trường
Sao chép tập tin `.env.example` thành `.env` và cập nhật chuỗi kết nối SQL Server của bạn:
```env
DATABASE_URL="sqlserver://localhost:1433;database=salm_db;user=sa;password=YourPassword123;encrypt=true;trustServerCertificate=true"
AES_SECRET_KEY="salm_aes_secret_key_32_chars!!"
JWT_SECRET="salm_jwt_super_secret_key_2026_graduation_thesis"
```

### Bước 2: Đồng bộ cấu trúc bảng vào SQL Server
```powershell
npm run prisma:push
```

### Bước 3: Nạp dữ liệu mẫu Tiếng Việt
Khởi tạo sẵn 4 vai trò, 3 khoa, 5 tài khoản mẫu, 5 máy trạm phòng Lab A301, 3 nhà cung cấp, và 4 gói bản quyền có các mốc hạn dùng khác nhau:
```powershell
npm run seed
```

### Bước 4: Khởi chạy máy chủ Web & API
```powershell
npm run dev
```
Mở trình duyệt truy cập: **`http://localhost:5000`** để sử dụng toàn bộ hệ thống!

---

## 5. Triển khai lên Vercel (Production)
Dự án được cấu hình sẵn sàng chạy dưới dạng **Serverless Functions** trên Vercel:
1. Đẩy mã nguồn lên GitHub.
2. Đăng nhập Vercel và Import Repository.
3. Cấu hình các biến môi trường (`DATABASE_URL`, `AES_SECRET_KEY`, `JWT_SECRET`) trong mục **Project Settings -> Environment Variables**.
4. Tập tin `vercel.json` sẽ tự động kích hoạt Vercel Cron Job quét hạn mỗi ngày vào lúc 00:00 UTC (`0 0 * * *`).
