# GRAFCET - Learning Portal Delivery Flow

## Main flow
1. Start planning baseline
2. Define unified target structure (`webapp` + `BUILD`)
3. Build portal shell skeleton
4. Add three feature routes
5. Migrate A3
6. Migrate A2
7. Migrate A1
8. Assemble Docker runtime
9. Validate exposed service on `7014`
10. Complete

## State details
### S0 Planning baseline
- exit when architecture, milestones, and tasks are documented

### S1 Portal shell skeleton
- includes homepage, cards, router, placeholders
- exit when `/`, `/a1`, `/a2`, `/a3` resolve in the unified frontend

### S2 A3 migrated
- exit when arithmetic learning runs inside `webapp`

### S3 A2 migrated
- exit when idiom quiz runs inside `webapp` through backend-backed generation boundary

### S4 A1 migrated
- exit when word lookup runs inside `webapp` through backend-backed lookup boundary

### S5 Docker assembled
- exit when `BUILD/` contains runnable container configuration and port `7014` is the external entrypoint
