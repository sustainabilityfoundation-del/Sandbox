-- Conceptualize entitlement (docs/specifications/conceptualize-contracts.md §6). Additive only
-- (ADR-0009): grants tool:conceptualize to the development users ada (administrator), rui (reviewer),
-- eli (editor) and rho (reader) where they already exist; nia stays without it. No row is changed or
-- deleted. Databases created later receive the grant when the development users are seeded
-- (prepareDatabase in services/api/src/server.ts).
INSERT INTO platform.entitlements (user_id, entitlement)
SELECT id, 'tool:conceptualize' FROM platform.users WHERE id IN ('ada', 'rui', 'eli', 'rho')
ON CONFLICT DO NOTHING;
