# ADR-0031: SysML Modeler — TypeScript semantic core with a hand-written parser

Status: Accepted (16 October 2026, coordinator, after review against main 186db1c; amendments recorded below)

## Context

The brief prefers reusing existing infrastructure and evaluating open-source SysML v2 parsers before
building equivalents (§9). The platform is TypeScript end to end; a new shipped runtime needs approval
(contracts §2). Candidates (research/sysml/open-source-landscape.md): the OMG pilot implementation
(Java/Xtext, JVM), SysON (Java/Sirius Web), SysIDE/sysml-2ls (TypeScript/Langium), tree-sitter grammars,
Python tooling.

## Decision

- Implement the KerML/SysML v2 semantic core in TypeScript (`@ews/sysml-core`), framework-free, so the
  same engine runs in the service (Node) and in the browser (local adapter, editors).
- Hand-write a recursive-descent lexer/parser for a documented subset of the textual notation, producing
  a hand-written syntax tree (`syntax/ast.ts`) that `syntax/build.ts` maps to abstract-syntax elements
  (no third-party parser or CST library). Rationale: no maintained, permissively
  licensed TypeScript parser that produces the abstract syntax could be confirmed (see the research
  landscape for each candidate's licence and maintenance status); Langium would add a large
  framework and its own AST we would still have to map; a hand-written parser gives precise error
  recovery and source ranges for the editor.
- The conformance oracle is the official release corpus (tags 2026-04 and later, EPL-2.0), run by
  `npm run sysml:conformance`; it is not shipped. The pilot implementation is not used.

## Consequences

- No new runtime; one engine for server and browser; the core is unit-testable without a database.
- We own grammar coverage: risk R-01, mitigated by conformance tests and an explicit unsupported list.
- Re-evaluate Langium-based reuse if a permissively licensed, maintained SysML v2 grammar appears.

## Alternatives considered

- JVM pilot implementation as a service: new shipped runtime (approval), heavy, LGPL/EPL questions.
- SysON as the editor: Java backend, different persistence; would not integrate with platform services.
- Langium grammar from scratch: comparable effort to a hand-written parser, plus framework weight.

## Amendments on acceptance

- The parser produces a hand-written syntax tree (`syntax/ast.ts`) mapped by `syntax/build.ts`; no third-party parser or CST library.
- The oracle is the official release corpus run by `npm run sysml:conformance`; the pilot implementation is not used.
