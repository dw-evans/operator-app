import { useState } from 'react';
import type { FC, FormEvent } from 'react';
import { Lock, RefreshCw, ArrowLeft } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { verifyPin } from '../services/api';

interface AdminPinGateProps {
  onUnlock: () => void;
  onCancel: () => void;
  title?: string;
  description?: string;
}

export const AdminPinGate: FC<AdminPinGateProps> = ({
  onUnlock,
  onCancel,
  title = 'Admin PIN Required',
  description = 'Enter PIN to access document management and admin features.',
}) => {
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const handleVerifyPin = async (e: FormEvent) => {
    e.preventDefault();
    if (!pinInput.trim()) return;

    setPinError(null);
    setIsVerifying(true);

    try {
      const res = await verifyPin(pinInput.trim());
      if (res.valid) {
        onUnlock();
      } else {
        setPinError('Incorrect PIN. Please try again.');
      }
    } catch {
      setPinError('Failed to verify PIN with server. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4 bg-background/50 select-none">
      <Card className="w-full max-w-sm border-border bg-card shadow-xl animate-in fade-in zoom-in-95 duration-150">
        <CardHeader className="text-center pb-3">
          <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-2 border border-primary/20">
            <Lock className="h-6 w-6" />
          </div>
          <CardTitle className="text-lg font-semibold text-foreground">
            {title}
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground pt-1">
            {description}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleVerifyPin} className="space-y-4">
            <div>
              <Input
                type="password"
                autoFocus
                value={pinInput}
                onChange={(e) => {
                  setPinInput(e.target.value);
                  if (pinError) setPinError(null);
                }}
                placeholder="Enter PIN"
                disabled={isVerifying}
                className="text-center text-lg tracking-widest font-mono h-11"
              />
              {pinError && (
                <p className="text-xs text-destructive text-center mt-2 font-medium">
                  {pinError}
                </p>
              )}
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                className="w-1/2 gap-1.5 cursor-pointer"
                onClick={onCancel}
                disabled={isVerifying}
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Cancel</span>
              </Button>
              <Button
                type="submit"
                className="w-1/2 gap-1.5 cursor-pointer"
                disabled={isVerifying || !pinInput.trim()}
              >
                {isVerifying ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <span>Unlock</span>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
