---
help_id: sysml-modeler.behavior-views
title: Action Flow and State Transition views
kind: guide
summary: Diagrams of actions (successions, flows, parameters) and of states (entry/do/exit actions, transitions with triggers and guards), computed from the model. Descriptive only; nothing is executed.
keywords: [action, action flow, activity, state, state machine, transition, succession, trigger, guard, behaviour, behavior]
related: [sysml-modeler.views, sysml-modeler.text, sysml-modeler.language]
operations: [sysml-modeler.behavior]
---

Both views are **computed from the model** like the General and Interconnection views. They show
the model's own elements; nothing is drawn by hand and nothing is simulated or executed.

## Action Flow View

**Action flow** in the toolbar shows the actions owned by an action definition or action usage:

- each action usage as a rounded node (with its definition, `computeError : ComputeError`), its
  `in`/`out` parameters as ports;
- the context's own parameters on its border;
- successions (`first a then b;`, `then b;`) as arrows; a filled circle marks the start when the
  model says `first a;`;
- flows (`flow from a.out to b.in;`) as arrows labelled «flow» with the item type.

Successions to the standard library's `start` and `done` are not drawn; the view lists them as notes.

## State Transition View

**States** in the toolbar shows the states owned by a state definition or state usage:

- each state as a rounded node, with its `entry`, `do` and `exit` actions and its substates in
  compartments;
- transitions as arrows labelled with the trigger (the accepted item type) and guard,
  `StartCommand [speed > 0]`, followed by the transition name;
- the initial state, marked with a filled circle, when the model has `entry; then idle;`.

## Choosing what is shown

The view uses, in order: the element opened as the view root, the selected element (or the
action/state around it), and otherwise the first action or state definition of the model. Select
an element in the browser to switch.

## Example

```sysml
state def ActuatorModes {
    entry; then idle;
    state idle;
    state positioning;
    transition startPositioning first idle accept StartCommand then positioning;
}
```

## Assistant

`sysml-modeler.behavior` with `view: "action-flow"` or `"state-transition"` returns the same
nodes, edges and notes. Example prompts: “Describe the state machine”, “Show the action flow of
the control loop”.

## Limits

- Decision, merge, fork and join nodes, send/accept actions inside actions, swimlanes and
  nested-state hierarchy drawing are planned; nested states are listed in a compartment.
- These are SysML v2 view presentations, not SysML v1 activity or state machine diagrams.
