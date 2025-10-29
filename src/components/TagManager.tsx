import { useState } from "react";
import { X, Plus, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface TagManagerProps {
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  availableTags: string[];
}

const TagManager = ({ tags, onTagsChange, availableTags }: TagManagerProps) => {
  const [newTag, setNewTag] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const addTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      onTagsChange([...tags, newTag.trim()]);
      setNewTag("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    onTagsChange(tags.filter(tag => tag !== tagToRemove));
  };

  const addExistingTag = (tag: string) => {
    if (!tags.includes(tag)) {
      onTagsChange([...tags, tag]);
    }
  };

  const unusedTags = availableTags.filter(tag => !tags.includes(tag));

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 bg-secondary/50 hover:bg-secondary border-border/50"
        >
          <Tag className="h-3.5 w-3.5 mr-1" />
          Tags {tags.length > 0 && `(${tags.length})`}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 bg-card/95 backdrop-blur-xl border-border z-50 rounded-xl shadow-xl">
        <div className="space-y-3">
          <h4 className="font-semibold text-sm">Manage Tags</h4>
          
          {/* Current Tags */}
          {tags.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Current tags:</p>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="bg-gradient-to-r from-primary/20 to-accent/20 text-primary pr-1"
                  >
                    {tag}
                    <button
                      onClick={() => removeTag(tag)}
                      className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Available Tags */}
          {unusedTags.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Available tags:</p>
              <div className="flex flex-wrap gap-1.5">
                {unusedTags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className="cursor-pointer hover:bg-primary/10 hover:border-primary/50"
                    onClick={() => addExistingTag(tag)}
                  >
                    {tag}
                    <Plus className="h-3 w-3 ml-1" />
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Add New Tag */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Create new tag:</p>
            <div className="flex gap-2">
              <Input
                placeholder="e.g., David Lynch"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && addTag()}
                className="h-8 text-sm"
              />
              <Button
                size="sm"
                onClick={addTag}
                disabled={!newTag.trim()}
                className="h-8 bg-gradient-to-r from-primary to-accent"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default TagManager;
