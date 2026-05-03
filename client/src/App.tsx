import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { lazy, Suspense } from "react";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";

// Resonanzen-Seite lazy laden — eigener Bundle-Chunk, FAQ-spezifisch.
const ResonanzenPage = lazy(() => import("./pages/ResonanzenPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));

function Router() {
  const fallback = <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Georgia, serif", fontStyle: "italic", color: "#888" }}>lädt …</div>;
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/resonanzen"}>
        <Suspense fallback={fallback}>
          <ResonanzenPage />
        </Suspense>
      </Route>
      <Route path={"/admin"}>
        <Suspense fallback={fallback}>
          <AdminPage />
        </Suspense>
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
