import { SIMPLIFIED_COLUMNS } from "@/lib/kanban-columns";
import { cn } from '@/lib/utils';

/**
 * Loading placeholders that mirror the real board: same exact-fit column
 * widths, flat phase-tinted backgrounds, header row (title · count · help),
 * and card proportions.
 */

/** Echo getColumnPhaseBg's palette without per-column logic. */
const PHASE_BGS = ['bg-olive-soft', 'bg-secondary/50'];

export const KanbanColumnSkeleton = ({ index = 0 }: { index?: number }) => {
    return (
    <div
    className={cn(
        "flex h-full shrink-0 flex-col rounded-lg animate-pulse",
        PHASE_BGS[index % PHASE_BGS.length],
        "w-[calc(100vw-1rem)] sm:w-[calc((100vw-1.5rem)/2)] md:w-[calc((100vw-3rem)/2)]",
        "lg:w-[calc((100vw-4rem)/3)] xl:w-[calc((100vw-5rem)/4)] 2xl:w-[calc((100vw-6rem)/5)]",
    )}
    >
        {/* Header — title, count, help icon */}
        <div className="flex items-center justify-between gap-2 rounded-t-lg p-3">
          <div className="flex items-center gap-2">
            <div className="h-4 w-28 bg-foreground/10 rounded"></div>
            <div className="h-4 w-6 bg-foreground/10 rounded"></div>
          </div>
          <div className="h-4 w-4 bg-foreground/10 rounded-full"></div>
        </div>

        <div className="flex-1 p-2">
          <div className="flex flex-col gap-2">
            {/* Vary card count per column so the board doesn't look stamped */}
            {Array.from({ length: 2 + (index % 3) }).map((_, cardIndex) => (
              <KanbanCardSkeleton key={`skeleton-${cardIndex}`} />
            ))}
          </div>
        </div>
      </div>
    )
}

export const KanbanCardSkeleton = () => {
    return (
        <div className="rounded-lg border bg-card p-3 pb-2 shadow-sm animate-pulse">
            {/* Bill number + badge row */}
            <div className="flex items-center gap-1.5 mb-2">
                <div className="h-4 w-16 bg-muted rounded"></div>
                <div className="h-4 w-10 bg-muted rounded-md"></div>
            </div>

            {/* Title lines */}
            <div className="space-y-2">
                <div className="h-3 w-full bg-muted rounded"></div>
                <div className="h-3 w-2/3 bg-muted rounded"></div>
            </div>

            {/* Footer — status text + tag chip */}
            <div className="flex justify-between items-center mt-3 mb-1">
                <div className="h-3 w-20 bg-muted rounded"></div>
                <div className="h-5 w-12 bg-muted rounded-full"></div>
            </div>
        </div>
    )
}

export default function KanbanBoardSkeleton({ columns = SIMPLIFIED_COLUMNS.length }: { columns?: number }) {
    // Spacing mirrors the real board's column wrapper so the swap to live
    // content doesn't shift anything.
    return (
        <div className="flex h-full space-x-2 md:space-x-4 pb-4 overflow-hidden">
            {Array.from({ length: columns }).map((_, index) => (
                <KanbanColumnSkeleton
                key={`column-skeleton-${index}`}
                index={index}
                />
            ))}
        </div>
    )
}
