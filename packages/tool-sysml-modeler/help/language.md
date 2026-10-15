---
help_id: sysml-modeler.language
title: Supported language (SysML v2 subset)
kind: reference
summary: The SysML v2 textual notation and semantics this version supports, what it does not support yet, and the model library it provides.
keywords: [language, sysml v2, textual notation, grammar, supported, unsupported, conformance, library, units]
related: [sysml-modeler.text, sysml-modeler.validation, sysml-modeler.troubleshooting]
---

The SysML Modeler implements a **subset** of SysML v2 (OMG SysML 2.0 and KerML 1.0). It makes **no
conformance claim**. Unsupported constructs are always reported as errors (`SYSML-SYNTAX-UNSUPPORTED`)
and never dropped silently.

## Supported

- Packages, library packages, visibility (`public`, `private`, `protected`), imports (`::*`,
  membership imports, recursive `::**`), aliases, `doc` and `comment … about`, short names
  (`<'R-1'>`) and quoted names (`'Power unit'`).
- Definitions and usages: `part`, `attribute`, `enum` (with literals), `item`, `port` (with
  conjugation `~`), `connection`, `interface` (with `end` features), `allocation`, `flow`,
  `action`, `state`, `constraint`, `requirement`, `calc`, `occurrence`, `metadata`, `ref`.
- Specialization `:>`, typing `:`, subsetting `:>`, redefinition `:>>`, reference subsetting `::>`,
  multiplicities `[n]`, `[n..m]`, `[*]`, `ordered`, `nonunique`, `abstract`, `in`/`out`/`inout`,
  `derived`, `constant`, feature values `=`, `:=`, `default`.
- Connections: `connect a.p to b.q`, `interface i : I connect …`, `flow of T from … to …`,
  `bind x = y`, `first a then b`, `allocate a to b`, `satisfy R by x`.
- Behaviour: action parameters and successions; states with `entry`/`do`/`exit`; transitions
  `transition t first s1 accept T if guard then s2`.
- Requirements: `subject`, `require constraint { … }`, `assume constraint { … }`.
- Expressions: literals, arithmetic, comparison, boolean operators, `if … ? … else …`, invocation,
  feature chains `a.b.c`, quantities with units `12 [kg]`, `3 [m/s]`, `9.81 [m/s^2]`.
- Metadata usages `@T { name = value; }`.

## Not supported yet

Use cases, verification cases and `verify`, analysis cases, views and viewpoints (`view`, `render`,
`expose`), concerns and stakeholders, `perform` and `exhibit`, `send`, messages and events,
individuals, snapshots and time slices, variation points with `variant`, decision, merge, fork and
join nodes and loops, `assert`, dependencies, and the `then` shorthand after a member. Several
details of the abstract syntax are simplified (for example operator arguments, flow ends and the
binding of `satisfy … by`); the developer conformance list records each one.

## Model library

The bundled library is a **platform subset** written for this module. It declares standard names
so that models resolve: `ScalarValues` (Real, Integer, Boolean, String …), `ISQ` quantity value
types (MassValue, LengthValue, ForceValue, VoltageValue …), `SI` units by symbol (`kg`, `m`, `mm`,
`s`, `N`, `V`, `A`, `W`, `Hz`, `rpm`, `Nm` …), and base packages (Parts, Ports, Actions …). It is not
the OMG standard library; names not listed here do not resolve.
