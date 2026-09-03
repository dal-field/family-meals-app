import "./style.css";
import { createApp } from "./app.js";

const root = document.querySelector("#app");
createApp(root);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const url = `${import.meta.env.BASE_URL}sw.js`;
    navigator.serviceWorker.register(url).catch(() => undefined);
  });
}
