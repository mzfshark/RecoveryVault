import React from "react";
import ReactDOM from "react-dom/client";
import { ReownProvider } from "./services/appkit";
import { ContractProvider } from "./contexts/ContractContext";
import App from "./App";
import "./styles/Global.module.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ReownProvider>
      <ContractProvider>
        <App />
      </ContractProvider>
    </ReownProvider>
  </React.StrictMode>
);
