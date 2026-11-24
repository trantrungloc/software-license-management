/**
 * ==============================================================================
 * CONTROLLER: QUẢN LÝ HỢP ĐỒNG (CONTRACTS)
 * Quản lý các hợp đồng mua sắm/tài trợ bản quyền ký kết với Nhà cung cấp
 * ==============================================================================
 */

const prisma = require('../lib/prisma');

/**
 * 1. LẤY DANH SÁCH HỢP ĐỒNG (GET /api/contracts)
 */
async function getContracts(req, res, next) {
  try {
    const contracts = await prisma.contract.findMany({
      include: {
        vendor: true,
        request: {
          include: {
            department: true,
            software: true
          }
        },
        license_pools: {
          select: {
            license_id: true,
            software: { select: { software_name: true, version: true } },
            total_seats: true,
            available_seats: true,
            status: true,
            expiry_date: true
          }
        }
      },
      orderBy: { signed_date: 'desc' }
    });

    return res.status(200).json({
      success: true,
      count: contracts.length,
      data: contracts
    });
  } catch (error) {
    next(error);
  }
}

/**
 * 2. TẠO MỚI HỢP ĐỒNG (POST /api/contracts)
 */
async function createContract(req, res, next) {
  try {
    const { contract_number, vendor_id, signed_date, total_cost, request_id } = req.body;

    if (!contract_number || typeof contract_number !== 'string' || !contract_number.trim()) {
      return res.status(400).json({ success: false, message: 'Số hợp đồng (contract_number) là bắt buộc.' });
    }
    if (!vendor_id) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn nhà cung cấp cho hợp đồng.' });
    }
    if (!signed_date) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập ngày ký hợp đồng.' });
    }
    if (total_cost === undefined || total_cost === null || isNaN(Number(total_cost)) || Number(total_cost) < 0) {
      return res.status(400).json({ success: false, message: 'Giá trị hợp đồng (total_cost) phải là số không âm.' });
    }

    // Kiểm tra số hợp đồng đã tồn tại chưa
    const existing = await prisma.contract.findUnique({
      where: { contract_number: contract_number.trim() }
    });
    if (existing) {
      return res.status(400).json({ success: false, message: `Số hợp đồng '${contract_number}' đã tồn tại trong hệ thống.` });
    }

    // Kiểm tra nhà cung cấp
    const vendor = await prisma.vendor.findUnique({
      where: { vendor_id }
    });
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Nhà cung cấp không tồn tại.' });
    }

    // Tạo hợp đồng
    const newContract = await prisma.contract.create({
      data: {
        contract_number: contract_number.trim(),
        vendor_id,
        signed_date: new Date(signed_date),
        total_cost: parseFloat(total_cost),
        request_id: request_id || null
      },
      include: {
        vendor: true
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Tạo mới hợp đồng thành công.',
      data: newContract
    });
  } catch (error) {
    next(error);
  }
}

/**
 * 3. LẤY CHI TIẾT 1 HỢP ĐỒNG (GET /api/contracts/:id)
 */
async function getContractById(req, res, next) {
  try {
    const { id } = req.params;

    const contract = await prisma.contract.findUnique({
      where: { contract_id: id },
      include: {
        vendor: true,
        request: {
          include: {
            department: true,
            software: true
          }
        },
        license_pools: {
          include: {
            software: true
          }
        },
        renewal_histories: true
      }
    });

    if (!contract) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy hợp đồng.' });
    }

    return res.status(200).json({
      success: true,
      data: contract
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getContracts,
  createContract,
  getContractById
};
