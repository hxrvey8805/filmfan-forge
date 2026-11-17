import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import Install from "./pages/Install";
import Auth from "./pages/Auth";
import Companion from "./pages/Companion";
import NotFound from "./pages/NotFound";
import {useSyncExternalStore} from "react";
import { AppSession } from "./components/AppSession";
import Onboarding from "./pages/Onboarding";
import { NewAccountGate } from "./components/NewAccountGate";

import { ProAccessProvider } from "./hooks/use-pro-access";

import {AIPrivacyProvider} from './components/AIPrivacy';
import {recovery} from './lib/password-recovery';
import ResetPassword from './pages/ResetPassword';
import AccountPrivacy from './pages/AccountPrivacy';
import {PrivacyNotice,SupportPage} from './pages/PublicInformation';
function RecoveryRedirect(){
 const state=useSyncExternalStore(recovery.subscribe,recovery.snapshot),location=useLocation();
 return state.intent && ['/', '/auth', '/dashboard'].includes(location.pathname)?<Navigate to="/reset-password" replace/>:null;
}
const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <BrowserRouter><RecoveryRedirect/><Routes>
        <Route path="/reset-password" element={<ResetPassword/>}/>
        <Route path="/privacy" element={<PrivacyNotice/>}/>
        <Route path="/support" element={<SupportPage/>}/>
        <Route path="*" element={<AppSession><ProAccessProvider><AIPrivacyProvider>
        <NewAccountGate><Routes>
          <Route path="/" element={<Home />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/account" element={<AccountPrivacy/>}/>
          <Route path="/onboarding" element={<Onboarding />} />
          {import.meta.env.MODE === "mobile-preview" && <Route path="/onboarding-preview" element={<Onboarding demo />} />}
          <Route path="/install" element={<Install />} />
          <Route path="/companion" element={<Companion />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes></NewAccountGate>
      </AIPrivacyProvider></ProAccessProvider></AppSession>}/></Routes></BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
