import debug from "debug";
const log = debug("tus-s3-uploader:PATCH");
import fsExtraPkg from "fs-extra";
const { remove } = fsExtraPkg;
import path from "path";

export async function tusDeleteHandler(req, res) {
    log("The upload has been terminated. Removing the cache file and entry");
    const uploadId = req.params.uploadId;
    let uploadData = await this.cache.get(uploadId);

    // if we don't find upload data for uploadId - fail out
    if (!uploadData) {
        res.gone();
        return;
    }

    const cacheFile = path.join(this.cache.basePath, uploadId);
    await remove(cacheFile);
    await this.cache.remove(uploadId);
    res.code(204).send();
}
