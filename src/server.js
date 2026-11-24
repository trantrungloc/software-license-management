/**
 * ==============================================================================
 * APPLICATION SERVER — HỆ THỐNG SALM
 * Express.js Serverless-ready cho Vercel & Phát triển cục bộ
 * ==============================================================================
 */

require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

// Import routes
const licensePoolRoutes = require('./routes/licensePoolRoutes');
const contractRoutes = require('./routes/contractRoutes');
const allocationRoutes = require('./routes/allocationRoutes');
const assignmentRoutes = require('./routes/assignmentRoutes');
const departmentRoutes = require('./routes/departmentRoutes');
const cronRoutes = require('./routes/cronRoutes');
const licenseRequestRoutes = require('./routes/licenseRequestRoutes');
const softwareRoutes = require('./routes/softwareRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const auditLogRoutes = require('./routes/auditLogRoutes');
const authRoutes = require('./routes/authRoutes');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Phục vụ giao diện tĩnh từ thư mục public
app.use(express.static(path.join(__dirname, '../public')));
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Endpoint kiểm tra sức khỏe hệ thống
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    system: 'Hệ thống Quản lý Bản quyền Phần mềm Trường học (SALM)',
    version: '1.0.0',
    timestamp: new Date()
  });
});

// Gắn các API Routes
app.use('/api/auth', authRoutes);
app.use('/api/license-pools', licensePoolRoutes);
app.use('/api/contracts', contractRoutes);
app.use('/api/allocations', allocationRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/cron', cronRoutes);
app.use('/api/requests', licenseRequestRoutes);
app.use('/api/softwares', softwareRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/audit-logs', auditLogRoutes);

// Phục vụ trang chủ cho client-side routing
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Xử lý Route không tìm thấy (404 cho API)
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Đường dẫn API '${req.method} ${req.originalUrl}' không tồn tại trên hệ thống.`
  });
});

// Middleware xử lý lỗi tập trung bằng Tiếng Việt
app.use((err, req, res, next) => {
  console.error('[SALM ERROR]', err);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Đã có lỗi bất ngờ xảy ra trên máy chủ. Vui lòng thử lại sau.';

  res.status(statusCode).json({
    success: false,
    message,
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Khởi chạy server nếu được gọi trực tiếp bằng `node src/server.js`
const PORT = process.env.PORT || 5000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`[SALM] Máy chủ API đang chạy tại: http://localhost:${PORT}`);
    console.log(`[SALM] Giao diện Web Admin: http://localhost:${PORT}`);
    console.log(`====================================================`);
  });
}

module.exports = app;
