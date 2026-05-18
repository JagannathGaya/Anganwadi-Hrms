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

    /**
     * Apply admin adjustments to a payslip — manual overtime, bonus,
     * deductions, and their notes. Any field left null is left unchanged.
     * Pass clearManualOvertime=true to wipe the override.
     */
    @PatchMapping("/{id}/adjustments")
    public ResponseEntity<Payslip> applyAdjustments(@PathVariable("id") Long id,
                                                    @RequestBody AdjustRequest body) {
        return ResponseEntity.ok(payslipService.applyAdjustments(
                id,
                body.manualOvertimePay(),
                body.clearManualOvertime(),
                body.bonusAmount(),
                body.bonusNote(),
                body.deductions(),
                body.deductionNote()
        ));
    }

    public record AdjustRequest(
            java.math.BigDecimal manualOvertimePay,
            Boolean clearManualOvertime,
            java.math.BigDecimal bonusAmount,
            String bonusNote,
            java.math.BigDecimal deductions,
            String deductionNote
    ) {}

    /**
     * Revert an admin override back to the attendance-based payslip. Used
     * when "Complete with full salary" was applied by mistake or once
     * actual attendance data has been entered for the month.
     */
    @PostMapping("/{id}/revert-override")
    public ResponseEntity<Payslip> revertOverride(@PathVariable("id") Long id) {
        return ResponseEntity.ok(payslipService.clearManualOverride(id));
    }

    /**
     * Admin-only detailed view of a single payslip — includes the calendar
     * breakdown (days worked / leave / holiday / absent), daily and hourly
     * rates, deductions placeholder, and the derived net pay. Unlike the
     * employee endpoint, this bypasses the release gate.
     */
    @GetMapping("/{id}/detail")
    public ResponseEntity<PayslipDetail> detail(@PathVariable("id") Long id) {
        return ResponseEntity.ok(payslipService.adminDetail(id));
    }
}
