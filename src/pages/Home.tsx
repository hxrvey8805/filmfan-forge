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
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16 md:py-24">
        <div className="text-center space-y-6 max-w-3xl mx-auto">
          <div className="flex justify-center mb-6">
            <Film className="h-16 w-16 md:h-20 md:w-20 text-primary" />
          </div>
          <h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
            Welcome to CineGeek
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground">
            Your Ultimate Cinematic Companion
          </p>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Discover movies and TV shows with a spoiler-free AI companion, collect actor and director cards, and build your ultimate entertainment collection.
          </p>
          <Button size="lg" onClick={handleGetStarted} className="text-lg px-8 py-6">
            {isAuthenticated ? "Go to Dashboard" : "Get Started"}
          </Button>
        </div>
      </div>

      {/* Features Section */}
      <div className="container mx-auto px-4 py-16">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
          What Makes CineGeek Special?
        </h2>
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          <Card className="p-6 space-y-4 hover:shadow-lg transition-shadow">
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-xl font-bold">Spoiler-Free AI Companion</h3>
            <p className="text-muted-foreground">
              Get personalized recommendations and insights without worrying about spoilers. Our AI keeps your viewing experience safe and exciting.
            </p>
          </Card>

          <Card className="p-6 space-y-4 hover:shadow-lg transition-shadow">
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
              <Users className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-xl font-bold">Collect Actor & Director Cards</h3>
            <p className="text-muted-foreground">
              Open packs to collect cards of your favorite actors and directors. Build your collection with cards of varying rarities and values.
            </p>
          </Card>

          <Card className="p-6 space-y-4 hover:shadow-lg transition-shadow">
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
              <Package className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-xl font-bold">Trading System</h3>
            <p className="text-muted-foreground">
              Sell cards for coins, buy new packs, and manage your collection. Build value and discover rare cards as you explore cinema history.
            </p>
          </Card>
        </div>
      </div>

      {/* CTA Section */}
      <div className="container mx-auto px-4 py-16 text-center">
        <div className="max-w-2xl mx-auto space-y-6">
          <h2 className="text-3xl md:text-4xl font-bold">
            Ready to Start Your Journey?
          </h2>
          <p className="text-lg text-muted-foreground">
            Join CineGeek today and experience movies and TV shows in a whole new way.
          </p>
          <Button size="lg" onClick={handleGetStarted} className="text-lg px-8 py-6">
            {isAuthenticated ? "Go to Dashboard" : "Sign Up Now"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Home;
