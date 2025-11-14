import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, Filter } from "lucide-react";
import { toast } from "sonner";

interface CustomFilter {
  id: string;
  name: string;
  criteria: string;
  inspirationType: string;
}

interface ManageFiltersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customFilters: CustomFilter[];
  onRemoveCustomFilter: (filterId: string) => void;
}

const ManageFiltersDialog = ({ 
  open, 
  onOpenChange, 
  customFilters, 
  onRemoveCustomFilter 
}: ManageFiltersDialogProps) => {
  const handleRemoveFilter = (filter: CustomFilter) => {
    onRemoveCustomFilter(filter.id);
    toast.success(`Removed "${filter.name}" filter`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Manage Custom Filters
          </DialogTitle>
          <DialogDescription>
            View and delete your custom filters. You currently have {customFilters.length} custom filter{customFilters.length !== 1 ? 's' : ''}.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-3 py-4 max-h-[400px] overflow-y-auto">
          {customFilters.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Filter className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No custom filters yet</p>
              <p className="text-sm">Create one from the filter dropdown to get started</p>
            </div>
          ) : (
            customFilters.map((filter) => (
              <div 
                key={filter.id}
                className="flex items-start justify-between gap-3 p-3 border border-border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{filter.name}</h3>
                    <Badge variant="secondary" className="text-xs capitalize">
                      {filter.inspirationType}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{filter.criteria}</p>
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRemoveFilter(filter)}
                  className="shrink-0 hover:bg-destructive hover:text-destructive-foreground hover:border-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ManageFiltersDialog;