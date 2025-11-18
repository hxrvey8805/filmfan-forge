import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Film, Users, Package, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
const Home = () => {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({
      data: {
        session
      }
    }) => {
      if (session) {
        setIsAuthenticated(true);
      }
    });
  }, []);
  const handleGetStarted = () => {
    if (isAuthenticated) {
      navigate("/dashboard");
    } else {
      navigate("/auth");
    }
  };
  return <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* Cinematic Background with Film Grain */}
      <div className="fixed inset-0 bg-background pointer-events-none">
        {/* Subtle gradient glow */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/8 via-transparent to-transparent opacity-60" />
        {/* Film grain texture */}
        <div className="absolute inset-0 opacity-[0.015] mix-blend-overlay" 
             style={{
               backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='2.5' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
               backgroundRepeat: 'repeat',
               backgroundSize: '200px 200px'
             }} 
        />
      </div>

      {/* Minimal Premium Hero Section */}
      <div className="min-h-screen flex items-center justify-center relative">
        <div className="container mx-auto px-6 md:px-8 relative z-10">
          <div className="text-center space-y-8 max-w-4xl mx-auto">
            <h1 className="text-6xl md:text-8xl lg:text-9xl font-bold tracking-tight text-foreground animate-fade-in">
              Welcome to CineGeek
            </h1>
            <p className="text-2xl md:text-4xl font-light text-foreground/80 animate-fade-in [animation-delay:200ms]">
              Your Geeky Cinematic Companion
            </p>
            <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed animate-fade-in [animation-delay:400ms]">
              Track the movies and TV shows you love, ask spoiler-free questions while you watch, and explore your cinematic world in a whole new way.
            </p>
            <div className="pt-8 animate-fade-in [animation-delay:600ms]">
              <Button 
                size="lg" 
                onClick={handleGetStarted} 
                className="text-base px-12 py-6 rounded-full shadow-lg hover:shadow-2xl hover:scale-105 transition-all duration-300"
              >
                {isAuthenticated ? "Go to Dashboard" : "Get Started"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>;
};
export default Home;