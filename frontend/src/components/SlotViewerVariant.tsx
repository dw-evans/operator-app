import type { FC } from 'react';
import { PdfiumViewer } from './PdfiumViewer';
import { Card } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';
import type { DocumentRevision } from '../types';

interface SlotViewerVariantProps {
  slotId: number;
  document: DocumentRevision | null;
  totalFeedbackCount?: number;
  onFeedbackSubmitted?: () => void;
}

export const SlotViewerVariant: FC<SlotViewerVariantProps> = ({
  slotId,
  document,
}) => {
  if (!document) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-center bg-background">
        <Card className="max-w-md p-8 text-center border-border shadow-sm">
          <AlertCircle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-semibold text-lg text-foreground">
            No Manual Uploaded
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Slot {slotId} does not currently have an active instruction manual PDF.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col relative w-full h-full overflow-hidden bg-background">
      <PdfiumViewer url={document.url} />
    </div>
  );
};

export default SlotViewerVariant;
