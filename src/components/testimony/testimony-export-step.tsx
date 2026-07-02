'use client';

import { useState } from 'react';
import type { BillDetails } from '@/types/legislation';
import type { TestimonyMeta } from '@/lib/testimony-export/blocks';
import { tiptapToBlocks } from '@/lib/testimony-export/blocks';
import { downloadBlob } from '@/lib/testimony-export/download';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { TestimonyPreview } from './testimony-preview';
import type { TestimonyHeaderValue } from './testimony-header-form';
import { ArrowLeft, ArrowRight, FileDown, Loader2 } from 'lucide-react';

interface TestimonyExportStepProps {
  bill: BillDetails;
  form: TestimonyHeaderValue;
  contentJson: unknown;
  onBack: () => void;
  onNext: () => void;
}

export function TestimonyExportStep({ bill, form, contentJson, onBack, onNext }: TestimonyExportStepProps) {
  const [generating, setGenerating] = useState<'pdf' | 'docx' | null>(null);

  const meta: TestimonyMeta = {
    billNumber: bill.bill_number,
    billTitle: bill.bill_title,
    committee: bill.committee_assignment || null,
    position: form.position,
    authorName: form.authorName || 'Anonymous',
    organization: form.organization,
    dateStr: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
  };

  const handleDownload = async (format: 'pdf' | 'docx') => {
    setGenerating(format);
    try {
      const blocks = tiptapToBlocks(contentJson);
      const filename = `${bill.bill_number.replace(/\s+/g, '')}-testimony.${format}`;
      if (format === 'pdf') {
        const { generateTestimonyPdf } = await import('@/lib/testimony-export/to-pdf');
        downloadBlob(await generateTestimonyPdf(meta, blocks), filename);
      } else {
        const { generateTestimonyDocx } = await import('@/lib/testimony-export/to-docx');
        downloadBlob(await generateTestimonyDocx(meta, blocks), filename);
      }
    } catch (error) {
      console.error('Testimony export failed:', error);
      toast({ title: 'Export failed', description: `Could not generate the ${format.toUpperCase()} file.`, variant: 'destructive' });
    } finally {
      setGenerating(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Review your testimony, then download it. The PDF uses a standard font; the DOCX keeps your chosen fonts.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={generating !== null} onClick={() => handleDownload('pdf')}>
            {generating === 'pdf' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileDown className="mr-1.5 h-3.5 w-3.5" />}
            Download PDF
          </Button>
          <Button variant="outline" size="sm" disabled={generating !== null} onClick={() => handleDownload('docx')}>
            {generating === 'docx' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileDown className="mr-1.5 h-3.5 w-3.5" />}
            Download DOCX
          </Button>
        </div>
      </div>

      <TestimonyPreview meta={meta} contentJson={contentJson} />

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back: Write
        </Button>
        <Button onClick={onNext}>
          Next: Submit
          <ArrowRight className="ml-1.5 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
