/**
 * ==============================================================================
 * ROUTES: /api/softwares
 * ==============================================================================
 */

const express = require('express');
const router = express.Router();
const softwareController = require('../controllers/softwareController');

router.get('/', softwareController.getSoftwares);
router.post('/', softwareController.createSoftware);

module.exports = router;
