package com.anganwadi.hrms.payslip;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

@Entity
@Table(name = "payslips",
       uniqueConstraints = @UniqueConstraint(columnNames = {"employee_id", "month"}))
public class Payslip {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "employee_id", nullable = false)
    private Long employeeId;

    @Column(name = "month", nullable = false, length = 7)
    private String month; // 'YYYY-MM'

    @Column(name = "total_hours", nullable = false, precision = 8, scale = 2)
    private BigDecimal totalHours = BigDecimal.ZERO;

    @Column(name = "regular_pay", nullable = false, precision = 12, scale = 2)
    private BigDecimal regularPay = BigDecimal.ZERO;

    @Column(name = "overtime_pay", nullable = false, precision = 12, scale = 2)
    private BigDecimal overtimePay = BigDecimal.ZERO;

    @Column(name = "gross_pay", nullable = false, precision = 12, scale = 2)
    private BigDecimal grossPay = BigDecimal.ZERO;

    @Column(nullable = false)
    private boolean paid = false;

    /**
     * Admin "activation" gate. Until this flips to true, employees see
     * the row as still being prepared and cannot view their payslip.
     * Defaults to false on new rows; backfilled to true for historical data.
     */
    @Column(nullable = false)
    private boolean released = false;

    /**
     * Set when an admin has manually overridden the payslip (e.g. "Complete
     * with full salary" for a back-dated month). When true, the attendance-
     * based recompute in generateOrRefresh is skipped so the override sticks
     * across employee fetches.
     */
    @Column(name = "manual_override", nullable = false)
    private boolean manualOverride = false;

    /**
     * Optional overtime override from the admin. When non-null, replaces the
     * attendance-computed `overtimePay` in the gross calculation. The
     * computed value stays in `overtimePay` so the audit trail isn't lost.
     */
    @Column(name = "manual_overtime_pay", precision = 12, scale = 2)
    private BigDecimal manualOvertimePay;

    /** Additional pay added to gross (performance bonus, festival bonus, etc). */
    @Column(name = "bonus_amount", nullable = false, precision = 12, scale = 2)
    private BigDecimal bonusAmount = BigDecimal.ZERO;

    /** Short label that describes the bonus. */
    @Column(name = "bonus_note", length = 200)
    private String bonusNote;

    /** Total deductions amount (tax, PF, loan recovery, advance, etc). */
    @Column(name = "deductions", nullable = false, precision = 12, scale = 2)
    private BigDecimal deductions = BigDecimal.ZERO;

    /** Free-form breakdown of deductions (e.g. "Tax 1000; PF 500"). */
    @Column(name = "deduction_note", length = 500)
    private String deductionNote;

    @Column(name = "generated_at", nullable = false)
    private OffsetDateTime generatedAt = OffsetDateTime.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getEmployeeId() { return employeeId; }
    public void setEmployeeId(Long employeeId) { this.employeeId = employeeId; }

    public String getMonth() { return month; }
    public void setMonth(String month) { this.month = month; }

    public BigDecimal getTotalHours() { return totalHours; }
    public void setTotalHours(BigDecimal totalHours) { this.totalHours = totalHours; }

    public BigDecimal getRegularPay() { return regularPay; }
    public void setRegularPay(BigDecimal regularPay) { this.regularPay = regularPay; }

    public BigDecimal getOvertimePay() { return overtimePay; }
    public void setOvertimePay(BigDecimal overtimePay) { this.overtimePay = overtimePay; }

    public BigDecimal getGrossPay() { return grossPay; }
    public void setGrossPay(BigDecimal grossPay) { this.grossPay = grossPay; }

    public boolean isPaid() { return paid; }
    public void setPaid(boolean paid) { this.paid = paid; }

    public boolean isReleased() { return released; }
    public void setReleased(boolean released) { this.released = released; }

    public boolean isManualOverride() { return manualOverride; }
    public void setManualOverride(boolean manualOverride) { this.manualOverride = manualOverride; }

    public BigDecimal getManualOvertimePay() { return manualOvertimePay; }
    public void setManualOvertimePay(BigDecimal manualOvertimePay) { this.manualOvertimePay = manualOvertimePay; }

    public BigDecimal getBonusAmount() { return bonusAmount; }
    public void setBonusAmount(BigDecimal bonusAmount) {
        this.bonusAmount = bonusAmount == null ? BigDecimal.ZERO : bonusAmount;
    }

    public String getBonusNote() { return bonusNote; }
    public void setBonusNote(String bonusNote) { this.bonusNote = bonusNote; }

    public BigDecimal getDeductions() { return deductions; }
    public void setDeductions(BigDecimal deductions) {
        this.deductions = deductions == null ? BigDecimal.ZERO : deductions;
    }

    public String getDeductionNote() { return deductionNote; }
    public void setDeductionNote(String deductionNote) { this.deductionNote = deductionNote; }

    /** Effective overtime in gross calculation: manual override wins. */
    public BigDecimal effectiveOvertimePay() {
        return manualOvertimePay != null ? manualOvertimePay
                : (overtimePay == null ? BigDecimal.ZERO : overtimePay);
    }

    public OffsetDateTime getGeneratedAt() { return generatedAt; }
    public void setGeneratedAt(OffsetDateTime generatedAt) { this.generatedAt = generatedAt; }
}
