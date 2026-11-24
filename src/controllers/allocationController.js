/**
 * ==============================================================================
 * CONTROLLER: PHÂN BỔ HẠN MỨC CHO KHOA (DEPARTMENT_ALLOCATIONS) — CẤP 1
 * Tuân thủ nghiêm ngặt các Business Rules:
 * - BR01: Bắt buộc dùng Database Transaction kiểm tra allocated_seats <= available_seats
 *         rồi mới trừ available_seats kho tổng.
 * - BR04: Khóa hết hạn (status === 'EXPIRED') không cho phép phân bổ mới.
 * ==============================================================================
 */

const prisma = require('../lib/prisma');

/**
 * 1. LẤY DANH SÁCH CÁC KHOẢN PHÂN BỔ (GET /api/allocations)
 */
async function getAllocations(req, res, next) {
  try {
    const { department_id, license_id, status } = req.query;

    const where = {};
    if (department_id) where.department_id = department_id;
    if (license_id) where.license_id = license_id;
    if (status) where.status = status;

    const allocations = await prisma.departmentAllocation.findMany({
      where,
      include: {
        department: true,
        license_pool: {
          include: {
            software: true
          }
        },
        license_assignments: {
          select: {
            assignment_id: true,
            target_type: true,
            status: true,
            seats_consumed: true
          }
        }
      },
      orderBy: { allocated_date: 'desc' }
    });

    return res.status(200).json({
      success: true,
      count: allocations.length,
      data: allocations
    });
  } catch (error) {
    next(error);
  }
}

/**
 * 2. PHÂN BỔ SEATS VỀ CHO KHOA (POST /api/allocations)
 * - Giao dịch Database nguyên tử (Prisma Transaction)
 * - Kiểm tra BR01 & BR04
 */
async function createAllocation(req, res, next) {
  try {
    const { license_id, department_id, allocated_seats, request_id } = req.body;

    if (!license_id || !department_id) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn gói bản quyền và phòng ban cần phân bổ.' });
    }

    const seatsToAllocate = parseInt(allocated_seats, 10);
    if (isNaN(seatsToAllocate) || seatsToAllocate <= 0) {
      return res.status(400).json({ success: false, message: 'Số lượng phân bổ (allocated_seats) phải là số nguyên dương lớn hơn 0.' });
    }

    // Thực thi Database Transaction để đảm bảo tính toàn vẹn và nguyên tử (BR01)
    const result = await prisma.$transaction(async (tx) => {
      // 1. Lấy thông tin gói bản quyền từ kho tổng
      const pool = await tx.licensePool.findUnique({
        where: { license_id },
        include: { software: true }
      });

      if (!pool) {
        throw new Error('NOT_FOUND_POOL: Không tìm thấy gói bản quyền trong kho tổng.');
      }

      // 2. Ràng buộc BR04: Không phân bổ nếu gói đã hết hạn
      const now = new Date();
      if (pool.status === 'EXPIRED' || new Date(pool.expiry_date) <= now) {
        throw new Error('EXPIRED_POOL: Gói bản quyền này đã hết hạn sử dụng. Theo quy định BR04, không thể thực hiện phân bổ mới.');
      }

      // 3. Ràng buộc BR01: Bảo toàn hạn mức Cấp 1 (allocated_seats <= available_seats)
      if (seatsToAllocate > pool.available_seats) {
        throw new Error(`INSUFFICIENT_SEATS: Số lượng yêu cầu phân bổ (${seatsToAllocate} seats) vượt quá số lượng khả dụng trong kho tổng (hiện còn ${pool.available_seats} seats).`);
      }

      // 4. Kiểm tra phòng ban hợp lệ
      const department = await tx.department.findUnique({
        where: { department_id }
      });
      if (!department) {
        throw new Error('NOT_FOUND_DEPT: Khoa / Phòng ban được chọn không tồn tại.');
      }

      // 5. Trừ số lượng seat khả dụng ở kho tổng
      const newAvailableSeats = pool.available_seats - seatsToAllocate;
      await tx.licensePool.update({
        where: { license_id },
        data: {
          available_seats: newAvailableSeats,
          status: newAvailableSeats === 0 ? 'DEPLETED' : pool.status
        }
      });

      // 6. Tạo bản ghi phân bổ cho Khoa
      const allocation = await tx.departmentAllocation.create({
        data: {
          license_id,
          department_id,
          request_id: request_id || null,
          allocated_seats: seatsToAllocate,
          used_seats: 0,
          status: 'ACTIVE'
        },
        include: {
          department: true,
          license_pool: {
            include: { software: true }
          }
        }
      });

      // 7. Ghi vết kiểm toán (Audit Log)
      await tx.auditAlertLog.create({
        data: {
          license_id,
          action_type: 'ALLOCATE',
          description: `Phân bổ Cấp 1: Chuyển ${seatsToAllocate} seats của phần mềm [${pool.software.software_name}] về cho [${department.department_name}]. Kho tổng còn lại ${newAvailableSeats} seats.`
        }
      });

      return allocation;
    });

    return res.status(201).json({
      success: true,
      message: `Phân bổ thành công ${seatsToAllocate} seats cho ${result.department.department_name}.`,
      data: result
    });
  } catch (error) {
    if (error.message.startsWith('NOT_FOUND_POOL') || error.message.startsWith('NOT_FOUND_DEPT')) {
      return res.status(404).json({ success: false, message: error.message.split(': ')[1] });
    }
    if (error.message.startsWith('EXPIRED_POOL') || error.message.startsWith('INSUFFICIENT_SEATS')) {
      return res.status(400).json({ success: false, message: error.message.split(': ')[1] });
    }
    next(error);
  }
}

module.exports = {
  getAllocations,
  createAllocation
};
