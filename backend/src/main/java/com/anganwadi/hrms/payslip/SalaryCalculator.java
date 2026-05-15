package com.anganwadi.hrms.payslip;

import com.anganwadi.hrms.attendance.Attendance;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Monthly-salary payroll model:
 *
 *   daily_pay        = monthly_salary / days_in_month
 *   per-day credit   = clamp(actual_hours, 0, daily_hours) / daily_hours
 *                      (holidays + approved leaves count as full credit)
 *   regular_pay      = sum_of_day_credits × daily_pay
 *   overtime_pay     = sum_of(actual_hours - daily_hours, when positive)
 *                      × (daily_pay / daily_hours) × 1.5
 *   gross_pay        = regular_pay + overtime_pay
 *
 * In other words: an employee who attends every working day for the full
 * daily_hours (or has them covered by holidays / approved leave) earns exactly
 * monthly_salary. Missing or short days are docked pro-rata. Hours beyond the
 * daily target add an overtime bonus on top.
 */
public final class SalaryCalculator {

    public static final BigDecimal OVERTIME_MULTIPLIER = BigDecimal.valueOf(1.5);

    public static class Result {
        public final BigDecimal totalHours;
        public final BigDecimal regularPay;
        public final BigDecimal overtimePay;
        public final BigDecimal grossPay;

        public Result(BigDecimal totalHours, BigDecimal regularPay,
                      BigDecimal overtimePay, BigDecimal grossPay) {
            this.totalHours = totalHours;
            this.regularPay = regularPay;
            this.overtimePay = overtimePay;
            this.grossPay = grossPay;
        }
    }

    private SalaryCalculator() {}

    /**
     * @param creditedDays days in the month on which a full-day credit should
     *        be granted regardless of attendance (typically holidays plus
     *        approved-leave dates).
     */
    public static Result compute(YearMonth month,
                                 BigDecimal monthlySalary,
                                 BigDecimal dailyHours,
                                 List<Attendance> entries,
                                 Set<LocalDate> creditedDays) {

        if (dailyHours == null || dailyHours.signum() <= 0) dailyHours = new BigDecimal("6");
        BigDecimal salary = monthlySalary == null ? BigDecimal.ZERO : monthlySalary;

        int daysInMonth = month.lengthOfMonth();
        BigDecimal dailyPay        = salary.divide(BigDecimal.valueOf(daysInMonth), 6, RoundingMode.HALF_UP);
        BigDecimal hourlyEquivalent = dailyPay.divide(dailyHours, 6, RoundingMode.HALF_UP);

        // 1. Sum attendance hours per calendar day (only days inside the target month)
        Map<LocalDate, BigDecimal> hoursPerDay = new HashMap<>();
        for (Attendance a : entries) {
            if (a.getCheckInAt() == null || a.getCheckOutAt() == null) continue;
            LocalDate d = a.getCheckInAt().toLocalDate();
            if (!YearMonth.from(d).equals(month)) continue;
            long secs = Duration.between(a.getCheckInAt(), a.getCheckOutAt()).getSeconds();
            if (secs <= 0) continue;
            BigDecimal hrs = BigDecimal.valueOf(secs)
                    .divide(BigDecimal.valueOf(3600), 4, RoundingMode.HALF_UP);
            hoursPerDay.merge(d, hrs, BigDecimal::add);
        }

        BigDecimal totalHours    = BigDecimal.ZERO;
        BigDecimal totalDayCredit = BigDecimal.ZERO; // sum of per-day credits, max = daysInMonth
        BigDecimal totalOvertimeHours = BigDecimal.ZERO;

        LocalDate start = month.atDay(1);
        LocalDate end   = month.atEndOfMonth();
        for (LocalDate d = start; !d.isAfter(end); d = d.plusDays(1)) {
            if (creditedDays != null && creditedDays.contains(d)) {
                totalDayCredit = totalDayCredit.add(BigDecimal.ONE);
                totalHours     = totalHours.add(dailyHours);
                continue;
            }
            BigDecimal worked = hoursPerDay.getOrDefault(d, BigDecimal.ZERO);
            if (worked.signum() <= 0) continue;
            BigDecimal capped = worked.min(dailyHours);
            BigDecimal credit = capped.divide(dailyHours, 6, RoundingMode.HALF_UP);
            totalDayCredit = totalDayCredit.add(credit);
            BigDecimal overtime = worked.subtract(dailyHours).max(BigDecimal.ZERO);
            totalOvertimeHours = totalOvertimeHours.add(overtime);
            totalHours = totalHours.add(worked);
        }

        BigDecimal regularPay  = totalDayCredit.multiply(dailyPay)
                .setScale(2, RoundingMode.HALF_UP);
        BigDecimal overtimePay = totalOvertimeHours.multiply(hourlyEquivalent).multiply(OVERTIME_MULTIPLIER)
                .setScale(2, RoundingMode.HALF_UP);
        BigDecimal gross = regularPay.add(overtimePay);

        return new Result(
                totalHours.setScale(2, RoundingMode.HALF_UP),
                regularPay,
                overtimePay,
                gross
        );
    }
}
