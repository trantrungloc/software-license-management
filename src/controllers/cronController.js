/**
 * ==============================================================================
 * CONTROLLER: QUÉT HẠN SỬ DỤNG TỰ ĐỘNG & CẢNH BÁO (CRON JOB CONTROLLER)
 * Tuân thủ quy định trong AGENTS.md:
 * - Không sử dụng node-cron chạy ngầm liên tục (tránh bị tiêu diệt trên Vercel Serverless)
 * - Triển khai dưới dạng API Controller để Vercel Cron tự động gọi hoặc gọi thủ công
 * - Tự động đổi trạng thái EXPIRING_SOON (<= 30 ngày) và EXPIRED (<= 0 ngày)
 * - Tự động ghi vết cảnh báo vào bảng audit_alert_logs
 * ==============================================================================
 */

const prisma = require('../lib/prisma');

/**
 * QUÉT HẠN SỬ DỤNG BẢN QUYỀN TOÀN HỆ THỐNG (GET /api/cron/check-expirations)
 */
async function checkExpirations(req, res, next) {
  try {
    const now = new Date();
    const pools = await prisma.licensePool.findMany({
      include: {
        software: true
      }
    });

    let expiredCount = 0;
    let expiringSoonCount = 0;
    let activeCount = 0;
    const updatedPools = [];

    for (const pool of pools) {
      const expiryDate = new Date(pool.expiry_date);
      // Tính chênh lệch thời gian theo ngày
      const diffTime = expiryDate.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      // 1. Trường hợp: Đã quá hạn (diffDays <= 0)
      if (diffDays <= 0) {
        if (pool.status !== 'EXPIRED') {
          await prisma.$transaction(async (tx) => {
            await tx.licensePool.update({
              where: { license_id: pool.license_id },
              data: { status: 'EXPIRED' }
            });

            await tx.auditAlertLog.create({
              data: {
                license_id: pool.license_id,
                action_type: 'EXPIRED_ALERT',
                description: `Cảnh báo Quá hạn: Gói bản quyền [${pool.software.software_name}] (Mã: ${pool.license_id.slice(0, 8)}) đã quá hạn vào ngày ${expiryDate.toLocaleDateString('vi-VN')}. Hệ thống đã tự động chuyển sang trạng thái EXPIRED và khóa phân bổ/cấp phát mới theo quy định BR04.`
              }
            });
          });

          expiredCount++;
          updatedPools.push({
            license_id: pool.license_id,
            software_name: pool.software.software_name,
            old_status: pool.status,
            new_status: 'EXPIRED',
            diff_days: diffDays
          });
        }
      }
      // 2. Trường hợp: Sắp hết hạn trong vòng 30 ngày (0 < diffDays <= 30)
      else if (diffDays <= 30) {
        if (pool.status !== 'EXPIRING_SOON') {
          await prisma.$transaction(async (tx) => {
            await tx.licensePool.update({
              where: { license_id: pool.license_id },
              data: { status: 'EXPIRING_SOON' }
            });

            await tx.auditAlertLog.create({
              data: {
                license_id: pool.license_id,
                action_type: 'EXPIRING_ALERT',
                description: `Cảnh báo Sắp hết hạn: Gói bản quyền [${pool.software.software_name}] (Mã: ${pool.license_id.slice(0, 8)}) chỉ còn lại ${diffDays} ngày (hết hạn ngày ${expiryDate.toLocaleDateString('vi-VN')}). Cần lên kế hoạch gia hạn hợp đồng.`
              }
            });
          });

          expiringSoonCount++;
          updatedPools.push({
            license_id: pool.license_id,
            software_name: pool.software.software_name,
            old_status: pool.status,
            new_status: 'EXPIRING_SOON',
            diff_days: diffDays
          });
        }
      }
      // 3. Trường hợp: Còn hạn trên 30 ngày (> 30 ngày)
      else {
        // Nếu trước đó đang bị set nhầm sang EXPIRING_SOON hoặc EXPIRED (ví dụ vừa gia hạn xong)
        if (pool.status === 'EXPIRING_SOON' || pool.status === 'EXPIRED') {
          const newStatus = pool.available_seats === 0 ? 'DEPLETED' : 'ACTIVE';
          await prisma.licensePool.update({
            where: { license_id: pool.license_id },
            data: { status: newStatus }
          });
          activeCount++;
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Đã hoàn tất kiểm tra và cập nhật hạn sử dụng bản quyền toàn hệ thống.',
      summary: {
        total_scanned: pools.length,
        expired_updated: expiredCount,
        expiring_soon_updated: expiringSoonCount,
        active_restored: activeCount,
        timestamp: now
      },
      updated_pools: updatedPools
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  checkExpirations
};
