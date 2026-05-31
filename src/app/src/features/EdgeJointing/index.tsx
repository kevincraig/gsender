import { useEffect, useState } from 'react';
import get from 'lodash/get';
import pubsub from 'pubsub-js';
import { useNavigate } from 'react-router';
import cx from 'classnames';

import store from 'app/store';
import {
    GRBL_ACTIVE_STATE_IDLE,
    GRBL_ACTIVE_STATE_JOG,
    IMPERIAL_UNITS,
    METRIC_UNITS,
    VISUALIZER_SECONDARY,
    START_POSITION_FRONT_LEFT,
    START_POSITION_FRONT_RIGHT,
    START_POSITION_BACK_LEFT,
    START_POSITION_BACK_RIGHT,
} from 'app/constants';
import { convertToImperial, convertToMetric } from 'app/lib/units';
import { Switch } from 'app/components/shadcn/Switch';
import { useTypedSelector } from 'app/hooks/useTypedSelector';
import { ControlledInput } from 'app/components/ControlledInput';
import defaultState from 'app/store/defaultState';
import { Tabs, TabsList, TabsTrigger } from 'app/components/shadcn/Tabs';
import { RadioGroup, RadioGroupItem } from 'app/components/shadcn/RadioGroup';
import controller from 'app/lib/controller';
import { uploadGcodeFileToServer } from 'app/lib/fileupload';
import InputArea from 'app/components/InputArea';
import { Button } from 'app/components/Button';
import Tooltip from 'app/components/Tooltip';
import VisualizerPreview from 'app/features/Surfacing/components/VisualizerPreview';
import { GcodeViewer } from 'app/features/Surfacing/components/GcodeViewer';

import { EdgeJointing } from './definitions';
import WidgetConfig from '../WidgetConfig/WidgetConfig';
import EdgeJointingGenerator from './utils/edgeJointingGcodeGenerator';

const defaultEdgeJointingState = get(
    defaultState,
    'widgets.edgeJointing',
    {},
) as EdgeJointing;

const POSITION_BUTTONS = [
    {
        key: 0,
        className: 'm-0 absolute -left-5 -top-5',
        title: 'Start at Back Left',
        value: START_POSITION_BACK_LEFT,
    },
    {
        key: 1,
        className: 'm-0 absolute -right-5 -top-5',
        title: 'Start at Back Right',
        value: START_POSITION_BACK_RIGHT,
    },
    {
        key: 2,
        className: 'm-0 absolute -bottom-7 -left-5',
        title: 'Start at Front Left',
        value: START_POSITION_FRONT_LEFT,
    },
    {
        key: 3,
        className: 'm-0 absolute -bottom-7 -right-5',
        title: 'Start at Front Right',
        value: START_POSITION_FRONT_RIGHT,
    },
];

const EdgeJointingTool = () => {
    const navigate = useNavigate();
    const edgeJointingConfig = new WidgetConfig('edgeJointing');
    const [tabSwitch, setTabSwitch] = useState(false);
    const units = store.get('workspace.units', METRIC_UNITS);

    const status = useTypedSelector((state) => state?.controller.state?.status);
    const isDisabled =
        status &&
        status.activeState !== GRBL_ACTIVE_STATE_IDLE &&
        status.activeState !== GRBL_ACTIVE_STATE_JOG;

    const getInitialState = (): EdgeJointing => {
        const saved = edgeJointingConfig.get('', defaultEdgeJointingState);

        if (units === IMPERIAL_UNITS) {
            return {
                ...saved,
                boardLength: convertToImperial(saved.boardLength),
                materialHeight: convertToImperial(saved.materialHeight),
                stepDown: convertToImperial(saved.stepDown),
                overrun: convertToImperial(saved.overrun),
                feedrate: convertToImperial(saved.feedrate),
            };
        }
        return saved;
    };

    const [edgeJointing, setEdgeJointing] = useState<EdgeJointing>(
        getInitialState(),
    );
    const [gcode, setGcode] = useState('');

    const isStepDownExceedingHeight =
        edgeJointing.stepDown > edgeJointing.materialHeight;

    useEffect(() => {
        if (units === IMPERIAL_UNITS) {
            edgeJointingConfig.set('', {
                ...edgeJointing,
                boardLength: convertToMetric(edgeJointing.boardLength),
                materialHeight: convertToMetric(edgeJointing.materialHeight),
                stepDown: convertToMetric(edgeJointing.stepDown),
                overrun: convertToMetric(edgeJointing.overrun),
                feedrate: convertToMetric(edgeJointing.feedrate),
            });
        } else {
            edgeJointingConfig.set('', edgeJointing);
        }
    }, [edgeJointing]);

    const handleGenerateGcode = async () => {
        const generator = new EdgeJointingGenerator({ edgeJointing, units });
        const generated = generator.generate();
        setGcode(generated);

        const name = 'gSender_EdgeJointing';
        const file = new File([generated], name);
        uploadGcodeFileToServer(file, controller.port, VISUALIZER_SECONDARY);
    };

    const onChange = (property: string, value: number | boolean | string) => {
        setEdgeJointing({ ...edgeJointing, [property]: value });
    };

    const loadGcode = () => {
        const name = 'gSender_EdgeJointing.gcode';
        const { size } = new File([gcode], name);
        pubsub.publish('gcode:surfacing', { gcode, name, size });
        navigate('/');
    };

    const inputStyle =
        'text-xl font-light z-0 align-center text-center text-blue-500 pl-1 pr-1 w-full';

    const convertedDefaults =
        units === METRIC_UNITS
            ? defaultEdgeJointingState
            : {
                  ...defaultEdgeJointingState,
                  boardLength: convertToImperial(
                      defaultEdgeJointingState.boardLength,
                  ),
                  materialHeight: convertToImperial(
                      defaultEdgeJointingState.materialHeight,
                  ),
                  stepDown: convertToImperial(defaultEdgeJointingState.stepDown),
                  overrun: convertToImperial(defaultEdgeJointingState.overrun),
                  feedrate: convertToImperial(defaultEdgeJointingState.feedrate),
              };

    const minVal = units === IMPERIAL_UNITS ? convertToImperial(1) : 1;

    return (
        <div className="bg-white dark:bg-transparent dark:text-white w-full flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-4 max-xl:gap-3 xl:gap-2">
                    <p className="text-sm xl:text-base font-normal text-gray-500 dark:text-gray-300">
                        <b>Edge Jointing:</b> Zero your machine at the corner of
                        the board edge with{' '}
                        <b>Z=0 at the top of the board edge</b>. The tool makes
                        multiple passes stepping down through the board height.
                        Use a straight bit and set your depth of cut physically
                        before running.
                    </p>

                    <div className="grid grid-cols-5 items-center gap-4">
                        <span className="text-sm font-medium leading-none col-span-2">
                            Start Position
                        </span>
                        <div className="flex items-center col-span-3 justify-center">
                            <div className="w-16 h-16 border-4 border-black relative mt-6 mb-8 mx-6">
                                <RadioGroup
                                    name="edgeJointingPositions"
                                    value={edgeJointing.startPosition}
                                    className="border-black"
                                    onValueChange={(value) =>
                                        onChange('startPosition', value)
                                    }
                                >
                                    {POSITION_BUTTONS.map((pos) => (
                                        <div
                                            key={pos.key}
                                            className={pos.className}
                                        >
                                            <Tooltip content={pos.title}>
                                                <RadioGroupItem
                                                    value={pos.value}
                                                    className="m-0"
                                                    size="h-8 w-8"
                                                />
                                            </Tooltip>
                                        </div>
                                    ))}
                                </RadioGroup>
                            </div>
                        </div>
                    </div>

                    <InputArea label="Board Length">
                        <Tooltip
                            content={`Default is ${convertedDefaults.boardLength} ${units}`}
                        >
                            <ControlledInput
                                type="number"
                                suffix={units}
                                className={inputStyle}
                                value={edgeJointing.boardLength}
                                wrapperClassName="col-span-3"
                                min={minVal}
                                max={50000}
                                immediateOnChange
                                onChange={(e) =>
                                    onChange(
                                        'boardLength',
                                        Number(e.target.value),
                                    )
                                }
                            />
                        </Tooltip>
                    </InputArea>

                    <InputArea label="Material Height">
                        <Tooltip
                            content={`Default is ${convertedDefaults.materialHeight} ${units}`}
                        >
                            <ControlledInput
                                type="number"
                                suffix={units}
                                className={cx('rounded', inputStyle, {
                                    'text-red-500 border-red-500':
                                        isStepDownExceedingHeight,
                                })}
                                value={edgeJointing.materialHeight}
                                wrapperClassName="col-span-3"
                                min={minVal}
                                max={50000}
                                immediateOnChange
                                onChange={(e) =>
                                    onChange(
                                        'materialHeight',
                                        Number(e.target.value),
                                    )
                                }
                            />
                        </Tooltip>
                    </InputArea>

                    <InputArea label="Step Down Depth">
                        <Tooltip
                            content={`Default is ${convertedDefaults.stepDown} ${units}`}
                        >
                            <ControlledInput
                                type="number"
                                suffix={units}
                                className={cx('rounded', inputStyle, {
                                    'text-red-500 border-red-500':
                                        isStepDownExceedingHeight,
                                })}
                                value={edgeJointing.stepDown}
                                wrapperClassName="col-span-3"
                                min={0.00001}
                                max={10000}
                                immediateOnChange
                                onChange={(e) =>
                                    onChange(
                                        'stepDown',
                                        Number(e.target.value),
                                    )
                                }
                            />
                        </Tooltip>
                        {isStepDownExceedingHeight && (
                            <p className="col-span-5 text-[10px] xl:text-xs text-red-500 leading-tight">
                                Warning: Step down ({edgeJointing.stepDown}{' '}
                                {units}) exceeds material height (
                                {edgeJointing.materialHeight} {units})
                            </p>
                        )}
                    </InputArea>

                    <InputArea label="Overrun">
                        <Tooltip
                            content={`Default is ${convertedDefaults.overrun} ${units}. How far past each end of the board to travel.`}
                        >
                            <ControlledInput
                                type="number"
                                suffix={units}
                                className={inputStyle}
                                value={edgeJointing.overrun}
                                wrapperClassName="col-span-3"
                                min={0}
                                max={1000}
                                immediateOnChange
                                onChange={(e) =>
                                    onChange('overrun', Number(e.target.value))
                                }
                            />
                        </Tooltip>
                    </InputArea>

                    <InputArea label="Feed Rate">
                        <Tooltip
                            content={`Default is ${convertedDefaults.feedrate} ${units}/min`}
                        >
                            <ControlledInput
                                type="number"
                                suffix={`${units}/min`}
                                className={inputStyle}
                                value={edgeJointing.feedrate}
                                wrapperClassName="col-span-3"
                                immediateOnChange
                                onChange={(e) =>
                                    onChange('feedrate', Number(e.target.value))
                                }
                            />
                        </Tooltip>
                    </InputArea>

                    <InputArea label="Spindle RPM">
                        <div className="grid grid-cols-2 gap-2 col-span-3">
                            <Tooltip
                                content={`Default is ${convertedDefaults.spindleRPM} RPM`}
                            >
                                <ControlledInput
                                    type="number"
                                    className={inputStyle}
                                    wrapperClassName="w-full"
                                    value={edgeJointing.spindleRPM}
                                    suffix={'RPM'}
                                    immediateOnChange
                                    onChange={(e) =>
                                        onChange(
                                            'spindleRPM',
                                            Number(e.target.value),
                                        )
                                    }
                                />
                            </Tooltip>
                            <Tooltip
                                content={`Default is ${convertedDefaults.shouldDwell ? 'on' : 'off'}`}
                            >
                                <div className="flex items-center gap-2 justify-center">
                                    <label className="text-sm leading-none col-span-2">
                                        Delay
                                    </label>
                                    <Switch
                                        checked={edgeJointing.shouldDwell}
                                        onChange={(checked) =>
                                            onChange(
                                                'shouldDwell',
                                                checked as boolean,
                                            )
                                        }
                                        aria-label="Toggle spindle delay"
                                    />
                                </div>
                            </Tooltip>
                        </div>
                    </InputArea>

                    <InputArea label="Coolant Control">
                        <div className="flex items-center gap-2 justify-center col-span-3">
                            <Tooltip
                                content={`Default is ${convertedDefaults.mist ? 'on' : 'off'}`}
                            >
                                <div className="flex items-center gap-2 justify-center">
                                    <span className="font-light text-sm max-w-20 dark:text-white">
                                        Mist (M7)
                                    </span>
                                    <Switch
                                        onChange={(value) =>
                                            onChange('mist', value)
                                        }
                                        checked={edgeJointing.mist ?? false}
                                        className="h-20"
                                        aria-label="Toggle Mist coolant"
                                    />
                                </div>
                            </Tooltip>
                            <Tooltip
                                content={`Default is ${convertedDefaults.flood ? 'on' : 'off'}`}
                            >
                                <div className="flex items-center gap-2 justify-center">
                                    <span className="font-light text-sm max-w-20 dark:text-white">
                                        Flood (M8)
                                    </span>
                                    <Switch
                                        onChange={(value) =>
                                            onChange('flood', value)
                                        }
                                        checked={edgeJointing.flood ?? false}
                                        className="h-20"
                                        aria-label="Toggle Flood coolant"
                                    />
                                </div>
                            </Tooltip>
                        </div>
                    </InputArea>
                </div>

                <div className="flex flex-col border border-gray-200 rounded-md">
                    <Tabs defaultValue="visualizer-preview">
                        <TabsList className="w-full pb-0 border-b rounded-b-none">
                            <TabsTrigger
                                value="visualizer-preview"
                                className="w-full"
                                onClick={() => setTabSwitch(false)}
                            >
                                Visualizer Preview
                            </TabsTrigger>
                            <TabsTrigger
                                value="gcode-viewer"
                                className="w-full"
                                onClick={() => setTabSwitch(true)}
                                disabled={!gcode}
                            >
                                G-Code{' '}
                                {gcode.length !== 0 ? (
                                    <span className="text-xs text-gray-500">
                                        ({gcode.split('\n').length} lines)
                                    </span>
                                ) : null}
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>
                    <div className="relative w-full h-full">
                        <div
                            className={cx(
                                'absolute w-full h-full top-0 left-0 rounded-md',
                                { invisible: tabSwitch },
                            )}
                        >
                            <VisualizerPreview gcode={gcode} />
                        </div>
                        <div
                            className={cx('h-full relative p-2', {
                                invisible: !tabSwitch,
                            })}
                        >
                            <GcodeViewer gcode={gcode} />
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex flex-row gap-4">
                <Button onClick={handleGenerateGcode} disabled={isDisabled}>
                    Generate G-code
                </Button>
                <Button disabled={!!!gcode || isDisabled} onClick={loadGcode}>
                    Load to Main Visualizer
                </Button>
            </div>
        </div>
    );
};

export default EdgeJointingTool;
