---
help_id: sysml-modeler.example
title: "Worked example: electromechanical linear actuator"
kind: tutorial
summary: A multidisciplinary model with mechanical, electrical, software and control parts, interfaces and flows, behaviour, requirements, satisfaction and allocation.
keywords: [example, actuator, multidisciplinary, mechanical, electrical, software, control, walkthrough]
related: [sysml-modeler.getting-started, sysml-modeler.views, sysml-modeler.ai]
---

The seeded project models the ACT-100 actuator of the platform's sample product. A brushless motor
drives a ball screw through a gearbox; a controller closes a position loop using a position sensor.

| Package | Discipline | What it shows |
| --- | --- | --- |
| `Interfaces` | all | Items exchanged (electrical power, position command and measurement, torque) and the port definitions that carry them; an interface definition with conjugated ends |
| `Mechanical` | mechanical | Housing, gearbox, ball screw and rod with masses, lengths, ratios and efficiencies in SI units |
| `Electrical` | electrical | Power supply (24 V), motor driver (10 A), brushless motor (0.32 N·m, 3000 rpm) and position sensor |
| `Software` | software | Controller firmware, a mode state machine (idle, positioning, fault) with accept-triggered transitions, and a control-loop action with parameters and a succession |
| `Control` | control | A maximum-force calculation and the constraint that the stroke fits the housing |
| `Architecture` | system | `LinearActuator`: composition of all parts, an interface (power supply to driver), connections along the drive train, flows of measurements and commands, and the bound constraint `strokeFits` |
| `Requirements` | system | Load, mass and stroke requirement definitions with subjects and required constraints, and their usages |
| `Product` | system | `act100`, the configured system that satisfies the requirements, and the allocation of the control loop to the controller |

## Things to try

1. **Interconnection View** of `Architecture::LinearActuator` (browser › select › toolbar
   Interconnection): power and phase connections, the shaft line and the measurement and command
   flows.
2. **General View** of `Requirements` and `Product`: `satisfy` edges from `act100` to the
   requirements.
3. **Validation**: the example has no problems. Set `Mechanical::Rod::mass` to `0.4 [m]` and see
   `SYSML-UNIT-DIMENSION`; undo it from History.
4. **Impact**: select `Electrical::BrushlessMotor` and read *Referenced by*, or ask the assistant
   "What uses BrushlessMotor?".
5. **Elaboration**: ask the assistant to "Add a cooling subsystem", review the proposal and apply
   it; then undo it.

Values are illustrative engineering data for demonstration, not a product specification. In the
platform, requirement text is owned by Requirements Management; link the usages with
`ManagedRequirement` metadata.
