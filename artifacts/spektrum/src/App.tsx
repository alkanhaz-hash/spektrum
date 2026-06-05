import React, { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import NotFound from "@/pages/not-found";

import AuthPage from "@/pages/auth";
import HomePage from "@/pages/home";
import DiscoverPage from "@/pages/discover";
import SearchPage from "@/pages/search";
import StoryPage from "@/pages/story";
import ReadPage from "@/pages/read";
import WritePage from "@/pages/write";
import ChapterEditorPage from "@/pages/chapter-editor";
import ProfilePage from "@/pages/profile";
import MessagesPage from "@/pages/messages";
import ModeratorPage from "@/pages/moderator";

// ─── AUTH GUARD ──────────────────────────────────────────────────────────────
function withAuth<P extends object>(Component: React.ComponentType<P>) {
  return function AuthGuarded(props: P) {
    const { user, loading } = useAuth();
    const [, setLocation] = useLocation();
    useEffect(() => {
      if (!loading && !user) setLocation("/auth");
    }, [user, loading]);
    if (loading || !user) return null;
    return <Component {...props} />;
  };
}

const GuardedWrite = withAuth(WritePage);
const GuardedChapterEditor = withAuth(ChapterEditorPage);
const GuardedMessages = withAuth(MessagesPage);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 min local cache
      gcTime: 1000 * 60 * 30,   // 30 min in memory
      retry: 2,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/discover" component={DiscoverPage} />
      <Route path="/search" component={SearchPage} />
      <Route path="/story/:id" component={StoryPage} />
      <Route path="/read/:storyId/:chapterId" component={ReadPage} />
      <Route path="/write" component={GuardedWrite} />
      <Route path="/write/:storyId" component={GuardedWrite} />
      <Route path="/write/:storyId/chapter/:chapterId" component={GuardedChapterEditor} />
      <Route path="/profile/:uid" component={ProfilePage} />
      <Route path="/messages" component={GuardedMessages} />
      <Route path="/messages/:conversationId" component={GuardedMessages} />
      <Route path="/moderator" component={ModeratorPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
