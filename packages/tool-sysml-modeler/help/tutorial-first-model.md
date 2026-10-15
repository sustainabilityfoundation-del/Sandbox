---
help_id: sysml-modeler.tutorial.first-model
title: "Tutorial: model a battery and connect it"
kind: tutorial
summary: Add a part definition with an attribute, use it in the system, connect it, validate, and undo, using the browser, the Add dialog, Properties and the Interconnection View.
keywords: [tutorial, create, add, part, connect, first model]
related: [sysml-modeler.getting-started, sysml-modeler.properties, sysml-modeler.views]
---

1. In the browser, select `ActuatorSystem › Electrical`. Choose **Add** in the toolbar.
2. Choose kind **part def**, name `Battery`, and choose **Create**. The new definition is selected.
3. With `Battery` selected, choose **Add member**: kind **attribute**, name `capacity`, defined by
   `ISQ::ElectricChargeValue`, value `7200 [C]`, then **Create**.
4. Choose **Add member** again: kind **port**, name `powerOut`, defined by
   `ActuatorSystem::Interfaces::PowerPort`.
5. Select `Architecture › LinearActuator`, choose **Add member**: kind **part**, name `battery`,
   defined by `ActuatorSystem::Electrical::Battery`.
6. Choose **Interconnection**, then **Connect**: from `battery.powerOut` to `driver.powerIn`.
7. Choose **Validate**: no new problems. Choose **History** to see the commits you made, then
   **Undo** them one by one (newest first).

The same steps can be written as text: select `Electrical`, choose **Text**, add
`part def Battery { attribute capacity : ElectricChargeValue = 7200 [C]; port powerOut : Interfaces::PowerPort; }`,
then **Preview** and **Apply**.
