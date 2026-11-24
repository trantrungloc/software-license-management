const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken } = require('../middlewares/authMiddleware');

// Endpoint đăng nhập công khai
router.post('/login', authController.login);

// Endpoint lấy danh sách tài khoản mẫu để chuyển đổi nhanh
router.get('/quick-accounts', authController.getQuickAccounts);

// Endpoint lấy thông tin người dùng hiện tại (yêu cầu token)
router.get('/me', authenticateToken, authController.getMe);

module.exports = router;
