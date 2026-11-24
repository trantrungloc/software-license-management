/**
 * ==============================================================================
 * CONTROLLER: QUẢN LÝ KHO BẢN QUYỀN (LICENSE_POOLS)
 * Tuân thủ nghiêm ngặt các Business Rules:
 * - BR01: Bảo toàn hạn mức kho tổng
 * - BR03: Tự động mã hóa AES-256-CBC khi nhập, che key (masking) khi hiển thị,
 *         và BẮT BUỘC ghi vết vào audit_alert_logs khi giải mã (REVEAL_KEY).
 * - BR04: Khóa hết hạn không cấp phát mới
 * ==============================================================================
 */

const prisma = require('../lib/prisma');
const { encryptLicenseKey, decryptLicenseKey, maskLicenseKey } = require('../lib/crypto');

/**
 * 1. TẠO MỚI GÓI BẢN QUYỀN VÀO KHO TỔNG (POST /api/license-pools)
 * - Tự động mã hóa AES-256 license_key gốc
 * - Tự động thiết lập available_seats = total_seats
 * - Che ký tự khi trả về kết quả
 */
async function createLicensePool(req, res, next) {
  try {
    const {
      software_id,
      contract_id,
      license_type,
      license_key,
      total_seats,
      start_date,
      expiry_date,
      status
    } = req.body;

    // Validation cơ bản
    if (!software_id) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn phần mềm cần quản lý.' });
    }
    if (!license_type) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn loại bản quyền (SUBSCRIPTION, PERPETUAL, ACADEMIC).' });
    }
    if (!license_key || typeof license_key !== 'string' || !license_key.trim()) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập License Key hợp lệ.' });
    }
    const seatsNumber = parseInt(total_seats, 10);
    if (isNaN(seatsNumber) || seatsNumber <= 0) {
      return res.status(400).json({ success: false, message: 'Tổng số seat (total_seats) phải là số nguyên dương lớn hơn 0.' });
    }
    if (!start_date || !expiry_date) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp đầy đủ ngày bắt đầu và ngày hết hạn.' });
    }

    const startDateObj = new Date(start_date);
    const expiryDateObj = new Date(expiry_date);

    if (expiryDateObj <= startDateObj) {
      return res.status(400).json({ success: false, message: 'Ngày hết hạn phải sau ngày bắt đầu kích hoạt.' });
    }

    // Kiểm tra phần mềm có tồn tại trong hệ thống
    const software = await prisma.software.findUnique({
      where: { software_id }
    });
    if (!software) {
      return res.status(404).json({ success: false, message: 'Phần mềm không tồn tại trong danh mục hệ thống.' });
    }

    // Kiểm tra hợp đồng nếu có truyền lên
    if (contract_id) {
      const contract = await prisma.contract.findUnique({
        where: { contract_id }
      });
      if (!contract) {
        return res.status(404).json({ success: false, message: 'Hợp đồng liên kết không tồn tại.' });
      }
    }

    // Xác định trạng thái ban đầu: nếu ngày hết hạn đã qua -> EXPIRED, ngược lại dùng status truyền lên hoặc ACTIVE
    let initialStatus = status || 'ACTIVE';
    const now = new Date();
    if (expiryDateObj <= now) {
      initialStatus = 'EXPIRED';
    }

    // Tự động mã hóa License Key bằng AES-256-CBC
    const encryptedKey = encryptLicenseKey(license_key.trim());

    // Lưu vào CSDL
    const newPool = await prisma.licensePool.create({
      data: {
        software_id,
        contract_id: contract_id || null,
        license_type,
        license_key_encrypted: encryptedKey,
        total_seats: seatsNumber,
        available_seats: seatsNumber, // Quy tắc: available_seats ban đầu bằng total_seats
        start_date: startDateObj,
        expiry_date: expiryDateObj,
        status: initialStatus
      },
      include: {
        software: true,
        contract: {
          include: { vendor: true }
        }
      }
    });

    // Chuẩn bị dữ liệu trả về: che ký tự key, KHÔNG trả về license_key_encrypted
    const responseData = {
      ...newPool,
      license_key_masked: maskLicenseKey(license_key.trim())
    };
    delete responseData.license_key_encrypted;

    return res.status(201).json({
      success: true,
      message: 'Thêm mới gói bản quyền vào Kho tổng thành công.',
      data: responseData
    });
  } catch (error) {
    next(error);
  }
}

/**
 * 2. LẤY DANH SÁCH GÓI BẢN QUYỀN (GET /api/license-pools)
 * - Tuyệt đối không trả về chuỗi key giải mã hoặc chuỗi thô
 * - Chỉ trả về chuỗi đã che ký tự (Masking: XXXX-****-XXXX)
 */
async function getLicensePools(req, res, next) {
  try {
    const { status, software_id, license_type } = req.query;

    const where = {};
    if (status) where.status = status;
    if (software_id) where.software_id = software_id;
    if (license_type) where.license_type = license_type;

    const pools = await prisma.licensePool.findMany({
      where,
      include: {
        software: true,
        contract: {
          include: { vendor: true }
        },
        department_allocations: {
          select: {
            allocation_id: true,
            department_id: true,
            allocated_seats: true,
            used_seats: true,
            status: true
          }
        }
      },
      orderBy: { expiry_date: 'asc' }
    });

    // Định dạng dữ liệu và che ký tự khóa bản quyền
    const formattedPools = pools.map((pool) => {
      let maskedKey = '****-****-****-****';
      try {
        const decrypted = decryptLicenseKey(pool.license_key_encrypted);
        maskedKey = maskLicenseKey(decrypted);
      } catch (e) {
        maskedKey = 'CHƯA-MÃ-HÓA-HOẶC-LỖI';
      }

      const copy = {
        ...pool,
        license_key_masked: maskedKey
      };
      // Xóa trường key mã hóa thô để bảo mật tuyệt đối
      delete copy.license_key_encrypted;
      return copy;
    });

    return res.status(200).json({
      success: true,
      count: formattedPools.length,
      data: formattedPools
    });
  } catch (error) {
    next(error);
  }
}

/**
 * 3. LẤY CHI TIẾT 1 GÓI BẢN QUYỀN (GET /api/license-pools/:id)
 * - Cũng chỉ trả về chuỗi đã che dạng XXXX-****-XXXX
 */
async function getLicensePoolById(req, res, next) {
  try {
    const { id } = req.params;

    const pool = await prisma.licensePool.findUnique({
      where: { license_id: id },
      include: {
        software: true,
        contract: {
          include: { vendor: true }
        },
        department_allocations: {
          include: {
            department: true
          }
        }
      }
    });

    if (!pool) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy gói bản quyền với mã đã cung cấp.' });
    }

    let maskedKey = '****-****-****-****';
    try {
      const decrypted = decryptLicenseKey(pool.license_key_encrypted);
      maskedKey = maskLicenseKey(decrypted);
    } catch (e) {
      maskedKey = 'LỖI-GIẢI-MÃ-KEY';
    }

    const responseData = {
      ...pool,
      license_key_masked: maskedKey
    };
    delete responseData.license_key_encrypted;

    return res.status(200).json({
      success: true,
      data: responseData
    });
  } catch (error) {
    next(error);
  }
}

/**
 * 4. MỞ KHÓA GIẢI MÃ XEM LICENSE KEY & GHI VẾT AUDIT LOG (POST /api/license-pools/:id/reveal-key)
 * - Tuân thủ BR03: Giải mã key VÀ BẮT BUỘC ghi 1 bản ghi vào audit_alert_logs
 */
async function revealLicenseKey(req, res, next) {
  try {
    const { id } = req.params;
    const { user_id, reason } = req.body;

    const pool = await prisma.licensePool.findUnique({
      where: { license_id: id },
      include: {
        software: true
      }
    });

    if (!pool) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy gói bản quyền cần xem khóa.' });
    }

    // 1. Giải mã khóa bản quyền gốc
    let rawLicenseKey;
    try {
      rawLicenseKey = decryptLicenseKey(pool.license_key_encrypted);
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Lỗi khi giải mã khóa bản quyền: ' + err.message });
    }

    // 2. Tìm thông tin người dùng nếu có truyền user_id
    let userName = 'Không xác định';
    if (user_id) {
      const user = await prisma.user.findUnique({
        where: { user_id }
      });
      if (user) {
        userName = `${user.full_name} (${user.email})`;
      }
    }

    const logDescription = `Người dùng [${userName}] đã yêu cầu giải mã xem License Key của phần mềm [${pool.software.software_name}] (Gói ID: ${pool.license_id}). Lý do: ${reason || 'Không nêu'}`;

    // 3. BẮT BUỘC ghi vết kiểm toán vào bảng AUDIT_ALERT_LOGS
    await prisma.auditAlertLog.create({
      data: {
        license_id: pool.license_id,
        user_id: user_id || null,
        action_type: 'REVEAL_KEY',
        description: logDescription
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Đã giải mã License Key thành công và ghi nhận nhật ký kiểm toán.',
      data: {
        license_id: pool.license_id,
        software_name: pool.software.software_name,
        license_key: rawLicenseKey,
        revealed_at: new Date()
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * 5. KIỂM TRA ĐIỀU KIỆN RÀNG BUỘC GIA HẠN (GET /api/license-pools/:id/renewal-check)
 * - Kiểm tra xem gói bản quyền đã có phiếu yêu cầu gia hạn PENDING chưa
 * - Kiểm tra danh sách hợp đồng mua sắm/gia hạn mới đã ký kết khả dụng
 */
async function checkRenewalPrerequisites(req, res, next) {
  try {
    const { id } = req.params;

    const pool = await prisma.licensePool.findUnique({
      where: { license_id: id },
      include: {
        software: true,
        contract: {
          include: { vendor: true }
        }
      }
    });

    if (!pool) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy gói bản quyền.' });
    }

    // 1. Tìm các phiếu đề xuất gia hạn của phần mềm này
    const pendingRequest = await prisma.licenseRequest.findFirst({
      where: {
        software_id: pool.software_id,
        request_type: 'RENEWAL',
        status: 'PENDING'
      },
      include: {
        department: true,
        requester: { select: { full_name: true, email: true } }
      },
      orderBy: { created_at: 'desc' }
    });

    // 2. Tìm danh sách hợp đồng khả dụng cho việc gia hạn phần mềm này:
    // Hợp đồng hợp lệ là hợp đồng gắn với phiếu đề xuất gia hạn đã duyệt (request_type = 'RENEWAL', status = 'APPROVED')
    // và chưa từng được áp dụng để gia hạn gói này trước đó (không nằm trong contract_id hiện tại và renewal_histories).
    const usedRenewals = await prisma.renewalHistory.findMany({
      where: { license_id: id, contract_id: { not: null } },
      select: { contract_id: true }
    });
    const usedContractIds = new Set(usedRenewals.map(r => r.contract_id).filter(Boolean));
    if (pool.contract_id) {
      usedContractIds.add(pool.contract_id);
    }

    const availableContracts = await prisma.contract.findMany({
      where: {
        status: 'SIGNED',
        request: {
          software_id: pool.software_id,
          request_type: 'RENEWAL',
          status: 'APPROVED'
        },
        contract_id: {
          notIn: Array.from(usedContractIds)
        }
      },
      include: {
        vendor: true,
        request: true
      },
      orderBy: { signed_date: 'desc' }
    });

    return res.status(200).json({
      success: true,
      data: {
        license_pool: pool,
        has_pending_request: !!pendingRequest,
        pending_request: pendingRequest,
        can_renew: availableContracts.length > 0,
        available_contracts: availableContracts
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * 6. GIA HẠN GÓI BẢN QUYỀN (POST /api/license-pools/:id/renew)
 * - RÀNG BUỘC: Bắt buộc phải có Hợp đồng mua sắm (contract_id) hợp lệ đã ký kết
 * - Lưu old_expiry_date vào renewal_histories
 * - Cập nhật expiry_date mới & contract_id mới lên license_pools
 * - Chuyển trạng thái gói về lại ACTIVE (mở khóa cấp phát theo BR04)
 * - Tự động ghi vết vào audit_alert_logs
 */
async function renewLicensePool(req, res, next) {
  try {
    const { id } = req.params;
    const { new_expiry_date, renewal_cost, renewed_by, contract_id, notes } = req.body;

    // RÀNG BUỘC 1: Bắt buộc phải có Hợp đồng mua sắm/gia hạn đã ký
    if (!contract_id) {
      return res.status(400).json({
        success: false,
        message: 'Ràng buộc gia hạn: Bắt buộc phải có Hợp đồng mua sắm/gia hạn bản quyền (contract_id) đã ký kết với Nhà cung cấp. Vui lòng gửi Phiếu đề xuất gia hạn về Nhà trường để phê duyệt và ký Hợp đồng trước.'
      });
    }

    const existingContract = await prisma.contract.findUnique({
      where: { contract_id },
      include: { vendor: true }
    });
    if (!existingContract) {
      return res.status(400).json({
        success: false,
        message: 'Hợp đồng mua sắm/gia hạn được chỉ định không tồn tại trong hệ thống.'
      });
    }

    if (existingContract.status !== 'SIGNED') {
      return res.status(400).json({
        success: false,
        message: `Hợp đồng [${existingContract.contract_number}] đang ở trạng thái 'Chờ ký'. Bắt buộc phải ký hợp đồng trước khi thực hiện gia hạn bản quyền.`
      });
    }

    if (!new_expiry_date) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp ngày hết hạn mới (new_expiry_date).' });
    }

    const newExpiryObj = new Date(new_expiry_date);
    if (isNaN(newExpiryObj.getTime())) {
      return res.status(400).json({ success: false, message: 'Định dạng ngày hết hạn mới không hợp lệ.' });
    }

    const now = new Date();
    if (newExpiryObj <= now) {
      return res.status(400).json({ success: false, message: 'Ngày hết hạn mới phải ở tương lai lớn hơn ngày hiện tại.' });
    }

    const costNumber = renewal_cost !== undefined && renewal_cost !== null ? parseFloat(renewal_cost) : (Number(existingContract.total_cost) || 0);
    if (isNaN(costNumber) || costNumber < 0) {
      return res.status(400).json({ success: false, message: 'Chi phí gia hạn (renewal_cost) phải là số không âm.' });
    }

    // Thực thi Database Transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Lấy thông tin gói bản quyền hiện tại
      const pool = await tx.licensePool.findUnique({
        where: { license_id: id },
        include: { software: true }
      });

      if (!pool) {
        throw new Error('NOT_FOUND_POOL: Không tìm thấy gói bản quyền cần gia hạn.');
      }

      const oldExpiryDate = new Date(pool.expiry_date);
      if (newExpiryObj <= oldExpiryDate) {
        throw new Error(`INVALID_DATE: Ngày gia hạn mới (${newExpiryObj.toLocaleDateString('vi-VN')}) phải lớn hơn ngày hết hạn cũ (${oldExpiryDate.toLocaleDateString('vi-VN')}).`);
      }

      // 2. Xác định người thực hiện gia hạn
      let actualUserId = renewed_by;
      if (!actualUserId) {
        // Tìm 1 user IT_STAFF hoặc ADMIN mẫu nếu không truyền
        const staffUser = await tx.user.findFirst({
          where: { role: { role_code: { in: ['IT_STAFF', 'ADMIN'] } } }
        });
        if (staffUser) {
          actualUserId = staffUser.user_id;
        }
      }

      if (!actualUserId) {
        throw new Error('REQUIRED_USER: Cần xác định mã người dùng (renewed_by) thực hiện gia hạn.');
      }

      // 3. Lưu lịch sử gia hạn vào bảng RENEWAL_HISTORIES
      const renewalRecord = await tx.renewalHistory.create({
        data: {
          license_id: pool.license_id,
          contract_id: existingContract.contract_id,
          renewed_by: actualUserId,
          old_expiry_date: oldExpiryDate,
          new_expiry_date: newExpiryObj,
          renewal_cost: costNumber,
          renewed_at: new Date()
        },
        include: {
          renewer: {
            select: { full_name: true, email: true }
          },
          contract: true
        }
      });

      // 4. Cập nhật hạn mới, hợp đồng mới và mở khóa trạng thái về ACTIVE (BR04)
      const newStatus = pool.available_seats === 0 ? 'DEPLETED' : 'ACTIVE';
      const updatedPool = await tx.licensePool.update({
        where: { license_id: id },
        data: {
          contract_id: existingContract.contract_id,
          expiry_date: newExpiryObj,
          status: newStatus
        },
        include: {
          software: true,
          contract: true
        }
      });

      // 5. Ghi vết kiểm toán vào bảng AUDIT_ALERT_LOGS
      await tx.auditAlertLog.create({
        data: {
          license_id: pool.license_id,
          user_id: actualUserId,
          action_type: 'RENEW',
          description: `Gia hạn Bản quyền: Phần mềm [${pool.software.software_name}] được gia hạn theo Hợp đồng [${existingContract.contract_number}] từ ngày ${oldExpiryDate.toLocaleDateString('vi-VN')} sang ngày ${newExpiryObj.toLocaleDateString('vi-VN')} với chi phí ${costNumber.toLocaleString('vi-VN')} đ. Trạng thái gói đã được mở khóa về ACTIVE. Ghi chú: ${notes || 'Không có'}`
        }
      });

      return {
        renewal: renewalRecord,
        license_pool: updatedPool
      };
    });

    return res.status(200).json({
      success: true,
      message: `Gia hạn thành công gói bản quyền theo Hợp đồng ${existingContract.contract_number} đến ngày ${newExpiryObj.toLocaleDateString('vi-VN')}. Trạng thái đã được kích hoạt lại (ACTIVE).`,
      data: result
    });
  } catch (error) {
    if (error.message.startsWith('NOT_FOUND_POOL')) {
      return res.status(404).json({ success: false, message: error.message.split(': ')[1] });
    }
    if (error.message.startsWith('INVALID_DATE') || error.message.startsWith('REQUIRED_USER')) {
      return res.status(400).json({ success: false, message: error.message.split(': ')[1] });
    }
    next(error);
  }
}

/**
 * 6. LẤY LỊCH SỬ GIA HẠN CỦA GÓI BẢN QUYỀN (GET /api/license-pools/:id/renewals)
 */
async function getRenewalHistories(req, res, next) {
  try {
    const { id } = req.params;

    const histories = await prisma.renewalHistory.findMany({
      where: { license_id: id },
      include: {
        renewer: {
          select: { user_id: true, full_name: true, email: true }
        },
        contract: true
      },
      orderBy: { renewed_at: 'desc' }
    });

    return res.status(200).json({
      success: true,
      count: histories.length,
      data: histories
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createLicensePool,
  getLicensePools,
  getLicensePoolById,
  revealLicenseKey,
  checkRenewalPrerequisites,
  renewLicensePool,
  getRenewalHistories
};
