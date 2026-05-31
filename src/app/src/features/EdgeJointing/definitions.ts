import { SPINDLE } from 'app/lib/definitions/gcode_virtualization';

export interface EdgeJointing {
    boardLength: number;
    materialHeight: number;
    stepDown: number;
    overrun: number;
    feedrate: number;
    spindleRPM: number;
    startPosition: string;
    spindle: SPINDLE;
    shouldDwell: boolean;
    flood: boolean;
    mist: boolean;
}
