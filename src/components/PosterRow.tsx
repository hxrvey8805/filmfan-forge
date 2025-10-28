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

      <div className="relative flex items-center gap-3">
        <Carousel
          opts={{
            align: "start",
            skipSnaps: false,
          }}
          className="flex-1"
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
          </CarouselContent>
        </Carousel>
        
        {/* Circular Add Button */}
        {onAddClick && (
          <button
            onClick={onAddClick}
            className="flex-shrink-0 h-14 w-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg active:scale-95 transition-all duration-200 hover:shadow-xl"
          >
            <Plus className="h-6 w-6" />
          </button>
        )}
      </div>
    </section>
  );
};

export default PosterRow;
