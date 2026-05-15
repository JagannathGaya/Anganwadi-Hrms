package com.anganwadi.hrms.holiday;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;

public interface HolidayRepository extends JpaRepository<Holiday, Long> {
    List<Holiday> findByDateBetweenOrderByDateAsc(LocalDate from, LocalDate to);
    List<Holiday> findAllByOrderByDateAsc();
    long countByDateBetween(LocalDate from, LocalDate to);
}
