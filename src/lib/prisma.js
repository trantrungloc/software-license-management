/**
 * ==============================================================================
 * PRISMA CLIENT SINGLETON INSTANCE
 * Tối ưu hóa cho môi trường Serverless (Vercel) và phát triển cục bộ,
 * đảm bảo không mở quá nhiều connection pool gây treo SQL Server.
 * ==============================================================================
 */

const { PrismaClient } = require('@prisma/client');

let prisma;

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient();
} else {
  if (!global.prisma) {
    global.prisma = new PrismaClient({
      log: ['error', 'warn']
    });
  }
  prisma = global.prisma;
}

module.exports = prisma;
