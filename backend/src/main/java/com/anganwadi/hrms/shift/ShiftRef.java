package com.anganwadi.hrms.shift;

import java.math.BigDecimal;

/** Compact shift summary embedded in employee/today payloads. */
public record ShiftRef(Long id, String name, String startTime, String endTime, BigDecimal dailyHours) {
    public static ShiftRef from(Shift s) {
        return s == null ? null
                : new ShiftRef(s.getId(), s.getName(), s.getStartTime(), s.getEndTime(), s.getDailyHours());
    }
}
