package com.anganwadi.hrms.holiday;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;

/**
 * Enriched holiday payload — wraps the raw row with the day-name and a
 * server-computed `daysUntil` so the mobile UI doesn't have to redo the date
 * math (which is awkward across timezones). Also exposes `upcoming` so the
 * client can branch on a single flag.
 */
public record HolidayDetail(
        Long id,
        LocalDate date,
        String name,
        String weekday,         // "Monday" / "Tuesday" / ...
        Integer daysUntil,      // 0 = today, negative = past
        Boolean upcoming,       // daysUntil >= 0
        OffsetDateTime createdAt
) {
    public static HolidayDetail from(Holiday h, LocalDate today) {
        int daysUntil = (int) ChronoUnit.DAYS.between(today, h.getDate());
        return new HolidayDetail(
                h.getId(),
                h.getDate(),
                h.getName(),
                h.getDate().getDayOfWeek().toString().charAt(0) +
                  h.getDate().getDayOfWeek().toString().substring(1).toLowerCase(),
                daysUntil,
                daysUntil >= 0,
                h.getCreatedAt()
        );
    }
}
