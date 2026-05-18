package com.anganwadi.hrms.payslip;

import com.anganwadi.hrms.attendance.Attendance;
import com.anganwadi.hrms.attendance.AttendanceRepository;
import com.anganwadi.hrms.common.ConflictException;
import com.anganwadi.hrms.common.NotFoundException;
import com.anganwadi.hrms.config_org.OrgConfigRepository;
import com.anganwadi.hrms.employee.Employee;
import com.anganwadi.hrms.employee.EmployeeRepository;
import com.anganwadi.hrms.holiday.Holiday;
import com.anganwadi.hrms.holiday.HolidayRepository;
import com.anganwadi.hrms.leave_req.LeaveRepository;
import com.anganwadi.hrms.leave_req.LeaveRequest;
import com.anganwadi.hrms.leave_req.LeaveStatus;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Service
public class PayslipService {

    private final EmployeeRepository employees;
    private final AttendanceRepository attendances;
    private final PayslipRepository payslips;
    private final HolidayRepository holidays;
    private final LeaveRepository leaves;
    private final OrgConfigRepository orgRepo;
    private final ZoneId zone;

    public PayslipService(EmployeeRepository employees,
                          AttendanceRepository attendances,
                          PayslipRepository payslips,
                          HolidayRepository holidays,
                          LeaveRepository leaves,
                          OrgConfigRepository orgRepo,
                          @Value("${app.timezone:Asia/Kolkata}") String tz) {
        this.employees = employees;
        this.attendances = attendances;
        this.payslips = payslips;
        this.holidays = holidays;
        this.leaves = leaves;
        this.orgRepo = orgRepo;
        this.zone = ZoneId.of(tz);
    }

    /**
     * Returns the payslip for (employee, month) and re-computes it from
     * attendance entries, holidays, and approved leave records.
     *
     * If an existing row is flagged as `manualOverride` (admin used
     * "Complete with full salary"), the attendance-based recompute is SKIPPED
     * and the existing row is returned as-is. This keeps admin overrides
     * sticky across employee fetches.
     *
     * Refuses to generate a slip when the employee has no monthly salary set
     * (null or zero) — silently producing a ₹0 payslip would mislead the user.
     */
    @Transactional
    public Payslip generateOrRefresh(Long employeeId, YearMonth month) {
        Employee employee = employees.findById(employeeId)
                .orElseThrow(() -> new NotFoundException("employee not found"));

        if (employee.getMonthlySalary() == null || employee.getMonthlySalary().signum() <= 0) {
            throw new ConflictException(
                    "Your monthly salary hasn't been set yet. Please contact your administrator to configure it before generating a payslip.");
        }

        // Manual override short-circuit: respect the admin's frozen numbers.
        String monthKey0 = month.toString();
        var existing = payslips.findByEmployeeIdAndMonth(employeeId, monthKey0);
        if (existing.isPresent() && existing.get().isManualOverride()) {
            return existing.get();
        }

        LocalDate monthStart = month.atDay(1);
        LocalDate monthEnd   = month.atEndOfMonth();
        OffsetDateTime from  = monthStart.atStartOfDay(zone).toOffsetDateTime();
        OffsetDateTime to    = monthEnd.plusDays(1).atStartOfDay(zone).minusSeconds(1).toOffsetDateTime();

        List<Attendance> entries = attendances
                .findByEmployeeIdAndCheckInAtBetweenOrderByCheckInAtAsc(employeeId, from, to);

        Set<LocalDate> credited = new HashSet<>();
        for (Holiday h : holidays.findByDateBetweenOrderByDateAsc(monthStart, monthEnd)) {
            credited.add(h.getDate());
        }
        List<LeaveRequest> approved = leaves
                .findByEmployeeIdAndStatusAndFromDateLessThanEqualAndToDateGreaterThanEqual(
                        employeeId, LeaveStatus.APPROVED, monthEnd, monthStart);
        for (LeaveRequest lr : approved) {
            LocalDate s = lr.getFromDate().isBefore(monthStart) ? monthStart : lr.getFromDate();
            LocalDate e = lr.getToDate().isAfter(monthEnd)      ? monthEnd   : lr.getToDate();
            for (LocalDate d = s; !d.isAfter(e); d = d.plusDays(1)) credited.add(d);
        }

        var dailyHours = orgRepo.getSingleton().getDailyHours();
        SalaryCalculator.Result r = SalaryCalculator.compute(
                month, employee.getMonthlySalary(), dailyHours, entries, credited);

        String monthKey = month.toString();
        Payslip slip = payslips.findByEmployeeIdAndMonth(employeeId, monthKey)
                .orElseGet(() -> {
                    Payslip p = new Payslip();
                    p.setEmployeeId(employeeId);
                    p.setMonth(monthKey);
                    return p;
                });
        slip.setTotalHours(r.totalHours);
        slip.setRegularPay(r.regularPay);
        // Store the attendance-computed overtime; the admin override (if any)
        // lives separately on `manualOvertimePay` and only kicks in at gross
        // calculation. This preserves the audit trail of what attendance
        // *would* have produced.
        slip.setOvertimePay(r.overtimePay);
        // Effective gross = regular + (manual overtime ?? computed overtime) + bonus.
        // Deductions don't subtract here — they reduce netPay, not grossPay.
        BigDecimal effectiveOt = slip.effectiveOvertimePay();
        BigDecimal bonus = slip.getBonusAmount() == null ? BigDecimal.ZERO : slip.getBonusAmount();
        BigDecimal gross = r.regularPay.add(effectiveOt).add(bonus)
                .setScale(2, RoundingMode.HALF_UP);
        slip.setGrossPay(gross);
        slip.setGeneratedAt(OffsetDateTime.now(zone));
        return payslips.save(slip);
    }

    /**
     * Enriched payslip — wraps the stored Payslip with the calendar breakdown
     * (days worked / on leave / on holiday / absent), per-day/per-hour pay
     * rates, deductions placeholder, and the human-readable period label.
     *
     * Refuses in three precondition cases (each a 409):
     *   1. Requested month is the current month or later — payslips are only
     *      available after the month has ended.
     *   2. Employee has no monthly salary set yet.
     *   3. Admin has not released the (existing) row yet.
     */
    @Transactional
    public PayslipDetail generateDetail(Long employeeId, YearMonth month) {
        Employee employee = employees.findById(employeeId)
                .orElseThrow(() -> new NotFoundException("employee not found"));

        YearMonth currentMonth = YearMonth.now(zone);
        if (!month.isBefore(currentMonth)) {
            // The month is the current one (still in progress) or in the future.
            // Either way, no payslip yet — we'd be making one up.
            YearMonth availableFrom = currentMonth.plusMonths(1);
            throw new ConflictException(String.format(
                    "Your payslip for %s will be available after the month ends. The current month is still in progress — check back on %s.",
                    month, availableFrom.atDay(1)));
        }

        Payslip slip = generateOrRefresh(employeeId, month);
        if (!slip.isReleased()) {
            throw new ConflictException(
                    "Your payslip for this month hasn't been activated by your administrator yet. " +
                    "Please check back once it's released.");
        }

        LocalDate monthStart = month.atDay(1);
        LocalDate monthEnd   = month.atEndOfMonth();
        OffsetDateTime from  = monthStart.atStartOfDay(zone).toOffsetDateTime();
        OffsetDateTime to    = monthEnd.plusDays(1).atStartOfDay(zone).minusSeconds(1).toOffsetDateTime();

        List<Attendance> entries = attendances
                .findByEmployeeIdAndCheckInAtBetweenOrderByCheckInAtAsc(employeeId, from, to);

        // Calendar breakdown: holidays, leaves, worked days
        Set<LocalDate> holidayDates = new HashSet<>();
        for (Holiday h : holidays.findByDateBetweenOrderByDateAsc(monthStart, monthEnd)) {
            holidayDates.add(h.getDate());
        }
        Set<LocalDate> leaveDates = new HashSet<>();
        for (LeaveRequest lr : leaves
                .findByEmployeeIdAndStatusAndFromDateLessThanEqualAndToDateGreaterThanEqual(
                        employeeId, LeaveStatus.APPROVED, monthEnd, monthStart)) {
            LocalDate s = lr.getFromDate().isBefore(monthStart) ? monthStart : lr.getFromDate();
            LocalDate e = lr.getToDate().isAfter(monthEnd)      ? monthEnd   : lr.getToDate();
            for (LocalDate d = s; !d.isAfter(e); d = d.plusDays(1)) leaveDates.add(d);
        }

        Set<LocalDate> workedDates = new HashSet<>();
        for (Attendance a : entries) {
            if (a.getCheckInAt() == null) continue;
            LocalDate d = a.getCheckInAt().atZoneSameInstant(zone).toLocalDate();
            // Only count as "worked" if there was real time logged.
            if (a.getCheckOutAt() != null) {
                long secs = Duration.between(a.getCheckInAt(), a.getCheckOutAt()).getSeconds();
                if (secs > 0) workedDates.add(d);
            }
        }

        int daysInMonth = month.lengthOfMonth();
        int daysHoliday = holidayDates.size();
        // Leave days that don't overlap holidays (no double-counting)
        int daysOnLeave = 0;
        for (LocalDate d : leaveDates) if (!holidayDates.contains(d)) daysOnLeave++;
        // Worked days that aren't holidays/leaves
        int daysWorked = 0;
        for (LocalDate d : workedDates) {
            if (!holidayDates.contains(d) && !leaveDates.contains(d)) daysWorked++;
        }
        int daysAbsent = Math.max(0, daysInMonth - daysHoliday - daysOnLeave - daysWorked);

        // Full-salary override: the admin has decided to pay the employee for
        // the full month regardless of actual attendance. Reflect that in the
        // calendar split — show every non-holiday/non-leave day as "credited
        // / worked" instead of an absent day. Without this, the payslip's
        // "Days in {Month}" panel reads "0 worked, 30 absent" alongside the
        // full salary, which is confusing.
        if (slip.isManualOverride()) {
            daysWorked = Math.max(0, daysInMonth - daysHoliday - daysOnLeave);
            daysAbsent = 0;
        }

        BigDecimal dailyHours = orgRepo.getSingleton().getDailyHours();
        BigDecimal expectedHours = dailyHours.multiply(BigDecimal.valueOf(daysInMonth))
                .setScale(2, RoundingMode.HALF_UP);

        BigDecimal monthlySalary = employee.getMonthlySalary() == null
                ? BigDecimal.ZERO : employee.getMonthlySalary();
        BigDecimal dailyRate = monthlySalary
                .divide(BigDecimal.valueOf(daysInMonth), 2, RoundingMode.HALF_UP);
        BigDecimal hourlyRate = dailyHours.signum() > 0
                ? dailyRate.divide(dailyHours, 2, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;

        // Regular hours = totalHours - overtime portion (back-derive from overtimePay)
        BigDecimal regularHours;
        BigDecimal overtimeHours;
        if (hourlyRate.signum() > 0 && slip.getOvertimePay() != null) {
            overtimeHours = slip.getOvertimePay()
                    .divide(hourlyRate.multiply(SalaryCalculator.OVERTIME_MULTIPLIER), 2, RoundingMode.HALF_UP);
        } else {
            overtimeHours = BigDecimal.ZERO;
        }
        regularHours = slip.getTotalHours().subtract(overtimeHours).max(BigDecimal.ZERO)
                .setScale(2, RoundingMode.HALF_UP);

        BigDecimal averageDailyHours = daysWorked > 0
                ? slip.getTotalHours().divide(BigDecimal.valueOf(daysWorked), 2, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;

        // Effective overtime + auto overtime kept side-by-side for transparency.
        BigDecimal autoOt   = slip.getOvertimePay() == null ? BigDecimal.ZERO : slip.getOvertimePay();
        BigDecimal manualOt = slip.getManualOvertimePay();
        BigDecimal effectiveOt = manualOt != null ? manualOt : autoOt;

        BigDecimal bonus      = slip.getBonusAmount() == null ? BigDecimal.ZERO : slip.getBonusAmount();
        BigDecimal deductions = slip.getDeductions()  == null ? BigDecimal.ZERO : slip.getDeductions();
        BigDecimal netPay = slip.getGrossPay().subtract(deductions).setScale(2, RoundingMode.HALF_UP);

        String periodLabel = month.getMonth().getDisplayName(
                java.time.format.TextStyle.FULL, java.util.Locale.ENGLISH) + " " + month.getYear();
        String currency = orgRepo.getSingleton().getCurrency();

        return new PayslipDetail(
                slip.getId(),
                slip.getEmployeeId(),
                slip.getMonth(),
                periodLabel,
                slip.getTotalHours(),
                regularHours,
                overtimeHours,
                expectedHours,
                slip.getRegularPay(),
                effectiveOt,
                autoOt,
                manualOt,
                bonus,
                slip.getBonusNote(),
                slip.getGrossPay(),
                deductions,
                slip.getDeductionNote(),
                netPay,
                monthlySalary,
                dailyRate,
                hourlyRate,
                daysInMonth,
                daysWorked,
                daysOnLeave,
                daysHoliday,
                daysAbsent,
                averageDailyHours,
                currency,
                slip.isPaid() ? "PAID" : "PENDING",
                slip.getGeneratedAt()
        );
    }

    /**
     * Admin override: complete the month with the FULL monthly salary,
     * regardless of the employee's actual attendance hours. Useful when the
     * employee is being paid in full (new hire, special circumstance, etc).
     *
     * The row is created if missing, populated with:
     *   - totalHours    = dailyHours × daysInMonth (so the slip "looks right")
     *   - regularPay    = monthlySalary
     *   - overtimePay   = 0
     *   - grossPay      = monthlySalary
     *   - released      = true   (automatically released as part of this op)
     */
    @Transactional
    public Payslip generateFullSalary(Long employeeId, YearMonth month) {
        Employee employee = employees.findById(employeeId)
                .orElseThrow(() -> new NotFoundException("employee not found"));
        if (employee.getMonthlySalary() == null || employee.getMonthlySalary().signum() <= 0) {
            throw new ConflictException(
                    "Cannot complete with full salary — this employee has no monthly salary set.");
        }
        BigDecimal monthly = employee.getMonthlySalary();
        BigDecimal dailyHours = orgRepo.getSingleton().getDailyHours();
        BigDecimal totalHours = dailyHours.multiply(BigDecimal.valueOf(month.lengthOfMonth()))
                .setScale(2, RoundingMode.HALF_UP);

        String monthKey = month.toString();
        Payslip slip = payslips.findByEmployeeIdAndMonth(employeeId, monthKey)
                .orElseGet(() -> {
                    Payslip p = new Payslip();
                    p.setEmployeeId(employeeId);
                    p.setMonth(monthKey);
                    return p;
                });
        slip.setTotalHours(totalHours);
        slip.setRegularPay(monthly.setScale(2, RoundingMode.HALF_UP));
        slip.setOvertimePay(BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP));
        slip.setGrossPay(monthly.setScale(2, RoundingMode.HALF_UP));
        slip.setGeneratedAt(OffsetDateTime.now(zone));
        slip.setReleased(true);
        // Mark this as a manual override so subsequent employee fetches don't
        // recompute it from (likely zero) attendance and wipe the values out.
        slip.setManualOverride(true);
        return payslips.save(slip);
    }

    /**
     * Admin-only enriched payslip view, bypassing the release gate. Used by
     * the admin web to show the full breakdown for any payslip in any state.
     */
    @Transactional
    public PayslipDetail adminDetail(Long payslipId) {
        Payslip slip = payslips.findById(payslipId)
                .orElseThrow(() -> new NotFoundException("payslip not found"));
        YearMonth month = YearMonth.parse(slip.getMonth());
        // Reuse the enrichment logic — but skip the release/month gates by
        // calling the building blocks directly here. We want admins to see
        // detail even on held or current-month rows.
        return generateDetailUnchecked(slip);
    }

    /**
     * Build a PayslipDetail from an existing Payslip row without enforcing
     * the release / month-in-progress / salary preconditions. Admin-only path.
     */
    @Transactional(readOnly = true)
    public PayslipDetail generateDetailUnchecked(Payslip slip) {
        Employee employee = employees.findById(slip.getEmployeeId())
                .orElseThrow(() -> new NotFoundException("employee not found"));
        YearMonth month = YearMonth.parse(slip.getMonth());

        LocalDate monthStart = month.atDay(1);
        LocalDate monthEnd   = month.atEndOfMonth();
        OffsetDateTime from  = monthStart.atStartOfDay(zone).toOffsetDateTime();
        OffsetDateTime to    = monthEnd.plusDays(1).atStartOfDay(zone).minusSeconds(1).toOffsetDateTime();

        List<Attendance> entries = attendances
                .findByEmployeeIdAndCheckInAtBetweenOrderByCheckInAtAsc(slip.getEmployeeId(), from, to);

        java.util.Set<LocalDate> holidayDates = new java.util.HashSet<>();
        for (com.anganwadi.hrms.holiday.Holiday h : holidays.findByDateBetweenOrderByDateAsc(monthStart, monthEnd)) {
            holidayDates.add(h.getDate());
        }
        java.util.Set<LocalDate> leaveDates = new java.util.HashSet<>();
        for (var lr : leaves.findByEmployeeIdAndStatusAndFromDateLessThanEqualAndToDateGreaterThanEqual(
                slip.getEmployeeId(), com.anganwadi.hrms.leave_req.LeaveStatus.APPROVED, monthEnd, monthStart)) {
            LocalDate s = lr.getFromDate().isBefore(monthStart) ? monthStart : lr.getFromDate();
            LocalDate e = lr.getToDate().isAfter(monthEnd) ? monthEnd : lr.getToDate();
            for (LocalDate d = s; !d.isAfter(e); d = d.plusDays(1)) leaveDates.add(d);
        }
        java.util.Set<LocalDate> workedDates = new java.util.HashSet<>();
        for (Attendance a : entries) {
            if (a.getCheckInAt() == null) continue;
            LocalDate d = a.getCheckInAt().atZoneSameInstant(zone).toLocalDate();
            if (a.getCheckOutAt() != null) {
                long secs = java.time.Duration.between(a.getCheckInAt(), a.getCheckOutAt()).getSeconds();
                if (secs > 0) workedDates.add(d);
            }
        }

        int daysInMonth = month.lengthOfMonth();
        int daysHoliday = holidayDates.size();
        int daysOnLeave = 0;
        for (LocalDate d : leaveDates) if (!holidayDates.contains(d)) daysOnLeave++;
        int daysWorked = 0;
        for (LocalDate d : workedDates) {
            if (!holidayDates.contains(d) && !leaveDates.contains(d)) daysWorked++;
        }
        int daysAbsent = Math.max(0, daysInMonth - daysHoliday - daysOnLeave - daysWorked);

        // Full-salary override: see the comment in generateDetail. Reflect the
        // override in the calendar split so the printable payslip doesn't
        // show "0 worked / 30 absent" next to a full-month payout.
        if (slip.isManualOverride()) {
            daysWorked = Math.max(0, daysInMonth - daysHoliday - daysOnLeave);
            daysAbsent = 0;
        }

        BigDecimal dailyHours = orgRepo.getSingleton().getDailyHours();
        BigDecimal expectedHours = dailyHours.multiply(BigDecimal.valueOf(daysInMonth))
                .setScale(2, RoundingMode.HALF_UP);
        BigDecimal monthlySalary = employee.getMonthlySalary() == null
                ? BigDecimal.ZERO : employee.getMonthlySalary();
        BigDecimal dailyRate = daysInMonth > 0
                ? monthlySalary.divide(BigDecimal.valueOf(daysInMonth), 2, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;
        BigDecimal hourlyRate = dailyHours.signum() > 0
                ? dailyRate.divide(dailyHours, 2, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;

        BigDecimal overtimeHours;
        if (hourlyRate.signum() > 0 && slip.getOvertimePay() != null) {
            overtimeHours = slip.getOvertimePay()
                    .divide(hourlyRate.multiply(SalaryCalculator.OVERTIME_MULTIPLIER), 2, RoundingMode.HALF_UP);
        } else {
            overtimeHours = BigDecimal.ZERO;
        }
        BigDecimal regularHours = slip.getTotalHours().subtract(overtimeHours).max(BigDecimal.ZERO)
                .setScale(2, RoundingMode.HALF_UP);
        BigDecimal averageDailyHours = daysWorked > 0
                ? slip.getTotalHours().divide(BigDecimal.valueOf(daysWorked), 2, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;
        BigDecimal autoOt   = slip.getOvertimePay() == null ? BigDecimal.ZERO : slip.getOvertimePay();
        BigDecimal manualOt = slip.getManualOvertimePay();
        BigDecimal effectiveOt = manualOt != null ? manualOt : autoOt;
        BigDecimal bonus      = slip.getBonusAmount() == null ? BigDecimal.ZERO : slip.getBonusAmount();
        BigDecimal deductions = slip.getDeductions()  == null ? BigDecimal.ZERO : slip.getDeductions();
        BigDecimal netPay = slip.getGrossPay().subtract(deductions).setScale(2, RoundingMode.HALF_UP);

        String periodLabel = month.getMonth().getDisplayName(
                java.time.format.TextStyle.FULL, java.util.Locale.ENGLISH) + " " + month.getYear();
        String currency = orgRepo.getSingleton().getCurrency();

        return new PayslipDetail(
                slip.getId(), slip.getEmployeeId(), slip.getMonth(), periodLabel,
                slip.getTotalHours(), regularHours, overtimeHours, expectedHours,
                slip.getRegularPay(),
                effectiveOt, autoOt, manualOt,
                bonus, slip.getBonusNote(),
                slip.getGrossPay(),
                deductions, slip.getDeductionNote(),
                netPay,
                monthlySalary, dailyRate, hourlyRate,
                daysInMonth, daysWorked, daysOnLeave, daysHoliday, daysAbsent,
                averageDailyHours, currency,
                slip.isPaid() ? "PAID" : "PENDING", slip.getGeneratedAt()
        );
    }

    /**
     * Admin operation: revert a manual override back to attendance-based math.
     * The flag is cleared and the row is recomputed in place.
     */
    @Transactional
    public Payslip clearManualOverride(Long payslipId) {
        Payslip p = payslips.findById(payslipId)
                .orElseThrow(() -> new NotFoundException("payslip not found"));
        p.setManualOverride(false);
        // Recompute by calling generateOrRefresh for the same (employee, month).
        YearMonth ym = YearMonth.parse(p.getMonth());
        // Persist the cleared flag first so generateOrRefresh doesn't short-circuit.
        payslips.save(p);
        return generateOrRefresh(p.getEmployeeId(), ym);
    }

    /**
     * Admin operation: apply adjustments (manual overtime, bonus, deductions)
     * to a payslip and recompute gross. Any null field is left unchanged.
     *
     * Pass `clearManualOvertime = true` to explicitly wipe the override and
     * fall back to the attendance-computed value.
     */
    @Transactional
    public Payslip applyAdjustments(Long payslipId,
                                    BigDecimal manualOvertimePay,
                                    Boolean clearManualOvertime,
                                    BigDecimal bonusAmount,
                                    String bonusNote,
                                    BigDecimal deductions,
                                    String deductionNote) {
        Payslip p = payslips.findById(payslipId)
                .orElseThrow(() -> new NotFoundException("payslip not found"));

        if (Boolean.TRUE.equals(clearManualOvertime)) {
            p.setManualOvertimePay(null);
        } else if (manualOvertimePay != null) {
            if (manualOvertimePay.signum() < 0) {
                throw new IllegalArgumentException("manualOvertimePay cannot be negative");
            }
            p.setManualOvertimePay(manualOvertimePay.setScale(2, RoundingMode.HALF_UP));
        }

        if (bonusAmount != null) {
            if (bonusAmount.signum() < 0) {
                throw new IllegalArgumentException("bonusAmount cannot be negative");
            }
            p.setBonusAmount(bonusAmount.setScale(2, RoundingMode.HALF_UP));
        }
        if (bonusNote != null) p.setBonusNote(bonusNote.isBlank() ? null : bonusNote.trim());

        if (deductions != null) {
            if (deductions.signum() < 0) {
                throw new IllegalArgumentException("deductions cannot be negative");
            }
            p.setDeductions(deductions.setScale(2, RoundingMode.HALF_UP));
        }
        if (deductionNote != null) p.setDeductionNote(deductionNote.isBlank() ? null : deductionNote.trim());

        // Recompute gross with the new adjustments.
        BigDecimal regular = p.getRegularPay() == null ? BigDecimal.ZERO : p.getRegularPay();
        BigDecimal effectiveOt = p.effectiveOvertimePay();
        BigDecimal bonus = p.getBonusAmount() == null ? BigDecimal.ZERO : p.getBonusAmount();
        p.setGrossPay(regular.add(effectiveOt).add(bonus).setScale(2, RoundingMode.HALF_UP));
        return payslips.save(p);
    }

    @Transactional
    public Payslip markPaid(Long payslipId) {
        Payslip p = payslips.findById(payslipId)
                .orElseThrow(() -> new NotFoundException("payslip not found"));
        p.setPaid(true);
        // Paying implies releasing — paid slips should always be visible to
        // the employee. Without this, an admin who marks paid before
        // releasing would have a "paid but invisible" state.
        p.setReleased(true);
        return payslips.save(p);
    }

    /**
     * Admin operation: activate (or revoke activation of) a single payslip.
     * After releasing, the employee can view it via /payslip.
     */
    @Transactional
    public Payslip setReleased(Long payslipId, boolean released) {
        Payslip p = payslips.findById(payslipId)
                .orElseThrow(() -> new NotFoundException("payslip not found"));
        p.setReleased(released);
        return payslips.save(p);
    }

    /**
     * Admin operation: release every existing payslip for a given month.
     * Returns the count of rows updated.
     */
    @Transactional
    public int releaseMonth(YearMonth month) {
        List<Payslip> all = payslips.findByMonthOrderByEmployeeIdAsc(month.toString());
        int updated = 0;
        for (Payslip p : all) {
            if (!p.isReleased()) {
                p.setReleased(true);
                updated++;
            }
        }
        payslips.saveAll(all);
        return updated;
    }

    public List<Payslip> listForMonth(String month) {
        return payslips.findByMonthOrderByEmployeeIdAsc(month);
    }
}
