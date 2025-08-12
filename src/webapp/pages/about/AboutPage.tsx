import React from "react";
import { MarkdownViewer } from "../../components/markdown/MarkdownViewer";
import i18n from "../../../utils/i18n";
import "./AboutPage.css";
import { Typography } from "@material-ui/core";

export const AboutPage: React.FC = React.memo(() => {
    const contents = [
        // `# ${i18n.t("About Bulk Load App")}`,
        `#### ${i18n.t("Distributed under GNU GLPv3")}`,
        i18n.t(
            "Bulk Load is the import/export solution to connect DHIS2 and Excel. It allows to automatically create excel templates from any datasets and quickly upload data through them and to easily download data from DHIS2 as excel files."
        ),
        i18n.t(
            "This application has been funded by the WHO Global Malaria Programme, Samaritan’s Purse, Medecins Sans Frontières (MSF), the the Norwegian Refugee Council (NRC) and the Clinton Health Access Initiative (CHAI) to support countries in strengthening the collection and use of health data by using DHIS2. The application has been developed by [EyeSeeTea SL](http://eyeseetea.com). Source code, documentation and release notes can be found at the [EyeSeetea GitHub Project Page](https://eyeseetea.github.io/Bulk-Load-blessed/).",
            { nsSeparator: false }
        ),
        i18n.t(
            "If you wish to contribute to the development of Bulk Load with new features, please contact [EyeSeeTea](mailto:hello@eyeseetea.com).",
            { nsSeparator: false }
        ),
    ].join("\n\n");

    return (
        <>
            <Typography className="about-page-title" variant="h5" align="center">
                {i18n.t("About Bulk Load App")}
            </Typography>
            <div className="about-page">
                <div className="about-content">
                    <MarkdownViewer source={contents} />
                    <div className="logo-wrapper">
                        <div>
                            <img className="logo" alt={i18n.t("World Health Organization")} src="img/logo-who.svg" />
                        </div>
                        <div>
                            <img
                                className="logo logo-large"
                                alt={i18n.t("Samaritan's Purse")}
                                src="img/logo-samaritans.svg"
                            />
                        </div>
                        <div>
                            <img className="logo" alt={i18n.t("EyeSeeTea")} src="img/logo-eyeseetea.png" />
                        </div>
                        <div>
                            <img
                                className="logo logo-small"
                                alt={i18n.t("Médicos Sin Fronteras")}
                                src="img/logo-msf.svg"
                            />
                        </div>
                        <div>
                            <img className="logo" alt={i18n.t("Norwegian Refugee Council")} src="img/logo-nrc.svg" />
                        </div>
                        <div>
                            <img
                                className="logo logo-small"
                                alt={i18n.t("Clinton Health Access Initiative")}
                                src="img/logo-chai.png"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
});
