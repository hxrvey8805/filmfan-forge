import { Film, Tv, Plus, Trash2, MessageSquare } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";

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
}

const PosterRow = ({ title, items, onPosterClick, onAddClick, onDeleteClick }: PosterRowProps) => {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold px-1">{title}</h2>

      <div className="relative">
        <Carousel
          opts={{
            align: "start",
            skipSnaps: false,
          }}
          className="w-full"
        >
          <CarouselContent className="-ml-2">
            {items.map((item) => (
              <CarouselItem
                key={item.id}
                className={`pl-2 ${onAddClick ? "basis-[45%] sm:basis-1/3 md:basis-1/6" : "basis-[30%] sm:basis-1/4 md:basis-1/5"}`}
              >
                <div className="group relative w-full aspect-[2/3] rounded-lg overflow-hidden bg-card">
                  <button
                    onClick={() => onPosterClick(item)}
                    className="w-full h-full active:scale-95 transition-transform duration-200 focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <img
                      src={item.posterPath}
                      alt={item.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    
                    {/* Type Badge */}
                    <div className="absolute top-2 right-2">
                      {item.type === "movie" ? (
                        <Film className="h-4 w-4 text-primary drop-shadow-lg" />
                      ) : (
                        <Tv className="h-4 w-4 text-accent drop-shadow-lg" />
                      )}
                    </div>

                    {/* Progress Bar for Currently Watching */}
                    {item.progress !== undefined && (
                      <div className="absolute bottom-0 left-0 right-0">
                        <Progress value={item.progress} className="h-1 rounded-none" />
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
              <CarouselItem className="pl-2 basis-auto">
                <div className="flex items-center justify-center h-full px-2">
                  <button
                    onClick={onAddClick}
                    className="h-14 w-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg active:scale-95 transition-all duration-200 hover:shadow-xl"
                  >
                    <Plus className="h-6 w-6" />
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
