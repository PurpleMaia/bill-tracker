'use client';

import React, { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Plus, X } from 'lucide-react';
import { getAllTags, getBillTags, updateBillTags } from '@/services/data/tags';
import type { Tag } from '@/types/legislation';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/contexts/auth-context';
import { useBills } from '@/hooks/contexts/bills-context';

interface CardTagSelectorProps {
  billId: string;
  billTags?: Tag[];
  onTagsChange?: (tags: Tag[]) => void;
}

export function CardTagSelector({ billId, billTags = [], onTagsChange }: CardTagSelectorProps) {
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const { user, activeTenant } = useAuth();
  const { updateBill } = useBills();

  if (!activeTenant) return null;

  const canManageTags = activeTenant?.orgRole === 'admin';

  // Use billTags prop directly for display - no local state sync needed
  const displayTags = billTags || [];

  useEffect(() => {
    if (open && canManageTags) {
      const loadData = async () => {
        setLoading(true);
        try {
          const tags = await getAllTags(activeTenant.tenantId);
          setAllTags(tags);
        } catch (error) {
          console.error('Failed to load tags:', error);
        } finally {
          setLoading(false);
        }
      };
      loadData();
    }
  }, [open, canManageTags]);

  const handleToggleTag = async (tag: Tag) => {
    if (!canManageTags) return;

    const isSelected = displayTags.some(t => t.id === tag.id);
    let newSelectedTags: Tag[];

    if (isSelected) {
      newSelectedTags = displayTags.filter(t => t.id !== tag.id);
    } else {
      newSelectedTags = [...displayTags, tag];
    }

    setSaving(true);

    try {
      const updatedTags = await updateBillTags(
        billId,
        newSelectedTags.map(t => t.id),
        activeTenant.tenantId
      );
      toast({
        title: 'Success',
        description: 'Tags updated successfully',
      });
      // Update the bill's tags in the context without refreshing everything
      updateBill(billId, { tags: updatedTags });
      // Call onTagsChange callback if provided (for optimistic updates)
      if (onTagsChange) {
        onTagsChange(updatedTags);
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update tags',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  // Display tags on card (read-only for non-admin/supervisor)
  if (!canManageTags) {
    if (displayTags.length === 0) {
      return null;
    }
    return (
      <div className="flex flex-wrap gap-1">
        {displayTags.map((tag) => (
          <Badge
            key={tag.id}
            variant="outline"
            style={{
              backgroundColor: tag.color || '#3b82f6',
              color: 'white',
              fontSize: '10px',
              padding: '2px 6px',
            }}
            className="text-[10px] rounded-md"
          >
            {tag.name}
          </Badge>
        ))}
      </div>
    );
  }

  // Admin/supervisor can manage tags
  return (
    <div className="flex align-middle items-center gap-1">
      {/* Display existing tags */}
      {displayTags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {displayTags.map((tag) => (
            <Badge
              key={tag.id}
              variant="outline"
              style={{
                backgroundColor: tag.color || '#3b82f6',
                color: 'white',
                fontSize: '10px',
                padding: '2px 6px',
              }}
              className="text-[10px] rounded-md"
            >
              {tag.name}
              <X
                className="h-2.5 w-2.5 ml-1 cursor-pointer hover:bg-white/20 rounded"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleTag(tag);
                }}
              />
            </Badge>
          ))}
        </div>
      )}

      {/* Add tag button */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button            
            variant="ghost"
            className="h-5 border px-2 py-0.5 text-[10px] rounded-md "
            onClick={(e) => e.stopPropagation()}
          >
            <Plus className="h-1 w-1" />
            { displayTags.length === 0 ? 'Add Tag' : '' }
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3" onClick={(e) => e.stopPropagation()}>
          <div className="space-y-2">
            <p className="text-xs font-semibold mb-2">Select Tags</p>
            {loading ? (
              <p className="text-xs text-muted-foreground">Loading...</p>
            ) : allTags.length === 0 ? (
              <p className="text-xs text-muted-foreground">No tags available</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {allTags.map((tag) => {
                  const isSelected = displayTags.some(t => t.id === tag.id);
                  return (
                    <Badge
                      key={tag.id}
                      variant={isSelected ? 'default' : 'outline'}
                      style={{
                        backgroundColor: isSelected ? (tag.color || '#3b82f6') : undefined,
                        color: isSelected ? 'white' : undefined,
                        cursor: saving ? 'not-allowed' : 'pointer',
                        opacity: saving ? 0.6 : 1,
                        fontSize: '10px',
                        padding: '2px 6px',
                      }}
                      onClick={() => !saving && handleToggleTag(tag)}
                      className="cursor-pointer text-[10px]"
                    >
                      {tag.name}
                    </Badge>
                  );
                })}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

