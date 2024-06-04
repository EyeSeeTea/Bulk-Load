import { Maybe } from "../../types/utils";
import { TrackedEntityType } from "./DataForm";

export type Coordinates = { latitude: number; longitude: number };

export type Geometry = { type: "Point"; coordinates: Coordinates } | { type: "Polygon"; coordinates: Coordinates[] };

export function getGeometryAsString(geometry: Geometry | undefined): string {
    if (!geometry) return "";
    switch (geometry.type) {
        case "Point": {
            const { longitude, latitude } = geometry.coordinates;
            return `[${longitude}, ${latitude}]`;
        }
        case "Polygon": {
            const items = geometry.coordinates.map(coordinates => `[${coordinates.latitude}, ${coordinates.latitude}]`);
            return `[${items.join(", ")}]`;
        }
        default: {
            return "";
        }
    }
}

export function getGeometryFromString(
    trackedEntityType: Maybe<TrackedEntityType>,
    value: string
): Geometry | undefined {
    if (!trackedEntityType) {
        console.error(`Expected tracked entity type on dataForm`);
        return undefined;
    }
    const cleanValue = value.trim().replace(/\s*/g, "");
    if (!cleanValue) return undefined;

    switch (trackedEntityType.featureType) {
        case "none":
            return undefined;
        case "Point":
            return { type: "Point", coordinates: getCoordinatesFromString(cleanValue) };
        case "Polygon": {
            const match = cleanValue.match(/^\[(.+)\]/);
            if (!match) throw new Error(`Invalid format for polygon: ${cleanValue}`);
            // Perform split "[[lon1,lat1], [lat2,lon2]]"" -> ["[lon1,lat1]", "[lon1,lat1]"]
            // Re-add the trailing "]" that got eaten by the split for each pair.
            const items = (match[1] || "").split(/\]\s*,/).map(pairS => (!pairS.endsWith("]") ? pairS + "]" : pairS));
            const coordinatesList = items.map(getCoordinatesFromString);
            return { type: "Polygon", coordinates: coordinatesList };
        }
    }
}

function getCoordinatesFromString(s: string): Coordinates {
    const match = s.match(/^\[([-+\d.]+),([-+\d.]+)\]$/);
    if (!match) throw new Error(`Invalid format for a coordinate: ${s}`);

    const [longitude = "", latitude = ""] = match.slice(1);
    return { latitude: parseFloat(latitude), longitude: parseFloat(longitude) };
}
