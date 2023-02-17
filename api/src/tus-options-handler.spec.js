import fetch from "cross-fetch";
import { maximumFileSize, tusExtensions } from "./config";

describe.only(`Test TUS OPTIONS handling`, () => {
    it(`Should be able to perform an OPTIONS request and get the expected response`, async () => {
        let response = await fetch("http://localhost:8080/files", {
            method: "OPTIONS",
        });
        expect(response.status).toEqual(204);
        expect(response.headers.has("tus-resumable")).toBeTrue;
        expect(response.headers.get("tus-resumable")).toEqual("1.0.0");
        expect(response.headers.has("tus-version")).toBeTrue;
        expect(response.headers.get("tus-version")).toEqual("1.0.0");
        expect(response.headers.has("tus-max-size")).toBeTrue;
        expect(response.headers.get("tus-max-size")).toEqual(String(maximumFileSize));
        expect(response.headers.has("tus-extension")).toBeTrue;
        expect(response.headers.get("tus-extension")).toEqual(tusExtensions);
    });
});
