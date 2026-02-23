import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface PersonalListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onListCreated: (name: string) => void;
}

const PersonalListDialog = ({ open, onOpenChange, onListCreated }: PersonalListDialogProps) => {
  const [listName, setListName] = useState("");

  const handleSubmit = () => {
    if (!listName.trim()) {
      toast.error("Please enter a list name");
      return;
    }
    onListCreated(listName.trim());
    setListName("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Create Personal List</DialogTitle>
          <DialogDescription>
            Name your list, then select posters from your watchlist to add.
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
