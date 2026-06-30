'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { X, Plus, Edit2, Trash2 } from 'lucide-react';
import { getAllTags, createTag, updateTag, deleteTag } from '@/db/queries/tags';
import type { Tag } from '@/types/legislation';
import { toast } from '@/hooks/use-toast';
import { useBills } from '@/hooks/contexts/bills-context';
import { useAuth } from '@/hooks/contexts/auth-context';

interface TagManagementDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TagManagementDialog({ isOpen, onClose }: TagManagementDialogProps) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3b82f6');
  const { refreshBills } = useBills();
  const { activeTenant } = useAuth();

  console.log('TagManagementDialog render, isOpen:', isOpen);

  useEffect(() => {
    console.log('TagManagementDialog isOpen changed:', isOpen);
    if (isOpen) {
      loadTags();
    }
  }, [isOpen]);

  const loadTags = async () => {
    setLoading(true);
    try {
      if (!activeTenant) return;
      const fetchedTags = await getAllTags(activeTenant.tenantId);
      setTags(fetchedTags);
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

  const handleCreateTag = async () => {
    if (!newTagName.trim()) {
      toast({
        title: 'Error',
        description: 'Tag name is required',
        variant: 'destructive',
      });
      return;
    }

    try {
      const newTag = await createTag(newTagName.trim(), newTagColor, activeTenant!.tenantId);
      setTags([...tags, newTag]);
      setNewTagName('');
      toast({
        title: 'Success',
        description: 'Tag created successfully',
      });      
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create tag',
        variant: 'destructive',
      });
    }
  };

  const handleUpdateTag = async (tag: Tag) => {
    if (!tag.name.trim()) {
      toast({
        title: 'Error',
        description: 'Tag name is required',
        variant: 'destructive',
      });
      return;
    }

    try {
      const updatedTag = await updateTag(tag.id, tag.name.trim(), tag.color || undefined, activeTenant!.tenantId);
      setTags(tags.map(t => t.id === tag.id ? updatedTag : t));
      setEditingTag(null);
      toast({
        title: 'Success',
        description: 'Tag updated successfully',
      });
      // Refresh bills to update tag display
      await refreshBills();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update tag',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteTag = async (tagId: string) => {
    if (!confirm('Are you sure you want to delete this tag? This will remove it from all bills.')) {
      return;
    }

    try {
      await deleteTag(tagId, activeTenant!.tenantId);
      setTags(tags.filter(t => t.id !== tagId));
      toast({
        title: 'Success',
        description: 'Tag deleted successfully',
      });
      // Refresh bills to remove deleted tag from bills
      await refreshBills();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete tag',
        variant: 'destructive',
      });
    }
  };

  const startEditing = (tag: Tag) => {
    setEditingTag({ ...tag });
  };

  const cancelEditing = () => {
    setEditingTag(null);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        onClose();
      }
    }}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Tags</DialogTitle>
          <DialogDescription>
            Create, edit, and delete tags. Tags can be used to filter bills.
          </DialogDescription>
        </DialogHeader>

        {/* Create new tag */}
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Tag name"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCreateTag();
                }
              }}
            />
            <input
              type="color"
              value={newTagColor}
              onChange={(e) => setNewTagColor(e.target.value)}
              className="w-16 h-10 rounded border"
            />
            <Button onClick={handleCreateTag}>
              <Plus className="h-4 w-4 mr-2" />
              Add Tag
            </Button>
          </div>

          {/* Tags list */}
          <div className="space-y-2">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading tags...</p>
            ) : tags.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tags yet. Create your first tag above.</p>
            ) : (
              tags.map((tag) => (
                <div
                  key={tag.id}
                  className="flex items-center gap-2 p-2 border rounded-lg"
                >
                  {editingTag?.id === tag.id ? (
                    <>
                      <Input
                        value={editingTag.name}
                        onChange={(e) =>
                          setEditingTag({ ...editingTag, name: e.target.value })
                        }
                        className="flex-1"
                      />
                      <input
                        type="color"
                        value={editingTag.color || '#3b82f6'}
                        onChange={(e) =>
                          setEditingTag({ ...editingTag, color: e.target.value })
                        }
                        className="w-12 h-10 rounded border"
                      />
                      <Button
                        size="sm"
                        onClick={() => handleUpdateTag(editingTag)}
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={cancelEditing}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <Badge
                        style={{
                          backgroundColor: tag.color || '#3b82f6',
                          color: 'white',
                        }}
                        className="flex-1 justify-start"
                      >
                        {tag.name}
                      </Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => startEditing(tag)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteTag(tag.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

