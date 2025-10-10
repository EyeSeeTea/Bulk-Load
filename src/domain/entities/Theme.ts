import { generateUid } from "d2/uid";
import _ from "lodash";
import { defaultColorScale } from "../../webapp/utils/colors";
import { Id } from "./ReferenceObject";
import { publicReadSharing, Sharing } from "./Sharing";
import { Validation } from "./Validation";

export type Color = string;

export type ThemeableSections = "title" | "subtitle";
export type ImageSections = "logo";

export interface ThemeStyle {
    text?: string;
    bold?: boolean;
    italic?: boolean;
    fontSize?: number;
    fontColor?: Color;
    fillColor?: Color;
    wrapText?: boolean;
    horizontalAlignment?: "left" | "center" | "right" | "fill" | "centerContinuous" | "distributed";
    verticalAlignment?: "top" | "center" | "bottom" | "justify" | "distributed";
    border?: boolean;
    borderColor?: Color;
    rowSize?: number;
    columnSize?: number;
    merged?: boolean;
    locked?: boolean;
}

export interface CellImage {
    name: string;
    src: string;
}

export class Theme {
    public readonly id: Id;
    public readonly name: string;
    public readonly templates: Id[];
    public readonly palette: string[];
    public readonly sections?: {
        [key in ThemeableSections]?: ThemeStyle;
    };
    public readonly pictures?: {
        [key in ImageSections]?: CellImage;
    };
    public readonly sharing: Sharing;

    constructor({
        id = generateUid(),
        name = "",
        templates = [],
        palette = defaultColorScale,
        sections = {},
        pictures = {},
        sharing = publicReadSharing,
    }: Partial<Theme> = {}) {
        this.id = id;
        this.name = name;
        this.templates = templates;
        this.palette = palette;
        this.sections = sections;
        this.pictures = pictures;
        this.sharing = sharing;
    }

    private update(partialUpdate: Partial<Theme>): Theme {
        return new Theme({ ...this, ...partialUpdate });
    }

    public setName(name: string): Theme {
        return this.update({ name });
    }

    public setTemplates(templates: Id[]): Theme {
        return this.update({ templates });
    }

    public updateSection(section: ThemeableSections, style?: ThemeStyle): Theme {
        const sections = { ...this.sections, [section]: style };
        return this.update({ sections });
    }

    public updatePicture(section: ImageSections, image: CellImage): Theme {
        const pictures = { ...this.pictures, [section]: image };
        return this.update({ pictures });
    }

    public updateColorPalette(palette: string[]): Theme {
        return this.update({ palette });
    }

    public updateSharing(sharing: Theme["sharing"]): Theme {
        return this.update({ sharing });
    }

    public validate(): Validation {
        return _.pickBy({
            name: _.compact([
                !this.name.trim()
                    ? {
                          key: "isBlank",
                          namespace: { field: "name" },
                      }
                    : null,
            ]),
        });
    }
}
