import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Loader2, Check } from "lucide-react";

interface ProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ProgressStatus {
  isRunning: boolean;
  progress: number;
  total: number;
  currentStep: string;
  startTime?: string;
}

export function ProgressModal({ isOpen, onClose }: ProgressModalProps) {
  const [progressStatus, setProgressStatus] = useState<ProgressStatus>({
    isRunning: false,
    progress: 0,
    total: 0,
    currentStep: '',
    startTime: undefined
  });

  useEffect(() => {
    if (!isOpen) return;

    const pollProgress = async () => {
      try {
        const response = await fetch('/api/settings/progress');
        if (response.ok) {
          const status = await response.json();
          setProgressStatus(status);
          
          // Auto-close modal after completion
          if (!status.isRunning && status.progress > 0) {
            setTimeout(() => {
              onClose();
            }, 2000);
          }
        }
      } catch (error) {
        console.error('Error polling progress:', error);
      }
    };

    // Poll every 500ms while modal is open
    const interval = setInterval(pollProgress, 500);
    
    // Initial poll
    pollProgress();

    return () => clearInterval(interval);
  }, [isOpen, onClose]);

  const progressPercentage = progressStatus.total > 0 
    ? Math.round((progressStatus.progress / progressStatus.total) * 100) 
    : 0;

  const isCompleted = !progressStatus.isRunning && progressStatus.progress > 0;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isCompleted ? (
              <>
                <Check className="h-5 w-5 text-green-600" />
                Update Complete
              </>
            ) : (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Updating Client Urgency Scores
              </>
            )}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Progress</span>
              <span>{progressPercentage}%</span>
            </div>
            <Progress value={progressPercentage} className="w-full" />
          </div>
          
          {progressStatus.total > 0 && (
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Clients processed:</span>
              <span>{progressStatus.progress.toLocaleString()} of {progressStatus.total.toLocaleString()}</span>
            </div>
          )}
          
          {progressStatus.currentStep && (
            <div className="text-sm text-muted-foreground">
              <p className="font-medium">Current step:</p>
              <p>{progressStatus.currentStep}</p>
            </div>
          )}
          
          {isCompleted && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-sm text-green-800 font-medium">
                ✓ All client urgency scores have been updated with the new weight settings!
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}