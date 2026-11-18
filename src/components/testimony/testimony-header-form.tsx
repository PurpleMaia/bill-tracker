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

// Compact on phones so the editor sits higher and stays above the keyboard.
// Inputs keep their 16px text there so iOS doesn't zoom in on focus.
const LABEL = 'text-xs sm:text-sm';

export function TestimonyHeaderForm({ value, onChange }: TestimonyHeaderFormProps) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-lg border bg-card p-3 sm:gap-4 sm:p-4">
      <div className="space-y-1 sm:space-y-1.5">
        <Label htmlFor="testimony-author" className={LABEL}>
          Your name
        </Label>
        <Input
          id="testimony-author"
          value={value.authorName}
          placeholder="Jane Doe"
          className="h-9 px-2.5 sm:h-10 sm:px-3"
          onChange={(e) => onChange({ ...value, authorName: e.target.value })}
        />
      </div>
      <div className="space-y-1 sm:space-y-1.5">
        <Label htmlFor="testimony-org" className={LABEL}>
          Organization (optional)
        </Label>
        <Input
          id="testimony-org"
          value={value.organization}
          placeholder="Representing myself"
          className="h-9 px-2.5 sm:h-10 sm:px-3"
          onChange={(e) => onChange({ ...value, organization: e.target.value })}
        />
      </div>
      <div className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1 sm:block sm:space-y-1.5">
        <Label className={LABEL}>Position</Label>
        <RadioGroup
          value={value.position}
          onValueChange={(position) => onChange({ ...value, position: position as TestimonyPosition })}
          className="flex flex-wrap gap-3 sm:gap-4"
        >
          {POSITION_LABELS.map((option) => (
            <div key={option.value} className="flex items-center gap-1.5">
              <RadioGroupItem value={option.value} id={`position-${option.value}`} />
              <Label htmlFor={`position-${option.value}`} className={`${LABEL} font-normal`}>
                {option.label}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>
    </div>
  );
}
