import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { lazy, Suspense } from "react";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import AppFrame from "./components/AppFrame";

// Resonanzen-Seite lazy laden — eigener Bundle-Chunk, FAQ-spezifisch.
const ResonanzenPage = lazy(() => import("./pages/ResonanzenPage"));
const PhilosophyPage = lazy(() => import("./pages/PhilosophyPage"));
const ConceptGraphPage = lazy(() => import("./pages/ConceptGraphPage"));
const AdminLayout = lazy(() => import("./pages/admin/AdminLayout"));
const AdminCurationPage = lazy(() => import("./pages/admin/AdminCurationPage"));
const AdminMetricsPage = lazy(() => import("./pages/admin/AdminMetricsPage"));
const AdminHealthPage = lazy(() => import("./pages/admin/AdminHealthPage"));

// Wrapper: Sub-Pages laufen alle unter dem globalen AppFrame.
// Home (/) bleibt aussen vor — seine eigene Reading-UI bestimmt das Frame.
function Framed({ children }: { children: React.ReactNode }) {
  return <AppFrame>{children}</AppFrame>;
}

function Router() {
  const fallback = <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Georgia, serif", fontStyle: "italic", color: "#888" }}>lädt …</div>;
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/resonanzen"}>
        <Framed><Suspense fallback={fallback}><ResonanzenPage /></Suspense></Framed>
      </Route>
      <Route path={"/philosophie"}>
        <Framed><Suspense fallback={fallback}><PhilosophyPage /></Suspense></Framed>
      </Route>
      <Route path={"/begriffsnetz"}>
        <Framed><Suspense fallback={fallback}><ConceptGraphPage /></Suspense></Framed>
      </Route>
      <Route path={"/admin/metrics"}>
        <Framed><Suspense fallback={fallback}><AdminLayout><AdminMetricsPage /></AdminLayout></Suspense></Framed>
      </Route>
      <Route path={"/admin/health"}>
        <Framed><Suspense fallback={fallback}><AdminLayout><AdminHealthPage /></AdminLayout></Suspense></Framed>
      </Route>
      <Route path={"/admin"}>
        <Framed><Suspense fallback={fallback}><AdminLayout><AdminCurationPage /></AdminLayout></Suspense></Framed>
      </Route>
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
