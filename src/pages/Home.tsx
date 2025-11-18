import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Film, Users, Package, Sparkles, ChevronDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
const Home = () => {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showFeatures, setShowFeatures] = useState(false);
  const featuresRef = useRef<HTMLDivElement>(null);

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

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShowFeatures(true);
        }
      },
      { threshold: 0.1 }
    );

    if (featuresRef.current) {
      observer.observe(featuresRef.current);
    }

    return () => observer.disconnect();
  }, []);
  const handleGetStarted = () => {
    if (isAuthenticated) {
      navigate("/dashboard");
    } else {
      navigate("/auth");
    }
  };
  return <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* Cinematic Background with Film Grain and Atmospheric Glow */}
      <div className="fixed inset-0 bg-background pointer-events-none" />
      
      {/* Film Grain Texture */}
      <div 
        className="fixed inset-0 opacity-[0.03] pointer-events-none mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />
      
      {/* Soft Atmospheric Glows */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-primary/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed bottom-0 right-0 w-[600px] h-[600px] bg-accent/15 rounded-full blur-[100px] pointer-events-none" />
      <div className="fixed top-1/2 left-0 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[90px] pointer-events-none" />
      
      {/* Hero Section - Full Screen */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-4">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/0 to-background pointer-events-none" style={{ backgroundImage: 'linear-gradient(to bottom, transparent 0%, transparent 60%, hsl(var(--background)) 100%)' }} />
        
        <div className="relative z-10 text-center space-y-8 max-w-4xl mx-auto">
          <div className="flex justify-center mb-8 animate-fade-in">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full animate-pulse" />
              <Film className="h-20 w-20 md:h-24 md:w-24 text-primary relative z-10 drop-shadow-lg" />
            </div>
          </div>
          
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent animate-fade-in bg-[length:200%_auto] animate-[gradient_8s_linear_infinite]">
            Welcome to CineGeek
          </h1>
          
          <p className="text-2xl md:text-3xl font-semibold text-foreground/90 animate-fade-in [animation-delay:200ms]">
            Your Geeky Cinematic Companion
          </p>
          
          <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed animate-fade-in [animation-delay:400ms]">
            Track the movies and TV shows you love, ask spoiler-free questions while you watch, and explore your cinematic world in a whole new way.
          </p>
          
          <div className="pt-4 animate-fade-in [animation-delay:600ms]">
            <Button 
              size="lg" 
              onClick={handleGetStarted} 
              className="text-lg px-10 py-7 shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300"
            >
              {isAuthenticated ? "Go to Dashboard" : "Get Started"}
            </Button>
          </div>
        </div>

        {/* Scroll Indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <ChevronDown className="h-8 w-8 text-muted-foreground/50" />
        </div>
      </section>

      {/* Features Section - Reveals on Scroll */}
      <section 
        ref={featuresRef}
        className={`relative py-24 md:py-32 transition-all duration-1000 ${
          showFeatures ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'
        }`}
      >
        {/* Smooth Blend Overlay */}
        <div className="absolute top-0 left-0 right-0 h-48 bg-gradient-to-b from-background via-background/50 to-transparent pointer-events-none" />
        
        <div className="container mx-auto px-4">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-16 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
            What Makes CineGeek Special?
          </h2>
          
          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            <Card className="p-8 space-y-5 hover:shadow-2xl hover:scale-105 transition-all duration-500 backdrop-blur-sm bg-card/80 border-border/50 group">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-2xl font-bold">Spoiler-Free AI Companion</h3>
              <p className="text-muted-foreground leading-relaxed">
                Ask anything about your movie or TV show up to your exact timestamp — no spoilers, ever. Get insights, character explanations, and story clarifications without ruining the experience.
              </p>
            </Card>

            <Card className="p-8 space-y-5 hover:shadow-2xl hover:scale-105 transition-all duration-500 backdrop-blur-sm bg-card/80 border-border/50 group">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent/30 to-accent/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <Users className="h-8 w-8 text-accent" />
              </div>
              <h3 className="text-2xl font-bold">Collect Actor & Director Cards</h3>
              <p className="text-muted-foreground leading-relaxed">
                Test your movie knowledge by connecting two actors in under 2 minutes. Win rounds to earn free packs and discover surprising film connections as you play.
              </p>
            </Card>

            <Card className="p-8 space-y-5 hover:shadow-2xl hover:scale-105 transition-all duration-500 backdrop-blur-sm bg-card/80 border-border/50 group">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/30 to-accent/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <Package className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-2xl font-bold">Trading System</h3>
              <p className="text-muted-foreground leading-relaxed">
                Sell cards for coins, buy new packs, and manage your collection. Build value and discover rare cards as you explore cinema history.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative py-24 md:py-32 text-center">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto space-y-8 relative">
            <div className="absolute inset-0 bg-gradient-to-t from-primary/5 to-transparent rounded-3xl blur-3xl -z-10" />
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
              Ready to Start Your Journey?
            </h2>
            <p className="text-xl text-muted-foreground max-w-xl mx-auto leading-relaxed">
              Join CineGeek today and experience movies and TV shows in a whole new way.
            </p>
            <div className="pt-4">
              <Button 
                size="lg" 
                onClick={handleGetStarted} 
                className="text-lg px-10 py-7 shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300"
              >
                {isAuthenticated ? "Go to Dashboard" : "Sign Up Now"}
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>;
};
export default Home;