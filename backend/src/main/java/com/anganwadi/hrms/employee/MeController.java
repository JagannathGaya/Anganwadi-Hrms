package com.anganwadi.hrms.employee;

import com.anganwadi.hrms.auth.AuthPrincipal;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/me")
public class MeController {

    private final EmployeeService service;

    public MeController(EmployeeService service) {
        this.service = service;
    }

    @GetMapping
    public ResponseEntity<EmployeeDto> me(@AuthenticationPrincipal AuthPrincipal principal) {
        Employee e = service.getById(principal.employeeId());
        return ResponseEntity.ok(EmployeeDto.from(e, service.shiftFor(e)));
    }

    @PatchMapping
    public ResponseEntity<EmployeeDto> update(@AuthenticationPrincipal AuthPrincipal principal,
                                              @RequestBody Map<String, Object> patch) {
        String name  = patch.get("name")  == null ? null : String.valueOf(patch.get("name"));
        String phone = patch.get("phone") == null ? null : String.valueOf(patch.get("phone"));
        Employee e = service.updateSelf(principal.employeeId(), name, phone);
        return ResponseEntity.ok(EmployeeDto.from(e, service.shiftFor(e)));
    }
}
