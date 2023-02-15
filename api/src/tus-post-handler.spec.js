import fetch from "cross-fetch";
import path from "node:path";
import { stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { getS3Handle, keyExists, removeObjects, abortUpload } from "./s3-utils";

describe.only(`Test TUS POST handling`, () => {
    const Bucket = "repository";
    let s3client = getS3Handle({
        awsAccessKeyId: "root",
        awsSecretAccessKey: "rootpass",
        forcePathStyle: true,
        endpoint: "http://minio:9000",
    });
    it(`Should fail to perform a POST request as the required length headers are not set`, async () => {
        let response = await fetch("http://localhost:8080/files", {
            method: "POST",
        });
        expect(response.status).toEqual(400);
    });
    it(`Should fail to perform a POST request as the upload-defer-length header incorrect`, async () => {
        let response = await fetch("http://localhost:8080/files", {
            method: "POST",
            headers: {
                "upload-defer-length": "ummm",
            },
        });
        expect(response.status).toEqual(400);
    });
    it(`Should fail to perform a POST request upload-length && upload-defer-length set`, async () => {
        let response = await fetch("http://localhost:8080/files", {
            method: "POST",
            headers: {
                "upload-length": 100,
                "upload-defer-length": "",
            },
        });
        expect(response.status).toEqual(400);
    });
    it(`Should fail to perform a POST request as the required upload metadata header is not set`, async () => {
        let response = await fetch("http://localhost:8080/files", {
            method: "POST",
            headers: {
                "upload-length": 100,
            },
        });
        expect(response.status).toEqual(400);
    });
    it(`Should fail to perform a POST request as the upload metadata header is empty`, async () => {
        let response = await fetch("http://localhost:8080/files", {
            method: "POST",
            headers: {
                "upload-length": 100,
                "upload-metadata": ``,
            },
        });
        expect(response.status).toEqual(400);
    });
    it(`Should fail to perform a POST request as the upload metadata header does not contain a filename key`, async () => {
        let response = await fetch("http://localhost:8080/files", {
            method: "POST",
            headers: {
                "upload-length": 100,
                "upload-metadata": `something xxxx`,
            },
        });
        expect(response.status).toEqual(400);
    });
    it(`Should fail to perform a POST as object too large`, async () => {
        const filename = new Buffer.from("file.txt").toString("base64");
        let response = await fetch("http://localhost:8080/files", {
            method: "POST",
            headers: {
                "upload-length": 100000000000000000,
                "upload-metadata": `filename ${filename}`,
            },
        });
        expect(response.status).toEqual(413);
    });
    it(`Should succeed in performing a POST request as the upload metadata has required params`, async () => {
        const filename = new Buffer.from("file.txt").toString("base64");
        const bucket = new Buffer.from("repository").toString("base64");
        const overwrite = new Buffer.from("false").toString("base64");
        let response = await fetch("http://localhost:8080/files", {
            method: "POST",
            headers: {
                "upload-length": 100,
                "upload-metadata": `filename ${filename}, bucket ${bucket}, overwrite ${overwrite}`,
            },
        });
        expect(response.status).toEqual(201);
        expect(response.headers.get("location")).toMatch(/http:\/\/localhost:8080\/files\//);
        expect(response.headers.get("tus-resumable")).toEqual("1.0.0");
    });
    it(`Should succeed in performing a POST request as the upload metadata has required params and upload-defer-length set correctly`, async () => {
        const filename = new Buffer.from("file.txt").toString("base64");
        const bucket = new Buffer.from("repository").toString("base64");
        let response = await fetch("http://localhost:8080/files", {
            method: "POST",
            headers: {
                "upload-defer-length": 1,
                "upload-metadata": `filename ${filename}, bucket ${bucket} `,
            },
        });
        expect(response.status).toEqual(201);
        expect(response.headers.get("location")).toMatch(/http:\/\/localhost:8080\/files\//);
        expect(response.headers.get("tus-resumable")).toEqual("1.0.0");
    });
    it(`Should fail to perform a POST request with upload - missing headers`, async () => {
        const file = "./src/config.js";
        const filename = new Buffer.from(file).toString("base64");
        let fileStats = await stat(file);
        let stream = createReadStream(file);
        let response = await fetch("http://localhost:8080/files", {
            method: "POST",
            headers: {
                "content-type": "application/offset+octet-stream",
                "upload-length": fileStats.size,
                "upload-metadata": `filename ${filename} `,
            },
            body: stream,
        });
        expect(response.status).toEqual(400);

        stream = createReadStream(file, { start: 0, end: 10 });
        response = await fetch("http://localhost:8080/files", {
            method: "POST",
            headers: {
                "content-type": "application/offset+octet-stream",
                "content-length": 10,
                "upload-length": fileStats.size,
                "upload-metadata": `filename ${filename} `,
            },
            body: stream,
        });
        expect(response.status).toEqual(400);
    });
    it(`Should succeed in performing a POST request without data (creation)`, async () => {
        const file = "./src/config.js";
        const filename = new Buffer.from("config.js").toString("base64");
        const bucket = new Buffer.from("repository").toString("base64");
        let fileStats = await stat(file);
        let response = await fetch("http://localhost:8080/files", {
            method: "POST",
            headers: {
                "content-type": "application/offset+octet-stream",
                "content-length": fileStats.size,
                "upload-length": fileStats.size,
                "upload-metadata": `filename ${filename}, bucket ${bucket}, overwrite`,
            },
        });
        expect(response.status).toEqual(201);
        const location = response.headers.get("location");
        const uploadId = location.split("/").pop();

        await abortUpload({ client: s3client, Bucket: "repository", Key: "config.js", uploadId });
    });
    it(`Should succeed in performing a POST request with data (creation-with-upload)`, async () => {
        const file = "./src/config.js";
        const filename = new Buffer.from("config.js").toString("base64");
        const bucket = new Buffer.from("repository").toString("base64");
        let fileStats = await stat(file);
        let stream = createReadStream(file);
        let response = await fetch("http://localhost:8080/files", {
            method: "POST",
            headers: {
                "content-type": "application/offset+octet-stream",
                "content-length": fileStats.size,
                "upload-length": fileStats.size,
                "upload-metadata": `filename ${filename}, bucket ${bucket}, overwrite`,
            },
            body: stream,
        });
        expect(response.status).toEqual(201);
        expect(response.headers.get("upload-offset")).toEqual(String(fileStats.size));

        let exists = await keyExists({ client: s3client, Bucket, Key: "config.js" });
        expect(exists).toBeTrue;

        await removeObjects({ client: s3client, Bucket: "repository", keys: ["config.js"] });
    });
});
