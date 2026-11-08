import React, { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { NicknameSetupModal } from "@/components/NicknameSetupModal";
import NotFound from "@/pages/not-found";

import AuthPage from "@/pages/auth";
import HomePage from "@/pages/home";
import DiscoverPage from "@/pages/discover";
import SearchPage from "@/pages/search";
import StoryPage from "@/pages/story";
import ReadPage from "@/pages/read";
import WritePage from "@/pages/write";
import BookImportPage from "@/pages/book-import";
import ChapterEditorPage from "@/pages/chapter-editor";
import ReadingStatsPage from "@/pages/reading-stats";
import ProfilePage from "@/pages/profile";
import AnonymousAskPage from "@/pages/anonymous-ask";
import AnonymousAnswerPage from "@/pages/anonymous-answer";
import MessagesPage from "@/pages/messages";
import ModeratorPage from "@/pages/moderator";
import NotificationsPage from "@/pages/notifications";
import TermsPage from "@/pages/terms";
import KvkkPage from "@/pages/kvkk";
import JetonlarPage from "@/pages/jetonlar";
import HakkimizdaPage from "@/pages/hakkimizda";
import IletisimPage from "@/pages/iletisim";
import SSSPage from "@/pages/sss";
import HesapSilPage from "@/pages/hesap-sil";
import HesapAyarlariPage from "@/pages/hesap-ayarlari";
import DurumlarPage from "@/pages/durumlar";

// ─── AUTH GUARD ──────────────────────────────────────────────────────────────
function isEmailUnverified(user: import("firebase/auth").User) {
  return (
    user.providerData.some(p => p.providerId === "password") &&
    !user.emailVerified
  );
}

function withAuth<P extends object>(Component: React.ComponentType<P>) {
  return function AuthGuarded(props: P) {
    const { user, loading } = useAuth();
    const [, setLocation] = useLocation();
    useEffect(() => {
      if (!loading) {
        if (!user || isEmailUnverified(user)) setLocation("/auth");
      }
    }, [user, loading]);
    if (loading || !user || isEmailUnverified(user)) return null;
    return <Component {...props} />;
  };
}

const GuardedWrite = withAuth(WritePage);
const GuardedBookImport = withAuth(BookImportPage);
const GuardedChapterEditor = withAuth(ChapterEditorPage);
const GuardedReadingStats = withAuth(ReadingStatsPage);
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
      <Route path="/import" component={GuardedBookImport} />
      <Route path="/write/import" component={GuardedBookImport} />
      <Route path="/write/:storyId" component={GuardedWrite} />
      <Route path="/write/:storyId/chapter/:chapterId" component={GuardedChapterEditor} />
      <Route path="/reading-stats/:id" component={GuardedReadingStats} />
      <Route path="/profile/:uid" component={ProfilePage} />
      <Route path="/ask/:uid" component={AnonymousAskPage} />
      <Route path="/qa/:id" component={AnonymousAnswerPage} />
      <Route path="/messages" component={GuardedMessages} />
      <Route path="/messages/:conversationId" component={GuardedMessages} />
      <Route path="/moderator" component={ModeratorPage} />
      <Route path="/notifications" component={NotificationsPage} />
      <Route path="/terms" component={TermsPage} />
      <Route path="/kvkk" component={KvkkPage} />
      <Route path="/jetonlar" component={JetonlarPage} />
      <Route path="/hakkimizda" component={HakkimizdaPage} />
      <Route path="/iletisim" component={IletisimPage} />
      <Route path="/sss" component={SSSPage} />
      <Route path="/hesap-sil" component={HesapSilPage} />
      <Route path="/hesap-ayarlari" component={HesapAyarlariPage} />
      <Route path="/durumlar" component={DurumlarPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function NicknameGate({ children }: { children: React.ReactNode }) {
  const { user, profile } = useAuth();
  if (user && profile && profile.nicknameSet === false) {
    return (
      <NicknameSetupModal
        uid={user.uid}
        onComplete={() => {
          // onSnapshot zaten Firestore'u canlı izliyor; ayrıca state güncellemesi gerekmez
        }}
      />
    );
  }
  return <>{children}</>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LocaleProvider>
        <AuthProvider>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <NicknameGate>
                <Router />
              </NicknameGate>
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </LocaleProvider>
    </QueryClientProvider>
  );
}

export default App;
