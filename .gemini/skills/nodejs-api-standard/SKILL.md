---
name: nodejs-api-standard
description: Quy chuẩn thiết kế RESTful API bằng Express.js/Node.js và quản lý SQL Server Connection Pool (thư viện mssql). Kích hoạt khi viết API endpoints, controller, middleware, xử lý lỗi, hoặc cấu hình kết nối database.
---

# Quy Chuẩn RESTful API & Quản Lý Connection Pool (Node.js + `mssql`)

Tài liệu quy định cấu trúc phản hồi API, thông báo tiếng Việt, và kiến trúc kết nối Database Connection Pool bền bỉ với thư viện `mssql` trên Node.js/Express.js (tương thích Serverless Vercel & Long-running server).

---

## 1. Chuẩn Hóa Cấu Trúc Phản Hồi (Unified API Response)

Mọi API trả về bắt buộc tuân theo định dạng JSON đồng nhất:

### Cấu Trúc Thành Công:
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Lấy danh sách bản quyền thành công.",
  "data": [ ... ],
  "meta": {
    "total": 100,
    "page": 1,
    "limit": 20
  }
}
```

### Cấu Trúc Thất Bại / Lỗi:
```json
{
  "success": false,
  "statusCode": 400,
  "message": "Số lượng seat yêu cầu vượt quá hạn mức khả dụng của gói.",
  "data": null,
  "errors": [
    {
      "field": "allocated_seats",
      "message": "Giá trị phải nhỏ hơn hoặc bằng 25."
    }
  ]
}
```

### Response Helper Mẫu (`src/utils/responseHelper.js`):
```javascript
const sendSuccess = (res, data = null, message = 'Thao tác thành công.', statusCode = 200, meta = null) => {
  const response = {
    success: true,
    statusCode,
    message,
    data
  };
  if (meta) response.meta = meta;
  return res.status(statusCode).json(response);
};

const sendError = (res, message = 'Đã có lỗi xảy ra.', statusCode = 500, errors = null) => {
  return res.status(statusCode).json({
    success: false,
    statusCode,
    message,
    data: null,
    errors
  });
};

module.exports = { sendSuccess, sendError };
```

---

## 2. Quản Lý Connection Pool Bền Vững Với Thư Viện `mssql`

### Lỗi Phổ Biến Cần Tránh
Tuyệt đối **KHÔNG** gọi `sql.connect(config)` hoặc `new sql.ConnectionPool()` bên trong từng Request Handler / Controller. Việc mở kết nối mới mỗi request sẽ làm cạn kiệt tài nguyên (`ConnectionError: Resource pool exhausted`) và gây rò rỉ bộ nhớ.

### Kiến Trúc Singleton Pool Pattern (`src/config/db.js`)
Khởi tạo và quản lý duy nhất 1 Connection Pool instance tái sử dụng xuyên suốt ứng dụng:

```javascript
const sql = require('mssql');

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT || '1433', 10),
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true', // Bật nếu dùng Azure SQL Server
    trustServerCertificate: process.env.DB_TRUST_CERT !== 'false', // Môi trường Dev/Local
    enableArithAbort: true
  },
  pool: {
    max: 15,                   // Số kết nối tối đa
    min: 0,                    // Số kết nối nhàn rỗi tối thiểu
    idleTimeoutMillis: 30000,  // Giải phóng kết nối rỗi sau 30 giây (tối ưu Serverless)
    acquireTimeoutMillis: 15000 // Chờ tối đa 15s để lấy kết nối trước khi báo lỗi
  }
};

let poolPromise = null;

const getPool = async () => {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(dbConfig)
      .connect()
      .then(pool => {
        console.log('✅ Đã kết nối thành công tới SQL Server Connection Pool');
        pool.on('error', err => {
          console.error('❌ Lỗi Database Pool đột ngột:', err);
          poolPromise = null; // Đặt lại null để yêu cầu sau kích hoạt kết nối lại
        });
        return pool;
      })
      .catch(err => {
        console.error('❌ Không thể khởi tạo SQL Server Pool:', err.message);
        poolPromise = null;
        throw err;
      });
  }
  return poolPromise;
};

module.exports = {
  sql,
  getPool
};
```

---

## 3. Cách Viết Controller Chuẩn An Toàn & Bảo Mật

```javascript
const { getPool, sql } = require('../config/db');
const { sendSuccess, sendError } = require('../utils/responseHelper');

const getLicensePools = async (req, res, next) => {
  try {
    const pool = await getPool();
    
    // Luôn sử dụng Parameterized Inputs để triệt tiêu SQL Injection
    const result = await pool.request()
      .input('status', sql.NVarChar(20), req.query.status || 'ACTIVE')
      .query(`
        SELECT 
          lp.license_id,
          s.software_name,
          lp.license_type,
          -- Che License Key theo quy tắc BR03 của dự án
          CONCAT(SUBSTRING(lp.license_key_encrypted, 1, 4), '-****-****-', RIGHT(lp.license_key_encrypted, 4)) AS masked_key,
          lp.total_seats,
          lp.available_seats,
          lp.expiry_date,
          lp.status
        FROM license_pools lp
        INNER JOIN softwares s ON lp.software_id = s.software_id
        WHERE lp.status = @status
        ORDER BY lp.expiry_date ASC;
      `);

    return sendSuccess(res, result.recordset, 'Lấy danh sách gói bản quyền thành công.');
  } catch (error) {
    next(error);
  }
};

module.exports = { getLicensePools };
```

---

## 4. Xử Lý Lỗi Toàn Cục (Global Error Handling Middleware)

Tất cả các lỗi bất ngờ (Database, validation, cú pháp) đều chuyển qua Global Error Handler và phản hồi Tiếng Việt lịch sự:

```javascript
const errorHandler = (err, req, res, next) => {
  console.error('💥 Lỗi Server:', err);

  const statusCode = err.statusCode || 500;
  const message = err.isOperational 
    ? err.message 
    : 'Hệ thống đang gặp sự cố nội bộ. Vui lòng thử lại sau hoặc liên hệ quản trị viên.';

  return res.status(statusCode).json({
    success: false,
    statusCode,
    message,
    data: null,
    errors: process.env.NODE_ENV === 'development' ? err.stack : null
  });
};

module.exports = errorHandler;
```
