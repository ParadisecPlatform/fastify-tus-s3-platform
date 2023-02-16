import { Buffer } from "node:buffer";
import { Readable } from "stream";
import { maxFileSize } from "./config.js";
import debug from "debug";
const log = debug("tus-s3-uploader:POST");

export async function tusPostHandler(req, res) {
    // validate the request
    log("validate request headers");
    let result = validateRequest.bind(this)(req, res);
    if (result) return;

    // extra metadata from headers
    log("extract metadata from headers");
    let metadata;
    try {
        metadata = extractUploadMetadata(req.headers["upload-metadata"]);
    } catch (error) {
        log("ERROR extracting metadata");
        return res.badRequest(error.message);
    }

    // ensure the bucket exists
    log("ensure bucket exists");
    let exists = await this.storage.bucketExists({ Bucket: metadata.bucket });
    if (!exists) return res.notFound(`Bucket '${metadata.bucket}' does not exist in the storage.`);

    // body or not, create the file in the S3 bucket
    if (!metadata.overwrite) {
        log(`ensure file doesn't exist as 'overwrite = false'`);
        // check if the target file exists - abort if it does
        let exists = await this.storage.keyExists({
            Bucket: metadata.bucket,
            Key: metadata.filename,
        });
        if (exists)
            res.forbiddenError(
                `The file exists and 'overwrite true' was not specified in the 'upload-metadata' header`
            );
    }

    // create the file upload
    log("create the multipart object in the storage");
    const { uploadId } = await this.storage.createUpload({
        Bucket: metadata.bucket,
        Key: metadata.filename,
    });

    const host = `${req.protocol}://${req.hostname}${req.url}`;
    const location = `${host}/${uploadId}`;
    const headers = {
        location,
        "Tus-Resumable": "1.0.0",
    };

    if (!req.body) {
        log("no request body: update the cache and return 201");
        // no request body so this is a basic creation, not creation with upload

        // cache the uploadId for subsequent patch requests
        await this.cache.set(uploadId, {
            uploadLength: parseInt(req.headers["upload-length"]),
            latestUploadOffset: parseInt(req.headers["content-length"]),
            latestPartNumber: 0,
            metadata,
        });

        headers["upload-offset"] = 0;
        return res.code(201).headers(headers).send();
    }

    // if there is a request body, then upload it
    if (req.body) {
        log("request body: create stream");
        const stream = Readable.from(req.body);

        try {
            // upload the part
            log("request body: upload part");
            let part = await this.storage.uploadPart({
                Bucket: metadata.bucket,
                Key: metadata.filename,
                uploadId,
                partNumber: 1,
                stream: stream.read(),
            });

            // if we have the whole file then complete the upload
            //   and return 201 with upload offset set to the content length
            if (req.headers["content-length"] === req.headers["upload-length"]) {
                log("request body: the part contains the whole file, complete the upload");
                await this.storage.completeUpload({
                    Bucket: metadata.bucket,
                    Key: metadata.filename,
                    uploadId,
                    parts: [part],
                });
                headers["upload-offset"] = req.headers["content-length"];
                return res.code(201).headers(headers).send;
            } else {
                log(
                    "request body: the part is not the whole file, update the cache and return 201"
                );
                // we got a part but it's not the whole file
                //   return 201 with upload offset set to the content length we got
                req.headers["upload-offset"] = req.headers["content-length"];

                // cache the uploadId and part for subsequent patch requests
                await this.cache.set(uploadId, {
                    uploadLength: parseInt(req.headers["upload-length"]),
                    latestUploadOffset: parseInt(req.headers["content-length"]),
                    latestPartNumber: 1,
                    metadata,
                    byUploadOffset: {
                        [req.headers["content-length"]]: part,
                    },
                    byPartNumber: {
                        1: part,
                    },
                });
                res.code(201).headers(headers).send();
            }
        } catch (error) {
            return res.badRequest();
        }
    }
}

function extractUploadMetadata(metadata) {
    metadata = metadata
        .replace(", ", ",")
        .split(",")
        .map((entry) => {
            let [key, value] = entry.trim().split(" ");
            key = key ? key.trim() : key;
            value = value ? value.trim() : value;

            // check if value is base64 encoded
            const base64regex = new RegExp(
                /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/
            );
            // check if value isEmpty - set to true if it is
            if (!value) {
                value = true;
                return { [key]: value };
            } else if (value && !value.match(base64regex)) {
                throw new Error(
                    `'upload-metadata' header key '${key}' has a value that is not base64 encoded which is a requirement.`
                );
            }

            value = new Buffer.from(value, "base64").toString("ascii");
            if (value === "false") value = false;
            if (value === "true") value = true;
            return { [key]: value };
        })
        .reduce((acc, entry) => ({ ...acc, ...entry }));

    if (!metadata.filename) throw new Error(`File metadata must have a 'filename' key `);
    if (!metadata.bucket) throw new Error(`File metadata must have a 'bucket' key `);
    if (!metadata.overwrite) metadata.overwrite = false;

    return metadata;
}

function validateRequest(req, res) {
    // console.log(req.headers);
    // 'upload-defer-length' is currently not allowed by server options
    //  enable by setting 'creation-defer-length' on 'tusExtensions' in config.js
    if (!req.headers["upload-length"] && !req.headers["upload-defer-length"]) {
        return res.badRequest(
            `Neither 'upload-length' not 'upload-defer-length' haeders were set. Set one.`
        );
    }
    if (req.headers["upload-length"] && req.headers["upload-defer-length"]) {
        return res.badRequest(
            `Both 'upload-length' and 'upload-defer-length' headers were set. Set one only.`
        );
    }
    if (!req.headers["upload-metadata"]) {
        return res.badRequest(`Required header 'upload-metadata' not set.`);
    }
    if (req.headers["upload-defer-length"] && req.headers["upload-defer-length"] !== "1") {
        return res.badRequest(`'upload-defer-length' header was set but it's not equal to '1'.`);
    }

    if (parseInt(req.headers["upload-length"]) > maxFileSize) {
        return res.payloadTooLarge(
            `The file to be uploaded is greater than the maxium allowable upload size of ${maxFileSize}.`
        );
    }

    // if there's something in the body we need to confirm some other headers have been set
    if (req.body) {
        if (!req.headers["content-length"])
            return res.badRequest(`'content-length' header is not set.`);
        if (!req.headers["upload-length"])
            return res.badRequest(`'upload-length headers is not set.`);
        if (!req.headers["content-type"])
            return res.badRequest(`'content-type' header is not set.`);
        if (req.headers["content-type"] !== "application/offset+octet-stream")
            res.unsupportedMediaType(
                `'content-type' header must be 'application/offset+octet-stream'.`
            );
    }
}
