import React from 'react';
import { cn } from '@/lib/core/utils';

interface SpreadsheetSkeletonProps {
  className?: string;
  rows?: number;
  columns?: number;
  showHeader?: boolean;
  showRowNumbers?: boolean;
}

export const SpreadsheetSkeleton: React.FC<SpreadsheetSkeletonProps> = ({
  className,
  rows = 8,
  columns = 6,
  showHeader = true,
  showRowNumbers = true
}) => {
  // Generate random widths for more realistic appearance
  const getRandomWidth = () => {
    const widths = ['w-16', 'w-20', 'w-24', 'w-32', 'w-28', 'w-36'];
    return widths[Math.floor(Math.random() * widths.length)];
  };

  return (
    <div className={cn("w-full overflow-hidden rounded-lg border bg-card shadow-sm", className)}>
      {/* Spreadsheet container */}
      <div className="overflow-auto max-h-[600px]">
        <table className="w-full border-collapse">
          {/* Header row */}
          {showHeader && (
            <thead className="sticky top-0 bg-muted/50 border-b">
              <tr>
                {/* Row number header */}
                {showRowNumbers && (
                  <th className="w-12 p-2 border-r bg-muted/30">
                    <div className="h-4 w-6 bg-muted rounded animate-pulse mx-auto"></div>
                  </th>
                )}
                {/* Column headers */}
                {Array.from({ length: columns }).map((_, colIndex) => (
                  <th key={`header-${colIndex}`} className="p-3 border-r text-left">
                    <div className={cn("h-4 bg-muted rounded animate-pulse", getRandomWidth())}></div>
                  </th>
                ))}
              </tr>
            </thead>
          )}

          {/* Data rows */}
          <tbody>
            {Array.from({ length: rows }).map((_, rowIndex) => (
              <tr key={`row-${rowIndex}`} className="border-b hover:bg-muted/20">
                {/* Row number */}
                {showRowNumbers && (
                  <td className="w-12 p-2 border-r bg-muted/10 text-center">
                    <div className="h-3 w-4 bg-muted rounded animate-pulse mx-auto"></div>
                  </td>
                )}
                {/* Data cells */}
                {Array.from({ length: columns }).map((_, colIndex) => (
                  <td key={`cell-${rowIndex}-${colIndex}`} className="p-3 border-r">
                    <SpreadsheetCellSkeleton variant={colIndex % 4} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Individual cell skeleton with different variants for realism
interface SpreadsheetCellSkeletonProps {
  variant: number;
}

const SpreadsheetCellSkeleton: React.FC<SpreadsheetCellSkeletonProps> = ({ variant }) => {
  const variants = [
    // Text content (wide)
    <div key='text' className="h-4 w-32 bg-muted rounded animate-pulse"></div>,
    // Numbers/dates (medium)
    <div key='number' className="h-4 w-20 bg-muted rounded animate-pulse"></div>,
    // Short text (narrow)  
    <div key='short' className="h-4 w-16 bg-muted rounded animate-pulse"></div>,
    // Status/tags (small with different shape)
    <div key='status' className="h-5 w-14 bg-muted rounded-full animate-pulse"></div>
  ];

  return variants[variant] || variants[0];
};

// Compact version for smaller spaces
export const CompactSpreadsheetSkeleton: React.FC<Omit<SpreadsheetSkeletonProps, 'showRowNumbers'>> = ({
  className,
  rows = 5,
  columns = 4,
  showHeader = true
}) => {
  return (
    <SpreadsheetSkeleton
      className={cn("max-h-[300px]", className)}
      rows={rows}
      columns={columns}
      showHeader={showHeader}
      showRowNumbers={false}
    />
  );
};

// Grid-style skeleton (alternative layout)
export const GridSpreadsheetSkeleton: React.FC<SpreadsheetSkeletonProps> = ({
  className,
  rows = 6,
  columns = 4
}) => {
  return (
    <div className={cn("w-full rounded-lg border bg-card p-4", className)}>
      {/* Header */}
      <div className="grid grid-cols-4 gap-4 mb-4 pb-3 border-b">
        {Array.from({ length: columns }).map((_, index) => (
          <div key={`grid-header-${index}`} className="h-4 bg-muted rounded animate-pulse"></div>
        ))}
      </div>

      {/* Data rows */}
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={`grid-row-${rowIndex}`} className="grid grid-cols-4 gap-4">
            {Array.from({ length: columns }).map((_, colIndex) => (
              <div key={`grid-cell-${rowIndex}-${colIndex}`}>
                <div className="h-5 w-14 bg-muted rounded-full animate-pulse"></div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};