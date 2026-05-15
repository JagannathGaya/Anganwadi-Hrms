package com.anganwadi.hrms.auth;

import com.anganwadi.hrms.employee.Role;

public record AuthPrincipal(Long employeeId, String email, Role role) {
}
