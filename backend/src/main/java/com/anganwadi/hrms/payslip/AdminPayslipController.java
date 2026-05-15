package com.anganwadi.hrms.payslip;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.YearMonth;
import java.util.List;

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
}
