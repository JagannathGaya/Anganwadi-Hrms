package com.anganwadi.hrms.employee;

import com.anganwadi.hrms.shift.Shift;
import com.anganwadi.hrms.shift.ShiftRef;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;

/**
 * Employee response. The original 9 fields are unchanged for compatibility;
 * three derived fields are appended:
 *
 *   employeeCode    — "EMP" + zero-padded id, a stable display ID
 *   tenureMonths    — whole months between createdAt and now (≥ 0)
 *   shiftSchedule   — pre-formatted "HH:mm → HH:mm · Nh/day" when a shift is set
 */
public record EmployeeDto(
        Long id,
        String name,
        String email,
        String phone,
        Role role,
        BigDecimal monthlySalary,
        boolean active,
        ShiftRef shift,
        OffsetDateTime createdAt,
        String employeeCode,
        Integer tenureMonths,
        String shiftSchedule
) {

    public static EmployeeDto from(Employee e) {
        return from(e, null);
    }

    public static EmployeeDto from(Employee e, Shift shift) {
        return new EmployeeDto(
                e.getId(),
                e.getName(),
                e.getEmail(),
                e.getPhone(),
                e.getRole(),
                e.getMonthlySalary(),
                e.isActive(),
                ShiftRef.from(shift),
                e.getCreatedAt(),
                buildCode(e.getId()),
                tenureMonths(e.getCreatedAt()),
                buildShiftSchedule(shift)
        );
    }

    private static String buildCode(Long id) {
        return id == null ? null : String.format("EMP%04d", id);
    }

    private static Integer tenureMonths(OffsetDateTime createdAt) {
        if (createdAt == null) return 0;
        long months = ChronoUnit.MONTHS.between(createdAt, OffsetDateTime.now(ZoneOffset.UTC));
        return (int) Math.max(0, months);
    }

    private static String buildShiftSchedule(Shift s) {
        if (s == null) return null;
        String start = s.getStartTime() == null ? "" : s.getStartTime();
        String end   = s.getEndTime()   == null ? "" : s.getEndTime();
        if (start.length() > 5) start = start.substring(0, 5);
        if (end.length()   > 5) end   = end.substring(0, 5);
        BigDecimal hours = s.getDailyHours();
        String hoursLabel = hours == null ? "" : "  ·  " + hours.stripTrailingZeros().toPlainString() + "h/day";
        return start + " → " + end + hoursLabel;
    }
}
