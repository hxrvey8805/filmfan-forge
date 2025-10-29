import { useState, useEffect } from "react";
import { Download, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const Install = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    // Check if iOS
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(iOS);

    // Listen for the beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      setIsInstalled(true);
    }

    setDeferredPrompt(null);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-6 space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Install CineMate
          </h1>
          <p className="text-muted-foreground">
            Install our app for the best experience
          </p>
        </div>

        {isInstalled ? (
          <div className="text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto">
              <Check className="w-8 h-8 text-primary" />
            </div>
            <p className="text-lg font-medium">App Already Installed!</p>
            <p className="text-sm text-muted-foreground">
              You can find CineMate on your home screen
            </p>
          </div>
        ) : isIOS ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              To install CineMate on your iPhone or iPad:
            </p>
            <ol className="text-sm space-y-3 list-decimal list-inside">
              <li>Tap the Share button in Safari</li>
              <li>Scroll down and tap "Add to Home Screen"</li>
              <li>Tap "Add" in the top right corner</li>
            </ol>
          </div>
        ) : deferredPrompt ? (
          <div className="space-y-4">
            <Button
              onClick={handleInstallClick}
              className="w-full"
              size="lg"
            >
              <Download className="w-5 h-5 mr-2" />
              Install App
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              Works offline • Fast loading • Native app feel
            </p>
          </div>
        ) : (
          <div className="text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              To install CineMate:
            </p>
            <ol className="text-sm space-y-3 list-decimal list-inside text-left">
              <li>Open the browser menu (⋮)</li>
              <li>Look for "Install app" or "Add to Home screen"</li>
              <li>Follow the prompts to install</li>
            </ol>
          </div>
        )}

        <div className="pt-4 border-t border-border">
          <h3 className="font-semibold mb-3">App Features:</h3>
          <ul className="text-sm space-y-2 text-muted-foreground">
            <li>✓ Works offline</li>
            <li>✓ Fast loading</li>
            <li>✓ Home screen icon</li>
            <li>✓ Full screen experience</li>
          </ul>
        </div>
      </Card>
    </div>
  );
};

export default Install;
