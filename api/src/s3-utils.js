import {
    S3Client,
    HeadBucketCommand,
    HeadObjectCommand,
    AbortMultipartUploadCommand,
    CreateMultipartUploadCommand,
    UploadPartCommand,
    CompleteMultipartUploadCommand,
    // ListMultipartUploadsCommand,
    ListPartsCommand,
    DeleteObjectsCommand,
} from "@aws-sdk/client-s3";

export function getS3Handle({
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

    return new S3Client(configuration);
}
export async function keyExists({ client, Bucket, Key }) {
    const params = { Bucket, Key };
    const command = new HeadObjectCommand(params);
    try {
        return (await client.send(command)).$metadata.httpStatusCode === 200;
    } catch (error) {
        return false;
    }
}
export async function createUpload({ client, Bucket, Key }) {
    let command = new CreateMultipartUploadCommand({
        Bucket,
        Key,
    });
    let response = await client.send(command);
    if (response.$metadata.httpStatusCode !== 200) {
        // abort
        return;
    }
    return { uploadId: response.UploadId };
}
export async function uploadPart({ client, Bucket, Key, uploadId, partNumber, stream }) {
    let command = new UploadPartCommand({
        Bucket,
        Key,
        UploadId: uploadId,
        PartNumber: partNumber,
        Body: stream,
    });
    let response = await client.send(command);
    return { PartNumber: partNumber, ETag: response.ETag };
}
export async function completeUpload({ client, Bucket, Key, uploadId, parts }) {
    let command = new CompleteMultipartUploadCommand({
        Bucket,
        Key,
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
export async function listParts({ client, Bucket, Key, uploadId }) {
    let command = new ListPartsCommand({
        Bucket,
        Key,
        UploadId: uploadId,
    });
    let response = await client.send(command);
    return response;
}
export async function abortUpload({ client, Bucket, Key, uploadId }) {
    let command = new AbortMultipartUploadCommand({
        Bucket,
        Key,
        UploadId: uploadId,
    });
    let response = await client.send(command);
    return response;
}
export async function removeObjects({ client, Bucket, keys = [] }) {
    let objs = keys.map((k) => ({ Key: k }));
    if (objs?.length) {
        const command = new DeleteObjectsCommand({
            Bucket,
            Delete: { Objects: objs },
        });
        return (await client.send(command)).$metadata;
    }
}
export async function bucketExists({ client, Bucket }) {
    const command = new HeadBucketCommand({ Bucket });
    try {
        return (await client.send(command)).$metadata.httpStatusCode === 200;
    } catch (error) {
        return false;
    }
}
