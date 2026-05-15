package com.anganwadi.hrms.attendance;

import org.springframework.data.jpa.repository.JpaRepository;

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
}
