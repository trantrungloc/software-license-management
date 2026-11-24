/**
 * ==============================================================================
 * CONTROLLER: DANH MỤC PHẦN MỀM (SOFTWARES)
 * ==============================================================================
 */

const prisma = require('../lib/prisma');

/**
 * LẤY DANH MỤC PHẦN MỀM (GET /api/softwares)
 */
async function getSoftwares(req, res, next) {
  try {
    const softwares = await prisma.software.findMany({
      include: {
        _count: {
          select: {
            license_pools: true,
            license_requests: true
          }
        }
      },
      orderBy: { software_name: 'asc' }
    });

    return res.status(200).json({
      success: true,
      count: softwares.length,
      data: softwares
    });
  } catch (error) {
    next(error);
  }
}

/**
 * THÊM MỚI PHẦN MỀM (POST /api/softwares)
 */
async function createSoftware(req, res, next) {
  try {
    const { software_name, version, platform, is_open_source } = req.body;

    if (!software_name || !version || !platform) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp đầy đủ tên phần mềm, phiên bản và nền tảng.' });
    }

    const software = await prisma.software.create({
      data: {
        software_name: software_name.trim(),
        version: version.trim(),
        platform: platform.trim(),
        is_open_source: Boolean(is_open_source)
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Thêm mới phần mềm thành công.',
      data: software
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getSoftwares,
  createSoftware
};
