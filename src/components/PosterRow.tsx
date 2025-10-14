import { Film, Tv } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
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
}

const PosterRow = ({ title, items, onPosterClick }: PosterRowProps) => {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">{title}</h2>
        <button className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          See all
        </button>
      </div>

      <Carousel
        opts={{
          align: "start",
          loop: false,
        }}
        className="w-full"
      >
        <CarouselContent className="-ml-4">
          {items.map((item) => (
            <CarouselItem key={item.id} className="pl-4 basis-1/2 md:basis-1/4 lg:basis-1/6">
              <div
                onClick={() => onPosterClick(item)}
                className="group cursor-pointer space-y-2"
              >
                {/* Poster Card */}
                <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-muted transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-primary/20">
                  {/* Mock poster with gradient */}
                  <div className="w-full h-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                    {item.type === "movie" ? (
                      <Film className="h-16 w-16 text-muted-foreground/50" />
                    ) : (
                      <Tv className="h-16 w-16 text-muted-foreground/50" />
                    )}
                  </div>

                  {/* Type Badge */}
                  <Badge 
                    variant={item.type === "tv" ? "default" : "secondary"}
                    className="absolute top-2 left-2 text-xs"
                  >
                    {item.type === "tv" ? "TV" : "Movie"}
                  </Badge>

                  {/* Hover Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/0 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-center p-4">
                    <div className="text-xs font-medium">Click to view</div>
                  </div>

                  {/* Progress Bar */}
                  {item.progress !== undefined && (
                    <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-background to-transparent">
                      <Progress value={item.progress} className="h-1" />
                    </div>
                  )}
                </div>

                {/* Title */}
                <div className="space-y-1">
                  <h3 className="text-sm font-medium line-clamp-2 group-hover:text-primary transition-colors">
                    {item.title}
                  </h3>
                  {item.year && (
                    <p className="text-xs text-muted-foreground">{item.year}</p>
                  )}
                </div>
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious className="-left-4" />
        <CarouselNext className="-right-4" />
      </Carousel>
    </section>
  );
};

export default PosterRow;
