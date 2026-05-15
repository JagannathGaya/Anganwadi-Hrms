package com.anganwadi.hrms.employee;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/admin/employees")
public class AdminEmployeeController {

    private final EmployeeService service;

    public AdminEmployeeController(EmployeeService service) {
        this.service = service;
    }

    @GetMapping
    public ResponseEntity<List<EmployeeDto>> list(@RequestParam(value = "q", required = false) String q) {
        var results = service.search(q);
        var byShift = service.shiftsByEmployees(results);
        var out = results.stream()
                .map(e -> EmployeeDto.from(e, e.getShiftId() == null ? null : byShift.get(e.getShiftId())))
                .toList();
        return ResponseEntity.ok(out);
    }

    @PostMapping
    public ResponseEntity<EmployeeDto> create(@Valid @RequestBody CreateEmployeeRequest req) {
        Employee e = service.createByAdmin(req.name(), req.email(), req.phone(),
                req.password(), req.monthlySalary(), req.role(), req.shiftId());
        return ResponseEntity.ok(EmployeeDto.from(e, service.shiftFor(e)));
    }

    @PatchMapping("/{id}")
    public ResponseEntity<EmployeeDto> update(@PathVariable("id") Long id,
                                              @RequestBody Map<String, Object> patch) {
        String name  = (String) patch.get("name");
        String phone = (String) patch.get("phone");
        BigDecimal salary = patch.get("monthlySalary") == null ? null
                : new BigDecimal(String.valueOf(patch.get("monthlySalary")));
        Boolean active = patch.get("active") == null ? null : Boolean.parseBoolean(String.valueOf(patch.get("active")));
        Role role = patch.get("role") == null ? null : Role.valueOf(String.valueOf(patch.get("role")));
        boolean shiftProvided = patch.containsKey("shiftId");
        Long shiftId = !shiftProvided || patch.get("shiftId") == null
                ? null : Long.valueOf(String.valueOf(patch.get("shiftId")));
        String pw = (String) patch.get("password");
        Employee e = service.updateByAdmin(id, name, phone, salary, active, role,
                shiftId, shiftProvided, pw);
        return ResponseEntity.ok(EmployeeDto.from(e, service.shiftFor(e)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deactivate(@PathVariable("id") Long id) {
        service.deactivate(id);
        return ResponseEntity.noContent().build();
    }

    public record CreateEmployeeRequest(
            @NotBlank String name,
            @Email @NotBlank String email,
            String phone,
            @NotBlank String password,
            BigDecimal monthlySalary,
            Role role,
            Long shiftId
    ) {}
}
