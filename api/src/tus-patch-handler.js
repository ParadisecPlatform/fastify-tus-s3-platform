import { keyExists, bucketExists, createUpload, uploadPart, completeUpload } from "./s3-utils.js";
import { Readable } from "stream";
const MB = 1024 * 1024;
const minimumFileSize = 5 * MB;

export async function tusPatchHandler(req, res) {
    console.log("");
    console.log("");
    console.log("");
    console.log("start request");
    console.log("");
    const uploadId = req.params.uploadId;
    let uploadData = await this.cache.get(uploadId);
    if (!uploadData) return res.notFound();

    console.log("uploadData", uploadData);

    // check that all of the expected headers are set correctly
    if (!req.body) return res.badRequest(`No data sent with patch request.`);
    if (!req.headers["content-length"])
        return res.badRequest(`'content-length' header is not set.`);
    if (!req.headers["upload-offset"]) return res.badRequest(`'upload-offset' header is not set.`);
    if (!req.headers["content-type"]) return res.badRequest(`'content-type' header is not set.`);
    if (req.headers["content-type"] !== "application/offset+octet-stream")
        res.unsupportedMediaType(
            `'content-type' header must be 'application/offset+octet-stream'.`
        );

    const uploadOffset = req.headers["upload-offset"];
    let partNumber;
    if (uploadData?.byUploadOffset?.[uploadOffset]) {
        // this is a part retry
        let part = uploadData.byUploadOffset[uploadOffset];
        console.log("retried part", part);
        partNumber = part.partNumber;
    } else {
        // this is a new chunk
        const contentLength = parseInt(req.headers["content-length"]);
        uploadData.latestUploadOffset = uploadData.latestUploadOffset + contentLength;
        uploadData.latestPartNumber = uploadData.latestPartNumber + 1;
        console.log("new part", uploadData);
        partNumber = uploadData.latestPartNumber;
    }

    const stream = Readable.from(req.body);
    let part = await uploadPart({
        client: this.s3client,
        Bucket: uploadData.metadata.bucket,
        Key: uploadData.metadata.filename,
        uploadId,
        partNumber,
        stream: stream.read(),
    });
    uploadData = {
        ...uploadData,
        byUploadOffset: {
            ...uploadData.byUploadOffset,
            [req.headers["upload-offset"]]: part,
        },
        byPartNumber: {
            ...uploadData.byPartNumber,
            [partNumber]: part,
        },
    };
    console.log(uploadData);
    if (uploadData.uploadLength === uploadData.latestUploadOffset) {
        // we've got the whole file, complete it
        let parts = Object.keys(uploadData.byPartNumber).map(
            (part) => uploadData.byPartNumber[part]
        );
        await completeUpload({
            client: this.s3client,
            Bucket: uploadData.metadata.bucket,
            Key: uploadData.metadata.filename,
            uploadId,
            parts,
        });
    } else {
        await this.cache.set(uploadId, uploadData);
    }

    const headers = {
        "Tus-Resumable": "1.0.0",
        "upload-offset": uploadData.latestUploadOffset,
    };
    console.log("");
    console.log("end request");
    console.log("");
    console.log("");
    console.log("");
    res.code(204).headers(headers).send();
}
