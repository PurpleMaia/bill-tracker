'use client';

import React, { useLayoutEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { DialogDescription } from '@radix-ui/react-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Download } from 'lucide-react';
import { useAuth } from '@/hooks/contexts/auth-context';
import { useBills } from '@/hooks/contexts/bills-context';
import { useKanbanBoard } from '@/hooks/contexts/kanban-board-context';
import { useToast } from '@/hooks/use-toast';
import { useTrack } from '@/hooks/use-track';
import { filterBills, hasActiveFilters } from '@/lib/bills/bill-filters';
import { billsToCsv, billsToRows, type ExportFormat } from '@/lib/bills/bills-csv';
import type { Bill } from '@/types/legislation';

interface ExportCsvDialogProps {
  /** Optional custom trigger. Defaults to a standard primary "Export" button. */
  children?: React.ReactNode;
  /**
   * Controlled mode, for opening from a menu item (e.g. the avatar menu) rather
   * than a trigger. When `open` is given, no trigger is rendered.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * Whether "Apply current search & filters" starts checked. Off when opened
   * away from the board (e.g. the avatar menu on Discover), where the board's
   * saved filters aren't on screen and would silently drop bills. The option
   * still shows, so the user can opt in.
   */
  applyFiltersByDefault?: boolean;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function ExportCsvDialog({ children, open, onOpenChange, applyFiltersByDefault = true }: ExportCsvDialogProps) {
  const { activeTenant, memberships } = useAuth();
  const track = useTrack();
  const { viewMode, showArchived } = useBills();
  const { searchQuery, selectedTagIds, selectedYears, deadFilter, view } = useKanbanBoard();
  const { toast } = useToast();
  const belongsToOrg = memberships.length > 0;

  const boardFilters = {
    searchQuery,
    selectedTagIds,
    selectedYears,
    // The failed/active filter is only exposed (and only applied) in the
    // spreadsheet view — don't let a stale value narrow a kanban export.
    deadFilter: view === 'spreadsheet' ? deadFilter : ('all' as const),
  };
  const filtersActive = hasActiveFilters(boardFilters);

  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const controlled = open !== undefined;
  const isOpen = controlled ? open : uncontrolledOpen;
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [includeAllOrg, setIncludeAllOrg] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [applyBoardFilters, setApplyBoardFilters] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  // Seed the options from the current board view so the default is
  // "export what I'm looking at"; users can still widen before download. Runs
  // on every open, whether a trigger or a controlling parent opened it.
  useLayoutEffect(() => {
    if (!isOpen) return;
    setIncludeAllOrg(belongsToOrg && viewMode === 'all-bills');
    setIncludeArchived(showArchived);
    setApplyBoardFilters(applyFiltersByDefault);
    // Seed once per open, not on every board change while it's showing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleOpenChange = (next: boolean) => {
    if (controlled) onOpenChange?.(next);
    else setUncontrolledOpen(next);
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const viewMode = includeAllOrg ? 'all-bills' : 'my-bills';
      const params = new URLSearchParams({
        viewMode,
        showArchived: String(includeArchived),
      });
      if (activeTenant?.tenantId) {
        params.set('tenantId', activeTenant.tenantId);
      }

      const res = await fetch(`/api/bills?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch bills: ${res.status}`);
      }
      const { bills } = (await res.json()) as { bills: Bill[] };
      let safeBills = bills ?? [];
      if (filtersActive && applyBoardFilters) {
        // Same predicate the board uses, so the file matches what's on screen.
        safeBills = filterBills(safeBills, boardFilters);
      }

      if (format === 'xlsx') {
        // Dynamically import SheetJS so it stays out of the main bundle.
        const XLSX = await import('xlsx');
        const worksheet = XLSX.utils.aoa_to_sheet(billsToRows(safeBills));
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Bills');
        const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        downloadBlob(
          new Blob([buffer], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          }),
          'bills_export.xlsx'
        );
      } else {
        const csv = billsToCsv(safeBills);
        downloadBlob(
          new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
          'bills_export.csv'
        );
      }

      toast({
        title: 'Export ready',
        description: `Downloaded ${safeBills.length} bill${safeBills.length === 1 ? '' : 's'}.`,
      });
      track('csv_exported', { rowCount: safeBills.length });
      handleOpenChange(false);
    } catch (error) {
      console.error('Error exporting bills:', error);
      toast({
        variant: 'destructive',
        title: 'Export failed',
        description: 'Could not fetch bills. Please try again.',
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      {!controlled && (
        <DialogTrigger asChild>
          {children ?? (
            <Button>
              <Download /> Export
            </Button>
          )}
        </DialogTrigger>
      )}

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export Bills</DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            Download the bills you track as a spreadsheet.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm">Format</Label>
            <RadioGroup
              value={format}
              onValueChange={(value) => setFormat(value as ExportFormat)}
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="csv" id="format-csv" />
                <Label htmlFor="format-csv" className="text-sm font-normal">
                  CSV (.csv)
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="xlsx" id="format-xlsx" />
                <Label htmlFor="format-xlsx" className="text-sm font-normal">
                  Excel (.xlsx)
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-3 border-t pt-3">
            {filtersActive && (
              <div className="flex items-start gap-2">
                <Checkbox
                  id="export-apply-filters"
                  checked={applyBoardFilters}
                  onCheckedChange={(checked) => setApplyBoardFilters(checked === true)}
                />
                <Label htmlFor="export-apply-filters" className="text-sm font-normal leading-tight">
                  Apply current search &amp; filters
                </Label>
              </div>
            )}
            {belongsToOrg && (
              <div className="flex items-start gap-2">
                <Checkbox
                  id="export-all-org"
                  checked={includeAllOrg}
                  onCheckedChange={(checked) => setIncludeAllOrg(checked === true)}
                />
                <Label htmlFor="export-all-org" className="text-sm font-normal leading-tight">
                  Export all bills in my organization
                </Label>
              </div>
            )}
            <div className="flex items-start gap-2">
              <Checkbox
                id="export-archived"
                checked={includeArchived}
                onCheckedChange={(checked) => setIncludeArchived(checked === true)}
              />
              <Label htmlFor="export-archived" className="text-sm font-normal leading-tight">
                Include archived bills
              </Label>
            </div>
          </div>

          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isExporting}>
              Cancel
            </Button>
            <Button onClick={handleExport} disabled={isExporting}>
              {isExporting ? 'Exporting...' : 'Download'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
