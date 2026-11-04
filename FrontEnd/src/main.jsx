import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import App from "./App.jsx";
import Login from "./pages/login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Admin from "./pages/Admin.jsx";
import Upload from "./pages/upload.jsx";
import CreateQuiz from "./pages/CreateQuiz.jsx";

import "./index.css";
import "./styles/login.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/create-quiz" element={<CreateQuiz />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
