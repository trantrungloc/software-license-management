/**
 * ==============================================================================
 * CONTROLLER: QUẢN LÝ PHIẾU ĐỀ XUẤT BẢN QUYỀN (LICENSE_REQUESTS)
 * Luồng phê duyệt giữa Đại diện phòng ban (DEPT_REP) và Quản lý CNTT (IT_MANAGER)
 * ==============================================================================
 */

const prisma = require('../lib/prisma');

/**
 * 1. LẤY DANH SÁCH PHIẾU ĐỀ XUẤT (GET /api/requests)
 */
async function getRequests(req, res, next) {
  try {
    const { status, department_id, request_type } = req.query;

    const where = {};
    if (status) where.status = status;
    if (department_id) where.department_id = department_id;
    if (request_type) where.request_type = request_type;

    const requests = await prisma.licenseRequest.findMany({
      where,
      include: {
        department: true,
        software: true,
        requester: {
          select: { user_id: true, full_name: true, email: true }
        },
        approver: {
          select: { user_id: true, full_name: true, email: true }
        }
      },
      orderBy: { created_at: 'desc' }
    });

    return res.status(200).json({
      success: true,
      count: requests.length,
      data: requests
    });
  } catch (error) {
    next(error);
  }
}

/**
 * 2. TẠO MỚI PHIẾU ĐỀ XUẤT (POST /api/requests)
 */
async function createRequest(req, res, next) {
  try {
    const { department_id, software_id, requested_by, request_type, requested_seats, purpose } = req.body;

    if (!department_id) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn Khoa / Phòng ban đề xuất.' });
    }
    if (!software_id) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn phần mềm cần đề xuất.' });
    }

    const validTypes = ['NEW', 'RENEWAL', 'ADD_SEATS'];
    if (!validTypes.includes(request_type)) {
      return res.status(400).json({ success: false, message: "Loại đề xuất (request_type) phải là 'NEW' (Mua mới), 'RENEWAL' (Gia hạn), hoặc 'ADD_SEATS' (Thêm seat)." });
    }

    const seatsNumber = parseInt(requested_seats, 10);
    if (isNaN(seatsNumber) || seatsNumber <= 0) {
      return res.status(400).json({ success: false, message: 'Số lượng seat đề xuất phải là số nguyên dương lớn hơn 0.' });
    }

    // Kiểm tra khoa tồn tại
    const department = await prisma.department.findUnique({
      where: { department_id }
    });
    if (!department) {
      return res.status(404).json({ success: false, message: 'Khoa / Phòng ban không tồn tại.' });
    }

    // Kiểm tra phần mềm tồn tại
    const software = await prisma.software.findUnique({
      where: { software_id }
    });
    if (!software) {
      return res.status(404).json({ success: false, message: 'Phần mềm không tồn tại trong hệ thống.' });
    }

    // Xác định người đề xuất (nếu không truyền, lấy trưởng khoa hoặc user đại diện)
    let requesterId = requested_by;
    if (!requesterId) {
      if (department.manager_user_id) {
        requesterId = department.manager_user_id;
      } else {
        const deptUser = await prisma.user.findFirst({
          where: { department_id }
        });
        if (deptUser) {
          requesterId = deptUser.user_id;
        } else {
          const fallbackUser = await prisma.user.findFirst({
            where: { role: { role_code: { in: ['DEPT_REP', 'ADMIN', 'IT_STAFF'] } } }
          });
          if (fallbackUser) requesterId = fallbackUser.user_id;
        }
      }
    }

    if (!requesterId) {
      return res.status(400).json({ success: false, message: 'Cần xác định tài khoản người lập đề xuất (requested_by).' });
    }

    // Tạo phiếu đề xuất mới ở trạng thái PENDING
    const newRequest = await prisma.licenseRequest.create({
      data: {
        department_id,
        software_id,
        requested_by: requesterId,
        request_type,
        requested_seats: seatsNumber,
        purpose: purpose ? purpose.trim() : 'Phục vụ công tác giảng dạy & nghiên cứu',
        status: 'PENDING'
      },
      include: {
        department: true,
        software: true,
        requester: {
          select: { user_id: true, full_name: true, email: true }
        }
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Lập phiếu đề xuất bản quyền thành công. Phiếu đang ở trạng thái Chờ Quản lý CNTT phê duyệt.',
      data: newRequest
    });
  } catch (error) {
    next(error);
  }
}

/**
 * 3. PHÊ DUYỆT PHIẾU ĐỀ XUẤT (POST /api/requests/:id/approve)
 */
async function approveRequest(req, res, next) {
  try {
    const { id } = req.params;
    const { approved_by, notes } = req.body;

    const request = await prisma.licenseRequest.findUnique({
      where: { request_id: id },
      include: {
        department: true,
        software: true
      }
    });

    if (!request) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy phiếu đề xuất.' });
    }

    if (request.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        message: `Phiếu đề xuất này đã được xử lý trước đó (Trạng thái hiện tại: ${request.status}).`
      });
    }

    // Xác định người duyệt (nếu không truyền, lấy user IT_MANAGER mẫu)
    let approverId = approved_by;
    if (!approverId) {
      const itManager = await prisma.user.findFirst({
        where: { role: { role_code: 'IT_MANAGER' } }
      });
      if (itManager) approverId = itManager.user_id;
    }

    const updatedRequest = await prisma.$transaction(async (tx) => {
      // Cập nhật trạng thái phiếu
      const updated = await tx.licenseRequest.update({
        where: { request_id: id },
        data: {
          status: 'APPROVED',
          approved_by: approverId
        },
        include: {
          department: true,
          software: true,
          approver: {
            select: { full_name: true, email: true }
          }
        }
      });

      // Ghi vết vào AUDIT_ALERT_LOGS
      await tx.auditAlertLog.create({
        data: {
          license_id: null,
          user_id: approverId || null,
          action_type: 'APPROVE_REQUEST',
          description: `Phê duyệt Đề xuất: Quản lý CNTT đã duyệt phiếu [Mã: ${request.request_id.slice(0, 8)}] của [${request.department.department_name}] xin cấp ${request.requested_seats} seats phần mềm [${request.software.software_name}]. Ghi chú: ${notes || 'Chấp thuận cấp phép'}`
        }
      });

      // Nếu là đề xuất gia hạn (RENEWAL), tạo Hợp đồng mua sắm/gia hạn đã ký kết để mở khóa quyền gia hạn
      if (request.request_type === 'RENEWAL') {
        const existingContract = await tx.contract.findFirst({
          where: { request_id: request.request_id }
        });
        if (!existingContract) {
          const pool = await tx.licensePool.findFirst({
            where: { software_id: request.software_id },
            include: { contract: true }
          });
          let vendorId = pool?.contract?.vendor_id;
          if (!vendorId) {
            const anyVendor = await tx.vendor.findFirst();
            vendorId = anyVendor ? anyVendor.vendor_id : null;
          }
          if (vendorId) {
            const contractNumber = `HD-GH-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
            await tx.contract.create({
              data: {
                contract_number: contractNumber,
                vendor_id: vendorId,
                request_id: request.request_id,
                signed_date: new Date(),
                total_cost: 25000000
              }
            });
          }
        }
      }

      return updated;
    });

    return res.status(200).json({
      success: true,
      message: `Đã phê duyệt đề xuất cấp ${request.requested_seats} seats phần mềm ${request.software.software_name} cho ${request.department.department_name}.`,
      data: updatedRequest
    });
  } catch (error) {
    next(error);
  }
}

/**
 * 4. TỪ CHỐI PHIẾU ĐỀ XUẤT (POST /api/requests/:id/reject)
 */
async function rejectRequest(req, res, next) {
  try {
    const { id } = req.params;
    const { approved_by, rejection_reason } = req.body;

    if (!rejection_reason || !rejection_reason.trim()) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp lý do từ chối đề xuất để giải trình rõ ràng cho Khoa.' });
    }

    const request = await prisma.licenseRequest.findUnique({
      where: { request_id: id },
      include: {
        department: true,
        software: true
      }
    });

    if (!request) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy phiếu đề xuất.' });
    }

    if (request.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        message: `Phiếu đề xuất này đã được xử lý trước đó (Trạng thái hiện tại: ${request.status}).`
      });
    }

    // Xác định người từ chối
    let approverId = approved_by;
    if (!approverId) {
      const itManager = await prisma.user.findFirst({
        where: { role: { role_code: 'IT_MANAGER' } }
      });
      if (itManager) approverId = itManager.user_id;
    }

    const updatedRequest = await prisma.$transaction(async (tx) => {
      // Cập nhật trạng thái phiếu và ghi nhận lý do từ chối
      const updated = await tx.licenseRequest.update({
        where: { request_id: id },
        data: {
          status: 'REJECTED',
          approved_by: approverId,
          purpose: `${request.purpose} [TỪ CHỐI: ${rejection_reason.trim()}]`
        },
        include: {
          department: true,
          software: true,
          approver: {
            select: { full_name: true, email: true }
          }
        }
      });

      // Ghi vết vào AUDIT_ALERT_LOGS
      await tx.auditAlertLog.create({
        data: {
          license_id: null,
          user_id: approverId || null,
          action_type: 'REJECT_REQUEST',
          description: `Từ chối Đề xuất: Quản lý CNTT đã từ chối phiếu [Mã: ${request.request_id.slice(0, 8)}] của [${request.department.department_name}]. Lý do: ${rejection_reason.trim()}`
        }
      });

      return updated;
    });

    return res.status(200).json({
      success: true,
      message: `Đã từ chối đề xuất của ${request.department.department_name}. Lý do đã được lưu vết và thông báo.`,
      data: updatedRequest
    });
  } catch (error) {
    next(error);
  }
}

/**
 * 5. CHI TIẾT 1 PHIẾU ĐỀ XUẤT (GET /api/requests/:id)
 */
async function getRequestById(req, res, next) {
  try {
    const { id } = req.params;

    const request = await prisma.licenseRequest.findUnique({
      where: { request_id: id },
      include: {
        department: true,
        software: true,
        requester: {
          select: { user_id: true, full_name: true, email: true }
        },
        approver: {
          select: { user_id: true, full_name: true, email: true }
        }
      }
    });

    if (!request) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy phiếu đề xuất.' });
    }

    return res.status(200).json({
      success: true,
      data: request
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getRequests,
  createRequest,
  approveRequest,
  rejectRequest,
  getRequestById
};
