import fetch from "cross-fetch";
import { stat } from "node:fs/promises";
import { Storage } from "./s3-utils";

describe.only(`Test TUS HEAD handling`, () => {
    const Bucket = "repository";
    let storage = new Storage({
        awsAccessKeyId: "root",
        awsSecretAccessKey: "rootpass",
        forcePathStyle: true,
        endpoint: "http://minio:9000",
    });

    it(`Should not find the object of the head request`, async () => {
        const location = "http://localhost:8080/files/nosuchid";
        let response = await fetch(location, {
            method: "HEAD",
        });
        expect(response.status).toEqual(404);
        expect(response.headers.get("upload-offset")).toEqual(null);
    });
    it(`Should be able to perform a HEAD request and get the expected response`, async () => {
        // start the upload of a multipart object
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

        response = await fetch(location, {
            method: "HEAD",
        });
        expect(response.status).toEqual(200);
        expect(response.headers.get("upload-offset")).toEqual(String(0));

        // now try to get the data about it via a head request

        await storage.abortUpload({
            Bucket: "repository",
            Key: "config.js",
            uploadId,
        });
    });
});
