/**
 * Representative multidisciplinary example (brief §13): an electromechanical linear actuator with
 * mechanical, electrical, software and control parts, interfaces and flows, behaviour, requirements,
 * satisfaction and allocation. Written for the SysML Modeler (our own text) in the supported subset.
 * It matches the platform's sample actuator twin (ACT-100: housing, rod, motor).
 */
export const ACTUATOR_EXAMPLE_NAME = 'Electromechanical linear actuator'

export const ACTUATOR_EXAMPLE = `package ActuatorSystem {
    doc /* Electromechanical linear actuator ACT-100: a brushless motor drives a ball screw through a gearbox; a controller closes a position loop using a position sensor. */
    private import ScalarValues::*;
    private import ISQ::*;
    private import SI::*;

    package Interfaces {
        doc /* Items exchanged between the subsystems and the ports that carry them. */
        item def ElectricalPower {
            attribute voltage : VoltageValue;
            attribute current : ElectricCurrentValue;
        }
        item def PositionCommand {
            attribute target : LengthValue;
        }
        item def PositionMeasurement {
            attribute measured : LengthValue;
        }
        item def PhaseCurrents;
        item def Torque;
        port def PowerPort {
            out item power : ElectricalPower;
        }
        port def CommandPort {
            in item command : PositionCommand;
        }
        port def FeedbackPort {
            out item measurement : PositionMeasurement;
        }
        port def PhasePort {
            out item phases : PhaseCurrents;
        }
        port def ShaftPort {
            out item torque : Torque;
        }
        interface def PowerInterface {
            end supplier : PowerPort;
            end consumer : ~PowerPort;
        }
    }

    package Mechanical {
        doc /* Load path: housing, gearbox, ball screw and rod. */
        private import Interfaces::*;
        part def Housing {
            attribute mass : MassValue = 0.85 [kg];
            attribute length : LengthValue = 320 [mm];
        }
        part def Gearbox {
            attribute ratio : Real = 5.0;
            attribute efficiency : Real = 0.9;
            port input : ~ShaftPort;
            port output : ShaftPort;
        }
        part def BallScrew {
            attribute lead : LengthValue = 5 [mm];
            attribute efficiency : Real = 0.9;
            port drive : ~ShaftPort;
        }
        part def Rod {
            attribute stroke : LengthValue = 150 [mm];
            attribute diameter : LengthValue = 20 [mm];
            attribute mass : MassValue = 0.4 [kg];
        }
    }

    package Electrical {
        doc /* Power conversion and sensing. */
        private import Interfaces::*;
        part def PowerSupply {
            attribute nominalVoltage : VoltageValue = 24 [V];
            port powerOut : PowerPort;
        }
        part def MotorDriver {
            attribute maxCurrent : ElectricCurrentValue = 10 [A];
            port powerIn : ~PowerPort;
            port phaseOut : PhasePort;
            port command : CommandPort;
        }
        part def BrushlessMotor {
            attribute ratedTorque : TorqueValue = 0.32 [Nm];
            attribute ratedSpeed : AngularVelocityValue = 3000 [rpm];
            attribute mass : MassValue = 0.6 [kg];
            port phaseIn : ~PhasePort;
            port shaft : ShaftPort;
        }
        part def PositionSensor {
            attribute resolution : LengthValue = 0.01 [mm];
            port feedback : FeedbackPort;
        }
    }

    package Software {
        doc /* Controller firmware: modes and the position control loop. */
        private import Interfaces::*;
        item def StartCommand;
        item def StopCommand;
        item def FaultDetected;
        state def ActuatorModes {
            state idle;
            state positioning;
            state fault;
            transition startPositioning first idle accept StartCommand then positioning;
            transition finishPositioning first positioning accept StopCommand then idle;
            transition onFault first positioning accept FaultDetected then fault;
        }
        action def ControlLoop {
            in setpoint : PositionCommand;
            in measurement : PositionMeasurement;
            out demand : PositionCommand;
            action computeError;
            action computeDemand;
            first computeError then computeDemand;
        }
        action controlLoop : ControlLoop;
        part def ControllerFirmware {
            attribute version : String = "1.4.2";
            attribute loopRate : FrequencyValue = 1000 [Hz];
        }
    }

    package Control {
        doc /* Control-law parameters and engineering constraints. */
        calc def MaxForce {
            in torque : Real;
            in ratio : Real;
            in efficiency : Real;
            in lead : Real;
            return force : Real;
            torque * ratio * efficiency * 2 * 3.14159 / lead
        }
        constraint def StrokeWithinHousing {
            in stroke : LengthValue;
            in housingLength : LengthValue;
            stroke < housingLength
        }
    }

    package Architecture {
        doc /* The integrated actuator: how the subsystems are composed and connected. */
        private import Interfaces::*;
        private import Mechanical::*;
        private import Electrical::*;
        private import Software::*;
        part def Controller {
            part firmware : ControllerFirmware;
            port command : CommandPort;
            port feedbackIn : ~FeedbackPort;
        }
        part def LinearActuator {
            doc /* Top-level system. */
            attribute totalMass : MassValue = 1.85 [kg];
            attribute operatingLoad : ForceValue = 500 [N];
            part housing : Housing;
            part rod : Rod;
            part gearbox : Gearbox;
            part screw : BallScrew;
            part motor : BrushlessMotor;
            part driver : MotorDriver;
            part supply : PowerSupply;
            part sensor : PositionSensor;
            part controller : Controller;
            interface powerLink : PowerInterface connect supply.powerOut to driver.powerIn;
            connect driver.phaseOut to motor.phaseIn;
            connect motor.shaft to gearbox.input;
            connect gearbox.output to screw.drive;
            flow of PositionMeasurement from sensor.feedback to controller.feedbackIn;
            flow of PositionCommand from controller.command to driver.command;
            constraint strokeFits : Control::StrokeWithinHousing {
                :>> stroke = rod.stroke;
                :>> housingLength = housing.length;
            }
        }
    }

    package Requirements {
        doc /* System requirements (illustrative text; in the platform they are managed by Requirements Management). */
        private import Architecture::*;
        requirement def <'R-FORCE'> LoadRequirement {
            doc /* The actuator shall deliver at least 500 N at the rod. */
            subject actuator : LinearActuator;
            require constraint { actuator.operatingLoad >= 500 [N] }
        }
        requirement def <'R-MASS'> MassRequirement {
            doc /* The actuator shall weigh no more than 2.5 kg. */
            subject actuator : LinearActuator;
            require constraint { actuator.totalMass <= 2.5 [kg] }
        }
        requirement def <'R-STROKE'> StrokeRequirement {
            doc /* The actuator shall provide a stroke of at least 150 mm. */
            subject actuator : LinearActuator;
        }
        requirement load : LoadRequirement;
        requirement massLimit : MassRequirement;
        requirement stroke : StrokeRequirement;
    }

    package Product {
        doc /* The ACT-100 configuration: the system usage that satisfies the requirements and the allocation of software to hardware. */
        private import Architecture::*;
        private import Requirements::*;
        part act100 : LinearActuator;
        satisfy load by act100;
        satisfy massLimit by act100;
        satisfy stroke by act100;
        allocate Software::controlLoop to act100.controller;
    }
}
`
