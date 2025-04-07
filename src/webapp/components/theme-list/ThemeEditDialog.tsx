import { makeStyles, TextField, Typography } from "@material-ui/core";
import { ConfirmationDialog } from "@eyeseetea/d2-ui-components";
import { ChangeEvent, useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Theme, ThemeableSections } from "../../../domain/entities/Theme";
import i18n from "../../../utils/i18n";
import { toBase64 } from "../../../utils/files";
import { generatorOriginalPalette } from "../../utils/colors";
import { ColorPicker } from "../color-picker/ColorPicker";
import { ColorScaleSelect } from "../color-scale/ColorScaleSelect";
import { Select, SelectOption } from "../select/Select";

interface ThemeEditDialogProps {
    type: "new" | "edit";
    theme?: Theme;
    onSave: (theme: Theme) => void;
    onCancel: () => void;
}

export default function ThemeEditDialog({ type, theme: editTheme, onSave, onCancel }: ThemeEditDialogProps) {
    const classes = useStyles();
    const [theme, updateTheme] = useState<Theme>(editTheme ?? new Theme());

    const defaultColorOption = theme.palette.length > 1 ? "pattern" : "fixed";
    const [colorOption, setColorOption] = useState<string>(defaultColorOption);

    const onDrop = useCallback(async ([file]: File[]) => {
        if (!file) return;
        const src = await toBase64(file);
        updateTheme(theme => theme.updatePicture("logo", { name: file.name, src }));
    }, []);

    const { getRootProps, getInputProps } = useDropzone({
        onDrop,
        accept: "image/jpeg, image/png",
    });

    const title = type === "edit" ? i18n.t("Edit theme") : i18n.t("New theme");

    const updateName = (event: ChangeEvent<HTMLInputElement>) => {
        const name = event.target.value;
        updateTheme(theme => theme.setName(name));
    };

    const updatePalette = (newColors: string | string[]) => {
        const palette = [newColors].flat();
        updateTheme(theme => theme.updateColorPalette(palette));
    };

    const updateSection = (field: ThemeableSections) => {
        return (event: ChangeEvent<HTMLInputElement>) => {
            const text = event.target.value;

            // TODO: This should be configurable from the UI
            const fontSize = field === "title" ? 22 : 12;
            const italic = field === "subtitle";

            updateTheme(theme => theme.updateSection(field, text ? { text, fontSize, italic } : undefined));
        };
    };

    const saveTheme = () => onSave(theme);

    const changeColorOption = ({ value }: SelectOption) => {
        const fixedColor = theme.palette[0];
        if (!fixedColor) return;

        const defaultPalette = generatorOriginalPalette["default"][9];
        const palette = theme.palette.length > 1 ? theme.palette : defaultPalette;

        updatePalette(value === "fixed" ? [fixedColor] : palette);
        setColorOption(value);
    };

    return (
        <ConfirmationDialog
            isOpen={true}
            title={title}
            onSave={saveTheme}
            onCancel={onCancel}
            maxWidth={"lg"}
            fullWidth={true}
        >
            <div className={classes.group}>
                <TextField
                    className={classes.text}
                    label={i18n.t("Theme name")}
                    required={true}
                    fullWidth={true}
                    value={theme.name ?? ""}
                    onChange={updateName}
                />
            </div>

            <div className={classes.group} style={{ marginBottom: 5 }}>
                <Typography variant="h6">{i18n.t("Colors")}</Typography>
                <div className={classes.colorOptions}>
                    <div className={classes.colorOptionsPicker}>
                        <Select
                            placeholder={i18n.t("Color options")}
                            options={colorPickerOptions}
                            value={colorOption}
                            onChange={changeColorOption}
                        />
                    </div>

                    {theme.palette.length > 1 ? (
                        <ColorScaleSelect
                            selected={theme.palette}
                            onChange={updatePalette}
                            additionalPalettes={generatorOriginalPalette}
                        />
                    ) : (
                        <ColorPicker
                            color={theme.palette[0]}
                            onChange={updatePalette}
                            width={34}
                            height={36}
                            disableArrow={true}
                        />
                    )}
                </div>
            </div>

            <div className={classes.group}>
                <Typography variant="h6">{i18n.t("Headings")}</Typography>
                <TextField
                    className={classes.text}
                    label={i18n.t("Title text")}
                    fullWidth={true}
                    multiline={true}
                    value={theme.sections?.title?.text ?? ""}
                    onChange={updateSection("title")}
                />
                <TextField
                    className={classes.text}
                    label={i18n.t("Subtitle text")}
                    fullWidth={true}
                    multiline={true}
                    value={theme.sections?.subtitle?.text ?? ""}
                    onChange={updateSection("subtitle")}
                />
            </div>

            <div className={classes.group}>
                <Typography variant="h6">{i18n.t("Logo")}</Typography>
                <div {...getRootProps({ className: classes.dropzone })}>
                    <input {...getInputProps()} />
                    {theme.pictures?.logo?.name ?? <p>{i18n.t("Drag and drop logo file")}</p>}
                </div>
            </div>
        </ConfirmationDialog>
    );
}

const useStyles = makeStyles({
    group: { marginBottom: 25, marginLeft: 0 },
    text: { marginTop: 8 },
    colorOptions: { marginTop: 12, marginBottom: 0, display: "flex" },
    colorOptionsPicker: { width: "20%", marginRight: 30 },
    dropzone: {
        flex: 1,
        display: "flex",
        flexDirection: "column" as const,
        alignItems: "center",
        padding: 20,
        margin: 8,
        borderWidth: 2,
        borderRadius: 2,
        borderColor: "#c8c8c8",
        borderStyle: "dashed",
        backgroundColor: "#f0f0f0",
        cursor: "pointer",
    },
});

const colorPickerOptions = [
    {
        label: i18n.t("Pattern"),
        value: "pattern",
    },
    {
        label: i18n.t("Fixed"),
        value: "fixed",
    },
];
