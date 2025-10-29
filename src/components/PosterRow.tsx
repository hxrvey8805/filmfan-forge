import { Film, Tv, Plus, Trash2, MessageSquare } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Title {
  id: number;
  title: string;
  type: "movie" | "tv";
  posterPath: string;
  year?: number;
  progress?: number;
}

interface PosterRowProps {
  title: string;
  items: Title[];
  onPosterClick: (title: Title) => void;
  onAddClick?: () => void;
  onDeleteClick?: (title: Title) => void;
  filterValue?: string;
  onFilterChange?: (value: string) => void;
}

const PosterRow = ({ title, items, onPosterClick, onAddClick, onDeleteClick, filterValue, onFilterChange }: PosterRowProps) => {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3 px-1">
        {onFilterChange && (
          <Select value={filterValue} onValueChange={onFilterChange}>
            <SelectTrigger className="w-[120px] h-9 text-sm bg-card border-border hover:border-primary/50 transition-colors rounded-lg">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border z-50 rounded-lg">
              <SelectItem value="all" className="rounded-md">All</SelectItem>
              <SelectItem value="movie" className="rounded-md">Movies</SelectItem>
              <SelectItem value="tv" className="rounded-md">TV Shows</SelectItem>
            </SelectContent>
          </Select>
        )}
        <h2 className="text-xl font-bold tracking-tight">{title}</h2>
      </div>

      <div className="relative">
        <Carousel
          opts={{
            align: "start",
            skipSnaps: false,
          }}
          className="w-full"
        >
          <CarouselContent className="-ml-3">
            {items.map((item) => (
              <CarouselItem
                key={item.id}
                className={`pl-3 ${onAddClick ? "basis-[42%] sm:basis-1/3 md:basis-1/6" : "basis-[32%] sm:basis-1/4 md:basis-1/5"}`}
              >
                <div className="group relative w-full aspect-[2/3] rounded-xl overflow-hidden bg-card shadow-md hover:shadow-xl transition-shadow">
                  <button
                    onClick={() => onPosterClick(item)}
                    className="w-full h-full active:scale-95 transition-transform duration-200 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
                  >
                    <img
                      src={item.posterPath}
                      alt={item.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    
                    {/* Type Badge */}
                    <div className="absolute top-2 right-2 bg-background/80 backdrop-blur-sm rounded-full p-1.5">
                      {item.type === "movie" ? (
                        <Film className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <Tv className="h-3.5 w-3.5 text-accent" />
                      )}
                    </div>

                    {/* Progress Bar for Currently Watching */}
                    {item.progress !== undefined && (
                      <div className="absolute bottom-0 left-0 right-0 bg-background/90 backdrop-blur-sm p-2">
                        <Progress value={item.progress} className="h-1.5" />
                        <p className="text-xs text-muted-foreground mt-1">{item.progress}%</p>
                      </div>
                    )}
                  </button>

                  {/* Hover Overlay Actions */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex">
                    {/* Ask Question Button - Left Half */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onPosterClick(item);
                      }}
                      className="flex-1 flex flex-col items-center justify-center gap-2 hover:bg-primary/20 transition-colors"
                      aria-label="Ask question about this title"
                    >
                      <MessageSquare className="h-6 w-6 text-white" />
                      <span className="text-xs text-white font-medium">Ask</span>
                    </button>

                    {/* Delete Button - Right Half */}
                    {onDeleteClick && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteClick(item);
                        }}
                        className="flex-1 flex flex-col items-center justify-center gap-2 hover:bg-destructive/20 transition-colors"
                        aria-label="Remove from list"
                      >
                        <Trash2 className="h-6 w-6 text-white" />
                        <span className="text-xs text-white font-medium">Remove</span>
                      </button>
                    )}
                  </div>
                </div>
              </CarouselItem>
            ))}
            
            {/* Circular Add Button as last carousel item */}
            {onAddClick && (
              <CarouselItem className="pl-3 basis-auto">
                <div className="flex items-center justify-center h-full px-2">
                  <button
                    onClick={onAddClick}
                    className="h-16 w-16 rounded-full bg-gradient-to-br from-primary to-accent text-primary-foreground flex items-center justify-center shadow-lg active:scale-95 transition-all duration-200 hover:shadow-xl min-h-[64px] min-w-[64px]"
                    aria-label="Add new title"
                  >
                    <Plus className="h-7 w-7" />
                  </button>
                </div>
              </CarouselItem>
            )}
          </CarouselContent>
        </Carousel>
      </div>
    </section>
  );
};

export default PosterRow;
