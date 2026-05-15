package com.anganwadi.hrms.auth;

import com.anganwadi.hrms.employee.Employee;
import com.anganwadi.hrms.employee.Role;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.Map;

@Service
public class JwtService {

    private final SecretKey key;
    private final long ttlMinutes;

    public JwtService(@Value("${app.jwt.secret}") String secret,
                      @Value("${app.jwt.ttl-minutes}") long ttlMinutes) {
        byte[] bytes = secret.getBytes(StandardCharsets.UTF_8);
        if (bytes.length < 32) {
            throw new IllegalStateException("app.jwt.secret must be at least 32 bytes");
        }
        this.key = Keys.hmacShaKeyFor(bytes);
        this.ttlMinutes = ttlMinutes;
    }

    public String issue(Employee employee) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(String.valueOf(employee.getId()))
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusSeconds(ttlMinutes * 60)))
                .claims(Map.of(
                        "email", employee.getEmail(),
                        "role", employee.getRole().name()
                ))
                .signWith(key)
                .compact();
    }

    public Claims parse(String token) {
        return Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    public Long subjectAsId(Claims claims) {
        return Long.valueOf(claims.getSubject());
    }

    public Role roleOf(Claims claims) {
        return Role.valueOf((String) claims.get("role"));
    }
}
