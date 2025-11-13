import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

interface CustomFilterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFilterAdded: (filter: { id: string; name: string; criteria: string; inspirationType: string }) => void;
}

const CustomFilterDialog = ({ open, onOpenChange, onFilterAdded }: CustomFilterDialogProps) => {
  const [filterName, setFilterName] = useState("");
  const [inspirationType, setInspirationType] = useState("genre");
  const [criteria, setCriteria] = useState("");

  const handleSubmit = () => {
    if (!filterName.trim() || !criteria.trim()) {
      toast.error("Please fill in all fields");
      return;
    }

    const newFilter = {
      id: `custom_${Date.now()}`,
      name: filterName,
      criteria: criteria,
      inspirationType: inspirationType,
    };

    onFilterAdded(newFilter);
    
    // Reset form
    setFilterName("");
    setCriteria("");
    setInspirationType("genre");
    onOpenChange(false);
    
    toast.success(`Added custom filter: ${filterName}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create Custom Filter</DialogTitle>
          <DialogDescription>
            Create a custom way to sort your watchlist based on your preferences.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="filter-name">Filter Name</Label>
            <Input
              id="filter-name"
              placeholder="e.g., Nolan Films"
              value={filterName}
              onChange={(e) => setFilterName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="inspiration-type">Filter By</Label>
            <Select value={inspirationType} onValueChange={setInspirationType}>
              <SelectTrigger id="inspiration-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="genre">Genre</SelectItem>
                <SelectItem value="director">Director</SelectItem>
                <SelectItem value="actor">Actor</SelectItem>
                <SelectItem value="theme">Theme/Mood</SelectItem>
                <SelectItem value="year">Year/Era</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="criteria">Filter Criteria</Label>
            <Input
              id="criteria"
              placeholder="e.g., Christopher Nolan, Sci-fi, 1990s action..."
              value={criteria}
              onChange={(e) => setCriteria(e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>
            Add Filter
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CustomFilterDialog;
