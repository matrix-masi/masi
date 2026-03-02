import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { MatrixProvider } from "./contexts/MatrixContext";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MatrixProvider>
      <App />
    </MatrixProvider>
  </StrictMode>
);
