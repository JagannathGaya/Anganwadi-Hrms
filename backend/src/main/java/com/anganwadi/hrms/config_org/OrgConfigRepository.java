package com.anganwadi.hrms.config_org;

import org.springframework.data.jpa.repository.JpaRepository;

public interface OrgConfigRepository extends JpaRepository<OrgConfig, Short> {
    default OrgConfig getSingleton() {
        return findById((short) 1).orElseThrow(() -> new IllegalStateException("org_config row missing"));
    }
}
