# Phased roadmap

Status: Proposed. Each phase ends with tested, usable functionality (B§14). Milestones are sprint-sized
vertical slices; status is tracked in the [progress file](../../specifications/sysml-program-progress.md).

| Phase | Milestones | Exit criteria |
| --- | --- | --- |
| 0 Research and architecture | M0.1 research deliverables (research/sysml); M0.2 requirements, ADRs, architecture docs; M0.3 decisions sent to the coordinator | Documents committed; approval items listed |
| 1 Foundation | M1.1 core metamodel, element store, standard JSON; M1.2 lexer/parser/serializer (documented subset), round-trip tests; M1.3 name resolution, library subset, validation rules, units; M1.4 typed commands, transactions, dry run, inverse, text reconciliation; M1.5 repository (schema `sysml`), API subset, outbox/SSE, OpenAPI; M1.6 client (HTTP + local) with contract tests; M1.7 AI access: assistant actions + service proposals | `npm run check`, DB tests and conformance tests green; an assistant proposal creates elements through the same commands and can be undone |
| 2 Modeling environment | M2.1 tool shell, model browser, inspector editing; M2.2 text editor with dry run/apply; M2.3 General View (auto layout); M2.4 Interconnection View; M2.5 validation and history panels; M2.6 help, harness, workspace registration, capability inventory | A person can create, edit, view, validate and undo a model in the workspace and the harness; both themes, three device sizes |
| 3 Engineering integration | M3.1 managed requirement metadata + Requirements SDK reads; M3.2 satisfy/verify coverage and traceability matrix; M3.3 ArtifactRef for Conceptualize (after CR-SYSML-02); M3.4 CAD links (after CR-SYSML-03); M3.5 tables and dependency matrices | Requirement coverage visible; concepts link to SysML Modeler elements |
| 4 Advanced modeling | M4.1 action flow and state transition views; M4.2 expression evaluation and constraint checking; M4.3 parametric solving, trade studies; M4.4 state-machine/activity execution (labelled executable); M4.5 v1 compatibility presentations; M4.6 query language | Executable behaviour clearly distinguished from descriptive |
| 5 Enterprise | M5.1 semantic merge and conflict resolution; M5.2 review/approval, publication; M5.3 element-level access control; M5.4 v1 XMI import/export + v1-to-v2 transformation subset; M5.5 10⁵–10⁶ element performance (partitioning, workers) | Measured performance targets; round-trip tests for each claimed format |
| 6 AI-native engineering | M6.1 architecture generation from concepts; M6.2 iterative design exploration with alternatives as branches; M6.3 impact analysis across modules; M6.4 autonomous validation loops within granted scope | Every operation available to the UI available to the AI (coverage inventory) |

AI access to the core model operations is part of Phase 1 (M1.7), not deferred (B§14).

## Proposed scope notes (recorded, not silently applied)

- **Rust/JVM components**: none proposed for Phase 1–2 (contracts §2). The OMG pilot implementation may
  be used as an *external* conformance oracle (JVM, not shipped) when the research confirms its licence
  allows it; this needs no approval.
- **Official standard library**: shipped only if its licence allows (ADR-0036); until then the platform
  subset library is used and labelled.
