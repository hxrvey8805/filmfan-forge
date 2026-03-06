import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

interface CustomFilter {
  id: string;
  name: string;
}

interface PersonalList {
  id: string;
  name: string;
}

interface PersonalListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onListCreated: (name: string, filterLabel: string) => void;
  customFilters?: CustomFilter[];
  personalLists?: PersonalList[];
}

const PersonalListDialog = ({ open, onOpenChange, onListCreated, customFilters = [], personalLists = [] }: PersonalListDialogProps) => {
  const [listName, setListName] = useState("");
  const [filterLabel, setFilterLabel] = useState("all");

  const handleSubmit = () => {
    if (!listName.trim()) {
      toast.error("Please enter a list name");
      return;
    }
    onListCreated(listName.trim(), filterLabel);
    setListName("");
    setFilterLabel("all");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Create Personal List</DialogTitle>
          <DialogDescription>
            Name your list and choose which view to pick from.
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
            <Select value={filterLabel} onValueChange={setFilterLabel}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="movies">Movies</SelectItem>
                <SelectItem value="tv">TV Shows</SelectItem>
                {personalLists.map((list) => (
                  <SelectItem key={list.id} value={list.id}>{list.name}</SelectItem>
                ))}
                {customFilters.map((filter) => (
                  <SelectItem key={filter.id} value={filter.id}>{filter.name}</SelectItem>
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
