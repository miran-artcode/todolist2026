import React from "react";
import { createRoot } from "react-dom/client";
import "./firebase";
import "./storage"; // App 이 뜨기 전에 window.storage 를 깔아 둔다
import App from "./App";

createRoot(document.getElementById("root")).render(<App />);
