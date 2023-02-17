import { maximumFileSize, tusExtensions } from "./config.js";
export async function tusOptionsHandler(req, res) {
    res.code(204)
        .headers({
            "Tus-Resumable": "1.0.0",
            "Tus-Version": "1.0.0",
            "Tus-Max-Size": maximumFileSize,
            "Tus-Extension": tusExtensions,
        })
        .send();
}
