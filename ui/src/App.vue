<template>
    <div class="flex flex-col h-screen">
        <div ref="dashboard"></div>
    </div>
</template>

<script setup>
import Dashboard from "@uppy/dashboard";
import Tus from "@uppy/tus";
import "@uppy/core/dist/style.css";
import "@uppy/dashboard/dist/style.css";
import Uppy from "@uppy/core";
import { ref, onMounted } from "vue";
const dashboard = ref(null);

let uppy;
onMounted(() => {
    uppy = new Uppy({
        debug: false,
        autoProceed: false,
        onBeforeFileAdded: (file) => {
            file.meta.bucket = "repository";
            file.meta.overwrite = true;
        },
    });
    uppy.on("upload-error", (error) => console.error(error));
    uppy.use(Dashboard, {
        target: dashboard.value,
        inline: true,
    });
    uppy.use(Tus, {
        endpoint: "http://localhost:9000/api/files",
        retryDelays: null,
        chunkSize: 64 * 1024 * 1024,
    });
});
</script>
