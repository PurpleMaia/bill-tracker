'use client';

import React, { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { getAllTags, getBillTags, updateBillTags } from '@/db/queries/tags';
import type { Tag } from '@/types/legislation';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/contexts/auth-context';
import { useBills } from '@/hooks/contexts/bills-context';

interface TagSelectorProps {
  billId: string;
  onTagsChange?: (tags: Tag[]) => void;
  readOnly?: boolean;
}

export function TagSelector({ billId, onTagsChange, readOnly = false }: TagSelectorProps) {
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { user, activeTenant } = useAuth();
  const { updateBill } = useBills();

  if (!activeTenant) return null;

  // Determine if user can manage tags (admin/supervisor only, unless explicitly read-only)
  const canManageTags = !readOnly && activeTenant?.orgRole === 'admin';

  useEffect(() => {
    loadData();
  }, [billId, activeTenant]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [tags, billTags] = await Promise.all([
        getAllTags(activeTenant.tenantId),
        getBillTags(billId, activeTenant.tenantId),
      ]);
      setAllTags(tags);
      setSelectedTags(billTags);
      if (onTagsChange) {
        onTagsChange(billTags);
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load tags',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleTag = async (tag: Tag) => {
    if (!canManageTags) return;

    const isSelected = selectedTags.some(t => t.id === tag.id);
    let newSelectedTags: Tag[];

    if (isSelected) {
      newSelectedTags = selectedTags.filter(t => t.id !== tag.id);
    } else {
      newSelectedTags = [...selectedTags, tag];
    }

    setSelectedTags(newSelectedTags);
    setSaving(true);

    try {
      const updatedTags = await updateBillTags(
        billId,
        newSelectedTags.map(t => t.id),
        activeTenant.tenantId
      );
      setSelectedTags(updatedTags);
      // Update the bill's tags in the context without refreshing everything
      updateBill(billId, { tags: updatedTags });
      if (onTagsChange) {
        onTagsChange(updatedTags);
      }
      toast({
        title: 'Success',
        description: 'Tags updated successfully',
      });
    } catch (error) {
      // Revert on error
      setSelectedTags(selectedTags);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update tags',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading tags...</div>;
  }

  // Read-only view for public/intern users
  if (!canManageTags) {
    if (selectedTags.length === 0) {
      return (
        <div className="text-sm text-muted-foreground">No tags assigned</div>
      );
    }
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground mb-1">Tags:</p>
        <div className="flex flex-wrap gap-2">
          {selectedTags.map((tag) => (
            <Badge
              key={tag.id}
              variant="outline"
              style={{
                backgroundColor: tag.color || '#3b82f6',
                color: 'white',
              }}
            >
              {tag.name}
            </Badge>
          ))}
        </div>
      </div>
    );
  }

  // Editable view for admin/supervisor
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {allTags.map((tag) => {
          const isSelected = selectedTags.some(t => t.id === tag.id);
          return (
            <Badge
              key={tag.id}
              variant={isSelected ? 'default' : 'outline'}
              style={{
                backgroundColor: isSelected ? (tag.color || '#3b82f6') : undefined,
                color: isSelected ? 'white' : undefined,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.6 : 1,
              }}
              onClick={() => !saving && handleToggleTag(tag)}
              className="cursor-pointer"
            >
              {tag.name}
            </Badge>
          );
        })}
      </div>      
    </div>
  );
}

