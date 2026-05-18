package com.anganwadi.hrms.attendance;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * One employee's attendance rollup for a calendar month.
 *
 *   days          — one entry per calendar date in the month, in order
 *   totalHours    — sum of worked hours across the month
 *   expectedHours — sum of daily expected hours for working days
 *   presentDays   — days with at least one closed session
 *   absentDays    — working days with no attendance and no leave/holiday
 *   leaveDays     — days fully covered by an approved leave
 *   holidayDays   — days flagged as company holidays
 *   lateDays      — days where the first check-in was after grace
 *   overtimeMinutes — sum of overtime minutes across the month
 *
 * Designed so the mobile calendar UI can render the whole month from a single
 * fetch — each day's colour-coded state, hours, and lateness are pre-computed.
 */
public record MonthAttendance(
        String month,                 // YYYY-MM
        List<DayEntry> days,
        BigDecimal totalHours,
        BigDecimal expectedHours,
        Integer presentDays,
        Integer absentDays,
        Integer leaveDays,
        Integer holidayDays,
        Integer lateDays,
        Integer overtimeMinutes
) {

    /** Categorical state for a single date. */
    public enum DayState {
        PRESENT,   // attended (closed) and met target
        PARTIAL,   // attended but worked less than expected
        ABSENT,    // working day with no attendance
        LEAVE,     // approved leave that day
        HOLIDAY,   // company holiday
        WEEKEND,   // (reserved — currently treated same as ABSENT/holiday)
        FUTURE     // not yet reached
    }

    public record DayEntry(
            LocalDate date,
            DayState state,
            BigDecimal workedHours,
            BigDecimal expectedHours,
            Integer sessions,
            Integer lateMinutes,
            Integer overtimeMinutes,
            String firstCheckInAt,    // ISO time HH:mm, null if none
            String lastCheckOutAt,    // ISO time HH:mm, null if none
            String note               // holiday name, leave reason, etc.
    ) {}
}
