import { makeStyles } from "@material-ui/core";
import CloudDoneIcon from "@material-ui/icons/CloudDone";
import CloudUploadIcon from "@material-ui/icons/CloudUpload";
import React from "react";
import Dropzone from "react-dropzone";

export type TemplateDropzoneProps = {
    accept: string[];
    placeholder: string;
    selectedFileName?: string;
    onDrop: (files: File[]) => void;
    disabled?: boolean;
};

export function TemplateDropzone(props: TemplateDropzoneProps): React.ReactElement {
    const { accept, placeholder, selectedFileName, onDrop, disabled = false } = props;
    const classes = useStyles();

    return (
        <Dropzone accept={accept} onDrop={onDrop} multiple={false} disabled={disabled}>
            {({ getRootProps, getInputProps, isDragActive, isDragAccept }) => (
                <section className={classes.dropzoneSection}>
                    <div
                        {...getRootProps({
                            className: isDragActive
                                ? `${classes.stripes} ${isDragAccept ? classes.acceptStripes : classes.rejectStripes}`
                                : classes.dropzone,
                        })}
                    >
                        <input {...getInputProps()} />
                        <div className={classes.dropzoneTextStyle}>
                            <p className={classes.dropzoneParagraph}>{selectedFileName ?? placeholder}</p>
                            <br />
                            {selectedFileName ? (
                                <CloudDoneIcon className={classes.uploadIconSize} />
                            ) : (
                                <CloudUploadIcon className={classes.uploadIconSize} />
                            )}
                        </div>
                    </div>
                </section>
            )}
        </Dropzone>
    );
}

const useStyles = makeStyles({
    dropzoneTextStyle: { textAlign: "center", top: "15%", position: "relative" },
    dropzoneParagraph: { fontSize: 20 },
    uploadIconSize: { width: 50, height: 50, color: "#909090" },
    dropzone: {
        position: "relative",
        width: "100%",
        height: 270,
        backgroundColor: "#f0f0f0",
        border: "dashed",
        borderColor: "#c8c8c8",
        cursor: "pointer",
    },
    stripes: {
        width: "100%",
        height: 270,
        cursor: "pointer",
        border: "solid",
        borderColor: "#c8c8c8",
        "-webkit-animation": "progress 2s linear infinite !important",
        "-moz-animation": "progress 2s linear infinite !important",
        animation: "progress 2s linear infinite !important",
        backgroundSize: "150% 100%",
    },
    acceptStripes: {
        backgroundImage: `repeating-linear-gradient(
            -45deg,
            #f0f0f0,
            #f0f0f0 25px,
            #c8c8c8 25px,
            #c8c8c8 50px
        )`,
    },
    rejectStripes: {
        backgroundImage: `repeating-linear-gradient(
            -45deg,
            #fc8785,
            #fc8785 25px,
            #f4231f 25px,
            #f4231f 50px
        )`,
    },
    dropzoneSection: { marginBottom: "1em" },
});
