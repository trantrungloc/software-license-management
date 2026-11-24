/**
 * ==============================================================================
 * ROUTES: /api/contracts
 * ==============================================================================
 */

const express = require('express');
const router = express.Router();
const contractController = require('../controllers/contractController');

// Lấy danh sách hợp đồng
router.get('/', contractController.getContracts);

// Tạo mới hợp đồng
router.post('/', contractController.createContract);

// Ký kết hợp đồng (Chờ ký -> Đã ký)
router.post('/:id/sign', contractController.signContract);

// Lấy chi tiết 1 hợp đồng
router.get('/:id', contractController.getContractById);

module.exports = router;
