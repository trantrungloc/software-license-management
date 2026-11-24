/**
 * ==============================================================================
 * CONTROLLER: BÁO CÁO THỐNG KÊ TOÀN TRƯỜNG (ANALYTICS)
 * Tổng hợp dữ liệu quản trị tài sản số: Ngân sách, Tỷ lệ lấp đầy, Cơ cấu nhà cung cấp
 * ==============================================================================
 */

const prisma = require('../lib/prisma');

/**
 * LẤY TỔNG HỢP SỐ LIỆU THỐNG KÊ (GET /api/analytics/summary)
 */
async function getSummary(req, res, next) {
  try {
    // 1. Thống kê Hợp đồng & Chi phí Gia hạn
    const [contracts, renewals, pools, departments, softwaresCount] = await Promise.all([
      prisma.contract.findMany({
        include: { vendor: true }
      }),
      prisma.renewalHistory.findMany(),
      prisma.licensePool.findMany({
        include: { software: true }
      }),
      prisma.department.findMany({
        where: { is_active: true },
        include: {
          department_allocations: {
            include: {
              license_assignments: true
            }
          }
        }
      }),
      prisma.software.count()
    ]);

    // Tính tổng chi phí hợp đồng gốc
    const contractTotalCost = contracts.reduce((sum, c) => sum + Number(c.total_cost || 0), 0);
    // Tính tổng chi phí gia hạn
    const renewalTotalCost = renewals.reduce((sum, r) => sum + Number(r.renewal_cost || 0), 0);
    const totalBudget = contractTotalCost + renewalTotalCost;

    // 2. Thống kê Hạn mức Seat toàn trường
    const totalPurchasedSeats = pools.reduce((sum, p) => sum + (p.total_seats || 0), 0);
    const totalAvailableSeats = pools.reduce((sum, p) => sum + (p.available_seats || 0), 0);
    const totalAllocatedSeats = totalPurchasedSeats - totalAvailableSeats;

    let totalUsedSeats = 0;
    departments.forEach(d => {
      d.department_allocations.forEach(a => {
        totalUsedSeats += (a.used_seats || 0);
      });
    });

    const overallUtilizationRate = totalPurchasedSeats > 0
      ? Math.round((totalUsedSeats / totalPurchasedSeats) * 100)
      : 0;

    // 3. Phân bố trạng thái gói bản quyền
    let activePools = 0;
    let expiringSoonPools = 0;
    let expiredPools = 0;

    pools.forEach(p => {
      if (p.status === 'EXPIRED') expiredPools++;
      else if (p.status === 'EXPIRING_SOON') expiringSoonPools++;
      else activePools++;
    });

    // 4. Tỷ lệ sử dụng seat theo từng Khoa
    const departmentUtilization = departments.map(d => {
      let allocated = 0;
      let used = 0;
      d.department_allocations.forEach(a => {
        allocated += a.allocated_seats;
        used += a.used_seats;
      });
      const rate = allocated > 0 ? Math.round((used / allocated) * 100) : 0;
      return {
        department_id: d.department_id,
        department_name: d.department_name,
        department_code: d.department_code,
        allocated_seats: allocated,
        used_seats: used,
        available_in_dept: allocated - used,
        utilization_rate: rate
      };
    });

    // 5. Cơ cấu chi phí theo Nhà cung cấp
    const vendorMap = {};
    contracts.forEach(c => {
      const vName = c.vendor ? c.vendor.vendor_name : 'Khác';
      if (!vendorMap[vName]) {
        vendorMap[vName] = 0;
      }
      vendorMap[vName] += Number(c.total_cost || 0);
    });

    const vendorSpending = Object.keys(vendorMap).map(vendor_name => {
      const amount = vendorMap[vendor_name];
      const percentage = contractTotalCost > 0 ? Math.round((amount / contractTotalCost) * 100) : 0;
      return {
        vendor_name,
        total_amount: amount,
        percentage
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        kpis: {
          total_budget: totalBudget,
          contract_cost: contractTotalCost,
          renewal_cost: renewalTotalCost,
          total_purchased_seats: totalPurchasedSeats,
          total_available_seats: totalAvailableSeats,
          total_allocated_seats: totalAllocatedSeats,
          total_used_seats: totalUsedSeats,
          overall_utilization_rate: overallUtilizationRate,
          total_softwares: softwaresCount,
          active_pools: activePools,
          expiring_soon_pools: expiringSoonPools,
          expired_pools: expiredPools,
          warning_count: expiringSoonPools + expiredPools
        },
        department_utilization: departmentUtilization,
        vendor_spending: vendorSpending,
        status_distribution: {
          active: activePools,
          expiring_soon: expiringSoonPools,
          expired: expiredPools
        }
      }
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getSummary
};
