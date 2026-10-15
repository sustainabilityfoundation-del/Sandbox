/**
 * PLATFORM MODEL LIBRARY SUBSET (ADR-0036).
 *
 * Written for the SysML Modeler in our own words. It declares a small subset of the names and kinds
 * of the OMG KerML/SysML standard model libraries (so that models written against standard names,
 * e.g. `ScalarValues::Real`, `ISQ::MassValue`, `SI::kg`, resolve), plus the platform metadata
 * package `EWS`. It is NOT the OMG standard library and makes no claim to its semantics; the official
 * library (EPL-2.0 from release 2026-04) can be loaded for conformance tests (see the progress file).
 */
export const LIBRARY_SOURCES: { file: string; text: string }[] = [
  {
    file: 'Base.sysml',
    text: `
library package Base {
    doc /* Platform subset: root types of the library. */
    abstract attribute def DataValue;
    abstract part def Anything;
}
library package ScalarValues {
    doc /* Platform subset: primitive data types. */
    abstract attribute def ScalarValue;
    attribute def Boolean :> ScalarValue;
    attribute def String :> ScalarValue;
    abstract attribute def NumericalValue :> ScalarValue;
    attribute def Number :> NumericalValue;
    attribute def Complex :> Number;
    attribute def Real :> Complex;
    attribute def Rational :> Real;
    attribute def Integer :> Rational;
    attribute def Natural :> Integer;
    attribute def Positive :> Natural;
}
library package Parts {
    abstract part def Part;
    abstract part parts : Part[0..*];
}
library package Items {
    abstract item def Item;
    abstract item items : Item[0..*];
}
library package Ports {
    abstract port def Port;
    abstract port ports : Port[0..*];
}
library package Connections {
    abstract connection def Connection;
    abstract connection connections : Connection[0..*];
    abstract flow def Flow;
    abstract flow flows : Flow[0..*];
}
library package Interfaces {
    abstract interface def Interface;
    abstract interface interfaces : Interface[0..*];
}
library package Allocations {
    abstract allocation def Allocation;
    abstract allocation allocations : Allocation[0..*];
}
library package Actions {
    abstract action def Action;
    abstract action actions : Action[0..*];
}
library package States {
    abstract state def StateAction;
    abstract state stateActions : StateAction[0..*];
}
library package Constraints {
    abstract constraint def ConstraintCheck;
    abstract constraint constraintChecks : ConstraintCheck[0..*];
}
library package Requirements {
    abstract requirement def RequirementCheck;
    abstract requirement requirementChecks : RequirementCheck[0..*];
}
library package Calculations {
    abstract calc def Calculation;
    abstract calc calculations : Calculation[0..*];
}
`,
  },
  {
    file: 'Quantities.sysml',
    text: `
library package Quantities {
    doc /* Platform subset: quantity values. A quantity value is a number with a measurement reference (unit). */
    import ScalarValues::*;
    abstract attribute def TensorQuantityValue;
    abstract attribute def ScalarQuantityValue :> TensorQuantityValue {
        attribute num : Real;
    }
}
library package MeasurementReferences {
    abstract attribute def MeasurementReference;
    abstract attribute def MeasurementUnit :> MeasurementReference;
    abstract attribute def SimpleUnit :> MeasurementUnit;
    abstract attribute def DerivedUnit :> MeasurementUnit;
}
library package ISQ {
    doc /* Platform subset of International System of Quantities value types (names as in the OMG library). */
    import Quantities::*;
    import MeasurementReferences::*;
    attribute def DimensionOneValue :> ScalarQuantityValue;
    attribute def DimensionOneUnit :> DerivedUnit;
    attribute def LengthValue :> ScalarQuantityValue;
    attribute def LengthUnit :> SimpleUnit;
    alias DistanceValue for LengthValue;
    attribute def MassValue :> ScalarQuantityValue;
    attribute def MassUnit :> SimpleUnit;
    attribute def DurationValue :> ScalarQuantityValue;
    attribute def DurationUnit :> SimpleUnit;
    alias TimeValue for DurationValue;
    alias TimeUnit for DurationUnit;
    attribute def ElectricCurrentValue :> ScalarQuantityValue;
    attribute def ElectricCurrentUnit :> SimpleUnit;
    attribute def ThermodynamicTemperatureValue :> ScalarQuantityValue;
    attribute def ThermodynamicTemperatureUnit :> SimpleUnit;
    alias TemperatureValue for ThermodynamicTemperatureValue;
    attribute def AmountOfSubstanceValue :> ScalarQuantityValue;
    attribute def LuminousIntensityValue :> ScalarQuantityValue;
    attribute def AreaValue :> ScalarQuantityValue;
    attribute def AreaUnit :> DerivedUnit;
    attribute def VolumeValue :> ScalarQuantityValue;
    attribute def VolumeUnit :> DerivedUnit;
    attribute def SpeedValue :> ScalarQuantityValue;
    attribute def SpeedUnit :> DerivedUnit;
    alias VelocityValue for SpeedValue;
    attribute def AccelerationValue :> ScalarQuantityValue;
    attribute def AccelerationUnit :> DerivedUnit;
    attribute def ForceValue :> ScalarQuantityValue;
    attribute def ForceUnit :> DerivedUnit;
    attribute def TorqueValue :> ScalarQuantityValue;
    attribute def TorqueUnit :> DerivedUnit;
    attribute def EnergyValue :> ScalarQuantityValue;
    attribute def EnergyUnit :> DerivedUnit;
    attribute def PowerValue :> ScalarQuantityValue;
    attribute def PowerUnit :> DerivedUnit;
    attribute def PressureValue :> ScalarQuantityValue;
    attribute def PressureUnit :> DerivedUnit;
    attribute def FrequencyValue :> ScalarQuantityValue;
    attribute def FrequencyUnit :> DerivedUnit;
    attribute def ElectricPotentialDifferenceValue :> ScalarQuantityValue;
    attribute def ElectricPotentialDifferenceUnit :> DerivedUnit;
    alias VoltageValue for ElectricPotentialDifferenceValue;
    attribute def ResistanceValue :> ScalarQuantityValue;
    attribute def ResistanceUnit :> DerivedUnit;
    attribute def ElectricChargeValue :> ScalarQuantityValue;
    attribute def ElectricChargeUnit :> DerivedUnit;
    attribute def AngularMeasureValue :> ScalarQuantityValue;
    attribute def AngularMeasureUnit :> DerivedUnit;
    alias PlaneAngleValue for AngularMeasureValue;
    attribute def AngularVelocityValue :> ScalarQuantityValue;
    attribute def AngularVelocityUnit :> DerivedUnit;
}
library package SI {
    doc /* Platform subset of SI units. Short names are the unit symbols, e.g. kg, m, s, N, V. */
    import ISQ::*;
    attribute <one> 'one' : DimensionOneUnit;
    attribute <m> metre : LengthUnit;
    attribute <mm> millimetre : LengthUnit;
    attribute <cm> centimetre : LengthUnit;
    attribute <km> kilometre : LengthUnit;
    attribute <kg> kilogram : MassUnit;
    attribute <g> gram : MassUnit;
    attribute <s> second : DurationUnit;
    attribute <ms> millisecond : DurationUnit;
    attribute <min> minute : DurationUnit;
    attribute <h> hour : DurationUnit;
    attribute <A> ampere : ElectricCurrentUnit;
    attribute <mA> milliampere : ElectricCurrentUnit;
    attribute <K> kelvin : ThermodynamicTemperatureUnit;
    attribute <'°C'> 'degree Celsius' : ThermodynamicTemperatureUnit;
    attribute <N> newton : ForceUnit;
    attribute <kN> kilonewton : ForceUnit;
    attribute <J> joule : EnergyUnit;
    attribute <W> watt : PowerUnit;
    attribute <kW> kilowatt : PowerUnit;
    attribute <Pa> pascal : PressureUnit;
    attribute <bar> 'bar' : PressureUnit;
    attribute <Hz> hertz : FrequencyUnit;
    attribute <V> volt : ElectricPotentialDifferenceUnit;
    attribute <ohm> ohm : ResistanceUnit;
    attribute <C> coulomb : ElectricChargeUnit;
    attribute <rad> radian : AngularMeasureUnit;
    attribute <deg> degree : AngularMeasureUnit;
    attribute <rpm> 'revolution per minute' : AngularVelocityUnit;
    attribute <Nm> 'newton metre' : TorqueUnit;
    attribute <L> litre : VolumeUnit;
}
`,
  },
  {
    file: 'EWS.sysml',
    text: `
library package EWS {
    doc /* Engineering workspace platform metadata: links from model elements to records owned by other modules (ADR-0037). */
    import ScalarValues::*;
    metadata def ManagedRequirement {
        doc /* The requirement usage or definition stands for a requirement managed by the Requirements module. */
        attribute requirementId : String;
        attribute revision : Integer[0..1];
    }
    metadata def CadRepresentation {
        doc /* The part is represented by a CAD part or assembly (proposal CR-SYSML-03). */
        attribute cadRef : String;
        attribute revision : Integer[0..1];
        attribute role : String[0..1];
    }
    metadata def ConceptLink {
        doc /* The element realizes a Concept owned by Conceptualize (informational; Conceptualize owns the link). */
        attribute conceptId : String;
    }
}
`,
  },
]
