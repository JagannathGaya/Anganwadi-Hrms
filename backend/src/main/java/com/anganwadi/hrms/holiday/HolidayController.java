package com.anganwadi.hrms.holiday;

import com.anganwadi.hrms.common.ConflictException;
import com.anganwadi.hrms.common.NotFoundException;
import com.anganwadi.hrms.config_org.OrgConfigRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@RestController
public class HolidayController {

    private final HolidayRepository repo;
    private final OrgConfigRepository cfg;

    public HolidayController(HolidayRepository repo, OrgConfigRepository cfg) {
        this.repo = repo;
        this.cfg = cfg;
    }

    /** Public list — useful for both employee app and admin view. */
    @GetMapping("/holidays")
    public ResponseEntity<List<Holiday>> list(
            @RequestParam(value = "from", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(value = "to",   required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        if (from != null && to != null) return ResponseEntity.ok(repo.findByDateBetweenOrderByDateAsc(from, to));
        return ResponseEntity.ok(repo.findAllByOrderByDateAsc());
    }

    @GetMapping("/admin/holidays/quota")
    public ResponseEntity<Map<String, Object>> quota(
            @RequestParam(value = "year", required = false) Integer year) {
        int y = year != null ? year : LocalDate.now().getYear();
        long used = repo.countByDateBetween(LocalDate.of(y, 1, 1), LocalDate.of(y, 12, 31));
        int quota = cfg.getSingleton().getAnnualHolidayQuota();
        return ResponseEntity.ok(Map.of("year", y, "used", used, "quota", quota,
                "remaining", Math.max(0, quota - used)));
    }

    @PostMapping("/admin/holidays")
    public ResponseEntity<Holiday> create(@Valid @RequestBody CreateRequest req) {
        Holiday h = new Holiday();
        h.setDate(req.date());
        h.setName(req.name().trim());
        try {
            return ResponseEntity.ok(repo.save(h));
        } catch (DataIntegrityViolationException e) {
            throw new ConflictException("a holiday already exists on " + req.date());
        }
    }

    @DeleteMapping("/admin/holidays/{id}")
    public ResponseEntity<Void> delete(@PathVariable("id") Long id) {
        if (!repo.existsById(id)) throw new NotFoundException("holiday not found");
        repo.deleteById(id);
        return ResponseEntity.noContent().build();
    }

    public record CreateRequest(@NotNull LocalDate date, @NotBlank String name) {}
}
