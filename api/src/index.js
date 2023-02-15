import fp from "fastify-plugin";
import { getS3Handle } from "./s3-utils.js";
import { tusHeadHandler } from "./tus-head-handler.js";
import { tusOptionsHandler } from "./tus-options-handler.js";
import { tusPostHandler } from "./tus-post-handler.js";
import { tusPatchHandler } from "./tus-patch-handler.js";
import { FileSystemCache as Cache } from "file-system-cache";

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
    const uploadRoutePath = opts.uploadRoutePath ?? "/files";
    const cachePath = opts.cachePath ?? "./.cache";

    fastify.addHook("onReady", async () => {
        // attach a cache object to the fastify instance when it's ready
        const cache = new Cache({
            basePath: cachePath,
            ns: "tus-s3-uploader",
        });
        fastify.decorate("cache", cache);

        // and a handle to S3
        const client = getS3Handle(opts);
        fastify.decorate("s3client", client);
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
    done();
}
export default fp(tusS3Uploader);

function checkParam(opts, name) {
    if (!opts[name]) throw new Error(`Missing required param: '${name}'`);
}
