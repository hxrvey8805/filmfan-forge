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
    supabase.auth.getSession().then(({ data: { session } }) => {
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

  return (
    <div className="min-h-screen bg-background text-foreground overflow-hidden">
      {/* Ambient Background */}
      <div className="fixed inset-0 bg-gradient-to-br from-background via-background to-primary/5 pointer-events-none" />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent pointer-events-none" />
      
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-20 md:py-32 relative">
        <div className="text-center space-y-8 max-w-4xl mx-auto">
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
            Your Ultimate Cinematic Companion
          </p>
          <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed animate-fade-in [animation-delay:400ms]">
            Discover movies and TV shows with a spoiler-free AI companion, collect actor and director cards, and build your ultimate entertainment collection.
          </p>
          <div className="pt-4 animate-fade-in [animation-delay:600ms]">
            <Button size="lg" onClick={handleGetStarted} className="text-lg px-10 py-7 shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300">
              {isAuthenticated ? "Go to Dashboard" : "Get Started"}
            </Button>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="container mx-auto px-4 py-24 relative">
        <h2 className="text-4xl md:text-5xl font-bold text-center mb-16 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
          What Makes CineGeek Special?
        </h2>
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          <Card className="p-8 space-y-5 hover:shadow-2xl hover:scale-105 transition-all duration-300 backdrop-blur-sm bg-card/80 border-border/50 group">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-2xl font-bold">Spoiler-Free AI Companion</h3>
            <p className="text-muted-foreground leading-relaxed">
              Get personalized recommendations and insights without worrying about spoilers. Our AI keeps your viewing experience safe and exciting.
            </p>
          </Card>

          <Card className="p-8 space-y-5 hover:shadow-2xl hover:scale-105 transition-all duration-300 backdrop-blur-sm bg-card/80 border-border/50 group">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent/30 to-accent/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
              <Users className="h-8 w-8 text-accent" />
            </div>
            <h3 className="text-2xl font-bold">Collect Actor & Director Cards</h3>
            <p className="text-muted-foreground leading-relaxed">
              Open packs to collect cards of your favorite actors and directors. Build your collection with cards of varying rarities and values.
            </p>
          </Card>

          <Card className="p-8 space-y-5 hover:shadow-2xl hover:scale-105 transition-all duration-300 backdrop-blur-sm bg-card/80 border-border/50 group">
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

      {/* CTA Section */}
      <div className="container mx-auto px-4 py-24 text-center relative">
        <div className="max-w-3xl mx-auto space-y-8 relative">
          <div className="absolute inset-0 bg-gradient-to-t from-primary/5 to-transparent rounded-3xl blur-3xl -z-10" />
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
            Ready to Start Your Journey?
          </h2>
          <p className="text-xl text-muted-foreground max-w-xl mx-auto leading-relaxed">
            Join CineGeek today and experience movies and TV shows in a whole new way.
          </p>
          <div className="pt-4">
            <Button size="lg" onClick={handleGetStarted} className="text-lg px-10 py-7 shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300">
              {isAuthenticated ? "Go to Dashboard" : "Sign Up Now"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
