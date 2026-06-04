import { lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Navigate, Routes, Route, useLocation } from "react-router-dom";
import { ThemeProvider, CssBaseline, Box, CircularProgress } from "@mui/material";
import theme from "./theme";
import ToastContainer from "./components/Toast";
import ErrorBoundary from "./components/ErrorBoundary";
import { isOpsFrontendEnabled } from "./utils/opsApi";
import "./index.css";

const Home = lazy(() => import("./pages/Home"));
const Diagnosing = lazy(() => import("./pages/Diagnosing"));
const Report = lazy(() => import("./pages/Report"));
const History = lazy(() => import("./pages/History"));
const ScreenshotAnalysis = lazy(() => import("./pages/ScreenshotAnalysis"));
const OpsDashboard = lazy(() => import("./pages/OpsDashboard"));

function RootLanding() {
  return isOpsFrontendEnabled() ? <Navigate to="/ops" replace /> : <Home />;
}

const routes = [
  { path: "/", Component: RootLanding },
  { path: "/ops", Component: OpsDashboard },
  { path: "/diagnose", Component: Home },
  { path: "/diagnose/new", Component: Home },
  { path: "/diagnosing", Component: Diagnosing },
  { path: "/report", Component: Report },
  { path: "/history", Component: History },
  { path: "/screenshot", Component: ScreenshotAnalysis },
] as const;

function RouteFallback() {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "background.default",
      }}
    >
      <CircularProgress size={28} color="primary" />
    </Box>
  );
}

function PageShell({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ minHeight: "100vh" }}>
      <Suspense fallback={<RouteFallback />}>{children}</Suspense>
    </Box>
  );
}

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <Routes location={location} key={location.pathname}>
      {routes.map(({ path, Component }) => (
        <Route
          key={path}
          path={path}
          element={
            <PageShell>
              <Component />
            </PageShell>
          }
        />
      ))}
    </Routes>
  );
}

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ErrorBoundary>
        <BrowserRouter basename="/app">
          <AnimatedRoutes />
          <ToastContainer />
        </BrowserRouter>
      </ErrorBoundary>
    </ThemeProvider>
  );
}

export default App;
