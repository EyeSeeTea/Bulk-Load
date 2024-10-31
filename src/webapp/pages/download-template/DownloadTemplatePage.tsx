import { useLoading, useSnackbar } from "@eyeseetea/d2-ui-components";
import { Button, makeStyles } from "@material-ui/core";
import React, { useState } from "react";
import i18n from "../../../locales";
import {
    DataModelProps,
    TemplateSelector,
    TemplateSelectorState,
} from "../../components/template-selector/TemplateSelector";
import { useAppContext } from "../../contexts/app-context";
import { RouteComponentProps } from "../Router";

export default function DownloadTemplatePage({ settings, themes, customTemplates }: RouteComponentProps) {
    const loading = useLoading();
    const snackbar = useSnackbar();
    const classes = useStyles();
    const { api, compositionRoot } = useAppContext();

    const [template, setTemplate] = useState<TemplateSelectorState | null>(null);
    const [_availableModels, _] = useState<DataModelProps[]>([]);
    const [orgUnitShortName, setOrgUnitShortName] = useState(false);

    const handleTemplateDownloadClick = async () => {
        if (!template) {
            snackbar.info(i18n.t("You need to select at least one element to export"));
            return;
        }

        const { type, startDate, endDate, populate, populateStartDate, populateEndDate, templateType, orgUnits } =
            template;

        if (
            (template.relationshipsOuFilter === "SELECTED" ||
                template.relationshipsOuFilter === "CHILDREN" ||
                template.relationshipsOuFilter === "DESCENDANTS") &&
            orgUnits?.length === 0
        ) {
            snackbar.info(i18n.t("You need to select at least one organisation unit to export"));
            return;
        }

        if (type === "dataSets" && (!startDate || !endDate)) {
            snackbar.info(i18n.t("You need to select start and end periods for dataSet templates"));
            return;
        }

        let templateToDownload: TemplateSelectorState;

        if (templateType === "custom" && Boolean(orgUnits)) {
            templateToDownload = {
                ...template,
                populate: true,
                populateStartDate: template.populateStartDate || template.startDate,
                populateEndDate: template.populateEndDate || template.endDate,
            };
        } else if (populate && (!populateStartDate || !populateEndDate)) {
            snackbar.info(i18n.t("You need to select start and end dates to populate template"));
            return;
        } else {
            templateToDownload = template;
        }

        loading.show(true, i18n.t("Downloading template..."));

        try {
            await compositionRoot.templates.download(api, { ...templateToDownload, orgUnitShortName });
        } catch (error: any) {
            console.error(error);
            snackbar.error(error.message ?? i18n.t("Couldn't generate template"));
        }

        loading.show(false);
    };

    return (
        <React.Fragment>
            <TemplateSelector
                settings={settings}
                themes={themes}
                onChange={setTemplate}
                customTemplates={customTemplates}
                onUseShortNamesChange={setOrgUnitShortName}
            />

            <div className={classes.downloadTemplateRow}>
                <Button variant="contained" color="primary" onClick={handleTemplateDownloadClick}>
                    {i18n.t("Download template")}
                </Button>
            </div>
        </React.Fragment>
    );
}

const useStyles = makeStyles({
    downloadTemplateRow: {
        marginTop: "2em",
        marginLeft: "2em",
        marginRight: "2em",
        textAlign: "center",
        display: "flex",
        flexFlow: "row nowrap",
        justifyContent: "space-around",
    },
    content: { margin: "1rem", marginBottom: 35, marginLeft: 0 },
    checkbox: { padding: 9 },
});
