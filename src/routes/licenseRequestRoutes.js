/**
 * ==============================================================================
 * ROUTES: /api/requests
 * ==============================================================================
 */

const express = require('express');
const router = express.Router();
const requestController = require('../controllers/licenseRequestController');

// Lấy danh sách phiếu đề xuất
router.get('/', requestController.getRequests);

// Tạo mới phiếu đề xuất (DEPT_REP)
router.post('/', requestController.createRequest);

// Xem chi tiết 1 phiếu đề xuất
router.get('/:id', requestController.getRequestById);

// Phê duyệt phiếu đề xuất (IT_MANAGER)
router.post('/:id/approve', requestController.approveRequest);

// Từ chối phiếu đề xuất (IT_MANAGER)
router.post('/:id/reject', requestController.rejectRequest);

module.exports = router;
