import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, Redirect } from "wouter";
import { lazy, Suspense } from "react";
import ErrorBoundary from "./components/ui/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

const NotFound = lazy(() => import("@/pages/NotFound"));
const Login = lazy(() => import("@/pages/Login"));
const DashboardOverviewPage = lazy(() => import("@/pages/DashboardOverviewPage"));
const ProjectsPage = lazy(() => import("@/pages/ProjectsPage"));
const KeywordResearchPage = lazy(() => import("@/pages/KeywordResearchPage"));
const KeywordClusterPlanner = lazy(() => import("@/pages/KeywordClusterPlanner"));
const WritePage = lazy(() => import("@/pages/WritePage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const ArticlesPage = lazy(() => import("@/pages/ArticlesPage"));
const ArticleEditorPage = lazy(() => import("@/pages/ArticleEditorPage"));
const AdminAuditPage = lazy(() => import("@/pages/AdminAuditPage"));

const LoadingFallback = (
  <div className="min-h-screen flex items-center justify-center bg-[#fbf8f4]">
    <div className="text-center">
      <div className="w-12 h-12 rounded-full border-4 border-amber-600/30 border-t-amber-600 animate-spin mx-auto mb-5" />
      <p className="text-stone-600 text-[14px]">กำลังโหลด EEAT Studio...</p>
    </div>
  </div>
);

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <TooltipProvider delayDuration={150}>
          <Suspense fallback={LoadingFallback}>
            <Switch>
              <Route path="/login"><Login /></Route>
              <Route path="/"><DashboardOverviewPage /></Route>
              <Route path="/dashboard"><DashboardOverviewPage /></Route>
              <Route path="/projects"><ProjectsPage /></Route>
              <Route path="/research"><KeywordResearchPage /></Route>
              <Route path="/kcp"><KeywordClusterPlanner /></Route>
              <Route path="/write"><WritePage /></Route>
              <Route path="/members">
                <Redirect to="/" replace={true} />
              </Route>
              <Route path="/teams">
                <Redirect to="/" replace={true} />
              </Route>
              <Route path="/audit"><AdminAuditPage /></Route>
              <Route path="/settings">
                <SettingsPage />
              </Route>
              <Route path="/articles"><ArticlesPage /></Route>
              <Route path="/articles/:id/edit"><ArticleEditorPage /></Route>
              <Route path="/projects/:id/articles"><ArticlesPage /></Route>
              <Route><NotFound /></Route>
            </Switch>
          </Suspense>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
