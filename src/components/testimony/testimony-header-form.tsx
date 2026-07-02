'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { TestimonyPosition } from '@/types/testimony';

export interface TestimonyHeaderValue {
  authorName: string;
  organization: string;
  position: TestimonyPosition;
}

interface TestimonyHeaderFormProps {
  value: TestimonyHeaderValue;
  onChange: (value: TestimonyHeaderValue) => void;
}

const POSITION_LABELS: Array<{ value: TestimonyPosition; label: string }> = [
  { value: 'support', label: 'Support' },
  { value: 'oppose', label: 'Oppose' },
  { value: 'comments', label: 'Comments only' },
];

export function TestimonyHeaderForm({ value, onChange }: TestimonyHeaderFormProps) {
  return (
    <div className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="testimony-author">Your name</Label>
        <Input
          id="testimony-author"
          value={value.authorName}
          placeholder="Jane Doe"
          onChange={(e) => onChange({ ...value, authorName: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="testimony-org">Organization (optional)</Label>
        <Input
          id="testimony-org"
          value={value.organization}
          placeholder="Representing myself"
          onChange={(e) => onChange({ ...value, organization: e.target.value })}
        />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label>Position</Label>
        <RadioGroup
          value={value.position}
          onValueChange={(position) => onChange({ ...value, position: position as TestimonyPosition })}
          className="flex flex-wrap gap-4"
        >
          {POSITION_LABELS.map((option) => (
            <div key={option.value} className="flex items-center gap-1.5">
              <RadioGroupItem value={option.value} id={`position-${option.value}`} />
              <Label htmlFor={`position-${option.value}`} className="font-normal">
                {option.label}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>
    </div>
  );
}
