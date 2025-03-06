import { Maybe } from "../../types/utils";
import { DataFormFeatureType, TrackedEntityType } from "./DataForm";

export type Coordinates = { latitude: number; longitude: number };

export type Geometry =
    | { type: "none" }
    | { type: "point"; coordinates: Coordinates }
    | { type: "polygon"; coordinatesList: Coordinates[] };

export function getGeometryAsString(geometry: Geometry): string {
    switch (geometry.type) {
        case "none":
            return "";
        case "point": {
            const { longitude, latitude } = geometry.coordinates;
            return `[${longitude}, ${latitude}]`;
        }
        case "polygon": {
            const items = geometry.coordinatesList.map(
                coordinates => `[${coordinates.longitude}, ${coordinates.latitude}]`
            );
            return `[${items.join(", ")}]`;
        }
    }
}

export function getGeometryFromString(trackedEntityType: Maybe<TrackedEntityType>, value: string): Geometry {
    if (!trackedEntityType) {
        console.error(`Expected tracked entity type on dataForm`);
        return { type: "none" };
    }

    return buildGeometry(trackedEntityType.featureType, value);
}

export function buildGeometry(featureType: DataFormFeatureType, value: string): Geometry {
    const cleanValue = value.trim().replace(/\s*/g, "");
    if (!cleanValue) return { type: "none" };

    switch (featureType) {
        case "none":
            return { type: "none" };
        case "point":
            return { type: "point", coordinates: getCoordinatesFromString(cleanValue) };
        case "polygon": {
            const match = cleanValue.match(/^\[(.+)\]/);
            if (!match) throw new Error(`Invalid format for polygon: ${cleanValue}`);
            // Perform split "[[lon1,lat1], [lat2,lon2]]"" -> ["[lon1,lat1]", "[lon1,lat1]"]
            // Re-add the trailing "]" that got eaten by the split for each pair.
            const items = (match[1] || "").split(/\]\s*,/).map(pairS => (!pairS.endsWith("]") ? pairS + "]" : pairS));
            const coordinatesList = items.map(getCoordinatesFromString);
            return { type: "polygon", coordinatesList };
        }
    }
}

function getCoordinatesFromString(s: string): Coordinates {
    const match = s.match(/^\[([-+\d.]+),([-+\d.]+)\]$/);
    if (!match) throw new Error(`Invalid format for a coordinate: ${s}`);

    const [longitude = "", latitude = ""] = match.slice(1);
    return { latitude: parseFloat(latitude), longitude: parseFloat(longitude) };
}
