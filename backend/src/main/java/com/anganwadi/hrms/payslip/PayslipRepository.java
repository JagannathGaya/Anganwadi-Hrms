package com.anganwadi.hrms.payslip;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

public interface PayslipRepository extends JpaRepository<Payslip, Long> {

    Optional<Payslip> findByEmployeeIdAndMonth(Long employeeId, String month);

    List<Payslip> findByMonthOrderByEmployeeIdAsc(String month);

    List<Payslip> findByEmployeeIdOrderByMonthDesc(Long employeeId);

    @Query("select coalesce(sum(p.grossPay), 0) from Payslip p where p.month = :month")
    BigDecimal totalGrossForMonth(String month);
}
