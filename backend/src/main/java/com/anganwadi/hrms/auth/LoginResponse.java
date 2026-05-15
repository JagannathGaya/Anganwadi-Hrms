package com.anganwadi.hrms.auth;

import com.anganwadi.hrms.employee.Role;

public record LoginResponse(
        String token,
        long employeeId,
        String email,
        String name,
        Role role
) {}
