package com.anganwadi.hrms.attendance;

import com.anganwadi.hrms.shift.ShiftRef;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * Today's rollup for one employee.
 *
 *   totalHours       — sum of all CLOSED sessions today
 *   inProgressHours  — live elapsed time of any open session (capped)
 *   liveTotalHours   — totalHours + inProgressHours
 *
 *   expectedCheckInAt / expectedCheckOutAt — when today's shift is meant to
 *     start / end (timezone-aware, computed from the shift's HH:mm wall clock)
 *
 *   lateMinutes      — lateness of TODAY'S earliest check-in (+ late / - early)
 *   overtimeMinutes  — minutes worked past shift end across all closed sessions
 *   punctuality      — ON_TIME / LATE / EARLY / NO_SHIFT (most recent check-in)
 *
 *   nextAction       — what the user should do next:
 *                      CHECK_IN  | CHECK_OUT  | DONE  | NO_SHIFT
 *
 *   log              — full session list, plus the enriched dtoLog for UI use
 */
public record TodaySummary(
        ShiftRef shift,
        BigDecimal expectedHours,
        BigDecimal totalHours,
        BigDecimal inProgressHours,
        BigDecimal liveTotalHours,
        Integer sessions,
        Boolean openSession,
        Boolean shortfall,
        String alert,
        List<Attendance> log,

        // Shift schedule (computed)
        OffsetDateTime expectedCheckInAt,
        OffsetDateTime expectedCheckOutAt,

        // Punctuality (computed)
        Integer lateMinutes,
        Integer overtimeMinutes,
        String  punctuality,
        String  nextAction,

        // Enriched session list (each entry includes per-session punctuality)
        List<AttendanceDto> dtoLog
) {}
