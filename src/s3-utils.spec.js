import { createReadStream } from "fs";
import { Storage } from "./s3-utils.js";

describe(`Test multipart upload components`, () => {
    const storage = new Storage({
        awsAccessKeyId: "root",
        awsSecretAccessKey: "rootpass",
        forcePathStyle: true,
        endpoint: "http://minio:9000",
    });
    it(`should be able to upload a complete file that's less than 5MB`, async () => {
        const file = createReadStream("./jest.config.js");
        const Bucket = "repository";
        const Key = "jest.config.js";
        let response = await storage.uploadFile({ Bucket, Key, stream: file });
        expect(response.httpStatusCode).toEqual(200);

        await storage.removeObjects({ Bucket, keys: ["jest.config.js"] });
    });
    it("Should be able to perform a multipart upload of a small file - 1 part", async () => {
        const file = createReadStream("./jest.config.js");
        const Bucket = "repository";
        const Key = "jest.config.js";

        const { uploadId } = await storage.createUpload({ Bucket, Key });

        const parts = [];
        const part = await storage.uploadPart({
            Bucket,
            Key,
            uploadId,
            partNumber: 1,
            stream: file,
        });
        parts.push(part);

        let response = await storage.completeUpload({ Bucket, Key, uploadId, parts });
        expect(response.$metadata.httpStatusCode).toEqual(200);
        expect(response.Location).toEqual(`http://minio/repository/jest.config.js`);

        await storage.removeObjects({ Bucket, keys: ["jest.config.js"] });
    });
    it("Should be able to list, and abort, a single multipart upload in the bucket", async () => {
        const file = createReadStream("./jest.config.js");
        const Bucket = "repository";
        const Key = "jest.config.js";

        const { uploadId } = await storage.createUpload({ Bucket, Key });

        const parts = [];
        const part = await storage.uploadPart({
            Bucket,
            Key,
            uploadId,
            partNumber: 1,
            stream: file,
        });
        parts.push(part);

        let response = await storage.listParts({ Bucket, Key, uploadId });
        expect(response.Parts.length).toEqual(1);

        response = await storage.abortUpload({ Bucket, Key, uploadId });
        expect(response.$metadata.httpStatusCode).toEqual(204);

        try {
            response = await storage.listParts({ Bucket, Key, uploadId });
        } catch (error) {
            expect(error.message).toEqual(
                "The specified multipart upload does not exist. The upload ID may be invalid, or the upload may have been aborted or completed."
            );
        }
        //  expect(response.Parts.length).toEqual(1);
    });
});
