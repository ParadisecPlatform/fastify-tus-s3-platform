import Fastify from "fastify";
import fastifyCompress from "@fastify/compress";
import cors from "@fastify/cors";
import fastifySensible from "@fastify/sensible";
import { Buffer } from "buffer";
import { createId } from "@paralleldrive/cuid2";
import {
    S3Client,
    AbortMultipartUploadCommand,
    CreateMultipartUploadCommand,
    UploadPartCommand,
    CompleteMultipartUploadCommand,
    // ListMultipartUploadsCommand,
    ListPartsCommand,
} from "@aws-sdk/client-s3";

const envToLogger = {
    development: {
        transport: {
            target: "@fastify/one-line-logger",
        },
    },
};
const fastify = Fastify({ logger: envToLogger[process.env.NODE_ENV] });

main();
async function main() {
    fastify.register(cors, { origin: "*" });
    fastify.register(fastifySensible);
    fastify.register(fastifyCompress);
    fastify.addHook("onRequest", async (req, res) => {
        // console.log("***", req.method, req.url, req.headers);
    });
    fastify.ready(() => {
        console.log("fastify ready");
    });
    fastify.addContentTypeParser("application/offset+octet-stream", (req, res, done) => done());
    fastify.register((fastify, options, done) => {
        fastify.options("/files", filesOptionsHandler);
        fastify.post("/files", filesPostHandler);
        fastify.patch("/files/:id", filesPatchHandler);
        done();
    });
    fastify.listen({ port: 8080, host: "0.0.0.0" }, function (err, address) {});
}

async function filesOptionsHandler(req, res) {
    // 500GB max file size
    const maxFileSize = "536870912000";
    res.code(204)
        .headers({
            "Tus-Resumable": "1.0.0",
            "Tus-Version": "1.0.0",
            "Tus-Max-Size": maxFileSize,
            "Tus-Extension": "creation,expiration",
        })
        .send();
}
async function filesPostHandler(req, res) {
    if (!req.headers["upload-length"]) return res.badRequest();
    // console.log(req.protocol, req.hostname, req.url, req.method, req.headers);

    const host = `${req.protocol}://${req.hostname}${req.url}`;
    // console.log(req.headers["upload-metadata"]);
    let uploadMetadata = req.headers["upload-metadata"]
        .split(",")
        .map((entry) => ({
            [entry.split(" ")[0]]: new Buffer(entry.split(" ")[1], "base64").toString("ascii"),
        }))
        .reduce((acc, entry) => ({ ...acc, ...entry }));

    res.code(201)
        .headers({
            location: `${host}/${createId()}`,
            "Tus-Resumable": "1.0.0",
        })
        .send();
    // console.log("***", uploadMetadata);
}

async function filesPatchHandler(req, res) {
    console.log(req.params, req.headers);
    res.code(204).headers({ "upload-offset": req.headers["content-length"] }).send();
}

export function getS3Handle() {
    let configuration = {
        forcePathStyle: true,
        s3ForcePathStyle: true,
        endpoint: "http://minio:9000",
        credentials: {
            accessKeyId: "root",
            secretAccessKey: "rootpass",
        },
        region: "us-east-1",
    };

    return new S3Client(configuration);
}
export async function createUpload({ client, bucket, key }) {
    let command = new CreateMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
    });
    let response = await client.send(command);
    if (response.$metadata.httpStatusCode !== 200) {
        // abort
        return;
    }
    return { uploadId: response.UploadId };
}
export async function uploadPart({ client, bucket, key, uploadId, partNumber, stream }) {
    let command = new UploadPartCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
        Body: stream,
    });
    let response = await client.send(command);
    return { PartNumber: 1, ETag: response.ETag };
}
export async function completeUpload({ client, bucket, key, uploadId, parts }) {
    let command = new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts },
    });
    let response = await client.send(command);
    return response;
}
// export async function listMultipartUploads({ client, bucket }) {
//     let command = new ListMultipartUploadsCommand({
//         Bucket: bucket,
//     });
//     let response = await client.send(command);
//     return response;
// }
export async function listParts({ client, bucket, key, uploadId }) {
    let command = new ListPartsCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
    });
    let response = await client.send(command);
    return response;
}
export async function abortUpload({ client, bucket, key, uploadId }) {
    let command = new AbortMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
    });
    let response = await client.send(command);
    return response;
}
