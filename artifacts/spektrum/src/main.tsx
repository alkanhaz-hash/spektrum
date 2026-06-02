import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Force dark mode as default for SPEKTRUM
document.documentElement.classList.add("dark");

createRoot(document.getElementById("root")!).render(<App />);
