package com.anganwadi.hrms.config;

import com.anganwadi.hrms.attendance.AttendanceRepository;
import com.anganwadi.hrms.employee.EmployeeRepository;
import com.anganwadi.hrms.payslip.PayslipRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.util.Map;

@RestController
@RequestMapping("/admin/dashboard")
public class DashboardController {

    private final EmployeeRepository employees;
    private final AttendanceRepository attendances;
    private final PayslipRepository payslips;

    public DashboardController(EmployeeRepository employees,
                               AttendanceRepository attendances,
                               PayslipRepository payslips) {
        this.employees = employees;
        this.attendances = attendances;
        this.payslips = payslips;
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> totals() {
        long activeEmployees = employees.countByActiveTrue();
        LocalDate today = LocalDate.now();
        OffsetDateTime startOfDay = today.atStartOfDay().atOffset(ZoneOffset.UTC);
        OffsetDateTime endOfDay   = today.atTime(23, 59, 59).atOffset(ZoneOffset.UTC);
        long todaysCheckins = attendances.countByCheckInAtBetween(startOfDay, endOfDay);
        BigDecimal monthGross = payslips.totalGrossForMonth(YearMonth.now().toString());
        return ResponseEntity.ok(Map.of(
                "activeEmployees", activeEmployees,
                "todaysCheckins", todaysCheckins,
                "monthlyPayroll", monthGross == null ? BigDecimal.ZERO : monthGross
        ));
    }
}
