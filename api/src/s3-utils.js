import {
    S3Client,
    GetObjectCommand,
    HeadBucketCommand,
    HeadObjectCommand,
    AbortMultipartUploadCommand,
    CreateMultipartUploadCommand,
    UploadPartCommand,
    CompleteMultipartUploadCommand,
    // ListMultipartUploadsCommand,
    ListPartsCommand,
    DeleteObjectsCommand,
    PutObjectCommand,
} from "@aws-sdk/client-s3";

export class Storage {
    constructor({
        awsAccessKeyId,
        awsSecretAccessKey,
        forcePathStyle = false,
        endpoint = undefined,
        region = "us-east-1",
    }) {
        let configuration = {
            forcePathStyle,
            s3ForcePathStyle: forcePathStyle,
            credentials: {
                accessKeyId: awsAccessKeyId,
                secretAccessKey: awsSecretAccessKey,
            },
            region,
        };
        if (endpoint) configuration.endpoint = endpoint;

        this.client = new S3Client(configuration);
    }
    async keyExists({ Bucket, Key }) {
        const params = { Bucket, Key };
        const command = new HeadObjectCommand(params);
        try {
            return (await this.client.send(command)).$metadata.httpStatusCode === 200;
        } catch (error) {
            return false;
        }
    }
    async stat(Bucket, Key) {
        const command = new HeadObjectCommand(Bucket, Key);
        try {
            return await this.client.send(command);
        } catch (error) {
            return false;
        }
    }
    async downloadFile({ Bucket, Key }) {
        const command = new GetObjectCommand({ Bucket, Key });
        let response = await this.client.send(command);

        const chunks = [];
        for await (let chunk of response.Body) {
            chunks.push(chunk);
        }
        let data = Buffer.concat(chunks).toString();
        return data;
    }
    async uploadFile({ Bucket, Key, stream }) {
        const command = new PutObjectCommand({
            Bucket,
            Key,
            Body: stream,
        });
        let response = await this.client.send(command);
        return response.$metadata;
    }
    async createUpload({ Bucket, Key }) {
        let command = new CreateMultipartUploadCommand({
            Bucket,
            Key,
        });
        let response = await this.client.send(command);
        if (response.$metadata.httpStatusCode !== 200) {
            // abort
            return;
        }
        return { uploadId: response.UploadId };
    }
    async uploadPart({ Bucket, Key, uploadId, partNumber, stream }) {
        let command = new UploadPartCommand({
            Bucket,
            Key,
            UploadId: uploadId,
            PartNumber: partNumber,
            Body: stream,
        });
        let response = await this.client.send(command);
        return { PartNumber: partNumber, ETag: response.ETag };
    }
    async completeUpload({ Bucket, Key, uploadId, parts }) {
        let command = new CompleteMultipartUploadCommand({
            Bucket,
            Key,
            UploadId: uploadId,
            MultipartUpload: { Parts: parts },
        });
        let response = await this.client.send(command);
        return response;
    }
    // async listMultipartUploads({ Bucket }) {
    //     let command = new ListMultipartUploadsCommand({
    //         Bucket,
    //     });
    //     let response = await this.client.send(command);
    //     return response;
    // }
    async listParts({ Bucket, Key, uploadId }) {
        let command = new ListPartsCommand({
            Bucket,
            Key,
            UploadId: uploadId,
        });
        let response = await this.client.send(command);
        return response;
    }
    async abortUpload({ Bucket, Key, uploadId }) {
        let command = new AbortMultipartUploadCommand({
            Bucket,
            Key,
            UploadId: uploadId,
        });
        let response = await this.client.send(command);
        return response;
    }
    async removeObjects({ Bucket, keys = [] }) {
        let objs = keys.map((k) => ({ Key: k }));
        if (objs?.length) {
            const command = new DeleteObjectsCommand({
                Bucket,
                Delete: { Objects: objs },
            });
            return (await this.client.send(command)).$metadata;
        }
    }
    async bucketExists({ Bucket }) {
        const command = new HeadBucketCommand({ Bucket });
        try {
            return (await this.client.send(command)).$metadata.httpStatusCode === 200;
        } catch (error) {
            return false;
        }
    }
}
