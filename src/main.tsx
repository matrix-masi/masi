import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { MatrixProvider } from "./contexts/MatrixContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { SettingsProvider } from "./contexts/SettingsContext";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <SettingsProvider>
        <MatrixProvider>
          <App />
        </MatrixProvider>
      </SettingsProvider>
    </ThemeProvider>
  </StrictMode>
);
