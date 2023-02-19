import fp from "fastify-plugin";
import { Storage } from "./s3-utils.js";
import { tusHeadHandler } from "./tus-head-handler.js";
import { tusOptionsHandler } from "./tus-options-handler.js";
import { tusPostHandler } from "./tus-post-handler.js";
import { tusPatchHandler } from "./tus-patch-handler.js";
import { tusDeleteHandler } from "./tus-delete-handler.js";
import { FileSystemCache as Cache } from "file-system-cache";
import debug from "debug";
const log = debug("tus-s3-uploader:PLUGIN SETUP");

function tusS3Uploader(fastify, opts, done) {
    // verify required params set
    try {
        checkParam(opts, "awsAccessKeyId");
        checkParam(opts, "awsSecretAccessKey");
    } catch (error) {
        console.error("****", error.message);
        console.error(`**** Fastify TUS S3 uploader not available`);
        return next();
    }
    // set some defaults
    // https://date-fns.org/v2.29.3/docs/add
    const defaultUploadExpiration = opts.defaultUploadExpiration ?? { hours: 6 };
    const uploadRoutePath = opts.uploadRoutePath ?? "/files";
    const cachePath = opts.cachePath ?? "./.cache";

    log({ ...opts, uploadRoutePath, cachePath });

    fastify.addHook("onReady", async () => {
        // set default expiration time for all uploads
        fastify.decorate("defaultUploadExpiration", defaultUploadExpiration);

        // attach a cache object to the fastify instance when it's ready
        const cache = new Cache({
            basePath: cachePath,
            ns: "tus-s3-uploader",
        });
        fastify.decorate("cache", cache);

        // and a handle to S3
        const storage = new Storage(opts);
        fastify.decorate("storage", storage);

        log({ cache });
    });

    // define a content type parse for tus uploads
    //   this just returns the uploaded part as a buffer
    fastify.addContentTypeParser(
        "application/offset+octet-stream",
        { parseAs: "buffer" },
        (req, payload, done) => {
            if (payload.length === 0) return done();
            done(null, payload);
        }
    );

    // wire up the routes
    fastify.head(`${uploadRoutePath}/:uploadId`, tusHeadHandler);
    fastify.options(`${uploadRoutePath}`, tusOptionsHandler);
    fastify.post(`${uploadRoutePath}`, tusPostHandler);
    fastify.patch(`${uploadRoutePath}/:uploadId`, tusPatchHandler);
    fastify.delete(`${uploadRoutePath}/:uploadId`, tusDeleteHandler);
    done();
}
export default fp(tusS3Uploader);

function checkParam(opts, name) {
    if (!opts[name]) throw new Error(`Missing required param: '${name}'`);
}
