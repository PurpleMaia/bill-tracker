'use client'; 

import { useAuth } from '@/hooks/contexts/auth-context';
import { Switch } from '../ui/switch';
import { useKanbanBoard } from '@/hooks/contexts/kanban-board-context';
import { Label } from '../ui/label';
import NewBillButton from './new-bill/new-bill-button';
import { TrackBillDialog } from './track-bill-dialog';
import { useBills } from '@/hooks/contexts/bills-context';
import { TagFilterList } from '../tags/tag-filter-list';

export function KanbanHeader() {
  const { user, activeTenant } = useAuth();
  const { viewMode, toggleViewMode, showArchived, toggleShowArchived } = useBills();
  const { columnView, setColumnView, selectedTagIds, setSelectedTagIds, selectedYears, setSelectedYears } = useKanbanBoard();

  const isPublic = !user;
  const canAddRemoveBills = activeTenant?.orgRole === 'admin';

  return (
    <div className='p-2 border-b bg-white flex items-center justify-between shadow-md'>
      
        <div className='ml-6'>
          {isPublic ? (
            <div className=''>
              <h2 className="text-md font-semibold">Public View</h2>
              <p className="text-sm text-muted-foreground">All Food+ Tracked Bills</p>
            </div>
          ) : (
            <div className='flex items-center space-x-6'>
              <div className='flex items-center space-x-2'>
                <Switch id='my-bills' checked={viewMode === 'all-bills'} onCheckedChange={toggleViewMode}> View All Bills</Switch>
                <Label htmlFor='my-bills' className='text-md'>All Bills</Label>
              </div>
              <div className='flex items-center space-x-2'>
                <Switch id='show-archived' checked={showArchived} onCheckedChange={toggleShowArchived}> Show Archived</Switch>
                <Label htmlFor='show-archived' className='text-md'>Show Archived</Label>
              </div>
            </div>
          )}
        </div>

        <div className='flex items-center space-x-2 mr-4 py-2'>

            <div className='flex items-center space-x-2'>
              <Switch
                id='column-view'
                checked={columnView === 'detailed'}
                onCheckedChange={(checked) => setColumnView(checked ? 'detailed' : 'simplified')}
              />
              <Label htmlFor='column-view' className='text-md'>Detailed View</Label>
            </div>

            <TagFilterList
              selectedTagIds={selectedTagIds}
              onTagToggle={(tagId: string) => {
                setSelectedTagIds((prev) =>
                  prev.includes(tagId)
                    ? prev.filter((id) => id !== tagId)
                    : [...prev, tagId]
                );
              }}
              selectedYears={selectedYears}
              onYearToggle={(year: number) => {
                setSelectedYears((prev) =>
                  prev.includes(year)
                    ? prev.filter((y) => y !== year)
                    : [...prev, year]
                );
              }}
              onClearFilters={() => {
                setSelectedTagIds([]);
                setSelectedYears([]);
              }}
            />

            {!isPublic && (
              <>
                <TrackBillDialog />
                {canAddRemoveBills && <NewBillButton />}
              </>
            )}
        </div>

    </div>
  );
}