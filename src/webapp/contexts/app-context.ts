import React, { useContext } from "react";
import { CompositionRoot } from "../../CompositionRoot";
import { D2Api } from "../../types/d2-api";
import i18n from "../../locales";

export interface AppContextI {
    api: D2Api;
    d2: object;
    compositionRoot: CompositionRoot;
}

export const AppContext = React.createContext<AppContextI | null>(null);

export function useAppContext() {
    const context = useContext(AppContext);
    i18n.setDefaultNamespace("bulk-load");
    if (context) {
        return context;
    } else {
        throw new Error("Context not found");
    }
}
