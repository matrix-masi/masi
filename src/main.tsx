import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { MatrixProvider } from "./contexts/MatrixContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <MatrixProvider>
        <App />
      </MatrixProvider>
    </ThemeProvider>
  </StrictMode>
);
