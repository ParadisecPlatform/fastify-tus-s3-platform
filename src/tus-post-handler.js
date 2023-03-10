import { Buffer } from "node:buffer";
import { Readable } from "stream";
import { maximumFileSize } from "./config.js";
import path from "path";
import { remove } from "fs-extra";
import { add } from "date-fns";
import debug from "debug";
const log = debug("tus-s3-uploader:POST");

export async function tusPostHandler(req, res) {
    // validate the request
    log("validate request headers");
    let result = validateRequest.bind(this)(req, res);
    if (result) return;

    // check x-forwarded-host header set and return bad request if not
    if (!req.headers["x-forwarded-host"]) {
        log("ERROR X-Forwarded-Host header not set");
        return res.badRequest(`You need to define the 'X-Forwarded-Host' header`);
    }

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

    // see if we can create the file in the bucket
    if (!metadata.overwrite) {
        log(`ensure file doesn't exist as 'overwrite = false'`);
        let exists = await this.storage.keyExists({
            Bucket: metadata.bucket,
            Key: metadata.filename,
        });
        if (exists)
            res.forbidden(
                `The file exists and 'overwrite true' was not specified in the 'upload-metadata' header`
            );
    }
    const fileSize = parseInt(req.headers["upload-length"]);

    // create the file upload
    log("create the multipart object in the storage");
    const { uploadId } = await this.storage.createUpload({
        Bucket: metadata.bucket,
        Key: metadata.filename,
    });

    // if we have an existing cache file - remove it
    const cacheFile = path.join(this.cache.basePath, uploadId);
    await remove(cacheFile);

    // const host = `${req.protocol}://${req.hostname}${req.url}`;
    const location = `${req.headers["x-forwarded-host"]}/${uploadId}`;
    const uploadExpires = add(new Date(), this.defaultUploadExpiration);
    const headers = {
        location,
        "Tus-Resumable": "1.0.0",
        "Upload-Expires": uploadExpires,
        "upload-offset": 0,
    };

    // cache the uploadId for subsequent patch requests
    await this.cache.set(uploadId, {
        fileSize,
        metadata,
        bytesUploadedToServer: 0,
        uploadExpires,
        parts: [],
    });

    return res.code(201).headers(headers).send();
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

    if (parseInt(req.headers["upload-length"]) > maximumFileSize) {
        return res.payloadTooLarge(
            `The file to be uploaded is greater than the maxium allowable upload size of ${maximumFileSize}.`
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
