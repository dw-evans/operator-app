import type { FC } from 'react';
import { BookOpen, Boxes, ScanLine } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface AppLauncherProps {
  onSelectApp: (path: string) => void;
}

export const AppLauncher: FC<AppLauncherProps> = ({ onSelectApp }) => {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-background flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-3xl space-y-6">
        <div className="text-center">
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
            Applications
          </h1>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card
            onClick={() => onSelectApp('/instructions')}
            className="p-6 cursor-pointer border-border hover:border-foreground/30 hover:bg-muted/40 transition-colors flex flex-col items-start gap-3"
          >
            <div className="w-10 h-10 rounded-lg bg-muted border border-border flex items-center justify-center text-foreground">
              <BookOpen className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-foreground">
                Assembly Instructions
              </h2>
              <p className="text-xs text-muted-foreground">
                Work instruction manuals and operator notes
              </p>
            </div>
          </Card>

          <Card
            onClick={() => onSelectApp('/inventory')}
            className="p-6 cursor-pointer border-border hover:border-foreground/30 hover:bg-muted/40 transition-colors flex flex-col items-start gap-3"
          >
            <div className="w-10 h-10 rounded-lg bg-muted border border-border flex items-center justify-center text-foreground">
              <Boxes className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-foreground">
                Inventory Manager
              </h2>
              <p className="text-xs text-muted-foreground">
                Part versions, batches, and stock counts
              </p>
            </div>
          </Card>

          <Card
            onClick={() => onSelectApp('/scanner')}
            className="p-6 cursor-pointer border-border hover:border-foreground/30 hover:bg-muted/40 transition-colors flex flex-col items-start gap-3"
          >
            <div className="w-10 h-10 rounded-lg bg-muted border border-border flex items-center justify-center text-foreground">
              <ScanLine className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-foreground">
                Leg Serial Number Scanner
              </h2>
              <p className="text-xs text-muted-foreground">
                Scan Data Matrix and Code 128 leg serials
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
