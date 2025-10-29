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
    <section className="space-y-4">
      <h2 className="text-xl font-bold px-1 tracking-tight">{title}</h2>

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

                  {/* Mobile: Show action buttons on long press / Desktop: on hover */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-3 gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onPosterClick(item);
                      }}
                      className="w-full bg-primary/90 hover:bg-primary text-primary-foreground py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 font-medium text-sm active:scale-95 transition-all min-h-[44px]"
                      aria-label="Ask question about this title"
                    >
                      <MessageSquare className="h-4 w-4" />
                      <span>Ask</span>
                    </button>

                    {onDeleteClick && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteClick(item);
                        }}
                        className="w-full bg-destructive/90 hover:bg-destructive text-destructive-foreground py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 font-medium text-sm active:scale-95 transition-all min-h-[44px]"
                        aria-label="Remove from list"
                      >
                        <Trash2 className="h-4 w-4" />
                        <span>Remove</span>
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
