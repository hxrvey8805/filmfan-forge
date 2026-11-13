import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import Install from "./pages/Install";
import Auth from "./pages/Auth";
import Companion from "./pages/Companion";
import NotFound from "./pages/NotFound";
import { AppSession } from "./components/AppSession";
import Onboarding from "./pages/Onboarding";
import { NewAccountGate } from "./components/NewAccountGate";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <AppSession><BrowserRouter>
        <NewAccountGate><Routes>
          <Route path="/" element={<Home />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/onboarding" element={<Onboarding />} />
          {import.meta.env.MODE === "mobile-preview" && <Route path="/onboarding-preview" element={<Onboarding demo />} />}
          <Route path="/install" element={<Install />} />
          <Route path="/companion" element={<Companion />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes></NewAccountGate>
      </BrowserRouter></AppSession>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
