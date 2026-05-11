import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { syncGlobalTheme, initCrossTabThemeSync } from "./lib/globalTheme";

// Theme aus localStorage anwenden BEVOR React mountet — verhindert
// Hell-Dunkel-Flash bei direkten URL-Aufrufen auf Sub-Pages.
syncGlobalTheme();
// Cross-Tab-Sync registrieren — Toggle in Tab A wirkt sofort in Tab B.
initCrossTabThemeSync();

createRoot(document.getElementById("root")!).render(<App />);
