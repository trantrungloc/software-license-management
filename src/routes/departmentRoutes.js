/**
 * ==============================================================================
 * ROUTES: /api/departments
 * ==============================================================================
 */

const express = require('express');
const router = express.Router();
const departmentController = require('../controllers/departmentController');

router.get('/', departmentController.getDepartments);
router.get('/:id/users', departmentController.getDepartmentMembers);
router.get('/:id/devices', departmentController.getDepartmentDevices);
router.post('/:id/devices', departmentController.createDevice);

module.exports = router;
