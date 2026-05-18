package com.anganwadi.hrms.payslip;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/**
 * Enriched payslip payload returned by /payslip and /payslip/detail.
 *
 * Wraps the raw `Payslip` row with derived numbers the mobile UI wants:
 *   - daysWorked / daysOnLeave / daysHoliday / daysAbsent — the calendar split
 *   - averageDailyHours — totalHours / max(daysWorked, 1)
 *   - dailyRate / hourlyRate — derived from monthlySalary so the UI can show
 *     "your daily pay is ₹X" without recomputing
 *   - deductions / netPay — placeholder for future tax/PF logic. Currently 0 +
 *     gross, but the field exists so we don't break the contract later.
 *   - periodLabel — pre-formatted human label like "August 2024"
 *   - status — PAID | PENDING (string for easy mobile binding)
 */
public record PayslipDetail(
        // Identity
        Long id,
        Long employeeId,
        String month,
        String periodLabel,

        // Hours
        BigDecimal totalHours,
        BigDecimal regularHours,
        BigDecimal overtimeHours,
        BigDecimal expectedHours,

        // Pay
        BigDecimal regularPay,
        /** Effective overtime — manualOvertimePay when set, else computed. */
        BigDecimal overtimePay,
        /** Attendance-computed overtime (always; for transparency). */
        BigDecimal autoOvertimePay,
        /** Admin override of overtime; null when no override is set. */
        BigDecimal manualOvertimePay,
        BigDecimal bonusAmount,
        String     bonusNote,
        BigDecimal grossPay,
        BigDecimal deductions,
        String     deductionNote,
        BigDecimal netPay,

        // Rates (per-employee, derived from monthly salary)
        BigDecimal monthlySalary,
        BigDecimal dailyRate,
        BigDecimal hourlyRate,

        // Calendar breakdown
        Integer daysInMonth,
        Integer daysWorked,
        Integer daysOnLeave,
        Integer daysHoliday,
        Integer daysAbsent,

        // Averages
        BigDecimal averageDailyHours,

        // Meta
        String currency,
        String status,           // PAID | PENDING
        OffsetDateTime generatedAt
) {}
