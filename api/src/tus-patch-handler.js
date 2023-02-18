import { Readable } from "stream";
import debug from "debug";
import path from "node:path";
import fsExtraPkg from "fs-extra";
const {
    stat,
    open,
    close,
    write: nodeWrite,
    readFile,
    remove,
    pathExists,
    createReadStream,
} = fsExtraPkg;
import { minimumPartSize, preferredPartSize, maximumParts } from "./config.js";
const log = debug("tus-s3-uploader:PATCH");

export async function tusPatchHandler(req, res) {
    log("start request");
    const uploadId = req.params.uploadId;
    log("Upload Id", uploadId);
    let uploadData = await this.cache.get(uploadId);

    // if we don't find upload data for uploadId - fail out
    if (!uploadData) return res.notFound();
    // log("upload data", uploadData);

    // check that all of the expected headers are set correctly
    const result = checkRequest(req, res);
    if (result) return;

    // const parts = Object.keys(uploadData.byPartNumber).map((part) => uploadData.byPartNumber[part]);
    const contentLength = parseInt(req.headers["content-length"]);
    const uploadOffset = parseInt(req.headers["upload-offset"]);
    const fileSize = uploadData.fileSize;
    const metadata = uploadData.metadata;
    const optimalPartSize = calculateOptimalPartSize(fileSize);

    log("File Size", fileSize);
    log("Optimal part size for upload to S3", `${optimalPartSize / 1024} MB`);
    log("Upload Offset", uploadOffset);
    log("Content Length", contentLength);

    const cacheFile = path.join(this.cache.basePath, uploadId);
    log("Saving the chunk to the cache file");
    try {
        let fd = await open(cacheFile, "a+");
        await nodeWrite(fd, req.body);
        await close(fd);
        uploadData.bytesUploadedToServer += contentLength;
    } catch (error) {
        console.error(`Error saving the uploaded chunk to the cache file`);
        console.error(error);

        // send bad request and let tus retry
        res.code(400).send();
        return;
    }

    let cacheFileSize = (await stat(cacheFile)).size;
    log("Cache file size", cacheFileSize);

    /**
     * Once the cache file has reached the optimalPartSize
     *  upload that part to s3. Note that S3 requires each part
     *  to be the same size so only that amount is uploaded and
     *  the remainder is left in the cacheFile until the buffer
     *  is full again.
     */
    if (uploadData.bytesUploadedToServer !== fileSize) {
        while (cacheFileSize >= optimalPartSize) {
            log("uploading part to S3");
            let stream, partNumber, part;
            try {
                const parts = uploadData.parts;
                partNumber = parts.slice(-1).length ? parts.slice(-1)[0].PartNumber + 1 : 1;
                stream = createReadStream(cacheFile, {
                    highWaterMark: optimalPartSize,
                });

                part = await uploadPart.bind(this)({
                    metadata,
                    uploadId,
                    partNumber,
                    stream,
                });

                log("part uploaded to S3");
                uploadData.parts.push(part);

                // remove the uploaded bit from the cache file so that it's ready
                //  for more to be added via subsequent PATCH requests

                // read the cacheFile content into memory
                let fd = await open(cacheFile, "r");
                let data = await readFile(fd);
                await close(fd);

                // remove the file
                await remove(cacheFile);

                // write out the leftover from optimalPartSize to the end
                // (that is, the first bit up to optimalPartSize is thrown away
                //  and the rest is written back into the cachefile for next time)
                fd = await open(cacheFile, "w+");
                await nodeWrite(fd, data.subarray(optimalPartSize));
                await close(fd);

                cacheFileSize = (await stat(cacheFile)).size ?? 0;
                // log("upload data", uploadData);
            } catch (error) {
                console.error(`Error uploading a part to S3`);
                console.error(error);
                res.code(400).send();
                return;
            }
        }
    }

    /**
     * When we've received all of the file data, upload the final part.
     *  S3 allows this to be smaller than the other parts.
     */
    if (uploadData.bytesUploadedToServer === fileSize) {
        log("uploading part to S3");
        try {
            const parts = uploadData.parts;
            const partNumber = parts.slice(-1).length ? parts.slice(-1)[0].PartNumber + 1 : 1;
            let stream = createReadStream(cacheFile, { start: 0 });
            const part = await uploadPart.bind(this)({
                metadata,
                uploadId,
                partNumber,
                stream,
            });
            log("part uploaded to S3");
            uploadData.parts.push(part);
            log("upload data", uploadData);
        } catch (error) {
            console.error(`Error uploading the final part to S3`);
            console.error(error);
            res.code(400).send();
            return;
        }
    }
    await this.cache.set(uploadId, uploadData);

    let headers = {
        "Tus-Resumable": "1.0.0",
        "upload-offset": uploadData.bytesUploadedToServer,
    };

    if (uploadOffset + contentLength === fileSize) {
        // we have the full file so complete the upload in S3
        try {
            log("Complete the multipart upload to S3");
            const parts = uploadData.parts;
            await completeUpload.bind(this)({ metadata, uploadId, parts });
            await remove(cacheFile);
            await this.cache.remove(uploadId);
            headers["upload-offset"] = fileSize;
        } catch (error) {
            console.error(`Error completing the S3 multipart upload`);
            console.error(error);
            res.code(400).send();
            return;
        }
    }
    res.code(204).headers(headers).send();
    log("");
}

function checkRequest(req, res) {
    if (!req.body) return res.badRequest(`No data sent with patch request.`);
    if (!req.headers["content-length"])
        return res.badRequest(`'content-length' header is not set.`);
    if (!req.headers["upload-offset"]) return res.badRequest(`'upload-offset' header is not set.`);
    if (!req.headers["content-type"]) return res.badRequest(`'content-type' header is not set.`);
    if (req.headers["content-type"] !== "application/offset+octet-stream")
        return res.unsupportedMediaType(
            `'content-type' header must be 'application/offset+octet-stream'.`
        );
}

async function uploadPart({ metadata, uploadId, partNumber, stream }) {
    let part = await this.storage.uploadPart({
        Bucket: metadata.bucket,
        Key: metadata.filename,
        uploadId,
        partNumber,
        stream,
    });
    return part;
}

async function completeUpload({ metadata, uploadId, parts }) {
    await this.storage.completeUpload({
        Bucket: metadata.bucket,
        Key: metadata.filename,
        uploadId,
        parts,
    });
}

function calculateOptimalPartSize(size) {
    let optimalPartSize;

    // When upload is smaller or equal to PreferredPartSize, we upload in just one part.
    if (size <= preferredPartSize) {
        optimalPartSize = size;
    }
    // Does the upload fit in MaxMultipartParts parts or less with PreferredPartSize.
    else if (size <= preferredPartSize * maximumParts) {
        optimalPartSize = preferredPartSize;
        // The upload is too big for the preferred size.
        // We devide the size with the max amount of parts and round it up.
    } else {
        optimalPartSize = Math.ceil(size / maximumParts);
    }

    return optimalPartSize;
}
