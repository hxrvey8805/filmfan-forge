import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./lib/watch-focus";
import { registerAppWorker } from "./lib/register-app-worker";
import { registerSW } from "virtual:pwa-register";

registerAppWorker(registerSW);

createRoot(document.getElementById("root")!).render(<App />);
