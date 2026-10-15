---
help_id: cad-modeler.parameters
title: Parameters and expressions
kind: guide
summary: Named design parameters with expressions, units and functions that drive dimensions and features.
keywords: [parameter, expression, variable, equation, unit, formula, dimension]
related: [cad-modeler.regeneration, cad-modeler.sketch]
---

Each part has **parameters** (Model tab). A parameter has a name (letters, digits, underscore), an
expression and a unit (mm, deg or none). Expressions may use other parameters, `+ - * / % ^`,
brackets, `pi`, functions (`sin`, `cos`, `tan` in degrees, `asin`, `acos`, `atan`, `sqrt`, `abs`,
`min`, `max`, `round`, `floor`, `ceil`, `hypot`) and unit suffixes (`mm`, `cm`, `m`, `in`, `ft`,
`deg`, `rad`).

Examples: `80`, `width / 2`, `1 in` (25.4), `max(thickness, 3)`.

Change an expression and press Enter: everything that uses the parameter regenerates. Circular
definitions and unknown names are refused. Dimensions and feature values may use the same
expressions directly. Unit consistency (adding a length to an angle) is not checked yet.

**Bindings.** A parameter can record what it implements: a revision-pinned reference to another
module's artifact, typically a design constraint in Conceptualize. Set it with the command
`bind_parameter { partId, name, ref: { module, kind, id, revision }, quantity?, note? }` and remove it
with `unbind_parameter`.

- The Parameters panel shows the binding next to the parameter.
- The bound value is never copied into the model. `cad-modeler.check` reads the bound limits from the
  owning module and compares them with the regenerated model.
- `cad-modeler.check_bindings` lists bindings pinned to a revision that has since been superseded.
