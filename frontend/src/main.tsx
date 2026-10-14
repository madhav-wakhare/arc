import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ToastProvider } from "./components/ui";
import "./index.css";
import Board from "./pages/Board";
import Dashboard from "./pages/Dashboard";
import Quotes from "./pages/Quotes";
import Weekend from "./pages/Weekend";
import Reading from "./pages/Reading";
import Radar from "./pages/Radar";
import Revise from "./pages/Revise";
import Learning from "./pages/Learning";
import ListView from "./pages/ListView";
import Reports from "./pages/Reports";
import Projects from "./pages/Projects";
import Settings from "./pages/Settings";
import Trash from "./pages/Trash";
import Today from "./pages/Today";

/** Old /reading links (and bookmarks) now open Learning → Articles, keeping ?c= etc. */
function ToArticles() {
  return <Navigate to={`/learning/articles${useLocation().search}`} replace />;
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, refetchOnWindowFocus: true } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="radar" element={<Radar />} />
              <Route path="revisit" element={<Revise />} />
              <Route path="revise" element={<Navigate to="/revisit" replace />} />
              <Route path="inbox" element={<Navigate to="/radar" replace />} />
              <Route path="today" element={<Today />} />
              <Route path="board" element={<Board />} />
              <Route path="list" element={<ListView />} />
              <Route path="learning" element={<Learning />} />
              <Route path="learning/articles" element={<Reading />} />
              <Route path="reading" element={<ToArticles />} />
              <Route path="reports" element={<Reports />} />
              <Route path="projects" element={<Projects />} />
              <Route path="weekend" element={<Weekend />} />
              <Route path="quotes" element={<Quotes />} />
              <Route path="trash" element={<Trash />} />
              <Route path="settings" element={<Settings />} />
              <Route path="*" element={<Dashboard />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
