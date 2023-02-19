# Fastify plugin for TUS uploads direct to S3

- [Fastify plugin for TUS uploads direct to S3](#fastify-plugin-for-tus-uploads-direct-to-s3)
  - [Install](#install)
  - [Example Usage](#example-usage)
  - [Use it in your fastify server](#use-it-in-your-fastify-server)
  - [Supported TUS extensions](#supported-tus-extensions)
    - [CORS](#cors)
    - [Setting max body size on the fastify instance](#setting-max-body-size-on-the-fastify-instance)
    - [Plugin configuration options.](#plugin-configuration-options)
  - [How it works](#how-it-works)
  - [Develop the plugin](#develop-the-plugin)

This plugins adds support for TUS uploads that are sent directly to S3 as multi part uploads.

## Install

```
npm install -i @paradisec-platform/fastify-tus-s3-plugin
```

## Example Usage

-   To see an example of how to use it from nodejs go to
    [./src/tus-client-test.spec.js](./src/tus-client-test.spec.js)
-   To see an example of how to use it with Uppy inside a VueJS app:
    [./ui/sc/App.vue](./ui/src/App.vue)

## Use it in your fastify server

To integrate it into your server register it as you would any other fastify plugin:

```
import fastifyTusS3Plugin from "@paradisec-platform/fastify-tus-s3-plugin"

const fastify = Fastify({
    logger: envToLogger[process.env.NODE_ENV],
    bodyLimit: 256 * 1024 * 1024,
});

fastify.register(tusS3Uploader, {
    awsAccessKeyId: process.env.awsAccessKeyId,
    awsSecretAccessKey: process.env.awsSecretAccessKey,
    region: 'us-east-1',
    endpoint: "http://minio:9000",
    forcePathStyle: true,
    cachePath: "./.cache",
    uploadRoutePath: "/files",
    defaultUploadExpiration: { hours: 6 },
});
```

## Supported TUS extensions

This plugin implements the `creation`, `expiration` and `termination` tus extensions.

### CORS

If your UI is at a different URI to your API you will need to setup CORS. Look at
[./api/server.js](./api/server.js) for the methods and headers you will need to configure somewhere
(your web proxy or fastify itself as this example shows) to enable all of this to work.

### Setting max body size on the fastify instance

Note the `bodyLimit` property on the Fastify instance above. Without this you will not be able to
send data to Fastify. As to what you set it to, that really depends on the specs of your machine and
how you configure TUS (explained further below: [How it works](#how-it-works)). In this instance we
are allowing a maximum body size of 256MB.

### Plugin configuration options.

-   `awsAccessKeyId`: (required) The AWS key for access to the bucket.
-   `awsSecretAccessKey`: (required) The AWS secret key used for access to the bucket.
-   `region`: (optional, default: 'us-east-1') The AWS region for your bucket. (Leave as is if using
    MinIO, it has no effect anyway.)

If you are using MinIO or some other S3 like system then you will also need to set:

-   `endpoint`: The URL to the service.
-   `forcePathStyle`: (default: false) MinIO (and likely others) use paths rather than DNS named
    buckets; set this to true for those services.

In order to save required info between requests and cache uploaded data until enough has been
buffered to send to S3:

-   `cachePath`: (default: './.cache') The path on the server where info and file parts are cached
-   `uploadRoutePath`: (default: '/files') The route path where TUS uploads are sent.
-   `defaultUploadExpiration`: (default: 6 hours). The default, maximum time an upload is allowed to
    run for. To set a different time follow the docs at https://date-fns.org/v2.29.3/docs/add.

## How it works

Multipart uploads to S3 must operate in a specific way:
https://docs.aws.amazon.com/AmazonS3/latest/userguide/qfacts.html. Basically:

-   a multipart upload cannot have a part size smaller than 5MB unless it's a single part;
-   all parts except for the last must be the same size;
-   there can't be more than 10,000 parts in a given multipart upload;
-   with a maximum file size of 5TB.

This plugin accepts data blob uploads from a TUS client and then caches them locally until the
minimum part size is reached; at which point that part is uploaded to S3. Once all of the data has
been received, the multipart upload is completed. The [default configuration](./src/config.js)
specifies the following limits:

-   `maximumFileSize`: (default: 1.2TB) The maximum size of file this server will accept (this is
    not the maximum body request size defined above.
-   `preferredPartSize`: (default: 128MB) The amount of data cached locally before a part upload to
    S3 is performed. 128MB \* 10,000 equals a maximum file size of 1TB in S3 which ===
    maximumFileSize.
-   `maximumParts`: (default: 10,000) This is the AWS maximum number of parts limit.

So, you want the maximum body limit on the fastify server to be at least 128MB but you also need to
tell the TUS client that the maximum chunk size it can send is 128MB. The docs for the
[tus-node-js-client](https://github.com/tus/tus-js-client/blob/main/docs/api.md) describe a
`chunkSize` config property but if you don't set it, the client will try to buffer as much as it can
before sending to the server. That means the max body size on fastify needs to be (potentially) up
to 1.2TB to handle uploading a file that big.

In the example [UI](./ui/src/App.vue) / [API](./src/tus-client-test.spec.js) you can see examples
where TUS is given a maximum chunk size of 64MB and 128MB respectively. That means chunks of that
size will be uploaded and when there's enough data buffered (more than preferredPartSize), a multi
part upload will happen.

If the file size is smaller than preferred size, a single upload will occur when the data has been
received, regardless of the number of chunks it was sent it.

All of this magic happens in the file [./src/tus-patch-handler.js](./src/tus-patch-handler.js). Look
there to understand what happens.

Final thought: node streams are used throughout (to save a chunk to the local file buffer; to remove
the uploaded part from the buffer). This means the code (should be - hopefully!) is memory efficient
as it never tries to load a full file chunk into memory. Not even when it does the part upload as
that happens using a stream as well.

## Develop the plugin

You will need docker:

-   start the containers: `docker compose up`
-   docker exec into the API container and run jest test: `npm run test:watch`
-   Go for it
