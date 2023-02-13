import { createReadStream } from "fs";
import {
    getS3Handle,
    createUpload,
    uploadPart,
    completeUpload,
    // listMultipartUploads,
    listParts,
    abortUpload,
} from "./index.js";

describe(`Test multipart uploads to S3`, () => {
    it("Should be able to perform a multipart upload of a small file - 1 part", async () => {
        const file = createReadStream("./jest.config.js");
        let client = getS3Handle();
        const bucket = "repository";
        const key = "jest.config.js";

        const { uploadId } = await createUpload({ client, bucket, key });

        const parts = [];
        const part = await uploadPart({
            client,
            bucket,
            key,
            uploadId,
            partNumber: 1,
            stream: file,
        });
        parts.push(part);

        let response = await completeUpload({ client, bucket, key, uploadId, parts });
        expect(response.$metadata.httpStatusCode).toEqual(200);
        expect(response.Location).toEqual(`http://minio/repository/jest.config.js`);
    });
    it("Should be able to list, and abort, a single multipart upload in the bucket", async () => {
        const file = createReadStream("./jest.config.js");
        let client = getS3Handle();
        const bucket = "repository";
        const key = "jest.config.js";

        const { uploadId } = await createUpload({ client, bucket, key });

        const parts = [];
        const part = await uploadPart({
            client,
            bucket,
            key,
            uploadId,
            partNumber: 1,
            stream: file,
        });
        parts.push(part);

        let response = await listParts({ client, bucket, key, uploadId });
        expect(response.Parts.length).toEqual(1);

        response = await abortUpload({ client, bucket, key, uploadId });
        expect(response.$metadata.httpStatusCode).toEqual(204);

        try {
            response = await listParts({ client, bucket, key, uploadId });
        } catch (error) {
            expect(error.message).toEqual(
                "The specified multipart upload does not exist. The upload ID may be invalid, or the upload may have been aborted or completed."
            );
        }
        //  expect(response.Parts.length).toEqual(1);
    });
});
