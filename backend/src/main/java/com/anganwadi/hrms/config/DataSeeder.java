package com.anganwadi.hrms.config;

import com.anganwadi.hrms.employee.Employee;
import com.anganwadi.hrms.employee.EmployeeRepository;
import com.anganwadi.hrms.employee.Role;
import com.anganwadi.hrms.shift.ShiftRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;

/**
 * Creates the default admin and demo employee on first boot if they don't
 * exist. Uses BCryptPasswordEncoder so the hashes are guaranteed valid.
 */
@Component
public class DataSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(DataSeeder.class);

    private final EmployeeRepository employees;
    private final ShiftRepository shifts;
    private final PasswordEncoder encoder;

    private final boolean enabled;
    private final String adminEmail;
    private final String adminPassword;
    private final String employeeEmail;
    private final String employeePassword;

    public DataSeeder(EmployeeRepository employees,
                      ShiftRepository shifts,
                      PasswordEncoder encoder,
                      @Value("${app.seed.enabled}") boolean enabled,
                      @Value("${app.seed.admin-email}") String adminEmail,
                      @Value("${app.seed.admin-password}") String adminPassword,
                      @Value("${app.seed.employee-email}") String employeeEmail,
                      @Value("${app.seed.employee-password}") String employeePassword) {
        this.employees = employees;
        this.shifts = shifts;
        this.encoder = encoder;
        this.enabled = enabled;
        this.adminEmail = adminEmail;
        this.adminPassword = adminPassword;
        this.employeeEmail = employeeEmail;
        this.employeePassword = employeePassword;
    }

    @Override
    public void run(String... args) {
        if (!enabled) return;
        ensure(adminEmail, "Default Admin", adminPassword, Role.ADMIN, BigDecimal.ZERO);
        ensure(employeeEmail, "Demo Employee", employeePassword, Role.EMPLOYEE, new BigDecimal("12000.00"));
    }

    private void ensure(String email, String name, String password, Role role, BigDecimal monthlySalary) {
        if (employees.existsByEmail(email)) return;
        Employee e = new Employee();
        e.setName(name);
        e.setEmail(email);
        e.setPasswordHash(encoder.encode(password));
        e.setRole(role);
        e.setMonthlySalary(monthlySalary);
        if (role == Role.EMPLOYEE) {
            shifts.findAll().stream().findFirst().ifPresent(s -> e.setShiftId(s.getId()));
        }
        e.setActive(true);
        employees.save(e);
        log.info("Seeded default {} account: {}", role, email);
    }
}
