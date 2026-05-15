package com.anganwadi.hrms.attendance;

import java.time.OffsetDateTime;

public record TodayAttendanceDto(
        Long id,
        Long employeeId,
        String employeeName,
        String employeeEmail,
        OffsetDateTime checkInAt,
        Double checkInLat,
        Double checkInLng,
        OffsetDateTime checkOutAt,
        Double checkOutLat,
        Double checkOutLng
) {}
