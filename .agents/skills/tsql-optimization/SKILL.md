---
name: tsql-optimization
description: Quy chuẩn viết câu lệnh T-SQL và thiết kế cơ sở dữ liệu tối ưu cho Microsoft SQL Server / SSMS. Sử dụng khi thiết kế bảng, viết câu lệnh DDL/DML, đánh chỉ mục (Index), viết Stored Procedure, Transaction, hoặc tối ưu hóa truy vấn.
---

# Quy Chuẩn T-SQL & Tối Ưu Hóa SQL Server (SSMS)

Tài liệu quy định bắt buộc khi viết T-SQL, Stored Procedure, quản lý Transaction và đánh chỉ mục (Indexing) cho SQL Server.

---

## 1. Hỗ Trợ Unicode & Chuỗi Tiếng Việt

- **Kiểu dữ liệu:** Bắt buộc sử dụng `NVARCHAR(n)` hoặc `NVARCHAR(MAX)` cho tất cả các trường chứa ký tự tiếng Việt (họ tên, tên phòng ban, chức vụ, ghi chú, nội dung mô tả). Tuyệt đối không dùng `VARCHAR` vì sẽ gây lỗi bảng mã hoặc mất dấu.
- **Tiền tố Unicode `N`:** Mọi chuỗi ký tự tiếng Việt khi gán biến, so sánh trong `WHERE`, hoặc `INSERT`/`UPDATE` đều **bắt buộc** phải có tiền tố `N'...'`.
  ```sql
  -- ĐÚNG:
  SELECT * FROM users WHERE full_name = N'Nguyễn Văn A';
  UPDATE departments SET department_name = N'Khoa Công Nghệ Thông Tin' WHERE department_id = 1;

  -- SAI (sẽ làm mất dấu hoặc chuyển thành ký tự ?):
  SELECT * FROM users WHERE full_name = 'Nguyễn Văn A';
  ```

---

## 2. Chiến Lược Đánh Chỉ Mục (Index)

Mục tiêu: Đảm bảo thời gian phản hồi mili-giây cho các truy vấn phức tạp và phép `JOIN`.

1. **Khóa ngoại (Foreign Keys):** Mọi cột tham chiếu khóa ngoại bắt buộc phải có Non-clustered Index để tối ưu thao tác `JOIN` và tránh Table Scan.
2. **Quy tắc đặt tên Index:**
   - Khóa chính: `PK_<TableName>` (thường là Clustered Index tự sinh).
   - Chỉ mục thông thường: `IX_<TableName>_<ColumnName(s)>`.
   - Chỉ mục duy nhất: `UQ_<TableName>_<ColumnName>`.
3. **Cột lọc thường xuyên:** Đánh chỉ mục cho các cột lọc trạng thái hoặc khoảng ngày (`status`, `expiry_date`, `allocated_date`).
4. **Cú pháp mẫu:**
   ```sql
   -- Index cho khóa ngoại
   CREATE NONCLUSTERED INDEX IX_license_assignments_allocation_id
   ON license_assignments(allocation_id);

   -- Composite Index cho các truy vấn lọc kép kèm INCLUDE cột thường SELECT
   CREATE NONCLUSTERED INDEX IX_license_pools_status_expiry
   ON license_pools(status, expiry_date)
   INCLUDE (software_id, available_seats);
   ```

---

## 3. Khuôn Mẫu Stored Procedure Chuẩn Production

Mọi Stored Procedure có nghiệp vụ thay đổi dữ liệu (INSERT, UPDATE, DELETE) hoặc liên quan nhiều bảng bắt buộc tuân theo khuôn mẫu:

```sql
CREATE OR ALTER PROCEDURE dbo.usp_AllocateLicenseToDepartment
    @LicenseId INT,
    @DepartmentId INT,
    @RequestId INT,
    @AllocatedSeats INT,
    @NewAllocationId INT OUTPUT
AS
BEGIN
    -- 1. Bật NOCOUNT để giảm băng thông mạng và ngăn đếm dòng ảnh hưởng caller
    SET NOCOUNT ON;
    SET XACT_ABORT ON; -- Tự động rollback khi gặp run-time error cấp độ cao

    -- 2. Khối TRY...CATCH & TRANSACTION
    BEGIN TRY
        BEGIN TRANSACTION;

        -- Kiểm tra điều kiện nghiệp vụ (VD: BR01 - Bảo toàn hạn mức)
        DECLARE @CurrentAvailable INT;
        SELECT @CurrentAvailable = available_seats
        FROM license_pools WITH (UPDLOCK, ROWLOCK)
        WHERE license_id = @LicenseId AND status = 'ACTIVE';

        IF @CurrentAvailable IS NULL OR @CurrentAvailable < @AllocatedSeats
        BEGIN
            THROW 50001, N'Hạn mức khả dụng của gói bản quyền không đủ để phân bổ.', 1;
        END

        -- Trừ hạn mức pool
        UPDATE license_pools
        SET available_seats = available_seats - @AllocatedSeats
        WHERE license_id = @LicenseId;

        -- Tạo bản ghi phân bổ phòng ban
        INSERT INTO department_allocations (
            license_id, department_id, request_id, 
            allocated_seats, used_seats, allocated_date, status
        )
        VALUES (
            @LicenseId, @DepartmentId, @RequestId, 
            @AllocatedSeats, 0, GETDATE(), 'ACTIVE'
        );

        SET @NewAllocationId = SCOPE_IDENTITY();

        -- Ghi log kiểm toán
        INSERT INTO audit_alert_logs (license_id, action_type, description, created_at)
        VALUES (@LicenseId, 'ALLOCATE_SEATS', N'Đã phân bổ ' + CAST(@AllocatedSeats AS NVARCHAR(10)) + N' seats cho phòng ban ' + CAST(@DepartmentId AS NVARCHAR(10)), GETDATE());

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        -- Kiểm tra và rollback an toàn
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        -- Ném lại lỗi nguyên bản kèm mã và ngữ cảnh
        DECLARE @ErrMsg NVARCHAR(4000) = ERROR_MESSAGE();
        DECLARE @ErrSeverity INT = ERROR_SEVERITY();
        DECLARE @ErrState INT = ERROR_STATE();

        RAISERROR(@ErrMsg, @ErrSeverity, @ErrState);
        RETURN -1;
    END CATCH
END;
```

---

## 4. Quy Tắc Tối Ưu Truy Vấn (SARGable Queries) & Bảo Mật

1. **Tuyệt đối không dùng Dynamic SQL ghép chuỗi:**
   - **Cấm:** `SET @sql = 'SELECT * FROM users WHERE email = ''' + @email + ''''`
   - **Bắt buộc:** Dùng `sp_executesql` với tham số hóa (`@params`) để ngăn SQL Injection và tận dụng Execution Plan cache.
2. **Viết điều kiện SARGable (Search Argument Able):**
   - Không bọc function quanh cột index trong `WHERE`:
     ```sql
     -- SAI (Mất hiệu quả index):
     WHERE DATEDIFF(day, expiry_date, GETDATE()) <= 30;

     -- ĐÚNG (Tận dụng được index trên expiry_date):
     WHERE expiry_date <= DATEADD(day, 30, GETDATE()) AND expiry_date >= GETDATE();
     ```
3. **Tránh `SELECT *`:** Luôn chỉ định danh sách cột rõ ràng để giảm I/O và tối ưu bộ nhớ đệm Buffer Cache.
4. **Sử dụng `WITH (NOLOCK)` thận trọng:** Chỉ dùng cho các báo cáo đọc dữ liệu lịch sử không nhạy cảm với dirty read; tuyệt đối không dùng trong các giao dịch trừ hạn mức hoặc quyết định logic tiền tệ/tài nguyên.
