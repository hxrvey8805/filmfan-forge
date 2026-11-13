import { useId, useState } from "react";
import { usePosterHold } from "@/hooks/use-poster-hold";
import { PosterArtwork } from "./PosterArtwork";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Clapperboard, Tv, Plus, Trash2, MessageSquare, Check, MoreHorizontal, ListVideo } from "lucide-react";
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
  onMoveRequest?: (title: Title, anchor: HTMLElement, fromHold?: boolean) => void;
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
  title, items, onPosterClick, onAddClick, onDeleteClick, onMoveRequest,
  filterValue, onFilterChange, customFilters = [], onAddCustomFilter, onDeleteCustomFilter,
  personalLists = [], onAddPersonalList, onDeletePersonalList,
  selectionMode = false, selectedTitleIds = [], onToggleSelection,
}: PosterRowProps) => {
  const [pendingRemoval, setPendingRemoval] = useState<Title | null>(null);
  const hold = usePosterHold();
  const rowId = useId();
  const canMove = !!onMoveRequest && !selectionMode;
  return (
    <section aria-label={title} className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="sr-only">{title}</h3>
        <span className="text-sm text-muted-foreground flex-1">{items.length} {items.length === 1 ? "title" : "titles"}</span>
        {onFilterChange && (
          <Select value={filterValue} onValueChange={onFilterChange}>
            <SelectTrigger aria-label={`Filter ${title}`} className="w-auto max-w-[130px] gap-2 border-0 bg-transparent shadow-none text-xs text-muted-foreground rounded-xl">
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
        {onAddClick && !selectionMode && <button onClick={onAddClick} aria-label={`Add to ${title}`} className="rounded-full text-primary hover:bg-primary/10 flex items-center justify-center"><Plus className="w-5 h-5" /></button>}
      </div>

      {items.length === 0 && <div className="rounded-2xl border border-dashed border-white/15 py-6 px-4 text-sm text-muted-foreground">{filterValue && filterValue !== "all" ? "No titles in this filter yet." : "A little room for your next great watch."}{onAddClick && <button onClick={onAddClick} className="text-primary block mt-1 text-xs font-medium">Add a title</button>}</div>}
      <div className="relative">
        <Carousel
          opts={{
            align: "start",
            skipSnaps: false,
            dragFree: true,
            containScroll: "trimSnaps",
            dragThreshold: 2,
            watchDrag: true,
            watchResize: true,
            loop: false,
            duration: 20,
            watchSlides: true,
            slidesToScroll: 1,
          }}
          className="w-full"
        >
          <CarouselContent className="-ml-3">
            {items.map((item) => {
              const posterId = rowId + item.type + item.id;
              const isSelectedForList = selectionMode && selectedTitleIds.includes(item.id);
              
              return (
                <CarouselItem
                  key={item.type + ":" + item.id}
                  className="pl-3 basis-[37%] min-[480px]:basis-[28%] sm:basis-1/4 md:basis-1/5 lg:basis-1/6"
                >
                  <div className={`group relative w-full aspect-[2/3] rounded-xl overflow-hidden bg-card shadow-md hover:shadow-xl transition-all duration-300 ${
                    selectionMode && !isSelectedForList ? "opacity-40 grayscale" : ""
                  } ${isSelectedForList ? "ring-3 ring-primary shadow-lg shadow-primary/30" : ""}`}>
                    <button
                      id={posterId}
                      data-hold-poster={canMove ? "" : undefined}
                      onTouchStart={canMove ? e => { const button = e.currentTarget; hold.touch(e, () => onMoveRequest(item, button, true)); } : undefined}
                      onPointerDown={canMove ? e => { const button = e.currentTarget; hold.pointer(e, () => onMoveRequest(item, button, true)); } : undefined}
                      onContextMenu={canMove ? e => e.preventDefault() : undefined}
                      onDragStart={canMove ? e => e.preventDefault() : undefined}
                      aria-label={selectionMode ? `Select ${item.title}` : `Open ${item.title}`}
                      aria-pressed={selectionMode ? isSelectedForList : undefined}
                      onClick={e => {
                        if (canMove && hold.skipClick(e.currentTarget)) return;
                        if (selectionMode && onToggleSelection) {
                          onToggleSelection(item.id);
                        } else {
                          onPosterClick(item);
                        }
                      }}
                      className="w-full h-full active:scale-95 transition-transform duration-200 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
                      style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
                    >
                      <PosterArtwork src={item.posterPath} type={item.type} lazy />
                      
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
                      {typeof item.progress === "number" && Number.isFinite(item.progress) && item.progress >= 0 && item.progress <= 100 && !selectionMode && (
                        <div className="absolute bottom-0 left-0 right-0 bg-background/90 backdrop-blur-sm p-2">
                          <Progress value={item.progress} className="h-1.5" />
                          <p className="text-xs text-muted-foreground mt-1">{item.progress}%</p>
                        </div>
                      )}
                    </button>

                  </div>
                  <div className="flex items-start gap-1 mt-2">
                    <div className="min-w-0 flex-1 pt-1"><p className="text-xs font-medium leading-snug line-clamp-2">{item.title}</p><p className="text-[10px] text-muted-foreground mt-1">{item.year ? `${item.year} · ` : ""}{item.type === "tv" ? "Series" : "Movie"}</p></div>
                    {!selectionMode && <DropdownMenu><DropdownMenuTrigger asChild>
                      <button aria-label={`Options for ${item.title}`} className="-mr-2 -mt-1 flex justify-center items-center text-muted-foreground rounded-full hover:bg-white/5"><MoreHorizontal className="w-4 h-4" /></button>
                    </DropdownMenuTrigger><DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => onPosterClick(item)} className="min-h-11"><MessageSquare className="w-4 h-4 mr-2" />Ask your geek</DropdownMenuItem>
                      {canMove && <DropdownMenuItem className="min-h-11" onSelect={() => {
                        const anchor = document.getElementById(posterId);
                        if (anchor) window.setTimeout(() => onMoveRequest(item, anchor), 0);
                      }}><ListVideo className="w-4 h-4 mr-2" />Move to list…</DropdownMenuItem>}
                      {onDeleteClick && <DropdownMenuItem onSelect={() => setPendingRemoval(item)} className="text-destructive focus:text-destructive min-h-11"><Trash2 className="w-4 h-4 mr-2" />Remove from {title}</DropdownMenuItem>}
                    </DropdownMenuContent></DropdownMenu>}
                  </div>
                </CarouselItem>
              );
            })}
            
          </CarouselContent>
        </Carousel>
      </div>
      <AlertDialog open={!!pendingRemoval} onOpenChange={open => { if (!open) setPendingRemoval(null); }}>
        <AlertDialogContent><AlertDialogTitle>Remove {pendingRemoval?.title}?</AlertDialogTitle><AlertDialogDescription>This removes it from {title}. You can add it again using search.</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>Keep title</AlertDialogCancel><AlertDialogAction onClick={() => { if (pendingRemoval) onDeleteClick?.(pendingRemoval); setPendingRemoval(null); }}>Remove title</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </section>
  );
};

export default PosterRow;
