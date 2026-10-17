---
help_id: sysml-modeler.language
title: Supported language (SysML v2 subset)
kind: reference
summary: The SysML v2 textual notation and semantics this version supports, what it does not support yet, and the model library it provides.
keywords: [language, sysml v2, textual notation, grammar, supported, unsupported, conformance, library, units]
related: [sysml-modeler.text, sysml-modeler.validation, sysml-modeler.troubleshooting]
---

The System Model implements a **subset** of SysML v2 (OMG SysML 2.0 and KerML 1.0). It makes **no
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
- Behaviour: action parameters; `first x;` and `then` successions (`then action b;`, `then done;`);
  `perform` and `exhibit`; accept actions `accept s : Signal via port`; states with
  `entry`/`do`/`exit`; transitions `transition t first s1 accept T via p if guard then s2` and the
  shorthand `accept T then s2;`.
- Requirements and constraints: `subject`, `require constraint { … }`, `assume constraint { … }`,
  `require c;`, `assert constraint`, `assert not constraint`, `satisfy`, `not satisfy`.
- Cases, concerns and views (structure only, nothing executes or renders): `use case`,
  `verification` with `objective { verify r; }`, `analysis`, `case`, `concern` with
  `stakeholder`, `viewpoint` with `frame`, `view` with `expose` and `render`, `rendering`, `actor`.
- Expressions: literals, arithmetic, comparison, boolean operators, `if … ? … else …`, invocation,
  sequences `(a, b, c)`, feature chains `a.b.c`, quantities with units `12 [kg]`, `3 [m/s]`,
  `9.81 [m/s^2]`, indexing `v#(1)`, ranges `1..3`, classification and casts (`istype`, `hastype`,
  `@`, `as`, `meta`) and arrow invocations `x->f(y)` (stored as the invocation `f(x, y)`).
- Metadata usages `@T { name = value; }` and prefixes `#T part x;`; specializing feature chains
  (`ref part x :> a.b;`).

## Not supported yet

`send`, messages and events, individuals, snapshots and time slices, variation points with
`variant`, decision, merge, fork and join nodes, loops and assignments, `include use case`,
`filter`, dependencies, `new` (constructor expressions), expression-body arguments
(`x->forAll { … }`), and feature chains after a parenthesized expression (`(x as T).y`).
Multiplicities of `end` features and connector ends (`end [0..1] item x`, `connect [1] a to [*] b`)
are read but not kept: they are reported, never dropped silently. Several details of the abstract syntax are simplified
(for example operator arguments, flow ends and the binding of `satisfy … by`); the developer
conformance list records each one.

Measured against the official SysML v2 release examples and training models (196 files), 19% load
with no diagnostics and 47% load with no errors other than standard-library names outside the
platform subset. Resolved against the official library (for measurement only, not bundled), 25%
load with no diagnostics.

## Model library

The bundled library is a **platform subset** written for this module. It declares standard names
so that models resolve: `ScalarValues` (Real, Integer, Boolean, String …), `ISQ` quantity value
types (MassValue, LengthValue, ForceValue, VoltageValue …), `SI` units by symbol (`kg`, `m`, `mm`,
`s`, `N`, `V`, `A`, `W`, `Hz`, `rpm`, `Nm` …), and base packages (Parts, Ports, Actions …). It is not
the OMG standard library; names not listed here do not resolve.

Implicit specializations: a definition or usage written without `:>` or `:` is treated as
specializing the library base of its kind (a `part def` specializes `Parts::Part`, an `action`
subsets `Actions::actions`, a `state def` specializes `States::StateAction`, and so on). This is
derived, not stored: the text and the stored model stay as written. It is why `first start;` and
`then done;` resolve inside any action (`Actions::Action` declares `start` and `done`).
