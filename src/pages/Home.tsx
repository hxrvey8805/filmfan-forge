import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Glasses, Users, Package, Sparkles, ChevronDown, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
const Home = () => {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showFeatures, setShowFeatures] = useState(false);
  const [remainingFree, setRemainingFree] = useState<number | null>(null);
  const featuresRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({
      data: {
        session
      }
    }) => {
      if (session) {
        setIsAuthenticated(true);
        // Load AI usage for authenticated users
        loadAIUsage();
      }
    });
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setShowFeatures(true);
      }
    }, {
      threshold: 0.1
    });
    if (featuresRef.current) {
      observer.observe(featuresRef.current);
    }
    return () => observer.disconnect();
  }, []);

  const loadAIUsage = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const today = new Date().toISOString().split('T')[0];
      let { data: aiUsage } = await supabase
        .from('user_ai_usage')
        .select('questions_today, last_reset_date')
        .eq('user_id', user.id)
        .single();

      if (aiUsage) {
        // Reset if new day
        if (aiUsage.last_reset_date !== today) {
          setRemainingFree(5);
        } else {
          setRemainingFree(Math.max(0, 5 - aiUsage.questions_today));
        }
      } else {
        setRemainingFree(5);
      }
    } catch (error) {
      console.error('Error loading AI usage:', error);
      setRemainingFree(5); // Default to 5 if error
    }
  };
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
      <div className="fixed inset-0 opacity-[0.03] pointer-events-none mix-blend-overlay" style={{
      backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
    }} />
      
      {/* Soft Atmospheric Glows */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[1400px] h-[1400px] bg-primary/20 rounded-full blur-[200px] pointer-events-none" />
      <div className="fixed bottom-0 right-0 w-[1200px] h-[1200px] bg-accent/15 rounded-full blur-[180px] pointer-events-none" />
      <div className="fixed top-1/2 left-0 w-[1000px] h-[1000px] bg-primary/10 rounded-full blur-[160px] pointer-events-none" />
      
      {/* Spoiler-Free Companion Limit Display - Top of Page */}
      {isAuthenticated && remainingFree !== null && (
        <div className="relative z-20 pt-6 pb-4 px-4 animate-fade-in">
          <div className="max-w-4xl mx-auto">
            <Card className="relative overflow-hidden backdrop-blur-md bg-card/60 border-2 border-primary/30 hover:border-primary/50 transition-all duration-500 group">
              {/* Animated Gradient Background */}
              <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 opacity-50 group-hover:opacity-75 transition-opacity duration-500" />
              <div className="absolute inset-0 bg-gradient-to-br from-transparent via-primary/5 to-transparent" />
              
              {/* Glow Effect */}
              <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 via-accent/20 to-primary/20 rounded-lg blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 -z-10" />
              
              <div className="relative p-6 md:p-8">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-4 flex-1">
                    <div className="relative">
                      <div className="absolute inset-0 bg-primary/30 blur-2xl rounded-full animate-pulse" />
                      <div className="relative w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-gradient-to-br from-primary/40 to-accent/30 flex items-center justify-center border border-primary/50 backdrop-blur-sm">
                        <Zap className="h-6 w-6 md:h-7 md:w-7 text-primary drop-shadow-lg" />
                      </div>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg md:text-xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
                        Spoiler-Free Companion
                      </h3>
                      <p className="text-sm md:text-base text-muted-foreground mt-1">
                        Daily free questions remaining
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-6">
                    {/* Progress Ring/Display */}
                    <div className="relative flex items-center justify-center">
                      <div className="absolute inset-0 bg-primary/10 rounded-full blur-md" />
                      <div className="relative w-20 h-20 md:w-24 md:h-24">
                        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                          {/* Background circle */}
                          <circle
                            cx="50"
                            cy="50"
                            r="40"
                            stroke="currentColor"
                            strokeWidth="8"
                            fill="none"
                            className="text-primary/20"
                          />
                          {/* Progress circle */}
                          <circle
                            cx="50"
                            cy="50"
                            r="40"
                            stroke="url(#gradient)"
                            strokeWidth="8"
                            fill="none"
                            strokeLinecap="round"
                            strokeDasharray={`${2 * Math.PI * 40}`}
                            strokeDashoffset={`${2 * Math.PI * 40 * (1 - remainingFree / 5)}`}
                            className="transition-all duration-1000 ease-out"
                          />
                          <defs>
                            <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                              <stop offset="0%" stopColor="hsl(var(--primary))" />
                              <stop offset="100%" stopColor="hsl(var(--accent))" />
                            </linearGradient>
                          </defs>
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="text-center">
                            <div className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                              {remainingFree}
                            </div>
                            <div className="text-xs md:text-sm text-muted-foreground">/ 5</div>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Quick Action Button */}
                    <Button
                      onClick={() => navigate("/companion")}
                      variant="outline"
                      className="border-primary/40 hover:border-primary/60 hover:bg-primary/10 transition-all duration-300 backdrop-blur-sm"
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      Try It
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
      
      {/* Hero Section - Full Screen */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-4">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/0 to-background pointer-events-none" style={{
        backgroundImage: 'linear-gradient(to bottom, transparent 0%, transparent 60%, hsl(var(--background)) 100%)'
      }} />
        
        <div className="relative z-10 text-center space-y-8 max-w-4xl mx-auto">
          <div className="flex justify-center mb-8 animate-fade-in">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full animate-pulse" />
              <Glasses className="h-20 w-20 md:h-24 md:w-24 text-primary relative z-10 drop-shadow-lg" />
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
            <Button size="lg" onClick={handleGetStarted} className="text-lg px-10 py-7 shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300">
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
      <section ref={featuresRef} className={`relative py-24 md:py-32 transition-all duration-1000 ${showFeatures ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'}`}>
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
              <h3 className="text-2xl font-bold">Actor Connect Game
            </h3>
              <p className="text-muted-foreground leading-relaxed">
                Test your movie knowledge by connecting two actors in under 2 minutes. Win rounds to earn 75 coins and discover surprising film connections as you play.
              </p>
            </Card>

            <Card className="p-8 space-y-5 hover:shadow-2xl hover:scale-105 transition-all duration-500 backdrop-blur-sm bg-card/80 border-border/50 group">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/30 to-accent/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <Package className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-2xl font-bold">Collect Actor & Director Cards</h3>
              <p className="text-muted-foreground leading-relaxed">
                Sell cards for coins, buy new packs, and manage your collection. Build value and discover rare cards as you explore cinema history.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Split CTA Section - Web App & Mobile App */}
      <section className="relative py-24 md:py-32">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-4xl md:text-5xl font-bold text-center mb-12 bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
              Experience CineGeek Everywhere
            </h2>
            
            <div className="grid md:grid-cols-2 gap-6 relative">
              {/* Glow Effect Between Cards */}
              <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-accent/20 to-primary/20 rounded-3xl blur-3xl -z-10" />
              
              {/* Web App - Available Now */}
              <Card className="p-8 md:p-10 space-y-6 backdrop-blur-sm bg-card/90 border-2 border-primary/40 hover:border-primary/60 transition-all duration-300 group hover:scale-105">
                <div className="space-y-4">
                  <div className="inline-block px-4 py-1.5 rounded-full bg-primary/20 border border-primary/40">
                    <span className="text-sm font-semibold text-primary">Available Now</span>
                  </div>
                  <h3 className="text-3xl md:text-4xl font-bold">Web App</h3>
                  <p className="text-lg text-muted-foreground leading-relaxed">
                    Start tracking your movies and TV shows, ask spoiler-free questions, and play Actor Connect today.
                  </p>
                </div>
                <Button 
                  size="lg" 
                  onClick={handleGetStarted}
                  className="w-full text-lg px-8 py-6 shadow-lg group-hover:shadow-xl transition-all duration-300"
                >
                  {isAuthenticated ? "Go to Dashboard" : "Get Started →"}
                </Button>
              </Card>

              {/* Mobile App - Coming Soon */}
              <Card className="p-8 md:p-10 space-y-6 backdrop-blur-sm bg-card/90 border-2 border-accent/40 hover:border-accent/60 transition-all duration-300 group hover:scale-105">
                <div className="space-y-4">
                  <div className="inline-block px-4 py-1.5 rounded-full bg-accent/20 border border-accent/40">
                    <span className="text-sm font-semibold text-accent">Coming Soon</span>
                  </div>
                  <h3 className="text-3xl md:text-4xl font-bold">Mobile App</h3>
                  <p className="text-lg text-muted-foreground leading-relaxed">
                    Get early access to CineGeek on iOS & Android. Be the first to know when we launch.
                  </p>
                </div>
                <Button 
                  size="lg" 
                  variant="outline"
                  className="w-full text-lg px-8 py-6 shadow-lg group-hover:shadow-xl transition-all duration-300"
                >
                  Join the Waitlist →
                </Button>
              </Card>
            </div>
          </div>
        </div>
      </section>
    </div>;
};
export default Home;