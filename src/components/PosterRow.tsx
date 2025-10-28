import { Film, Tv, Plus } from "lucide-react";
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
}

const PosterRow = ({ title, items, onPosterClick, onAddClick }: PosterRowProps) => {
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
              <CarouselItem key={item.id} className="pl-2 basis-[30%] sm:basis-1/4 md:basis-1/5">
                <button
                  onClick={() => onPosterClick(item)}
                  className="group relative w-full aspect-[2/3] rounded-lg overflow-hidden bg-card active:scale-95 transition-transform duration-200 focus:outline-none focus:ring-2 focus:ring-primary"
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
              </CarouselItem>
            ))}
            
            {/* Add Button as Last Item */}
            {onAddClick && (
              <CarouselItem className="pl-2 basis-[30%] sm:basis-1/4 md:basis-1/5">
                <button
                  onClick={onAddClick}
                  className="w-full aspect-[2/3] rounded-lg bg-card border-2 border-dashed border-muted-foreground/30 flex items-center justify-center active:scale-95 transition-all duration-200 hover:border-primary/50 hover:bg-primary/5"
                >
                  <Plus className="h-12 w-12 text-muted-foreground" />
                </button>
              </CarouselItem>
            )}
          </CarouselContent>
        </Carousel>
      </div>
    </section>
  );
};

export default PosterRow;
