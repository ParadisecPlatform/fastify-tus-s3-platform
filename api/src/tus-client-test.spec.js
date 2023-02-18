import * as tus from "tus-js-client";
import { createReadStream } from "node:fs";
import { Storage } from "./s3-utils";
import fsExtraPkg from "fs-extra";
const { stat, open, close, write, remove, readFile, pathExists } = fsExtraPkg;

describe(`Test TUS uploads using tus js client`, () => {
    const endpoint = "http://localhost:8080/files";
    const Bucket = "repository";
    const storage = new Storage({
        awsAccessKeyId: "root",
        awsSecretAccessKey: "rootpass",
        forcePathStyle: true,
        endpoint: "http://minio:9000",
    });
    it.only(`Should be able to upload a 1MB file using the TUS JS client`, async () => {
        const file = "./test-files/1mb.txt";
        const filename = "1mb.txt";
        const stream = createReadStream(file);
        if (!(await pathExists(file))) {
            console.log(
                `Create this test file to run this test: 'dd if=/dev/zero of=api/test-files/1mb.txt bs=1024 count=1000'`
            );
            return;
        }
        const metadata = {
            filename,
            bucket: Bucket,
            overwrite: true,
        };
        await TusUpload({ endpoint, stream, metadata, quiet: true });

        // verify the uploaded file
        const fileSize = (await stat(file)).size;
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
    it(`Should be able to upload a 10MB file using the TUS JS client`, async () => {
        const file = "./test-files/10mb.txt";
        const filename = "10mb.txt";
        const stream = createReadStream(file);
        if (!(await pathExists(file))) {
            console.log(
                `Create this test file to run this test: 'dd if=/dev/zero of=api/test-files/10mb.txt bs=1024 count=10000'`
            );
            return;
        }
        const metadata = {
            filename,
            bucket: Bucket,
            overwrite: true,
        };
        await TusUpload({ endpoint, stream, metadata, quiet: true });

        // verify the uploaded file
        const fileSize = (await stat(file)).size;
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
    it(`Should be able to upload a 100MB file using the TUS JS client`, async () => {
        const file = "./test-files/100mb.txt";
        const filename = "100mb.txt";
        const stream = createReadStream(file);
        if (!(await pathExists(file))) {
            console.log(
                `Create this test file to run this test: 'dd if=/dev/zero of=api/test-files/100mb.txt bs=1024 count=100000'`
            );
            return;
        }
        const metadata = {
            filename,
            bucket: Bucket,
            overwrite: true,
        };
        await TusUpload({ endpoint, stream, metadata, quiet: false });

        // verify the uploaded file
        const fileSize = (await stat(file)).size;
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
    it(`Should be able to upload a 1GB file using the TUS JS client`, async () => {
        const file = "./test-files/1gb.txt";
        const filename = "1gb.txt";
        const stream = createReadStream(file);
        if (!(await pathExists(file))) {
            console.log(
                `Create this test file to run this test: 'dd if=/dev/zero of=api/test-files/1gb.txt bs=1024 count=1000000'`
            );
            return;
        }
        const metadata = {
            filename,
            bucket: Bucket,
            overwrite: true,
        };
        await TusUpload({ endpoint, stream, metadata, quiet: false });

        // verify the uploaded file
        const fileSize = (await stat(file)).size;
        let exists = await storage.keyExists({ Bucket, Key: filename });
        expect(exists).toBeTrue;

        let s3FileStat = await storage.stat({ Bucket, Key: filename });
        expect(s3FileStat.ContentLength).toEqual(fileSize);

        // let uploadedFile = await storage.downloadFile({
        //     Bucket,
        //     Key: filename,
        // });
        // let originalFile = await readFile(file);
        // expect(uploadedFile).toEqual(originalFile.toString());

        // await storage.removeObjects({
        //     Bucket,
        //     keys: [filename],
        // });
    }, 10000);
    it.only(`Should be able to upload a 10GB file using the TUS JS client`, async () => {
        const file = "./test-files/10gb.txt";
        const filename = "10gb.txt";
        const stream = createReadStream(file);
        if (!(await pathExists(file))) {
            console.log(
                `Create this test file to run this test: 'dd if=/dev/zero of=api/test-files/10gb.txt bs=1024 count=10000000'`
            );
            return;
        }
        const metadata = {
            filename,
            bucket: Bucket,
            overwrite: true,
        };
        await TusUpload({ endpoint, stream, metadata, quiet: false });

        // verify the uploaded file
        const fileSize = (await stat(file)).size;
        let exists = await storage.keyExists({ Bucket, Key: filename });
        expect(exists).toBeTrue;

        let s3FileStat = await storage.stat({ Bucket, Key: filename });
        expect(s3FileStat.ContentLength).toEqual(fileSize);

        // let uploadedFile = await storage.downloadFile({
        //     Bucket,
        //     Key: filename,
        // });
        // let originalFile = await readFile(file);
        // expect(uploadedFile).toEqual(originalFile.toString());

        // await storage.removeObjects({
        //     Bucket,
        //     keys: [filename],
        // });
    }, 1200000);
});

function TusUpload({ endpoint, stream, metadata, quiet = false }) {
    return new Promise((resolve, reject) => {
        const options = {
            endpoint,
            metadata,
            // chunk size = 128MB
            chunkSize: 256 * 1024 * 1024,
            onError(error) {
                console.error("An error occurred:");
                console.error(error);
                reject();
            },
            onProgress(bytesUploaded, bytesTotal) {
                const percentage = ((bytesUploaded / bytesTotal) * 100).toFixed(2);
                if (!quiet) console.log(bytesUploaded, bytesTotal, `${percentage}%`);
            },
            onSuccess() {
                if (!quiet) console.log("Upload finished:", upload.url);
                resolve();
            },
        };

        const upload = new tus.Upload(stream, options);
        upload.start();
    });
}
