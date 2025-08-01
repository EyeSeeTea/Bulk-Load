import { DataFormType } from "./DataForm";
import { Id } from "./ReferenceObject";
import { TrackedEntityInstance } from "./TrackedEntityInstance";
import { ContentType } from "./Template";
import { Maybe } from "../../types/utils";
import { Geometry } from "./DhisDataPackage";

export type DataPackage = DataSetPackage | EventProgramPackage | TrackerProgramPackage;
export type DataPackageValue = string | number | boolean;
export type DataPackageData = BasePackageData | DataSetPackageData | ProgramPackageData;
export type DataPackageDataValue = BasePackageDataValue | DataSetPackageDataValue;

interface BaseDataPackage {
    type: DataFormType;
    dataEntries: BasePackageData[];
}

type DataSetPackage = BaseDataPackage & {
    type: "dataSets";
    dataEntries: DataSetPackageData[];
};

type EventProgramPackage = BaseDataPackage & {
    type: "programs";
    dataEntries: ProgramPackageData[];
};

export type TrackerProgramPackage = BaseDataPackage & {
    type: "trackerPrograms";
    trackedEntityInstances: TrackedEntityInstance[];
    dataEntries: ProgramPackageData[];
};

type BasePackageData = {
    orgUnit: Id;
    dataForm: Id;
    period: string;
    attribute: Maybe<Id>;
    dataValues: (BasePackageDataValue | DataSetPackageDataValue)[];
};

export type DataSetPackageData = BasePackageData & {
    type: "aggregated";
    dataValues: DataSetPackageDataValue[];
};

export type ProgramPackageData = BasePackageData & {
    id: Maybe<Id>;
    trackedEntityInstance: Maybe<Id>;
    programStage: Maybe<Id>;
    coordinate: Maybe<{
        latitude: string;
        longitude: string;
    }>;
    dataValues: BasePackageDataValue[];
    geometry: Maybe<Geometry>;
};

export type BasePackageDataValue = {
    dataElement: Id;
    value: DataPackageValue;
    optionId?: Id;
    comment?: string;
    contentType?: ContentType;
}

export type DataSetPackageDataValue = BasePackageDataValue & {
    category: Maybe<Id>;
};