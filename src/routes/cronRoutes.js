/**
 * ==============================================================================
 * ROUTES: /api/cron
 * Được gọi tự động bởi Vercel Cron Job (00:00 hàng ngày) hoặc gọi thủ công
 * ==============================================================================
 */

const express = require('express');
const router = express.Router();
const cronController = require('../controllers/cronController');

// Quét và cập nhật trạng thái hạn dùng bản quyền (EXPIRING_SOON, EXPIRED)
router.get('/check-expirations', cronController.checkExpirations);

module.exports = router;
