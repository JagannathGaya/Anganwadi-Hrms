package com.anganwadi.hrms.attendance;

import com.anganwadi.hrms.shift.ShiftRef;

import java.math.BigDecimal;
import java.util.List;

public record TodaySummary(
        ShiftRef shift,
        BigDecimal expectedHours,
        BigDecimal totalHours,
        Integer sessions,
        Boolean openSession,
        Boolean shortfall,
        String alert,
        List<Attendance> log
) {}
