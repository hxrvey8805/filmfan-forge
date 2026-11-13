import { useState, type ComponentProps } from "react";
import { useViewerSession } from "@/hooks/use-viewer-session";
import { GeekViewer } from "@/hooks/use-geek-outfit";
import { Navigate, useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import SearchModal from "@/components/SearchModal";
import TitleDetailModal from "@/components/TitleDetailModal";
import { Button } from "@/components/ui/button";

export default function Companion() {
  const navigate = useNavigate();
  const viewer = useViewerSession();
  const [searchOpen, setSearchOpen] = useState(true);
  const [title, setTitle] = useState<ComponentProps<typeof TitleDetailModal>["title"] | null>(null);
  if (viewer === undefined) return null;
  if (!viewer) return <Navigate to="/auth" replace />;
  return <main className="standalone-companion">
    <h1>Ask your geek</h1>
    <Button onClick={() => setSearchOpen(true)}><Search size={18}/> Choose a title</Button>
    <Button variant="ghost" onClick={() => navigate("/dashboard")}>Back to Home</Button>
    <SearchModal open={searchOpen} listType="companion" onOpenChange={setSearchOpen} onSelect={setTitle}/>
    {title && <GeekViewer.Provider value={viewer.id}><TitleDetailModal open title={title} onOpenChange={open => { if (!open) setTitle(null); }}/></GeekViewer.Provider>}
  </main>;
}
