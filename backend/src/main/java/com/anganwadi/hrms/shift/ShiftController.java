package com.anganwadi.hrms.shift;

import com.anganwadi.hrms.common.NotFoundException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

@RestController
public class ShiftController {

    private static final String HHMM = "^([01]\\d|2[0-3]):[0-5]\\d$";

    private final ShiftRepository repo;

    public ShiftController(ShiftRepository repo) { this.repo = repo; }

    /** Authenticated read — both employees and admins use this list. */
    @GetMapping("/shifts")
    public ResponseEntity<List<Shift>> list() {
        return ResponseEntity.ok(repo.findAllByOrderByStartTimeAsc());
    }

    @PostMapping("/admin/shifts")
    public ResponseEntity<Shift> create(@Valid @RequestBody ShiftRequest req) {
        Shift s = new Shift();
        apply(s, req);
        return ResponseEntity.ok(repo.save(s));
    }

    @PatchMapping("/admin/shifts/{id}")
    @Transactional
    public ResponseEntity<Shift> update(@PathVariable("id") Long id, @RequestBody Map<String, Object> body) {
        Shift s = repo.findById(id).orElseThrow(() -> new NotFoundException("shift not found"));
        if (body.containsKey("name") && body.get("name") != null) s.setName(String.valueOf(body.get("name")).trim());
        if (body.containsKey("startTime") && body.get("startTime") != null)
            s.setStartTime(validateHHmm(String.valueOf(body.get("startTime"))));
        if (body.containsKey("endTime") && body.get("endTime") != null)
            s.setEndTime(validateHHmm(String.valueOf(body.get("endTime"))));
        if (body.containsKey("dailyHours") && body.get("dailyHours") != null)
            s.setDailyHours(new BigDecimal(String.valueOf(body.get("dailyHours"))));
        return ResponseEntity.ok(repo.save(s));
    }

    @DeleteMapping("/admin/shifts/{id}")
    public ResponseEntity<Void> delete(@PathVariable("id") Long id) {
        if (!repo.existsById(id)) throw new NotFoundException("shift not found");
        repo.deleteById(id);
        return ResponseEntity.noContent().build();
    }

    private static String validateHHmm(String v) {
        if (!v.matches(HHMM)) throw new IllegalArgumentException("time must be HH:mm");
        return v;
    }

    private static void apply(Shift s, ShiftRequest r) {
        s.setName(r.name().trim());
        s.setStartTime(r.startTime());
        s.setEndTime(r.endTime());
        s.setDailyHours(r.dailyHours());
    }

    public record ShiftRequest(
            @NotBlank String name,
            @NotBlank @Pattern(regexp = HHMM, message = "must be HH:mm") String startTime,
            @NotBlank @Pattern(regexp = HHMM, message = "must be HH:mm") String endTime,
            @NotNull @Positive BigDecimal dailyHours
    ) {}
}
