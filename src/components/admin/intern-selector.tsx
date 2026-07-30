'use client';

import React, { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/core/utils';

export interface InternOption {
  id: string;
  username: string;
  email: string;
  supervisor_id?: string | null;
}

interface InternSelectorProps {
  interns: InternOption[];
  selectedInternIds: string[];
  onSelectionChange: (selectedIds: string[]) => void;
  currentSupervisorId: string;
  disabled?: boolean;
}

export function InternSelector({
  interns,
  selectedInternIds,
  onSelectionChange,
  currentSupervisorId,
  disabled = false,
}: InternSelectorProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Filter out interns already assigned to this supervisor
  const availableInterns = interns.filter(
    (intern) => intern.supervisor_id !== currentSupervisorId
  );

  // Filter by search query
  const filteredInterns = availableInterns.filter((intern) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      intern.username.toLowerCase().includes(query) ||
      intern.email.toLowerCase().includes(query)
    );
  });

  const toggleIntern = (internId: string) => {
    const newSelection = selectedInternIds.includes(internId)
      ? selectedInternIds.filter((id) => id !== internId)
      : [...selectedInternIds, internId];
    onSelectionChange(newSelection);
  };

  const selectedInterns = availableInterns.filter((intern) =>
    selectedInternIds.includes(intern.id)
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
          disabled={disabled || availableInterns.length === 0}
        >
          {selectedInterns.length > 0 ? (
            <span className="truncate">
              {selectedInterns.length} intern{selectedInterns.length !== 1 ? 's' : ''} selected
            </span>
          ) : (
            <span className="text-muted-foreground">Select interns...</span>
          )}
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(400px,calc(100vw-2rem))] p-0" align="start">
        <div className="p-2">
          <div className="flex items-center justify-between mb-2 px-2">
            <span className="text-sm font-medium">Select Interns</span>
            {selectedInterns.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onSelectionChange([])}
                className="h-6 text-xs"
              >
                Clear
              </Button>
            )}
          </div>

          <div className="px-2 pb-2">
            <Input
              placeholder="Search interns..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          {availableInterns.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No available interns
            </div>
          ) : filteredInterns.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No interns found matching &quot;{searchQuery}&quot;
            </div>
          ) : (
            <div className="max-h-[300px] overflow-y-auto px-2">
              <div className="space-y-1">
                {filteredInterns.map((intern) => {
                  const isSelected = selectedInternIds.includes(intern.id);
                  return (
                    <div
                      key={intern.id}
                      className={cn(
                        'flex items-center gap-2 rounded-md px-2 py-2 cursor-pointer hover:bg-accent',
                        isSelected && 'bg-accent'
                      )}
                      onClick={() => toggleIntern(intern.id)}
                    >
                      <div
                        className={cn(
                          'flex h-4 w-4 items-center justify-center rounded border border-primary',
                          isSelected
                            ? 'bg-primary text-primary-foreground'
                            : 'opacity-50 [&_svg]:invisible'
                        )}
                      >
                        <Check className="h-3 w-3" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">
                          {intern.username}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {intern.email}
                        </div>
                      </div>
                      {intern.supervisor_id && intern.supervisor_id !== currentSupervisorId && (
                        <Badge variant="secondary" className="text-xs">
                          Assigned
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {selectedInterns.length > 0 && (
            <div className="mt-2 pt-2 border-t">
              <div className="text-xs text-muted-foreground px-2">
                {selectedInterns.length} intern{selectedInterns.length !== 1 ? 's' : ''} will be assigned
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
