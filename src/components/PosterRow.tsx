import { useId, useState } from "react";
import { createPortal } from "react-dom";
import { usePosterReorder } from "@/hooks/use-poster-reorder";
import { titleKey } from "@/lib/home-lists";
import { MoveTitleMenu } from "./MoveTitleMenu";
import "./poster-row.css";
import { PosterArtwork } from "./PosterArtwork";
import { Clapperboard, Tv, Plus, Trash2, Check, MoreHorizontal } from "lucide-react";
import { Progress } from "@/components/ui/progress";
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
  onMoveRequest?: (title: Title, anchor: HTMLElement) => void;
  onReorder?: (titles: Title[]) => void;
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
  title, items, onPosterClick, onAddClick, onDeleteClick, onMoveRequest, onReorder,
  filterValue, onFilterChange, customFilters = [], onAddCustomFilter, onDeleteCustomFilter,
  personalLists = [], onAddPersonalList, onDeletePersonalList,
  selectionMode = false, selectedTitleIds = [], onToggleSelection,
}: PosterRowProps) => {
  const [options, setOptions] = useState<{title: Title; anchor: HTMLElement} | null>(null);
  const reorder = usePosterReorder(items.map(titleKey), !selectionMode && onReorder ? keys => {
    const byKey = new Map(items.map(item => [titleKey(item), item]));
    onReorder(keys.map(key => byKey.get(key)!));
  } : undefined);
  const rowId = useId();
  const canReorder = !!onReorder && !selectionMode && items.length > 1;
  const lifted = items.find(item => titleKey(item) === reorder.lift?.key);
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
        <div ref={reorder.viewport} className="poster-row-viewport" aria-label={`${title} titles`}>
          <div className="poster-row-track">
            {items.map((item) => {
              const posterId = rowId + item.type + item.id;
              const isSelectedForList = selectionMode && selectedTitleIds.includes(item.id);

              return (
                <div
                  key={item.type + ":" + item.id}
                  data-reorder-key={titleKey(item)}
                  className="poster-row-item"
                >
                  <div className={`group relative w-full aspect-[2/3] rounded-xl overflow-hidden bg-card shadow-md hover:shadow-xl transition-all duration-300 ${
                    selectionMode && !isSelectedForList ? "opacity-40 grayscale" : ""
                  } ${isSelectedForList ? "ring-3 ring-primary shadow-lg shadow-primary/30" : ""}`}>
                    <button
                      id={posterId}
                      onTouchStart={canReorder ? e => reorder.touch(e, titleKey(item)) : undefined}
                      onPointerDown={canReorder ? e => reorder.pointer(e, titleKey(item)) : undefined}
                      onKeyDown={canReorder ? e => reorder.keyboard(e, titleKey(item)) : undefined}
                      aria-describedby={canReorder ? `${rowId}-reorder-help` : undefined}
                      aria-grabbed={canReorder ? reorder.lift?.key === titleKey(item) : undefined}
                      onContextMenu={e => e.preventDefault()}
                      onDragStart={e => e.preventDefault()}
                      aria-label={selectionMode ? `Select ${item.title}` : `Open ${item.title}`}
                      aria-pressed={selectionMode ? isSelectedForList : undefined}
                      onClick={e => {
                        if (reorder.skipClick()) { e.preventDefault(); return; }
                        if (selectionMode && onToggleSelection) {
                          onToggleSelection(item.id);
                        } else {
                          onPosterClick(item);
                        }
                      }}
                      className="poster-row-button w-full h-full transition-transform duration-200 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
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
                    {!selectionMode && <button aria-label={`Options for ${item.title}`} aria-haspopup="dialog"
                      onClick={event => onMoveRequest ? onMoveRequest(item, event.currentTarget) : setOptions({title:item,anchor:event.currentTarget})}
                      className="-mr-2 -mt-1 flex justify-center items-center text-muted-foreground rounded-full hover:bg-white/5"><MoreHorizontal className="w-4 h-4" /></button>}

                  </div>
                </div>
              );
            })}

          </div>
        </div>
      </div>
      {canReorder && <p id={`${rowId}-reorder-help`} className="sr-only">Hold and drag to reorder. With a keyboard, press Space, use the arrow keys, then Enter to place.</p>}
      <p className="sr-only" role="status" aria-live="polite">{reorder.announcement}</p>
      {reorder.lift && lifted && createPortal(<div ref={reorder.ghost} className="poster-row-ghost" aria-hidden="true" style={{width:reorder.lift.width,height:reorder.lift.height,left:reorder.lift.left,top:reorder.lift.top}}>
        <PosterArtwork src={lifted.posterPath} type={lifted.type}/>
      </div>, document.body)}
      {options && <MoveTitleMenu request={{...options, source:title, sourceLabel:title, targets:[]}}
        onClose={() => setOptions(null)} onMove={() => {}} onOpen={() => { onPosterClick(options.title); setOptions(null); }}
        onRemove={onDeleteClick ? () => { onDeleteClick(options.title); setOptions(null); } : undefined}/>}

    </section>
  );
};

export default PosterRow;
