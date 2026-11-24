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

// Lấy chi tiết 1 hợp đồng
router.get('/:id', contractController.getContractById);

module.exports = router;
