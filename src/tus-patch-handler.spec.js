import fetch from "cross-fetch";
import { createReadStream } from "node:fs";
import { Storage } from "./s3-utils";
import fsExtraPkg from "fs-extra";
const { stat, open, close, write, remove, readFile, pathExists } = fsExtraPkg;

describe.only(`Test TUS PATCH handling`, () => {
    const Bucket = "repository";
    let storage = new Storage({
        awsAccessKeyId: "root",
        awsSecretAccessKey: "rootpass",
        forcePathStyle: true,
        endpoint: "http://minio:9000",
    });
    it(`Should fail to perform a patch request as id not found`, async () => {
        let response = await fetch("http://localhost:8080/files/idnotreal", {
            method: "PATCH",
            headers: {
                authorization: "Bearer secret",
            },
        });
        expect(response.status).toEqual(404);
    });
    it(`Should fail to perform a patch request as required headers not provided`, async () => {
        const file = "./src/config.js";
        const filename = new Buffer.from("config.js").toString("base64");
        const bucket = new Buffer.from("repository").toString("base64");
        let fileStats = await stat(file);

        // create the file
        let response = await fetch("http://localhost:8080/files", {
            method: "POST",
            headers: {
                authorization: "Bearer secret",
                "x-forwarded-host": "http://localhost:8080/files",
                "content-type": "application/offset+octet-stream",
                "content-length": fileStats.size,
                "upload-length": fileStats.size,
                "upload-metadata": `filename ${filename}, bucket ${bucket}, overwrite`,
            },
        });
        expect(response.status).toEqual(201);
        const location = response.headers.get("location");
        const uploadId = location.split("/").pop();
        let uploadOffset = response.headers.get("upload-offset");

        //  no content-type header - expect 415
        let stream = createReadStream(file, { start: 0, end: 100 });
        response = await fetch(location, {
            method: "PATCH",
            headers: {
                authorization: "Bearer secret",
                "content-length": 100,
                "upload-offset": uploadOffset,
                "tus-resumable": "1.0.0",
            },
            body: stream,
        });
        expect(response.status).toEqual(415);

        // content-type header with unsupported type - expect 415
        stream = createReadStream(file, { start: 0, end: 100 });
        response = await fetch(location, {
            method: "PATCH",
            headers: {
                authorization: "Bearer secret",
                "content-type": "application/octet-stream",
                "content-length": 100,
                "upload-offset": uploadOffset,
                "tus-resumable": "1.0.0",
            },
            body: stream,
        });
        expect(response.status).toEqual(415);

        // content length not defined - expect 400
        stream = createReadStream(file, { start: 0, end: 100 });
        response = await fetch(location, {
            method: "PATCH",
            headers: {
                authorization: "Bearer secret",
                "content-type": "application/offset+octet-stream",
                "upload-offset": uploadOffset,
                "tus-resumable": "1.0.0",
            },
            body: stream,
        });
        expect(response.status).toEqual(400);

        // upload-offset not defined - expect 400
        stream = createReadStream(file, { start: 0, end: 100 });
        response = await fetch(location, {
            method: "PATCH",
            headers: {
                authorization: "Bearer secret",
                "content-type": "application/offset+octet-stream",
                "content-length": 100,
                "tus-resumable": "1.0.0",
            },
            body: stream,
        });
        expect(response.status).toEqual(400);

        await storage.abortUpload({ Bucket, Key: "config.js", uploadId });
    });
    it(`Should succeed in performing a PATCH request with a very small file`, async () => {
        const file = "./src/config.js";
        const filename = "config.js";
        const fileSize = (await stat(file)).size;
        await uploadFile({ file, filename, chunkSize: 100 });

        let exists = await storage.keyExists({ Bucket, Key: filename });
        expect(exists).toBeTrue;

        let s3FileStat = await storage.stat({ Bucket, Key: filename });
        expect(s3FileStat.ContentLength).toEqual(fileSize);

        let uploadedFile = await storage.downloadFile({
            Bucket: "repository",
            Key: filename,
        });
        let originalFile = await readFile(file);
        expect(uploadedFile.toString()).toEqual(originalFile.toString());

        await storage.removeObjects({
            Bucket: "repository",
            keys: [filename],
        });
    });
    it(`Should succeed in uploading a 1MB file`, async () => {
        const file = "./test-files/1mb.txt";
        if (!(await pathExists(file))) {
            console.log(
                `Create this test file to run this test: 'dd if=/dev/zero of=api/test-files/1mb.txt bs=1024 count=1000'`
            );
            return;
        }
        const filename = "1mb.txt";
        const fileSize = (await stat(file)).size;
        await uploadFile({ file, filename, chunkSize: 100 * 1024 });

        let exists = await storage.keyExists({ Bucket, Key: filename });
        expect(exists).toBeTrue;

        let s3FileStat = await storage.stat({ Bucket, Key: filename });
        expect(s3FileStat.ContentLength).toEqual(fileSize);

        let uploadedFile = await storage.downloadFile({
            Bucket,
            Key: filename,
        });
        let originalFile = await readFile(file);
        expect(uploadedFile.toString()).toEqual(originalFile.toString());

        await storage.removeObjects({
            Bucket,
            keys: [filename],
        });
    });
    it(`Should succeed in uploading a 10MB file`, async () => {
        const file = "./test-files/10mb.txt";
        if (!(await pathExists(file))) {
            console.log(
                `Create this test file to run this test: 'dd if=/dev/zero of=api/test-files/10mb.txt bs=1024 count=10000'`
            );
            return;
        }
        const filename = "10mb.txt";
        const fileSize = (await stat(file)).size;
        await uploadFile({ file, filename, chunkSize: 4 * 1024 * 1024 });

        let exists = await storage.keyExists({ Bucket, Key: filename });
        expect(exists).toBeTrue;

        let s3FileStat = await storage.stat({ Bucket, Key: filename });
        expect(s3FileStat.ContentLength).toEqual(fileSize);

        let uploadedFile = await storage.downloadFile({
            Bucket: "repository",
            Key: filename,
        });
        let originalFile = await readFile(file);
        expect(uploadedFile.toString()).toEqual(originalFile.toString());

        await storage.removeObjects({
            Bucket: "repository",
            keys: [filename],
        });
    });
    it(`Should succeed in uploading a 100MB file`, async () => {
        const file = "./test-files/100mb.txt";
        if (!(await pathExists(file))) {
            console.log(
                `Create this test file to run this test: 'dd if=/dev/zero of=api/test-files/100mb.txt bs=1024 count=100000'`
            );
            return;
        }
        const filename = "100mb.txt";
        const fileSize = (await stat(file)).size;
        await uploadFile({ file, filename, chunkSize: 8 * 1024 * 1024 });

        let exists = await storage.keyExists({ Bucket, Key: filename });
        expect(exists).toBeTrue;

        let s3FileStat = await storage.stat({ Bucket, Key: filename });
        expect(s3FileStat.ContentLength).toEqual(fileSize);

        let uploadedFile = await storage.downloadFile({
            Bucket,
            Key: filename,
        });
        let originalFile = await readFile(file);
        expect(uploadedFile.toString()).toEqual(originalFile.toString());

        await storage.removeObjects({
            Bucket: "repository",
            keys: [filename],
        });
    });
    it("playing with writing out file chunks", async () => {
        const file = "./src/config.js";
        const fileSize = (await stat(file)).size;

        let stream = createReadStream(file, { start: 0, end: 49 });
        for await (let chunk of stream) {
            await writeChunk({ chunk, position: 0 });
        }
        stream = createReadStream(file, { start: 50, end: 99 });
        for await (let chunk of stream) {
            await writeChunk({ chunk, position: 50 });
        }
        stream = createReadStream(file, { start: 100 });
        for await (let chunk of stream) {
            await writeChunk({ chunk, position: 100 });
        }
        await remove("./src/test-config.js");
    });
});

async function uploadFile({ file, filename, chunkSize = 100 }) {
    // const file = "./src/config.js";
    filename = new Buffer.from(filename).toString("base64");
    const bucket = new Buffer.from("repository").toString("base64");
    let fileSize = (await stat(file)).size;

    // create the file
    let response = await fetch("http://localhost:8080/files", {
        method: "POST",
        headers: {
            authorization: "Bearer secret",
            "x-forwarded-host": "http://localhost:8080/files",
            "content-type": "application/offset+octet-stream",
            "upload-length": fileSize,
            "upload-metadata": `filename ${filename}, bucket ${bucket}, overwrite`,
        },
    });
    expect(response.status).toEqual(201);
    // console.log("post request", response.status);
    const location = response.headers.get("location");

    let moreToGo = true;
    let start = 0;

    let i = 0;
    while (moreToGo) {
        start = i * chunkSize;
        let end = start + chunkSize - 1;
        if (end > fileSize) end = fileSize;
        // console.log("*****", start, end, fileSize, moreToGo);
        let stream = createReadStream(file, { start, end, highWaterMark: 10 * 1024 * 1024 });
        for await (let chunk of stream) {
            let response = await fetch(location, {
                method: "PATCH",
                headers: {
                    authorization: "Bearer secret",
                    "content-type": "application/offset+octet-stream",
                    "content-length": chunk.length,
                    "upload-offset": start,
                    "tus-resumable": "1.0.0",
                },
                body: chunk,
            });
            expect(response.status).toEqual(204);
            // console.log(start, chunkSize, response.headers);
            if (end < fileSize) {
                // expect(response.headers.get("upload-offset")).toEqual(
                //     String(start + chunkSize ?? end)
                // );
            } else {
                expect(response.headers.get("upload-offset")).toEqual(String(end));
            }
            // console.log("patch request", response.status);
        }
        if (end >= fileSize) {
            moreToGo = false;
        }
        i += 1;
    }
}

async function writeChunk({ chunk, position }) {
    const filename = "./src/test-config.js";
    let fd = await open(filename, "a+");
    await write(fd, chunk, null, null, position);
    await close(fd);
}
