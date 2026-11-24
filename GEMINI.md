# Ngữ cảnh Dự án: Web Full-Stack (Node.js + MS SQL Server)

## 1. Tech Stack cốt lõi
- **Database:** Microsoft SQL Server (quản lý qua SSMS). Sử dụng phương ngữ **T-SQL**.
- **Backend:** Node.js (RESTful API).
- **Frontend:** Web Client kết nối qua REST API.

## 2. Quy tắc bắt buộc với SQL Server (T-SQL)
- **Kiểu dữ liệu tiếng Việt:** BẮT BUỘC dùng `NVARCHAR` (kèm tiền tố `N'...'` khi insert/query) cho mọi trường lưu tên, địa chỉ, mô tả tiếng Việt. Không dùng `VARCHAR` cho chuỗi có dấu.
- **Bảo mật & Hiệu năng:** 
  - Luôn sử dụng Parameterized Queries (`@param` trong gói `mssql` hoặc qua ORM) để chống SQL Injection.
  - Không dùng `OFFSET ... FETCH` hoặc `TOP` thiếu `ORDER BY`.
  - Trước khi viết câu query phức tạp hoặc tạo migration mới, hãy dùng MCP `sqlserver_db` để kiểm tra cấu trúc bảng và ràng buộc khóa ngoại (FK) hiện tại.

## 3. Quy tắc Backend Node.js
- Quản lý kết nối SQL Server thông qua **Singleton Connection Pool** (không khởi tạo kết nối mới trong từng route/controller).
- Mọi thao tác làm thay đổi dữ liệu trên nhiều bảng phải được bọc trong `Transaction` (`BEGIN TRAN` / `COMMIT` / `ROLLBACK`).
- Kiểm tra kỹ lỗi bất đồng bộ (`async/await` bọc trong `try/catch` hoặc middleware xử lý lỗi tập trung).
