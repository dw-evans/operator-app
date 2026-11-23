import type { FC } from 'react';
import { BookOpen, Boxes, ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface AppLauncherProps {
  onSelectApp: (path: string) => void;
}

export const AppLauncher: FC<AppLauncherProps> = ({ onSelectApp }) => {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-background flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-3xl space-y-6">
        <div className="text-center space-y-1.5">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Shop-Floor Workspace
          </h1>
          <p className="text-sm text-muted-foreground">
            Select a tool to get started
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Assembly Instructions Sub-App */}
          <Card
            onClick={() => onSelectApp('/instructions')}
            className="p-6 cursor-pointer border-border hover:border-primary/70 hover:bg-muted/30 transition-all group flex flex-col justify-between gap-5 shadow-sm"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                  <BookOpen className="w-5 h-5" />
                </div>
                <Badge variant="secondary" className="font-mono text-[10px]">
                  Offline-Ready
                </Badge>
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
                  Assembly Instructions
                </h2>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  View live PDF work instructions, pin operator notes, and manage
                  document revisions across slots 1–10.
                </p>
              </div>
            </div>
            <div className="flex items-center text-xs font-medium text-primary gap-1">
              <span>Open Instructions</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </Card>

          {/* Inventory Manager Sub-App */}
          <Card
            onClick={() => onSelectApp('/inventory')}
            className="p-6 cursor-pointer border-border hover:border-emerald-500/70 hover:bg-muted/30 transition-all group flex flex-col justify-between gap-5 shadow-sm"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Boxes className="w-5 h-5" />
                </div>
                <Badge variant="outline" className="font-mono text-[10px] text-emerald-400 border-emerald-500/30">
                  Live Shared DB
                </Badge>
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-foreground group-hover:text-emerald-400 transition-colors">
                  Inventory Manager
                </h2>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Track part revisions, received batches, non-conformant lots, and
                  production stock offsets with a full undoable history ledger.
                </p>
              </div>
            </div>
            <div className="flex items-center text-xs font-medium text-emerald-400 gap-1">
              <span>Open Inventory</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
