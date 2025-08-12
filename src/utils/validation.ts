import _ from "lodash";
import { Validation } from "../domain/entities/Validation";
import i18n from "../utils/i18n";

const translations: Record<string, (namespace: Record<string, string>) => string> = {
    isBlank: (namespace: Record<string, string>) =>
        i18n.t("Field {{field}} cannot be blank", { field: namespace.field }),
    isEmpty: (namespace: Record<string, string>) =>
        i18n.t("You need to select at least one {{element}}", { element: namespace.element }),
};

export async function getValidationMessages(validation: Validation, validationKeys = null): Promise<string[]> {
    return _(validation)
        .at(validationKeys || _.keys(validation))
        .flatten()
        .compact()
        .map(error => {
            const translation = translations[error.key];
            if (translation) {
                return translation({ ...error.namespace });
            } else {
                return `Missing translation: ${error.key}`;
            }
        })
        .value();
}
