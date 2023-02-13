const endpoint = "http://api:8080/files";
const tus = require("tus-js-client");
const fs = require("fs");
const fetch = require("cross-fetch");

describe(`Test uploading chunks to S3`, () => {
    it("Should be able to connect to the /files endpoint", async () => {
        const file = fs.createReadStream("./jest.config.js");

        let upload = new tus.Upload(file, {
            endpoint,
            retryDelays: null,
            metadata: {
                filename: "jest.config.js",
                important: true,
            },
            onError(error) {
                // console.log("****", error);
            },
            onProgress(bytesUploaded, bytesTotal) {
                console.log("on progress", bytesUploaded, bytesTotal);
            },
            onSuccess() {
                console.log("done");
            },
        });
        console.log("start upload to server");
        await upload.start();

        await new Promise((resolve) => setTimeout(resolve, 1000));
        // await fetch(endpoint);
    });
});
