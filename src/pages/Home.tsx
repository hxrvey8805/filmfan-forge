import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Film, Users, Package, Sparkles, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const Home = () => {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (session) {
          navigate("/dashboard");
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/dashboard");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        toast({
          title: "Welcome back!",
          description: "Successfully signed in.",
        });
      } else {
        const redirectUrl = `${window.location.origin}/`;
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: redirectUrl,
          },
        });
        if (error) throw error;
        toast({
          title: "Account created!",
          description: "Successfully signed up. Redirecting...",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero Section with Auth */}
      <div className="container mx-auto px-4 py-12 md:py-16">
        <div className="text-center space-y-6 max-w-4xl mx-auto">
          <div className="flex justify-center mb-4">
            <Film className="h-16 w-16 md:h-20 md:w-20 text-primary" />
          </div>
          <h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
            Welcome to CineGeek
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground">
            Your Ultimate Cinematic Companion
          </p>
          <div className="inline-block px-6 py-2 bg-primary/20 rounded-full">
            <p className="text-lg font-semibold text-primary">
              🚀 App Coming Soon
            </p>
          </div>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Discover movies and TV shows with a spoiler-free AI companion, collect actor and director cards, and build your ultimate entertainment collection.
          </p>
        </div>

        {/* Auth Form */}
        <div className="max-w-md mx-auto mt-12">
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">
                {isLogin ? "Sign In" : "Create Account"}
              </CardTitle>
              <CardDescription>
                {isLogin ? "Welcome back to CineGeek" : "Join CineGeek today"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isLogin ? "Sign In" : "Sign Up"}
                </Button>
              </form>
              <div className="mt-4 text-center text-sm">
                <button
                  onClick={() => setIsLogin(!isLogin)}
                  className="text-primary hover:underline"
                >
                  {isLogin
                    ? "Don't have an account? Sign up"
                    : "Already have an account? Sign in"}
                </button>
              </div>
            </CardContent>
          </Card>
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

    </div>
  );
};

export default Home;
