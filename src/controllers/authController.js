const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

const JWT_SECRET = process.env.JWT_SECRET || 'salm_jwt_super_secret_key_2026_graduation_thesis';

/**
 * 1. ĐĂNG NHẬP HỆ THỐNG (POST /api/auth/login)
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp đầy đủ email và mật khẩu đăng nhập.'
      });
    }

    // Tìm kiếm người dùng theo email
    const user = await prisma.user.findFirst({
      where: { email: email.trim().toLowerCase() },
      include: {
        role: true,
        department: true
      }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Tài khoản email không tồn tại trong hệ thống.'
      });
    }

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ Quản trị viên.'
      });
    }

    // Kiểm tra mật khẩu bằng bcrypt
    const isPasswordValid = bcrypt.compareSync(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Mật khẩu không chính xác. Vui lòng kiểm tra lại.'
      });
    }

    // Tạo JWT Token có thời hạn 24 giờ
    const tokenPayload = {
      user_id: user.user_id,
      email: user.email,
      role_code: user.role.role_code,
      department_id: user.department_id
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '24h' });

    // Ghi vết đăng nhập vào bảng AUDIT_ALERT_LOGS
    try {
      await prisma.auditAlertLog.create({
        data: {
          license_id: null,
          user_id: user.user_id,
          action_type: 'LOGIN',
          description: `Đăng nhập: Người dùng [${user.full_name}] (${user.role.role_name}) đã đăng nhập vào hệ thống SALM.`
        }
      });
    } catch (logErr) {
      console.warn('[AUTH WARNING] Không thể ghi audit log đăng nhập:', logErr.message);
    }

    const userData = {
      user_id: user.user_id,
      email: user.email,
      full_name: user.full_name,
      role_code: user.role.role_code,
      role_name: user.role.role_name,
      department_id: user.department_id,
      department_name: user.department ? user.department.department_name : null,
      department_code: user.department ? user.department.department_code : null
    };

    return res.status(200).json({
      success: true,
      message: `Chào mừng ${user.full_name} (${user.role.role_name}) đã đăng nhập thành công.`,
      token,
      user: userData
    });
  } catch (error) {
    next(error);
  }
}

/**
 * 2. LẤY THÔNG TIN PHIÊN LÀM VIỆC HIỆN TẠI (GET /api/auth/me)
 */
async function getMe(req, res, next) {
  try {
    return res.status(200).json({
      success: true,
      user: req.user
    });
  } catch (error) {
    next(error);
  }
}

/**
 * 3. LẤY DANH SÁCH TÀI KHOẢN MẪU ĐỂ CHỌN NHANH (GET /api/auth/quick-accounts)
 */
async function getQuickAccounts(req, res, next) {
  try {
    const users = await prisma.user.findMany({
      where: { is_active: true },
      include: {
        role: true,
        department: true
      },
      orderBy: { role: { role_code: 'asc' } }
    });

    const accounts = users.map(u => ({
      user_id: u.user_id,
      email: u.email,
      full_name: u.full_name,
      role_code: u.role.role_code,
      role_name: u.role.role_name,
      department_name: u.department ? u.department.department_name : null,
      department_code: u.department ? u.department.department_code : null
    }));

    return res.status(200).json({
      success: true,
      data: accounts
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  login,
  getMe,
  getQuickAccounts
};
