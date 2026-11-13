import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./lib/watch-focus";
import { registerSW } from "virtual:pwa-register";

// Register service worker
if (import.meta.env.MODE !== "native") registerSW({ immediate: true });

createRoot(document.getElementById("root")!).render(<App />);
