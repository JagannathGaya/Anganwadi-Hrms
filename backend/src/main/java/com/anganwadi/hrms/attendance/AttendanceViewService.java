package com.anganwadi.hrms.attendance;

import com.anganwadi.hrms.employee.Employee;
import com.anganwadi.hrms.employee.EmployeeRepository;
import com.anganwadi.hrms.holiday.Holiday;
import com.anganwadi.hrms.holiday.HolidayRepository;
import com.anganwadi.hrms.leave_req.LeaveRepository;
import com.anganwadi.hrms.leave_req.LeaveRequest;
import com.anganwadi.hrms.leave_req.LeaveStatus;
import com.anganwadi.hrms.shift.Shift;
import com.anganwadi.hrms.shift.ShiftRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;

import com.anganwadi.hrms.config_org.OrgConfigRepository;

/**
 * Builds the monthly attendance rollup used by the mobile calendar view.
 *
 * Joins attendance entries, holidays, and approved leaves with the employee's
 * shift (or org default) to produce a per-day state.
 */
@Service
public class AttendanceViewService {

    private final AttendanceRepository attendances;
    private final EmployeeRepository employees;
    private final ShiftRepository shifts;
    private final HolidayRepository holidays;
    private final LeaveRepository leaves;
    private final OrgConfigRepository orgRepo;

    private final ZoneId zone;
    private final int graceMinutes;

    private static final DateTimeFormatter HHMM = DateTimeFormatter.ofPattern("HH:mm");

    public AttendanceViewService(AttendanceRepository attendances,
                                 EmployeeRepository employees,
                                 ShiftRepository shifts,
                                 HolidayRepository holidays,
                                 LeaveRepository leaves,
                                 OrgConfigRepository orgRepo,
                                 @Value("${app.timezone:Asia/Kolkata}") String tz,
                                 @Value("${app.attendance.late-grace-minutes:5}") int graceMinutes) {
        this.attendances = attendances;
        this.employees = employees;
        this.shifts = shifts;
        this.holidays = holidays;
        this.leaves = leaves;
        this.orgRepo = orgRepo;
        this.zone = ZoneId.of(tz);
        this.graceMinutes = graceMinutes;
    }

    @Transactional(readOnly = true)
    public MonthAttendance buildMonth(Long employeeId, YearMonth month) {
        Employee employee = employees.findById(employeeId).orElseThrow();
        Shift shift = employee.getShiftId() == null ? null
                : shifts.findById(employee.getShiftId()).orElse(null);

        BigDecimal dailyTarget = shift != null ? shift.getDailyHours()
                : orgRepo.getSingleton().getDailyHours();

        LocalDate monthStart = month.atDay(1);
        LocalDate monthEnd   = month.atEndOfMonth();
        OffsetDateTime from = monthStart.atStartOfDay(zone).toOffsetDateTime();
        OffsetDateTime to   = monthEnd.plusDays(1).atStartOfDay(zone).minusSeconds(1).toOffsetDateTime();

        // 1. All attendance entries that started (or are still open) within the month
        List<Attendance> entries = attendances
                .findByEmployeeIdAndCheckInAtBetweenOrderByCheckInAtAsc(employeeId, from, to);

        // 2. Group attendance by local date (of check-in)
        Map<LocalDate, List<Attendance>> byDate = new HashMap<>();
        for (Attendance a : entries) {
            LocalDate d = a.getCheckInAt().atZoneSameInstant(zone).toLocalDate();
            byDate.computeIfAbsent(d, k -> new ArrayList<>()).add(a);
        }

        // 3. Holidays in the month, keyed by date for fast lookup
        Map<LocalDate, Holiday> holidayMap = new HashMap<>();
        for (Holiday h : holidays.findByDateBetweenOrderByDateAsc(monthStart, monthEnd)) {
            holidayMap.put(h.getDate(), h);
        }

        // 4. Approved leaves overlapping the month
        List<LeaveRequest> approvedLeaves = leaves
                .findByEmployeeIdAndStatusAndFromDateLessThanEqualAndToDateGreaterThanEqual(
                        employeeId, LeaveStatus.APPROVED, monthEnd, monthStart);
        Map<LocalDate, LeaveRequest> leaveMap = new HashMap<>();
        for (LeaveRequest lr : approvedLeaves) {
            LocalDate s = lr.getFromDate().isBefore(monthStart) ? monthStart : lr.getFromDate();
            LocalDate e = lr.getToDate().isAfter(monthEnd) ? monthEnd : lr.getToDate();
            for (LocalDate d = s; !d.isAfter(e); d = d.plusDays(1)) {
                leaveMap.put(d, lr);
            }
        }

        // 5. Walk every date in the month and classify
        List<MonthAttendance.DayEntry> days = new ArrayList<>();
        BigDecimal totalHours = BigDecimal.ZERO;
        BigDecimal expectedTotal = BigDecimal.ZERO;
        int presentDays = 0, absentDays = 0, leaveDays = 0, holidayDays = 0, lateDays = 0;
        int overtimeAccum = 0;

        LocalDate todayLocal = LocalDate.now(zone);

        for (LocalDate d = monthStart; !d.isAfter(monthEnd); d = d.plusDays(1)) {
            List<Attendance> dayEntries = byDate.getOrDefault(d, List.of());
            Holiday holiday = holidayMap.get(d);
            LeaveRequest leave = leaveMap.get(d);

            BigDecimal worked = BigDecimal.ZERO;
            Integer lateMins = null;
            Integer overtimeMins = null;
            String firstIn = null;
            String lastOut = null;

            // Sum closed hours for the day
            for (Attendance a : dayEntries) {
                if (firstIn == null) {
                    firstIn = a.getCheckInAt().atZoneSameInstant(zone).toLocalTime().format(HHMM);
                }
                if (a.getCheckOutAt() != null) {
                    long secs = Duration.between(a.getCheckInAt(), a.getCheckOutAt()).getSeconds();
                    if (secs > 0) {
                        worked = worked.add(BigDecimal.valueOf(secs)
                                .divide(BigDecimal.valueOf(3600), 4, RoundingMode.HALF_UP));
                    }
                    String t = a.getCheckOutAt().atZoneSameInstant(zone).toLocalTime().format(HHMM);
                    lastOut = t; // keep updating so we end with the latest
                }
            }
            worked = worked.setScale(2, RoundingMode.HALF_UP);

            // Lateness based on the FIRST check-in of the day
            if (!dayEntries.isEmpty() && shift != null) {
                Attendance firstA = dayEntries.get(0);
                lateMins = PunctualityCalculator.lateMinutes(firstA.getCheckInAt(), shift, zone);
                // Sum overtime across all closed sessions that day
                int otSum = 0;
                for (Attendance a : dayEntries) {
                    Integer ot = PunctualityCalculator.overtimeMinutes(
                            a.getCheckInAt(), a.getCheckOutAt(), shift, zone);
                    if (ot != null) otSum += ot;
                }
                overtimeMins = otSum;
            }

            // Classify the day
            MonthAttendance.DayState state;
            String note = null;
            if (d.isAfter(todayLocal)) {
                state = MonthAttendance.DayState.FUTURE;
            } else if (holiday != null) {
                state = MonthAttendance.DayState.HOLIDAY;
                note = holiday.getName();
                holidayDays++;
                // Holidays count as their daily target for the totals view
                expectedTotal = expectedTotal.add(dailyTarget);
                totalHours = totalHours.add(dailyTarget);
            } else if (leave != null) {
                state = MonthAttendance.DayState.LEAVE;
                note = leave.getReason() != null ? leave.getReason() : "Approved leave";
                leaveDays++;
                expectedTotal = expectedTotal.add(dailyTarget);
                totalHours = totalHours.add(dailyTarget);
            } else if (!dayEntries.isEmpty()) {
                expectedTotal = expectedTotal.add(dailyTarget);
                totalHours = totalHours.add(worked);
                if (worked.compareTo(dailyTarget) >= 0) {
                    state = MonthAttendance.DayState.PRESENT;
                } else {
                    state = MonthAttendance.DayState.PARTIAL;
                }
                presentDays++;
                if (lateMins != null && lateMins > graceMinutes) lateDays++;
                if (overtimeMins != null) overtimeAccum += overtimeMins;
            } else {
                state = MonthAttendance.DayState.ABSENT;
                absentDays++;
                expectedTotal = expectedTotal.add(dailyTarget);
            }

            days.add(new MonthAttendance.DayEntry(
                    d, state, worked, dailyTarget,
                    dayEntries.size(),
                    lateMins, overtimeMins,
                    firstIn, lastOut,
                    note
            ));
        }

        return new MonthAttendance(
                month.toString(),
                days,
                totalHours.setScale(2, RoundingMode.HALF_UP),
                expectedTotal.setScale(2, RoundingMode.HALF_UP),
                presentDays, absentDays, leaveDays, holidayDays, lateDays,
                overtimeAccum
        );
    }
}
