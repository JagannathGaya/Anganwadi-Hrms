package com.anganwadi.hrms.auth;

import com.anganwadi.hrms.employee.Employee;
import com.anganwadi.hrms.employee.EmployeeRepository;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class AuthService {

    private final EmployeeRepository employees;
    private final PasswordEncoder encoder;
    private final JwtService jwtService;

    public AuthService(EmployeeRepository employees, PasswordEncoder encoder, JwtService jwtService) {
        this.employees = employees;
        this.encoder = encoder;
        this.jwtService = jwtService;
    }

    public LoginResponse login(LoginRequest req) {
        Employee employee = employees.findByEmail(req.email().trim().toLowerCase())
                .orElseThrow(() -> new BadCredentialsException("Invalid credentials"));
        if (!employee.isActive()) {
            throw new DisabledException("Account is deactivated");
        }
        if (!encoder.matches(req.password(), employee.getPasswordHash())) {
            throw new BadCredentialsException("Invalid credentials");
        }
        String token = jwtService.issue(employee);
        return new LoginResponse(token, employee.getId(), employee.getEmail(), employee.getName(), employee.getRole());
    }
}
