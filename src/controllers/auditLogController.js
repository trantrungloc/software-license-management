/**
 * ==============================================================================
 * CONTROLLER: NHẬT KÝ KIỂM TOÁN AN TOÀN & CẢNH BÁO (AUDIT_ALERT_LOGS)
 * Bảng sự kiện bất biến lưu vết các hành động nhạy cảm:
 * - REVEAL_KEY (Xem khóa bản quyền theo BR03)
 * - ALLOCATE (Phân bổ Cấp 1 theo BR01)
 * - ASSIGN / REVOKE (Cấp phát & Thu hồi Cấp 2 theo BR02)
 * - RENEW (Gia hạn bản quyền)
 * - EXPIRING_ALERT / EXPIRED_ALERT (Cảnh báo quét hạn)
 * - APPROVE_REQUEST / REJECT_REQUEST (Duyệt & Từ chối đề xuất)
 * ==============================================================================
 */

const prisma = require('../lib/prisma');

/**
 * LẤY DANH SÁCH NHẬT KÝ KIỂM TOÁN (GET /api/audit-logs)
 */
async function getAuditLogs(req, res, next) {
  try {
    const { action_type, keyword, limit } = req.query;

    const where = {};
    if (action_type && action_type !== 'ALL') {
      where.action_type = action_type;
    }
    if (keyword && keyword.trim()) {
      where.description = {
        contains: keyword.trim()
      };
    }

    const takeLimit = limit ? parseInt(limit, 10) : 100;

    const logs = await prisma.auditAlertLog.findMany({
      where,
      include: {
        user: {
          select: { user_id: true, full_name: true, email: true, role: { select: { role_name: true } } }
        },
        license_pool: {
          include: {
            software: true
          }
        }
      },
      orderBy: { created_at: 'desc' },
      take: isNaN(takeLimit) ? 100 : takeLimit
    });

    return res.status(200).json({
      success: true,
      count: logs.length,
      data: logs
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getAuditLogs
};
