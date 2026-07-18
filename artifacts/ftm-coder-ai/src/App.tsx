import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WorkspaceProvider } from "@/lib/workspace-context";
import { useEffect, useState, useCallback, Component, type ReactNode, type ErrorInfo } from "react";
import { getToken, getStoredUser, getStoredWorkspace, clearAuth } from "@/lib/auth";
import LoginPage from "@/pages/LoginPage";
import Home from "@/pages/Home";
import NotFound from "@/pages/not-found";

// ── Error Boundary ─────────────────────────────────────────────────────────────
interface EBState { hasError: boolean; error: Error | null; }
class ErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  state: EBState = { hasError: false, error: null };
  static getDerivedStateFromError(error: Error): EBState {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0d0d0d] flex flex-col items-center justify-center p-8 text-center gap-4">
          <div className="text-4xl">💥</div>
          <h1 className="text-white text-xl font-bold">Something went wrong</h1>
          <pre className="text-red-400 text-xs bg-[#1a0a0a] border border-red-900 rounded-lg p-4 max-w-2xl text-left overflow-auto whitespace-pre-wrap">
            {this.state.error?.message}
            {"\n\n"}
            {this.state.error?.stack}
          </pre>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); }}
            className="px-4 py-2 bg-amber-400 text-black rounded-lg font-semibold text-sm hover:bg-amber-300 transition-colors"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  // Dark mode is applied synchronously in main.tsx — no flash

  // Auth gate: show LoginPage until a valid token + user exist
  const [authed, setAuthed] = useState<boolean>(() => {
    return !!(getToken() && getStoredUser());
  });
  const [workspace, setWorkspace] = useState<string>(() => {
    // Use the workspace path saved at login time (accurate for both dev & prod).
    // Fallback: derive from username so old sessions still work.
    const stored = getStoredWorkspace();
    if (stored) return stored;
    const user = getStoredUser();
    return user ? `/home/users/${user.username}` : "";
  });

  const handleAuth = useCallback((ws: string) => {
    setWorkspace(ws);
    setAuthed(true);
  }, []);

  const handleLogout = useCallback(() => {
    clearAuth();
    queryClient.clear();
    setAuthed(false);
    setWorkspace("");
  }, []);

  if (!authed) {
    return (
      <ErrorBoundary>
        <LoginPage onAuth={handleAuth} />
        <Toaster />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <WorkspaceProvider initialWorkspace={workspace} onLogout={handleLogout}>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </WorkspaceProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
