/**
 * ==============================================================================
 * ROUTES: /api/allocations
 * ==============================================================================
 */

const express = require('express');
const router = express.Router();
const allocationController = require('../controllers/allocationController');

router.get('/', allocationController.getAllocations);
router.post('/', allocationController.createAllocation);

module.exports = router;
