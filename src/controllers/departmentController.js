/**
 * ==============================================================================
 * CONTROLLER: QUẢN LÝ KHOA, THÀNH VIÊN & MÁY TRẠM (DEPARTMENTS)
 * Cung cấp dữ liệu phục vụ các Dropdown trên giao diện Cấp phát
 * ==============================================================================
 */

const prisma = require('../lib/prisma');

/**
 * 1. LẤY DANH SÁCH CÁC KHOA / PHÒNG BAN (GET /api/departments)
 */
async function getDepartments(req, res, next) {
  try {
    const departments = await prisma.department.findMany({
      where: { is_active: true },
      include: {
        manager: {
          select: { user_id: true, full_name: true, email: true }
        },
        _count: {
          select: {
            users: true,
            devices: true,
            department_allocations: true
          }
        }
      },
      orderBy: { department_code: 'asc' }
    });

    return res.status(200).json({
      success: true,
      data: departments
    });
  } catch (error) {
    next(error);
  }
}

/**
 * 2. LẤY DANH SÁCH GIẢNG VIÊN THUỘC KHOA (GET /api/departments/:id/users)
 */
async function getDepartmentMembers(req, res, next) {
  try {
    const { id } = req.params;

    const users = await prisma.user.findMany({
      where: {
        department_id: id,
        is_active: true
      },
      select: {
        user_id: true,
        full_name: true,
        email: true,
        role: {
          select: { role_code: true, role_name: true }
        }
      },
      orderBy: { full_name: 'asc' }
    });

    return res.status(200).json({
      success: true,
      count: users.length,
      data: users
    });
  } catch (error) {
    next(error);
  }
}

/**
 * 3. LẤY DANH SÁCH MÁY TRẠM PHÒNG LAB THUỘC KHOA (GET /api/departments/:id/devices)
 */
async function getDepartmentDevices(req, res, next) {
  try {
    const { id } = req.params;

    const devices = await prisma.device.findMany({
      where: {
        department_id: id
      },
      orderBy: { device_code: 'asc' }
    });

    return res.status(200).json({
      success: true,
      count: devices.length,
      data: devices
    });
  } catch (error) {
    next(error);
  }
}

/**
 * 4. TẠO MÁY TRẠM MỚI (POST /api/departments/:id/devices)
 */
async function createDevice(req, res, next) {
  try {
    const { id } = req.params;
    const { device_code, device_name, room_location, status, os_platform, hardware_specs } = req.body;

    if (!device_code || !device_name || !room_location) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp mã máy, tên máy và phòng Lab.' });
    }

    const device = await prisma.device.create({
      data: {
        department_id: id,
        device_code: device_code.trim(),
        device_name: device_name.trim(),
        room_location: room_location.trim(),
        status: status || 'ACTIVE',
        os_platform: os_platform || 'Windows 11 Pro',
        hardware_specs: hardware_specs || 'Core i7, 16GB RAM'
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Thêm mới thiết bị thành công.',
      data: device
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getDepartments,
  getDepartmentMembers,
  getDepartmentDevices,
  createDevice
};
