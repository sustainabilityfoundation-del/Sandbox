---
help_id: sysml-modeler.overview
title: System Model
kind: overview
summary: Model systems in SysML v2 (a documented subset) with a model browser, textual notation, projected views, properties, validation and versioned history; the AI assistant uses the same commands.
keywords: [sysml, mbse, model, sysml v2, overview, systems engineering]
related: [sysml-modeler.getting-started, sysml-modeler.language, sysml-modeler.example]
---

The System Model is the platform's model-based systems engineering (MBSE) environment. The model
is stored as **SysML v2 / KerML elements**: definitions, usages and the relationships between them,
in a versioned repository. Every view is a projection of that model: diagrams, the browser and the
text are different ways of looking at the same elements.

> It implements a **documented subset** of SysML v2. It is not a SysML v2 conformant tool; see
> [Supported language](help:sysml-modeler.language) for exactly what is and is not supported.

## What you can do

- Browse and search the containment tree ([Model browser](help:sysml-modeler.browser)).
- Edit packages and definitions as SysML v2 text, with a preview before applying ([Textual editor](help:sysml-modeler.text)).
- See General and Interconnection Views laid out automatically ([Views](help:sysml-modeler.views)), Action Flow and State Transition views ([Behaviour views](help:sysml-modeler.behavior-views)), relationship matrices and requirement coverage ([Matrices](help:sysml-modeler.matrix), [Coverage](help:sysml-modeler.coverage)).
- Edit names, types, multiplicities, values and documentation ([Properties](help:sysml-modeler.properties)).
- Validate the model against 19 rules, including unit and quantity checks ([Validation](help:sysml-modeler.validation)).
- Review every change as a commit with its author and reason, and undo it ([History and versions](help:sysml-modeler.history)).
- Ask the assistant to inspect, validate, analyse impact and propose changes ([AI operations](help:sysml-modeler.ai)).
- Follow a worked engineering example ([Actuator example](help:sysml-modeler.example)).

## How it fits the platform

- **Tool ID** `sysml-modeler`, subscription entitlement `tool:sysml`. The older illustrative *SysML*
  tool is retired from the interface; the SysML elements it wrote to the example project stay readable in the product tree and inspector.
- **Requirements** remain owned by Requirements Management. Platform metadata
  `@EWS::ManagedRequirement` links a requirement in the model to the managed requirement by its UUID
  (see [Commands](help:sysml-modeler.commands)).
- Data lives in the SysML service (`/api/sysml/v1`, PostgreSQL schema `sysml`) or, when chosen
  explicitly, in a local in-browser repository for the standalone harness and demos
  ([API and integration](help:sysml-modeler.api)).
