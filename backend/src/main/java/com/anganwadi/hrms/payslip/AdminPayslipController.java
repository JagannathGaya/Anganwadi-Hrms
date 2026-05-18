package com.anganwadi.hrms.payslip;

import jakarta.validation.constraints.NotNull;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.YearMonth;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/admin/payslips")
public class AdminPayslipController {

    private final PayslipService payslipService;

    public AdminPayslipController(PayslipService payslipService) {
        this.payslipService = payslipService;
    }

    @GetMapping
    public ResponseEntity<List<Payslip>> list(@RequestParam("month") String month,
                                              @RequestParam(value = "employee_id", required = false) Long employeeId) {
        YearMonth ym = PayslipController.parseMonth(month);
        if (employeeId != null) {
            return ResponseEntity.ok(List.of(payslipService.generateOrRefresh(employeeId, ym)));
        }
        return ResponseEntity.ok(payslipService.listForMonth(ym.toString()));
    }

    @PostMapping("/{id}/mark-paid")
    public ResponseEntity<Payslip> markPaid(@PathVariable("id") Long id) {
        return ResponseEntity.ok(payslipService.markPaid(id));
    }

    /**
     * Activate a single payslip so the employee can view it. Body:
     *   { "released": true }   to release
     *   { "released": false }  to revoke
     */
    @PostMapping("/{id}/release")
    public ResponseEntity<Payslip> setReleased(@PathVariable("id") Long id,
                                               @RequestBody ReleaseRequest body) {
        return ResponseEntity.ok(payslipService.setReleased(id, body.released()));
    }

    /**
     * Convenience: release every existing payslip for a given month in one
     * call. Returns the number of rows actually flipped.
     */
    @PostMapping("/release-month")
    public ResponseEntity<Map<String, Object>> releaseMonth(@RequestParam("month") String month) {
        YearMonth ym = PayslipController.parseMonth(month);
        int updated = payslipService.releaseMonth(ym);
        return ResponseEntity.ok(Map.of("month", ym.toString(), "released", updated));
    }

    public record ReleaseRequest(@NotNull Boolean released) {}
}
