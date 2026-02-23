import { Clapperboard, Tv, Plus, Trash2, MessageSquare, Check } from "lucide-react";
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

interface CustomFilter {
  id: string;
  name: string;
  criteria: string;
  inspirationType: string;
}

interface PersonalList {
  id: string;
  name: string;
  titleIds: number[];
}

interface PosterRowProps {
  title: string;
  items: Title[];
  onPosterClick: (title: Title) => void;
  onAddClick?: () => void;
  onDeleteClick?: (title: Title) => void;
  filterValue?: string;
  onFilterChange?: (value: string) => void;
  customFilters?: CustomFilter[];
  onAddCustomFilter?: () => void;
  onDeleteCustomFilter?: (filterId: string) => void;
  personalLists?: PersonalList[];
  onAddPersonalList?: () => void;
  onDeletePersonalList?: (listId: string) => void;
  selectionMode?: boolean;
  selectedTitleIds?: number[];
  onToggleSelection?: (titleId: number) => void;
}

const PosterRow = ({ 
  title, items, onPosterClick, onAddClick, onDeleteClick, 
  filterValue, onFilterChange, customFilters = [], onAddCustomFilter, onDeleteCustomFilter,
  personalLists = [], onAddPersonalList, onDeletePersonalList,
  selectionMode = false, selectedTitleIds = [], onToggleSelection,
}: PosterRowProps) => {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3 px-1">
        {onFilterChange && (
          <Select value={filterValue} onValueChange={onFilterChange}>
            <SelectTrigger className="relative w-[160px] h-9 text-sm font-semibold bg-gradient-to-r from-primary/20 to-accent/20 border-primary/30 hover:border-primary transition-all rounded-full shadow-md text-primary [&>span]:absolute [&>span]:inset-x-0 [&>span]:text-center">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent className="bg-card/95 backdrop-blur-xl border-primary/30 z-50 rounded-xl shadow-2xl min-w-[160px]">
              <SelectItem value="all" className="rounded-lg text-sm font-medium focus:bg-primary/20 focus:text-primary cursor-pointer">All</SelectItem>
              <SelectItem value="movie" className="rounded-lg text-sm font-medium focus:bg-primary/20 focus:text-primary cursor-pointer">Movies</SelectItem>
              <SelectItem value="tv" className="rounded-lg text-sm font-medium focus:bg-accent/20 focus:text-accent cursor-pointer">TV Shows</SelectItem>
              
              {/* Personal Lists */}
              {personalLists.map((list) => {
                const isSelected = filterValue === list.id;
                return (
                  <SelectItem
                    key={list.id}
                    value={list.id}
                    className="rounded-lg text-sm font-medium focus:bg-primary/20 focus:text-primary cursor-pointer relative pl-8"
                  >
                    {!isSelected && onDeletePersonalList && (
                      <Trash2
                        className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground hover:text-destructive transition-colors cursor-pointer z-10"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          onDeletePersonalList(list.id);
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                        }}
                      />
                    )}
                    📋 {list.name}
                  </SelectItem>
                );
              })}

              {/* Custom Filters */}
              {customFilters.map((filter) => {
                const isSelected = filterValue === filter.id;
                return (
                  <SelectItem 
                    key={filter.id} 
                    value={filter.id}
                    className="rounded-lg text-sm font-medium focus:bg-primary/20 focus:text-primary cursor-pointer relative pl-8"
                  >
                    {!isSelected && onDeleteCustomFilter && (
                      <Trash2 
                        className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground hover:text-destructive transition-colors cursor-pointer z-10" 
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          onDeleteCustomFilter(filter.id);
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                        }}
                      />
                    )}
                    {filter.name}
                  </SelectItem>
                );
              })}

              {/* Add buttons */}
              {onAddPersonalList && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    onAddPersonalList();
                  }}
                  className="w-full text-left px-2 py-1.5 text-sm font-medium text-primary hover:bg-primary/20 rounded-lg cursor-pointer"
                >
                  + Create Personal List
                </button>
              )}
              {onAddCustomFilter && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    onAddCustomFilter();
                  }}
                  className="w-full text-left px-2 py-1.5 text-sm font-medium text-primary hover:bg-primary/20 rounded-lg cursor-pointer"
                >
                  + Add Custom Filter
                </button>
              )}
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
            dragFree: true,
            containScroll: "trimSnaps",
            dragThreshold: 2,
            watchDrag: !selectionMode,
            watchResize: true,
            loop: false,
            duration: 20,
            watchSlides: true,
            slidesToScroll: 1,
          }}
          className="w-full"
        >
          <CarouselContent className="-ml-3 touch-pan-x">
            {items.map((item) => {
              const isSelectedForList = selectionMode && selectedTitleIds.includes(item.id);
              
              return (
                <CarouselItem
                  key={item.id}
                  className={`pl-3 ${onAddClick ? "basis-[42%] sm:basis-1/3 md:basis-1/6" : "basis-[32%] sm:basis-1/4 md:basis-1/5"}`}
                >
                  <div className={`group relative w-full aspect-[2/3] rounded-xl overflow-hidden bg-card shadow-md hover:shadow-xl transition-all duration-300 ${
                    selectionMode && !isSelectedForList ? "opacity-40 grayscale" : ""
                  } ${isSelectedForList ? "ring-3 ring-primary shadow-lg shadow-primary/30" : ""}`}>
                    <button
                      onClick={() => {
                        if (selectionMode && onToggleSelection) {
                          onToggleSelection(item.id);
                        } else {
                          onPosterClick(item);
                        }
                      }}
                      className="w-full h-full active:scale-95 transition-transform duration-200 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
                      style={{ touchAction: selectionMode ? 'manipulation' : 'pan-x', WebkitUserSelect: 'none', userSelect: 'none' }}
                    >
                      <img
                        src={item.posterPath}
                        alt={item.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                      
                      {/* Selection checkmark */}
                      {selectionMode && isSelectedForList && (
                        <div className="absolute top-2 left-2 bg-primary rounded-full p-1 shadow-lg">
                          <Check className="h-4 w-4 text-primary-foreground" />
                        </div>
                      )}

                      {/* Type Badge */}
                      {!selectionMode && (
                        <div className="absolute top-2 right-2 bg-background/80 backdrop-blur-sm rounded-full p-1.5">
                          {item.type === "movie" ? (
                            <Clapperboard className="h-3.5 w-3.5 text-primary" />
                          ) : (
                            <Tv className="h-3.5 w-3.5 text-accent" />
                          )}
                        </div>
                      )}

                      {/* Progress Bar for Currently Watching */}
                      {item.progress !== undefined && !selectionMode && (
                        <div className="absolute bottom-0 left-0 right-0 bg-background/90 backdrop-blur-sm p-2">
                          <Progress value={item.progress} className="h-1.5" />
                          <p className="text-xs text-muted-foreground mt-1">{item.progress}%</p>
                        </div>
                      )}
                    </button>

                    {/* Hover Overlay Actions - hidden in selection mode */}
                    {!selectionMode && (
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex">
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
                    )}
                  </div>
                </CarouselItem>
              );
            })}
            
            {/* Circular Add Button - hidden in selection mode */}
            {onAddClick && !selectionMode && (
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
