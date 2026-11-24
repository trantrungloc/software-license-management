/**
 * ==============================================================================
 * ROUTES: /api/license-pools
 * ==============================================================================
 */

const express = require('express');
const router = express.Router();
const licensePoolController = require('../controllers/licensePoolController');

// Lấy danh sách gói bản quyền (Key đã được che dạng XXXX-****-XXXX)
router.get('/', licensePoolController.getLicensePools);

// Thêm mới gói bản quyền (Tự động mã hóa AES-256)
router.post('/', licensePoolController.createLicensePool);

// Lấy chi tiết 1 gói bản quyền
router.get('/:id', licensePoolController.getLicensePoolById);

// Mở khóa giải mã License Key & BẮT BUỘC ghi vết Audit Alert Log
router.post('/:id/reveal-key', licensePoolController.revealLicenseKey);

// Kiểm tra điều kiện ràng buộc gia hạn (phiếu đề xuất & hợp đồng khả dụng)
router.get('/:id/renewal-check', licensePoolController.checkRenewalPrerequisites);

// Gia hạn gói bản quyền (Lưu old_expiry_date vào renewal_histories, cập nhật hạn mới, chuyển trạng thái về ACTIVE)
router.post('/:id/renew', licensePoolController.renewLicensePool);

// Lấy lịch sử gia hạn của gói bản quyền
router.get('/:id/renewals', licensePoolController.getRenewalHistories);

module.exports = router;
