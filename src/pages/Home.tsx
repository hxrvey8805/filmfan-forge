import { Link, Navigate } from "react-router-dom";
import { GeekAvatar } from "@/components/GeekAvatar";
import { ContentLoading } from "@/components/ContentLoading";
import { useViewerSession } from "@/hooks/use-viewer-session";
import "./welcome.css";

export default function Home() {
  const viewer = useViewerSession();
  if (viewer === undefined) return <ContentLoading />;
  if (viewer) return <Navigate to="/dashboard" replace />;

  return <main className="welcome-screen">
    <div className="welcome-content">
      <div className="welcome-stage" role="img" aria-label="Arcade Geek waving hello">
        <GeekAvatar look="classic" />
      </div>
      <div className="welcome-brand">
        <h1>Cine<span>Geek</span></h1>
        <p className="welcome-tagline">
          <span className="welcome-tagline-credit">Your film and TV companion.</span>{" "}
          <span className="welcome-tagline-line">Spoiler-free, <em>scene by scene.</em></span>
        </p>
      </div>
      <nav className="welcome-actions" aria-label="Get started">
        <Link to="/auth">Sign in</Link>
        <Link to="/auth?mode=signup">Create an account</Link>
      </nav>
    </div>
  </main>;
}
