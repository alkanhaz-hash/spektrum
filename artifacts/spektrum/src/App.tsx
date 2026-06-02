import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import NotFound from "@/pages/not-found";

// Lazy-loaded pages
import AuthPage from "@/pages/auth";
import HomePage from "@/pages/home";
import DiscoverPage from "@/pages/discover";
import StoryPage from "@/pages/story";
import ReadPage from "@/pages/read";
import WritePage from "@/pages/write";
import ChapterEditorPage from "@/pages/chapter-editor";
import ProfilePage from "@/pages/profile";
import MessagesPage from "@/pages/messages";
import ModeratorPage from "@/pages/moderator";

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
      <Route path="/story/:id" component={StoryPage} />
      <Route path="/read/:storyId/:chapterId" component={ReadPage} />
      <Route path="/write" component={WritePage} />
      <Route path="/write/:storyId" component={WritePage} />
      <Route path="/write/:storyId/chapter/:chapterId" component={ChapterEditorPage} />
      <Route path="/profile/:uid" component={ProfilePage} />
      <Route path="/messages" component={MessagesPage} />
      <Route path="/messages/:conversationId" component={MessagesPage} />
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
