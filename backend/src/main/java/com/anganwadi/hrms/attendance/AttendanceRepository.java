package com.anganwadi.hrms.attendance;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

public interface AttendanceRepository extends JpaRepository<Attendance, Long> {

    Optional<Attendance> findFirstByEmployeeIdAndCheckOutAtIsNullOrderByCheckInAtDesc(Long employeeId);

    List<Attendance> findByEmployeeIdAndCheckInAtBetweenOrderByCheckInAtAsc(
            Long employeeId, OffsetDateTime from, OffsetDateTime to);

    long countByCheckInAtBetween(OffsetDateTime from, OffsetDateTime to);

    List<Attendance> findByCheckInAtBetweenOrderByCheckInAtDesc(OffsetDateTime from, OffsetDateTime to);

    List<Attendance> findByEmployeeIdAndCheckInAtBetweenOrderByCheckInAtDesc(
            Long employeeId, OffsetDateTime from, OffsetDateTime to);

    /**
     * Today's view for one employee, robust to cross-midnight sessions:
     *   - any session that CHECKED IN within [from, to]
     *   - PLUS any session still open (check_out_at IS NULL) that started before `to`
     *
     * Without the second clause, a check-in from 23:30 yesterday that hasn't been
     * closed yet would disappear from the "today" view the moment local midnight
     * passed.
     */
    @Query("""
        SELECT a FROM Attendance a
        WHERE a.employeeId = :employeeId
          AND (
                (a.checkInAt >= :from AND a.checkInAt <= :to)
             OR (a.checkOutAt IS NULL AND a.checkInAt <= :to)
          )
        ORDER BY a.checkInAt DESC
    """)
    List<Attendance> findTodayForEmployee(@Param("employeeId") Long employeeId,
                                          @Param("from") OffsetDateTime from,
                                          @Param("to")   OffsetDateTime to);
}
