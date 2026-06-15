import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { lazy, Suspense } from "react";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import AppFrame from "./components/AppFrame";
import InstallBanner from "./components/InstallBanner";

// Resonanzen-Seite lazy laden — eigener Bundle-Chunk, FAQ-spezifisch.
const ResonanzenPage = lazy(() => import("./pages/ResonanzenPage"));
const PhilosophyPage = lazy(() => import("./pages/PhilosophyPage"));
const ConceptGraphPage = lazy(() => import("./pages/ConceptGraphPage"));
const WerkPage = lazy(() => import("./pages/WerkPage"));
const MeinWerkPage = lazy(() => import("./pages/MeinWerkPage"));
const LandkartePage = lazy(() => import("./pages/LandkartePage"));
const ResonanzDetailPage = lazy(() => import("./pages/ResonanzDetailPage"));
const AdminLayout = lazy(() => import("./pages/admin/AdminLayout"));
const AdminCurationPage = lazy(() => import("./pages/admin/AdminCurationPage"));
const AdminMetricsPage = lazy(() => import("./pages/admin/AdminMetricsPage"));
const AdminHealthPage = lazy(() => import("./pages/admin/AdminHealthPage"));
const DevSearchPage = lazy(() => import("./pages/DevSearchPage"));
const LivePage = lazy(() => import("./pages/LivePage"));
const BlogPage = lazy(() => import("./pages/BlogPage"));
const StatusPage = lazy(() => import("./pages/StatusPage"));
const StatistikPage = lazy(() => import("./pages/StatistikPage"));
const ProjektPage = lazy(() => import("./pages/ProjektPage"));
const InfoPage = lazy(() => import("./pages/InfoPage"));

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
      <Route path={"/en"} component={Home} />
      {/* English locale routes — same components, locale resolved from URL prefix. */}
      <Route path={"/en/resonanzen"}>
        <Framed><Suspense fallback={fallback}><ResonanzenPage /></Suspense></Framed>
      </Route>
      <Route path={"/en/philosophie"}>
        <Framed><Suspense fallback={fallback}><PhilosophyPage /></Suspense></Framed>
      </Route>
      <Route path={"/en/begriffsnetz"}>
        <Framed><Suspense fallback={fallback}><ConceptGraphPage /></Suspense></Framed>
      </Route>
      <Route path={"/resonanzen"}>
        <Framed><Suspense fallback={fallback}><ResonanzenPage /></Suspense></Framed>
      </Route>
      <Route path={"/philosophie"}>
        <Framed><Suspense fallback={fallback}><PhilosophyPage /></Suspense></Framed>
      </Route>
      <Route path={"/begriffsnetz"}>
        <Framed><Suspense fallback={fallback}><ConceptGraphPage /></Suspense></Framed>
      </Route>
      <Route path={"/werk/:chapter?"}>
        <Framed><Suspense fallback={fallback}><WerkPage /></Suspense></Framed>
      </Route>
      <Route path={"/mein-werk"}>
        <Framed><Suspense fallback={fallback}><MeinWerkPage /></Suspense></Framed>
      </Route>
      <Route path={"/landkarte"}>
        <Framed><Suspense fallback={fallback}><LandkartePage /></Suspense></Framed>
      </Route>
      <Route path={"/en/landkarte"}>
        <Framed><Suspense fallback={fallback}><LandkartePage /></Suspense></Framed>
      </Route>
      <Route path={"/resonanz/:id"}>
        <Framed><Suspense fallback={fallback}><ResonanzDetailPage /></Suspense></Framed>
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
      <Route path={"/dev/search"}>
        <Framed><Suspense fallback={fallback}><DevSearchPage /></Suspense></Framed>
      </Route>
      <Route path={"/live"}>
        <Framed><Suspense fallback={fallback}><LivePage /></Suspense></Framed>
      </Route>
      <Route path={"/blog"}>
        <Framed><Suspense fallback={fallback}><BlogPage /></Suspense></Framed>
      </Route>
      <Route path={"/status"}>
        <Framed><Suspense fallback={fallback}><StatusPage /></Suspense></Framed>
      </Route>
      <Route path={"/projekt"}>
        <Framed><Suspense fallback={fallback}><ProjektPage /></Suspense></Framed>
      </Route>
      <Route path={"/impressum"}>
        <Framed><Suspense fallback={fallback}><InfoPage kind="impressum" /></Suspense></Framed>
      </Route>
      <Route path={"/kontakt"}>
        <Framed><Suspense fallback={fallback}><InfoPage kind="kontakt" /></Suspense></Framed>
      </Route>
      <Route path={"/nutzungsbedingungen"}>
        <Framed><Suspense fallback={fallback}><InfoPage kind="nutzung" /></Suspense></Framed>
      </Route>
      <Route path={"/lizenz"}>
        <Framed><Suspense fallback={fallback}><InfoPage kind="lizenz" /></Suspense></Framed>
      </Route>
      <Route path={"/statistik"}>
        <Framed><Suspense fallback={fallback}><StatistikPage /></Suspense></Framed>
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
          <InstallBanner />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
