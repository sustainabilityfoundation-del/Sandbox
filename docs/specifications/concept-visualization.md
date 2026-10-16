# Visual concept exploration (Conceptualize): brief (owner's text, verbatim)

Received 15 October 2026. Coordinator contracts and ownership: [concept-visualization-contracts.md](concept-visualization-contracts.md).
Progress: in [conceptualize-progress.md](conceptualize-progress.md) (section "Visual concept exploration") and
[ai-connection-progress.md](ai-connection-progress.md) (generation adapters).

---

Implement visual concept exploration in the Conceptualize module.

Objective

The AI currently develops useful concepts, but its output is predominantly text. Add visual representations that help users understand, compare, and refine options before committing to detailed engineering.

Think of the role concept sketches play in vehicle development: they communicate ideas early and support design decisions. Extend this principle to mechanisms, component layouts, systems, and engineering products.

Integrate this into the existing architecture and current end-to-end demonstration. Inspect the repository, architecture guidance, and existing modules before making changes. Reuse existing services and data models wherever practical.

1. Make visualization part of a concept

A concept should link:

- Design intent and operating principles.
- Structured engineering information.
- One or more visual representations.
- Requirements, assumptions, uncertainties, and design decisions.
- Downstream SysML, CAD, and analysis artifacts.

A concept may represent a part, assembly, or complete system. Do not restrict the implementation to one product type or the demonstration example.

Visuals must belong to saved projects and concept revisions, rather than existing only as transient chat attachments.

2. Support appropriate visual representations

Select the representation according to the design question:

Design question| Representation
What could it look like?| Sketch, silhouette, or rendered concept
How does it work?| Mechanism diagram, operating sequence, or flow diagram
Where do components fit?| Annotated layout or packaging diagram
How is the system organized?| Functional or system architecture diagram
What are the spatial constraints?| Dimensioned envelopes or simplified geometry
How do alternatives differ?| Comparable views with highlighted differences

For the first release, implement concept illustrations and structured, annotated 2D layouts. Prepare the architecture for interactive 3D envelopes and motion representations without making those prerequisites for delivery.

Use generated imagery for exploratory appearance and explanatory sketches. Use structured graphics or geometry for exact dimensions, interfaces, relationships, and engineering annotations.

3. Add a visual concept comparison workflow

Allow the AI to propose a configurable number of alternatives, with three as the default.

Each concept card should contain:

- A useful visual.
- A concise explanation of its operating principle.
- Key components and interfaces.
- Principal benefits and trade-offs.
- Relevant requirements and constraints.
- Assumptions, unresolved questions, and validation status.

Alternatives should differ meaningfully in architecture, mechanism, packaging, or manufacture. Avoid producing only cosmetic variations unless styling is the user's objective.

Keep views, scale, and annotations consistent where practical. Identify when illustrations are not to scale.

Allow users to expand a concept, compare alternatives, select one for refinement, and retain rejected alternatives with their decision rationale.

4. Enable visual refinement through the AI interface

Support this initial interaction:

1. Select a concept or visual.
2. Add a numbered pin or rectangular region annotation.
3. Enter an instruction referring to the selection.
4. Have the AI propose updates to the concept.
5. Apply those updates and generate a new visual revision.

Examples:

- "Move this hinge toward the rear."
- "Keep this housing but use the retention principle from option B."
- "Reduce the overall width while retaining the required clearances."

Store annotations against the exact visual revision, including normalized coordinates and the associated instruction. Do not silently carry annotations onto regenerated images when their locations may no longer be meaningful.

Where components are represented as structured graphic elements, use stable component identifiers. For raster sketches, treat region-to-component interpretation as an inference, with clarification when ambiguous.

Do not promise arbitrary image edits will preserve exact engineering geometry.

5. Preserve an authoritative engineering definition

Generated images are illustrative artifacts, not authoritative geometry or evidence of compliance.

Extend the existing concept model to represent:

- Components and relationships.
- Functional intent.
- Interfaces and constraints.
- Parameters, values, and units.
- Assumptions and unresolved questions.
- Requirement links.
- Decision records.
- Visual artifacts and revisions.
- Links to downstream engineering artifacts.

Separate:

- Defined engineering parameters.
- Illustrative or inferred visual features.
- Properties verified through a recorded check.

Dimensions displayed as authoritative annotations must come from structured engineering data. Do not infer authoritative dimensions from image proportions or rely on generated text within images for dimension labels.

A convincing image must never automatically mark a requirement as satisfied, a mechanism as feasible, or a design as verified.

6. Introduce progressive visual maturity

Support a progression through:

Exploration: sketches, operating principles, alternatives, and loose proportions.

Layout: component envelopes, interfaces, axes, clearances, and controlled dimensions.

Engineering: parametric CAD, explicit constraints, materials, and analysis.

These representations should remain linked to the same concept and its revisions.

CAD creation must consume structured intent, parameters, and interfaces, with images serving as references. If information required for CAD is missing, expose the gap and request or propose the missing definition.

Record the concept revision used to create each downstream artifact. When relevant parameters change, mark dependent representations as potentially outdated. Avoid silent overwrites or automatic regeneration of everything.

7. Integrate with the existing modules

Requirements: Trace concepts to relevant requirements and show which constraints each option addresses. Distinguish intended satisfaction from verified compliance.

Design reasoning: Record why alternatives were proposed, selected, combined, or rejected, together with assumptions and trade-offs.

SysML: Link concept components, functions, and interfaces to the existing system model where applicable. Avoid creating a competing system-model database.

CAD: Provide a structured handoff for the selected concept, including known parameters, interfaces, envelopes, and unresolved items.

Project management: Save visuals, annotations, revisions, decisions, and dependencies with the project. Reopening the project must restore the complete concept exploration state.

AI interface: Expose the same concept, visualization, annotation, selection, and refinement operations to AI and human workflows through shared application services.

8. Implementation requirements

Use the existing application conventions for APIs, persistence, authorization, jobs, and asset storage.

Provide a visualization service with replaceable rendering or generation adapters. Keep provider-specific logic outside the concept domain model.

For external image generation:

- Keep credentials on the server.
- Submit only the project context needed for the operation.
- Track pending, completed, and failed jobs.
- Provide retry and cancellation behavior consistent with the application.
- Avoid duplicate generation or charges caused by repeated requests.
- Record provider/model identity, generation instructions, reference assets, and the source concept revision.
- Preserve successful outputs when another option fails.

Do not block the interface while visuals generate. Present concepts progressively.

If an image-generation provider is unavailable, retain a usable structured diagram workflow and clearly explain the unavailable capability. Do not substitute placeholder images and report image generation as complete.

Document configuration, expected usage costs, and any provider limitations in the developer documentation.

9. Deliver a focused first implementation

Prioritize this complete workflow:

1. Create a clean project.
2. Enter a small engineering problem.
3. Establish initial requirements and constraints.
4. Generate three meaningfully different concepts with visuals.
5. Compare the concepts.
6. Annotate and refine one option.
7. Record the selection rationale.
8. Produce a structured layout and CAD handoff.
9. Create the CAD artifact through the existing CAD workflow.
10. Save and reopen the project with traceability intact.

Use the existing small engineering demonstration if suitable. Keep its data separate from reusable product logic; do not hard-code its components or design assumptions into the application.

Defer advanced animation, unrestricted sketch-to-CAD reconstruction, and full interactive 3D concept editing to the backlog unless they are already available through existing infrastructure.

10. Acceptance and delivery

Verify that:

- A user can understand the principal differences between alternatives visually.
- Visual refinement creates a traceable revision.
- Structured dimension labels match their source parameters.
- Project save/reopen preserves visuals and annotations.
- Relevant concept changes identify outdated dependent artifacts.
- Failed generation does not destroy successful work.
- AI and human actions use the same domain operations.
- The selected concept reaches the CAD workflow without losing its requirement and decision links.

Add focused tests for persistence, revision/dependency behavior, and generation failure handling. Exercise the user-facing workflow directly.

Update the module help and relevant architecture/API documentation.

Conclude with a concise implementation report covering what works, how it was validated, configuration required, and remaining limitations. Clearly distinguish implemented functionality from planned capabilities and any blocked CAD integration.

Proceed with implementation after inspecting the repository; do not stop at an architecture proposal.
