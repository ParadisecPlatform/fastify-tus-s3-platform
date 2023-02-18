import Fastify from "fastify";
import fastifyCompress from "@fastify/compress";
import fastifySensible from "@fastify/sensible";
import cors from "@fastify/cors";
const envToLogger = {
    development: {
        transport: {
            target: "@fastify/one-line-logger",
        },
        // transport: {
        //     target: "pino-pretty",
        //     options: {
        //         translateTime: "HH:MM:ss Z",
        //         ignore: "pid,hostname",
        //     },
        // },
    },
};
const fastify = Fastify({
    logger: envToLogger[process.env.NODE_ENV],
    bodyLimit: 256 * 1024 * 1024,
});
import tusS3Uploader from "./src/index.js";

main();
async function main() {
    fastify.addHook("onReady", () => {
        console.log();
        console.log("Registered routes:");
        routes.map((r) => console.log(`${r.method}: ${r.url}`));
        console.log("");
    });
    const routes = [];
    fastify.addHook("onRoute", (route) => {
        routes.push(route);
    });
    await fastify.register(cors, {
        origin: "*",
        methods: ["OPTIONS", "GET", "HEAD", "PATCH", "POST"],
        allowedHeaders: [
            "content-type",
            "upload-length",
            "content-length",
            "upload-offset",
            "upload-expires",
            "location",
            "upload-metadata",
            "tus-resumable",
            "tus-version",
            "tus-max-size",
            "tus-extension",
        ],
        exposedHeaders: [
            "content-type",
            "upload-length",
            "content-length",
            "upload-offset",
            "upload-expires",
            "location",
            "upload-metadata",
            "tus-resumable",
            "tus-version",
            "tus-max-size",
            "tus-extension",
        ],
    });
    fastify.register(fastifySensible);
    fastify.register(fastifyCompress);
    fastify.register(tusS3Uploader, {
        awsAccessKeyId: "root",
        awsSecretAccessKey: "rootpass",
        endpoint: "http://minio:9000",
        forcePathStyle: true,
    });
    fastify.addHook("onRequest", async (req, res) => {
        // console.log("***", req.method, req.url);
    });

    fastify.listen({ port: 8080, host: "0.0.0.0" }, function (err, address) {});
}
