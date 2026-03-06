import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export type PersonalListSource = "watchlist" | "favourite" | "watching" | "watched";

interface PersonalListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onListCreated: (name: string, source: PersonalListSource) => void;
}

const PersonalListDialog = ({ open, onOpenChange, onListCreated }: PersonalListDialogProps) => {
  const [listName, setListName] = useState("");
  const [source, setSource] = useState<PersonalListSource>("watchlist");

  const handleSubmit = () => {
    if (!listName.trim()) {
      toast.error("Please enter a list name");
      return;
    }
    onListCreated(listName.trim(), source);
    setListName("");
    setSource("watchlist");
    onOpenChange(false);
  };

  const sourceLabels: Record<PersonalListSource, string> = {
    watchlist: "Watch List",
    favourite: "Favourites",
    watching: "Currently Watching",
    watched: "Watched",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Create Personal List</DialogTitle>
          <DialogDescription>
            Name your list and choose which collection to pick from.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="list-name">List Name</Label>
            <Input
              id="list-name"
              placeholder="e.g., Weekend Binge, Comfort Picks..."
              value={listName}
              onChange={(e) => setListName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label>Pick From</Label>
            <Select value={source} onValueChange={(v) => setSource(v as PersonalListSource)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(sourceLabels).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>
            Next
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PersonalListDialog;
