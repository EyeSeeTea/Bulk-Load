import i18n from "../../../utils/i18n";
import { HistoryTable } from "../../components/history/HistoryTable";
import { RouteComponentProps } from "../Router";

export default function HistoryPage({ settings }: RouteComponentProps) {
    return (
        <div>
            <h3>{i18n.t("History")}</h3>
            <HistoryTable settings={settings} />
        </div>
    );
}
