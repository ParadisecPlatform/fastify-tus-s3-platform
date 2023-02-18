import "./assets/tailwind.css";

import { createApp } from "vue";
import App from "./App.vue";

(async () => {
    const app = createApp(App);
    console.log(app);
    app.mount("#app");
})();
