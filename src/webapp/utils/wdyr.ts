/// <reference types="@welldone-software/why-did-you-render" />

import React from "react";

if (process.env.NODE_ENV === "development") {
    // En Vite (ESM) no existe `require`, así que usamos import dinámico.
    void (async () => {
        const mod = await import("@welldone-software/why-did-you-render");
        const whyDidYouRender = (mod as any).default ?? mod;

        whyDidYouRender(React, {
            trackAllPureComponents: true,
        });
    })();
}
