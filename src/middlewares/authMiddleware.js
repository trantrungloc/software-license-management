const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

const JWT_SECRET = process.env.JWT_SECRET || 'salm_jwt_super_secret_key_2026_graduation_thesis';

/**
 * Middleware xác thực JSON Web Token (JWT)
 * Đọc token từ header Authorization: Bearer <token>
 */
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : req.query.token;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Yêu cầu chưa được xác thực. Vui lòng đăng nhập để tiếp tục.'
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Xác thực người dùng trong cơ sở dữ liệu để đảm bảo tài khoản vẫn đang hoạt động
    const user = await prisma.user.findUnique({
      where: { user_id: decoded.user_id },
      include: {
        role: true,
        department: true
      }
    });

    if (!user || !user.is_active) {
      return res.status(401).json({
        success: false,
        message: 'Tài khoản người dùng không tồn tại hoặc đã bị vô hiệu hóa.'
      });
    }

    req.user = {
      user_id: user.user_id,
      email: user.email,
      full_name: user.full_name,
      role_code: user.role.role_code,
      role_name: user.role.role_name,
      department_id: user.department_id,
      department_name: user.department ? user.department.department_name : null,
      department_code: user.department ? user.department.department_code : null
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.'
      });
    }
    return res.status(403).json({
      success: false,
      message: 'Mã xác thực (Token) không hợp lệ.'
    });
  }
}

/**
 * Middleware kiểm tra quyền hạn theo Role (RBAC)
 * @param  {...string} allowedRoles Các mã vai trò được phép (ví dụ: 'IT_STAFF', 'ADMIN')
 */
function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Chưa xác định thông tin người dùng.'
      });
    }

    if (!allowedRoles.includes(req.user.role_code)) {
      return res.status(403).json({
        success: false,
        message: `Quyền truy cập bị từ chối: Tài khoản [${req.user.role_name}] không có quyền thực hiện thao tác này. Yêu cầu vai trò: [${allowedRoles.join(', ')}].`
      });
    }

    next();
  };
}

module.exports = {
  authenticateToken,
  authorizeRoles
};
