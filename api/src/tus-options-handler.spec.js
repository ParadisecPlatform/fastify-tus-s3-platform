import fetch from "cross-fetch";

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
        expect(response.headers.get("tus-max-size")).toEqual("536870912000");
        expect(response.headers.has("tus-extension")).toBeTrue;
        expect(response.headers.get("tus-extension")).toEqual(
            "creation,creation-with-upload,expiration"
        );
    });
});
