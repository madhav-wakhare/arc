import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ToastProvider } from "./components/ui";
import "./index.css";
import Dashboard from "./pages/Dashboard";

// The Dashboard is the landing page and ships in the main bundle; every other page loads on
// first visit, so the app starts with a much smaller download.
const Board = lazy(() => import("./pages/Board"));
const Quotes = lazy(() => import("./pages/Quotes"));
const Weekend = lazy(() => import("./pages/Weekend"));
const Reading = lazy(() => import("./pages/Reading"));
const Books = lazy(() => import("./pages/Books"));
const Radar = lazy(() => import("./pages/Radar"));
const Revise = lazy(() => import("./pages/Revise"));
const Learning = lazy(() => import("./pages/Learning"));
const ListView = lazy(() => import("./pages/ListView"));
const Reports = lazy(() => import("./pages/Reports"));
const Projects = lazy(() => import("./pages/Projects"));
const Settings = lazy(() => import("./pages/Settings"));
const Trash = lazy(() => import("./pages/Trash"));

/** Old addresses (/reading, /revisit, bookmarks) open their new place, keeping ?id=, ?c= and the like. */
function KeepQuery({ to }: { to: string }) {
  return <Navigate to={`${to}${useLocation().search}`} replace />;
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
              <Route path="learning/revisit" element={<Revise />} />
              <Route path="revisit" element={<KeepQuery to="/learning/revisit" />} />
              <Route path="revise" element={<KeepQuery to="/learning/revisit" />} />
              <Route path="inbox" element={<Navigate to="/radar" replace />} />
              <Route path="today" element={<Navigate to="/" replace />} />
              <Route path="board" element={<Board />} />
              <Route path="list" element={<ListView />} />
              <Route path="learning" element={<Learning />} />
              <Route path="learning/articles" element={<Reading />} />
              <Route path="learning/books" element={<Books />} />
              <Route path="reading" element={<KeepQuery to="/learning/articles" />} />
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
