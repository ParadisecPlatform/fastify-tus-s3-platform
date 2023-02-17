export async function tusHeadHandler(req, res) {
    const uploadId = req.params.uploadId;
    let uploadData = await this.cache.get(uploadId);
    if (!uploadData) return res.notFound();

    console.log(uploadData);

    const headers = {
        "Tus-Resumable": "1.0.0",
        "Upload-Offset": parseInt(uploadData.bytesUploadedToServer),
    };
    res.code(200).headers(headers).send();
}
