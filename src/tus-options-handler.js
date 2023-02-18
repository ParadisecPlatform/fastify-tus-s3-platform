import { maximumFileSize, tusExtensions } from "./config.js";
export async function tusOptionsHandler(req, res) {
    const headers = {
        "Tus-Resumable": "1.0.0",
        "Tus-Version": "1.0.0",
        "Tus-Max-Size": maximumFileSize,
        "Tus-Extension": tusExtensions,
    };
    res.code(204).headers(headers).send();
}
