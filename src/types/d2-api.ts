import { D2Api } from "@eyeseetea/d2-api/2.42";

export * from "@eyeseetea/d2-api/2.42";

export const D2ApiDefault = D2Api;
export const getMockApi = () => {
    const api = new D2Api({ backend: "xhr" });
    const mock = api.getMockAdapter();
    return { api, mock };
};
