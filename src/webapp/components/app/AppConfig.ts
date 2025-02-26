import { FeedbackOptions } from "@eyeseetea/feedback-component";
import { JsonConfig } from "../../../data/ConfigWebRepository";

export interface AppConfig extends JsonConfig {
    appearance: {
        showShareButton: boolean;
    };
    feedback: FeedbackOptions;
}
