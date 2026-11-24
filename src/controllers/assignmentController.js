/**
 * ==============================================================================
 * CONTROLLER: CẤP PHÁT CHO GIẢNG VIÊN / MÁY TRẠM & THU HỒI SEAT — CẤP 2
 * Tuân thủ nghiêm ngặt các Business Rules:
 * - BR02: Bắt buộc kiểm tra used_seats + seats_consumed <= allocated_seats
 * - BR04: Khóa hết hạn không cho cấp phát mới
 * - Ràng buộc Thiết bị: Máy trạm trạng thái BROKEN hoặc bảo trì không được cấp phát
 * - Thu hồi (REVOKED): Đổi trạng thái, cập nhật revoked_at và hoàn trả seat về quỹ Khoa
 * ==============================================================================
 */

const prisma = require('../lib/prisma');

/**
 * 1. LẤY DANH SÁCH BẢN QUYỀN ĐÃ CẤP PHÁT (GET /api/assignments)
 */
async function getAssignments(req, res, next) {
  try {
    const { allocation_id, department_id, target_type, status } = req.query;

    const where = {};
    if (allocation_id) where.allocation_id = allocation_id;
    if (target_type) where.target_type = target_type;
    if (status) where.status = status;
    if (department_id) {
      where.allocation = { department_id };
    }

    const assignments = await prisma.licenseAssignment.findMany({
      where,
      include: {
        assigned_user: {
          select: { user_id: true, full_name: true, email: true }
        },
        device: {
          select: { device_id: true, device_code: true, device_name: true, room_location: true, status: true }
        },
        allocation: {
          include: {
            department: true,
            license_pool: {
              include: { software: true }
            }
          }
        }
      },
      orderBy: { assigned_at: 'desc' }
    });

    return res.status(200).json({
      success: true,
      count: assignments.length,
      data: assignments
    });
  } catch (error) {
    next(error);
  }
}

/**
 * 2. CẤP PHÁT CHI TIẾT CHO GIẢNG VIÊN HOẶC MÁY TRẠM (POST /api/assignments)
 * - Thực thi qua Database Transaction
 * - Kiểm tra BR02, BR04 và trạng thái thiết bị
 */
async function createAssignment(req, res, next) {
  try {
    const {
      allocation_id,
      target_type, // 'USER' hoặc 'DEVICE'
      assigned_user_id,
      device_id,
      seats_consumed
    } = req.body;

    if (!allocation_id) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn gói phân bổ hạn mức của Khoa.' });
    }
    if (!['USER', 'DEVICE'].includes(target_type)) {
      return res.status(400).json({ success: false, message: "Loại đối tượng cấp phát (target_type) phải là 'USER' (Giảng viên) hoặc 'DEVICE' (Máy trạm)." });
    }

    const seatsToConsume = seats_consumed ? parseInt(seats_consumed, 10) : 1;
    if (isNaN(seatsToConsume) || seatsToConsume <= 0) {
      return res.status(400).json({ success: false, message: 'Số lượng seat tiêu thụ phải là số nguyên dương lớn hơn 0.' });
    }

    if (target_type === 'USER' && !assigned_user_id) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn Giảng viên cần cấp bản quyền.' });
    }
    if (target_type === 'DEVICE' && !device_id) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn Máy trạm phòng Lab cần cấp bản quyền.' });
    }

    // Thực thi Database Transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Kiểm tra hạn mức quỹ khoa (department_allocations)
      const allocation = await tx.departmentAllocation.findUnique({
        where: { allocation_id },
        include: {
          department: true,
          license_pool: {
            include: { software: true }
          }
        }
      });

      if (!allocation) {
        throw new Error('NOT_FOUND_ALLOCATION: Không tìm thấy gói hạn mức của Khoa.');
      }

      // 2. Ràng buộc BR04: Kiểm tra gói bản quyền gốc đã hết hạn chưa
      const now = new Date();
      if (allocation.license_pool.status === 'EXPIRED' || new Date(allocation.license_pool.expiry_date) <= now) {
        throw new Error('EXPIRED_POOL: Gói bản quyền này đã hết hạn sử dụng. Theo quy định BR04, không thể thực hiện cấp phát mới.');
      }

      // 3. Ràng buộc BR02: Bảo toàn hạn mức Cấp 2 (used_seats + seats_consumed <= allocated_seats)
      if (allocation.used_seats + seatsToConsume > allocation.allocated_seats) {
        throw new Error(`INSUFFICIENT_ALLOCATION: Khoa [${allocation.department.department_name}] đã dùng hết hạn mức (${allocation.used_seats}/${allocation.allocated_seats} seats). Không thể cấp phát thêm theo quy định BR02.`);
      }

      let targetInfo = '';

      // 4. Kiểm tra đối tượng Giảng viên
      if (target_type === 'USER') {
        const user = await tx.user.findUnique({
          where: { user_id: assigned_user_id }
        });
        if (!user) {
          throw new Error('NOT_FOUND_USER: Giảng viên được chọn không tồn tại.');
        }
        if (!user.is_active) {
          throw new Error('INACTIVE_USER: Tài khoản giảng viên này hiện đang bị khóa hoặc ngừng công tác.');
        }
        targetInfo = `Giảng viên ${user.full_name} (${user.email})`;
      }

      // 5. Kiểm tra đối tượng Máy trạm
      if (target_type === 'DEVICE') {
        const device = await tx.device.findUnique({
          where: { device_id }
        });
        if (!device) {
          throw new Error('NOT_FOUND_DEVICE: Thiết bị / Máy trạm được chọn không tồn tại.');
        }

        // Ràng buộc Thiết bị: Chặn máy hỏng (BROKEN) hoặc bảo trì
        if (['BROKEN', 'MAINTENANCE', 'DISPOSED'].includes(device.status.toUpperCase())) {
          throw new Error(`INVALID_DEVICE_STATUS: Thiết bị [${device.device_code}] đang ở trạng thái '${device.status}' (Hỏng hoặc Bảo trì). Hệ thống từ chối cấp phát bản quyền.`);
        }
        targetInfo = `Máy trạm [${device.device_code}] - ${device.device_name} (${device.room_location})`;
      }

      // 6. Tạo bản ghi Cấp phát Cấp 2
      const newAssignment = await tx.licenseAssignment.create({
        data: {
          allocation_id,
          target_type,
          assigned_user_id: target_type === 'USER' ? assigned_user_id : null,
          device_id: target_type === 'DEVICE' ? device_id : null,
          seats_consumed: seatsToConsume,
          status: 'ACTIVE',
          assigned_at: new Date()
        },
        include: {
          assigned_user: true,
          device: true,
          allocation: {
            include: {
              department: true,
              license_pool: {
                include: { software: true }
              }
            }
          }
        }
      });

      // 7. Cập nhật used_seats của Quỹ Khoa
      const updatedUsedSeats = allocation.used_seats + seatsToConsume;
      await tx.departmentAllocation.update({
        where: { allocation_id },
        data: { used_seats: updatedUsedSeats }
      });

      // 8. Ghi vết kiểm toán (Audit Log)
      await tx.auditAlertLog.create({
        data: {
          license_id: allocation.license_id,
          action_type: 'ASSIGN',
          description: `Cấp phát Cấp 2: Cấp 1 seat phần mềm [${allocation.license_pool.software.software_name}] cho ${targetInfo}. Khoa ${allocation.department.department_name} đã dùng ${updatedUsedSeats}/${allocation.allocated_seats} seats.`
        }
      });

      return newAssignment;
    });

    return res.status(201).json({
      success: true,
      message: 'Cấp phát bản quyền thành công.',
      data: result
    });
  } catch (error) {
    if (error.message.startsWith('NOT_FOUND')) {
      return res.status(404).json({ success: false, message: error.message.split(': ')[1] });
    }
    if (
      error.message.startsWith('EXPIRED_POOL') ||
      error.message.startsWith('INSUFFICIENT_ALLOCATION') ||
      error.message.startsWith('INVALID_DEVICE_STATUS') ||
      error.message.startsWith('INACTIVE_USER')
    ) {
      return res.status(400).json({ success: false, message: error.message.split(': ')[1] });
    }
    next(error);
  }
}

/**
 * 3. THU HỒI BẢN QUYỀN VÀ HOÀN TRẢ SEAT VỀ QUỸ KHOA (POST /api/assignments/:id/revoke)
 */
async function revokeAssignment(req, res, next) {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Kiểm tra bản ghi cấp phát
      const assignment = await tx.licenseAssignment.findUnique({
        where: { assignment_id: id },
        include: {
          assigned_user: true,
          device: true,
          allocation: {
            include: {
              department: true,
              license_pool: {
                include: { software: true }
              }
            }
          }
        }
      });

      if (!assignment) {
        throw new Error('NOT_FOUND_ASSIGNMENT: Không tìm thấy bản ghi cấp phát cần thu hồi.');
      }

      if (assignment.status === 'REVOKED') {
        throw new Error('ALREADY_REVOKED: Bản quyền này đã được thu hồi trước đó vào ngày ' + new Date(assignment.revoked_at).toLocaleDateString('vi-VN'));
      }

      // 2. Đổi trạng thái sang REVOKED và cập nhật revoked_at
      const now = new Date();
      const updatedAssignment = await tx.licenseAssignment.update({
        where: { assignment_id: id },
        data: {
          status: 'REVOKED',
          revoked_at: now
        },
        include: {
          assigned_user: true,
          device: true
        }
      });

      // 3. Hoàn trả số lượng seat về lại quỹ của Khoa
      const newUsedSeats = Math.max(0, assignment.allocation.used_seats - assignment.seats_consumed);
      await tx.departmentAllocation.update({
        where: { allocation_id: assignment.allocation_id },
        data: { used_seats: newUsedSeats }
      });

      const targetDesc = assignment.target_type === 'USER'
        ? `Giảng viên ${assignment.assigned_user.full_name}`
        : `Máy trạm ${assignment.device.device_code}`;

      // 4. Ghi vết kiểm toán (Audit Log)
      await tx.auditAlertLog.create({
        data: {
          license_id: assignment.allocation.license_id,
          action_type: 'REVOKE',
          description: `Thu hồi Cấp 2: Đã thu hồi ${assignment.seats_consumed} seat phần mềm [${assignment.allocation.license_pool.software.software_name}] từ [${targetDesc}]. Quỹ Khoa ${assignment.allocation.department.department_name} đã hoàn trả seat (còn dùng ${newUsedSeats}/${assignment.allocation.allocated_seats} seats). Lý do: ${reason || 'Không nêu'}`
        }
      });

      return {
        assignment: updatedAssignment,
        refunded_seats: assignment.seats_consumed,
        department_used_seats: newUsedSeats,
        department_allocated_seats: assignment.allocation.allocated_seats
      };
    });

    return res.status(200).json({
      success: true,
      message: `Thu hồi thành công và đã hoàn trả ${result.refunded_seats} seat về quỹ của Khoa.`,
      data: result
    });
  } catch (error) {
    if (error.message.startsWith('NOT_FOUND')) {
      return res.status(404).json({ success: false, message: error.message.split(': ')[1] });
    }
    if (error.message.startsWith('ALREADY_REVOKED')) {
      return res.status(400).json({ success: false, message: error.message.split(': ')[1] });
    }
    next(error);
  }
}

module.exports = {
  getAssignments,
  createAssignment,
  revokeAssignment
};
