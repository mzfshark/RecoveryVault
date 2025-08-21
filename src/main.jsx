import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { store } from "./store";
import { ReownProvider } from "./services/appkit";
import { ContractProvider } from "./contexts/ContractContext";
import App from "./App";
import "./styles/Global.module.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ReownProvider>
      <ContractProvider>
        <Provider store={store}>
          <App />
        </Provider>
      </ContractProvider>
    </ReownProvider>
  </React.StrictMode>
);
