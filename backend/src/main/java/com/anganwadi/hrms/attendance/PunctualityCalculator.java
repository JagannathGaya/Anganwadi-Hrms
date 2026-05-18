package com.anganwadi.hrms.attendance;

import com.anganwadi.hrms.shift.Shift;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;

/**
 * Shift-aware punctuality math.
 *
 * Given a shift (HH:mm start/end) and an attendance event, compute:
 *   - the "expected" timestamp of the event on the event's local date
 *   - lateness in minutes (positive = late, negative = early)
 *   - overtime in minutes (only for check-out, positive = past shift end)
 *   - a categorical punctuality status
 *
 * Cross-midnight shifts (e.g. 22:00 → 06:00) are handled by tying the
 * expected check-out to "the next day at end" when end < start.
 */
public final class PunctualityCalculator {

    public enum Status { ON_TIME, LATE, EARLY, NO_SHIFT }

    private PunctualityCalculator() {}

    private static LocalTime parseHHmm(String s) {
        if (s == null || s.isBlank()) return null;
        // Accept "HH:mm" or "HH:mm:ss"
        String trimmed = s.length() > 5 ? s.substring(0, 5) : s;
        return LocalTime.parse(trimmed);
    }

    /**
     * The shift-start instant aligned with the LOCAL DATE of `eventAt`.
     * For overnight shifts, this is just the start time on that date.
     */
    public static OffsetDateTime expectedCheckInAt(OffsetDateTime eventAt, Shift shift, ZoneId zone) {
        if (shift == null || eventAt == null) return null;
        LocalTime start = parseHHmm(shift.getStartTime());
        if (start == null) return null;
        LocalDate localDate = eventAt.atZoneSameInstant(zone).toLocalDate();
        return LocalDateTime.of(localDate, start).atZone(zone).toOffsetDateTime();
    }

    /**
     * The shift-end instant for the shift the user CHECKED IN ON.
     *
     * For a normal day-shift (end > start) it's end on the same local date.
     * For an overnight shift (end <= start) it's end on the NEXT local date,
     * so a 22:00 → 06:00 shift checked in at 22:05 has an expected check-out
     * at 06:00 the following day.
     */
    public static OffsetDateTime expectedCheckOutAt(OffsetDateTime checkInAt, Shift shift, ZoneId zone) {
        if (shift == null || checkInAt == null) return null;
        LocalTime start = parseHHmm(shift.getStartTime());
        LocalTime end   = parseHHmm(shift.getEndTime());
        if (start == null || end == null) return null;

        LocalDate inDate = checkInAt.atZoneSameInstant(zone).toLocalDate();
        boolean overnight = !end.isAfter(start); // end <= start → spans midnight
        LocalDate outDate = overnight ? inDate.plusDays(1) : inDate;
        return LocalDateTime.of(outDate, end).atZone(zone).toOffsetDateTime();
    }

    /**
     * Minutes late at check-in. Negative means early.
     * Returns null when the shift is missing.
     */
    public static Integer lateMinutes(OffsetDateTime checkInAt, Shift shift, ZoneId zone) {
        OffsetDateTime expected = expectedCheckInAt(checkInAt, shift, zone);
        if (expected == null) return null;
        return Math.toIntExact(Duration.between(expected, checkInAt).toMinutes());
    }

    /**
     * Minutes worked past shift end at check-out. 0 when on-time or early.
     * Returns null when the shift is missing.
     */
    public static Integer overtimeMinutes(OffsetDateTime checkInAt,
                                          OffsetDateTime checkOutAt,
                                          Shift shift,
                                          ZoneId zone) {
        if (checkOutAt == null) return null;
        OffsetDateTime expectedOut = expectedCheckOutAt(checkInAt, shift, zone);
        if (expectedOut == null) return null;
        long mins = Duration.between(expectedOut, checkOutAt).toMinutes();
        return mins > 0 ? Math.toIntExact(mins) : 0;
    }

    /**
     * Minutes checked OUT before shift end. 0 when on-time or late.
     * Returns null when the shift is missing.
     */
    public static Integer earlyCheckoutMinutes(OffsetDateTime checkInAt,
                                               OffsetDateTime checkOutAt,
                                               Shift shift,
                                               ZoneId zone) {
        if (checkOutAt == null) return null;
        OffsetDateTime expectedOut = expectedCheckOutAt(checkInAt, shift, zone);
        if (expectedOut == null) return null;
        long mins = Duration.between(checkOutAt, expectedOut).toMinutes();
        return mins > 0 ? Math.toIntExact(mins) : 0;
    }

    /**
     * Categorical punctuality. A grace window absorbs minor lateness so the
     * status feels reasonable (default 5 min).
     */
    public static Status status(Integer lateMins, int graceMinutes) {
        if (lateMins == null) return Status.NO_SHIFT;
        if (lateMins < -1)          return Status.EARLY;
        if (lateMins > graceMinutes) return Status.LATE;
        return Status.ON_TIME;
    }

    /** Convenience: full punctuality computation from a fresh check-in. */
    public static Status statusFromCheckIn(OffsetDateTime checkInAt, Shift shift, ZoneId zone, int graceMinutes) {
        return status(lateMinutes(checkInAt, shift, zone), graceMinutes);
    }
}
