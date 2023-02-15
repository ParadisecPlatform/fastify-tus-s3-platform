import { createReadStream } from "fs";
import {
    getS3Handle,
    createUpload,
    uploadPart,
    completeUpload,
    // listMultipartUploads,
    listParts,
    abortUpload,
    removeObjects,
} from "./s3-utils.js";

describe(`Test multipart upload components`, () => {
    const client = getS3Handle({
        awsAccessKeyId: "root",
        awsSecretAccessKey: "rootpass",
        forcePathStyle: true,
        endpoint: "http://minio:9000",
    });
    it("Should be able to perform a multipart upload of a small file - 1 part", async () => {
        const file = createReadStream("./jest.config.js");
        const Bucket = "repository";
        const Key = "jest.config.js";

        const { uploadId } = await createUpload({ client, Bucket, Key });

        const parts = [];
        const part = await uploadPart({
            client,
            Bucket,
            Key,
            uploadId,
            partNumber: 1,
            stream: file,
        });
        parts.push(part);

        let response = await completeUpload({ client, Bucket, Key, uploadId, parts });
        expect(response.$metadata.httpStatusCode).toEqual(200);
        expect(response.Location).toEqual(`http://minio/repository/jest.config.js`);

        await removeObjects({ client, Bucket, keys: ["jest.config.js"] });
    });
    it("Should be able to list, and abort, a single multipart upload in the bucket", async () => {
        const file = createReadStream("./jest.config.js");
        const Bucket = "repository";
        const Key = "jest.config.js";

        const { uploadId } = await createUpload({ client, Bucket, Key });

        const parts = [];
        const part = await uploadPart({
            client,
            Bucket,
            Key,
            uploadId,
            partNumber: 1,
            stream: file,
        });
        parts.push(part);

        let response = await listParts({ client, Bucket, Key, uploadId });
        expect(response.Parts.length).toEqual(1);

        response = await abortUpload({ client, Bucket, Key, uploadId });
        expect(response.$metadata.httpStatusCode).toEqual(204);

        try {
            response = await listParts({ client, Bucket, Key, uploadId });
        } catch (error) {
            expect(error.message).toEqual(
                "The specified multipart upload does not exist. The upload ID may be invalid, or the upload may have been aborted or completed."
            );
        }
        //  expect(response.Parts.length).toEqual(1);
    });
});
