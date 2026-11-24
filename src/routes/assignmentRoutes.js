/**
 * ==============================================================================
 * ROUTES: /api/assignments
 * ==============================================================================
 */

const express = require('express');
const router = express.Router();
const assignmentController = require('../controllers/assignmentController');

router.get('/', assignmentController.getAssignments);
router.post('/', assignmentController.createAssignment);
router.post('/:id/revoke', assignmentController.revokeAssignment);

module.exports = router;
