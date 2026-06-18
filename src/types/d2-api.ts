import { D2Api } from "@eyeseetea/d2-api/2.41";

export * from "@eyeseetea/d2-api/2.41";

export type { MetadataPick } from "@eyeseetea/d2-api/2.41";

export { D2Api } from "@eyeseetea/d2-api/2.41";
export { CancelableResponse } from "@eyeseetea/d2-api";

/** axios-mock-adapter solo está disponible con backend axios, no con fetch. */
export function getMockApi() {
    const api = new D2Api({ backend: "xhr" });
    const mock = api.getMockAdapter();
    return { api, mock };
}
