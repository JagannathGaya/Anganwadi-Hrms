package com.anganwadi.hrms.attendance;

import com.anganwadi.hrms.shift.Shift;
import com.anganwadi.hrms.shift.ShiftRef;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneId;

/**
 * Enriched attendance payload returned by /attendance/* endpoints.
 *
 * Wraps the raw Attendance row with the shift schedule that applied at the
 * moment, plus computed punctuality fields the mobile UI can render directly
 * without having to redo the date math.
 *
 *   state       — OPEN while check_out_at is null, CLOSED once stamped
 *   punctuality — ON_TIME / LATE / EARLY / NO_SHIFT (see PunctualityCalculator)
 *   lateMinutes — positive = late, negative = early, null when no shift
 *   overtimeMinutes / earlyCheckoutMinutes — only meaningful on CLOSED sessions
 *   workedMinutes — duration of THIS session (or live-elapsed if open)
 */
public record AttendanceDto(
        Long id,
        Long employeeId,

        OffsetDateTime checkInAt,
        Double checkInLat,
        Double checkInLng,

        OffsetDateTime checkOutAt,
        Double checkOutLat,
        Double checkOutLng,

        // Shift context
        ShiftRef shift,
        OffsetDateTime expectedCheckInAt,
        OffsetDateTime expectedCheckOutAt,

        // Punctuality
        Integer lateMinutes,
        Integer overtimeMinutes,
        Integer earlyCheckoutMinutes,
        String punctuality,        // PunctualityCalculator.Status name
        String state,              // "OPEN" | "CLOSED"
        Integer workedMinutes
) {

    public static AttendanceDto from(Attendance a, Shift shift, ZoneId zone, int graceMinutes) {
        if (a == null) return null;
        OffsetDateTime expectedIn  = PunctualityCalculator.expectedCheckInAt(a.getCheckInAt(), shift, zone);
        OffsetDateTime expectedOut = PunctualityCalculator.expectedCheckOutAt(a.getCheckInAt(), shift, zone);
        Integer late      = PunctualityCalculator.lateMinutes(a.getCheckInAt(), shift, zone);
        Integer overtime  = PunctualityCalculator.overtimeMinutes(a.getCheckInAt(), a.getCheckOutAt(), shift, zone);
        Integer earlyOut  = PunctualityCalculator.earlyCheckoutMinutes(a.getCheckInAt(), a.getCheckOutAt(), shift, zone);
        var status = PunctualityCalculator.status(late, graceMinutes).name();

        // Worked: closed sessions use actual span; open sessions use live-elapsed.
        long workedMins;
        if (a.getCheckOutAt() != null) {
            workedMins = Math.max(0, Duration.between(a.getCheckInAt(), a.getCheckOutAt()).toMinutes());
        } else if (a.getCheckInAt() != null) {
            workedMins = Math.max(0, Duration.between(a.getCheckInAt(), OffsetDateTime.now(zone)).toMinutes());
        } else {
            workedMins = 0;
        }

        return new AttendanceDto(
                a.getId(),
                a.getEmployeeId(),
                a.getCheckInAt(),
                a.getCheckInLat(), a.getCheckInLng(),
                a.getCheckOutAt(),
                a.getCheckOutLat(), a.getCheckOutLng(),
                ShiftRef.from(shift),
                expectedIn,
                expectedOut,
                late,
                overtime,
                earlyOut,
                status,
                a.getCheckOutAt() == null ? "OPEN" : "CLOSED",
                Math.toIntExact(workedMins)
        );
    }
}
