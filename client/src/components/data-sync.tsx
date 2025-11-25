import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface SyncStatus {
  status: 'success' | 'error' | 'in_progress' | 'never_synced';
  lastSyncTime: string | null;
  recordsProcessed?: number;
  errorMessage?: string;
  progressPercentage?: number;
  currentStep?: string;
}


interface DataSyncProps {
  onSyncComplete: () => void;
}

export function DataSync({ onSyncComplete }: DataSyncProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [excelUrl, setExcelUrl] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [syncMethod, setSyncMethod] = useState<'url' | 'upload'>('url');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: syncStatus, refetch: refetchSyncStatus } = useQuery<SyncStatus>({
    queryKey: ['/api/sync/status'],
    refetchInterval: 5000, // Refresh every 5 seconds
  });


  const syncMutation = useMutation({
    mutationFn: async (url: string) => {
      return apiRequest('POST', '/api/sync', { excelUrl: url });
    },
    onSuccess: (data) => {
      toast({
        title: "Data Sync Started",
        description: `Processing data from your Excel file...`,
      });
      refetchSyncStatus();
      queryClient.invalidateQueries({ queryKey: ['/api/clients'] });
      onSyncComplete();
    },
    onError: (error: any) => {
      toast({
        title: "Sync Failed",
        description: error?.message || "Failed to start data sync. Please check your URL and try again.",
        variant: "destructive",
      });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('excelFile', file);
      
      const response = await fetch('/api/sync/upload', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Upload failed' }));
        throw new Error(errorData.message || 'Upload failed');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Excel Upload Started",
        description: `Processing uploaded file: ${data.filename || uploadFile?.name}...`,
      });
      refetchSyncStatus();
      queryClient.invalidateQueries({ queryKey: ['/api/clients'] });
      onSyncComplete();
    },
    onError: (error: any) => {
      toast({
        title: "Upload Failed",
        description: error?.message || "Failed to upload Excel file. Please check your file and try again.",
        variant: "destructive",
      });
    },
  });

  const handleSync = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (syncMethod === 'url') {
      if (!excelUrl.trim()) {
        toast({
          title: "URL Required",
          description: "Please enter a valid Excel file URL.",
          variant: "destructive",
        });
        return;
      }
      syncMutation.mutate(excelUrl);
    } else {
      if (!uploadFile) {
        toast({
          title: "File Required",
          description: "Please select an Excel file to upload.",
          variant: "destructive",
        });
        return;
      }
      
      // Check file type
      const allowedTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        'application/vnd.ms-excel' // .xls
      ];
      
      if (!allowedTypes.includes(uploadFile.type) && !uploadFile.name.toLowerCase().match(/\.(xlsx|xls)$/)) {
        toast({
          title: "Invalid File Type",
          description: "Please select a valid Excel file (.xlsx or .xls).",
          variant: "destructive",
        });
        return;
      }
      
      uploadMutation.mutate(uploadFile);
    }
    
    setIsOpen(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadFile(file);
    }
  };

  // Clear form data when switching methods
  const handleMethodChange = (method: 'url' | 'upload') => {
    setSyncMethod(method);
    if (method === 'url') {
      setUploadFile(null);
    } else {
      setExcelUrl('');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
      case 'error':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
      case 'never_synced':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'success':
        return 'Connected';
      case 'error':
        return 'Error';
      case 'in_progress':
        return 'Syncing...';
      case 'never_synced':
        return 'Not Connected';
      default:
        return 'Unknown';
    }
  };

  const formatLastSync = (lastSyncTime: string | null) => {
    if (!lastSyncTime) return "Never";
    
    const diff = Date.now() - new Date(lastSyncTime).getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes} minutes ago`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hours ago`;
    
    const days = Math.floor(hours / 24);
    return `${days} days ago`;
  };

  return (
    <Card className="mb-6" data-testid="data-sync-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Data Connection</CardTitle>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-connect-data">
                <i className="fas fa-link mr-2"></i>
                Connect Data Source
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md" data-testid="data-sync-modal">
              <DialogHeader>
                <DialogTitle>Connect Excel Data Source</DialogTitle>
              </DialogHeader>
              
              <form onSubmit={handleSync} className="space-y-4" data-testid="sync-form">
                {/* Method Selection */}
                <div className="space-y-3">
                  <Label className="block text-sm font-medium text-foreground">Data Source Method</Label>
                  <div className="flex space-x-4">
                    <label className="flex items-center space-x-2">
                      <input
                        type="radio"
                        name="syncMethod"
                        value="url"
                        checked={syncMethod === 'url'}
                        onChange={(e) => handleMethodChange(e.target.value as 'url' | 'upload')}
                        className="text-primary"
                      />
                      <span className="text-sm">URL Link</span>
                    </label>
                    <label className="flex items-center space-x-2">
                      <input
                        type="radio"
                        name="syncMethod"
                        value="upload"
                        checked={syncMethod === 'upload'}
                        onChange={(e) => handleMethodChange(e.target.value as 'url' | 'upload')}
                        className="text-primary"
                      />
                      <span className="text-sm">Upload File</span>
                    </label>
                  </div>
                </div>

                {/* URL Input */}
                {syncMethod === 'url' && (
                  <div>
                    <Label htmlFor="excelUrl" className="block text-sm font-medium text-foreground mb-2">
                      Excel File URL
                    </Label>
                    <Input
                      type="url"
                      id="excelUrl"
                      placeholder="https://your-excel-file-url.com/data.xlsx"
                      value={excelUrl}
                      onChange={(e) => setExcelUrl(e.target.value)}
                      className="w-full"
                      data-testid="input-excel-url"
                    />
                    <p className="text-sm text-muted-foreground mt-2">
                      Enter a public URL to your Excel file on OneDrive, SharePoint, or any accessible location.
                    </p>
                  </div>
                )}

                {/* File Upload */}
                {syncMethod === 'upload' && (
                  <div>
                    <Label htmlFor="excelFile" className="block text-sm font-medium text-foreground mb-2">
                      Excel File Upload
                    </Label>
                    <Input
                      type="file"
                      id="excelFile"
                      accept=".xlsx,.xls"
                      onChange={handleFileChange}
                      className="w-full"
                      data-testid="input-excel-file"
                    />
                    {uploadFile && (
                      <p className="text-sm text-green-600 mt-2">
                        Selected: {uploadFile.name} ({(uploadFile.size / 1024 / 1024).toFixed(2)} MB)
                      </p>
                    )}
                    <p className="text-sm text-muted-foreground mt-2">
                      Select an Excel file (.xlsx or .xls) from your computer to upload and process.
                    </p>
                  </div>
                )}
                
                <div className="pt-4 flex space-x-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setIsOpen(false)}
                    data-testid="button-cancel"
                  >
                    <i className="fas fa-times mr-2"></i>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={syncMutation.isPending || uploadMutation.isPending}
                    data-testid="button-sync"
                  >
                    <i className="fas fa-sync mr-2"></i>
                    {syncMutation.isPending || uploadMutation.isPending 
                      ? (syncMethod === 'upload' ? "Uploading..." : "Connecting...") 
                      : (syncMethod === 'upload' ? "Upload & Process" : "Connect & Sync")
                    }
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium text-foreground">Status:</span>
              <Badge 
                className={`${getStatusColor(syncStatus?.status || 'never_synced')} border-0`}
                data-testid="sync-status-badge"
              >
                {getStatusText(syncStatus?.status || 'never_synced')}
              </Badge>
            </div>
            
            {syncStatus?.status === 'in_progress' && (
              <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                <span>
                  {syncStatus.progressPercentage ? `${Math.round(syncStatus.progressPercentage)}% - ` : ''}
                  {syncStatus.currentStep || 'Processing...'}
                </span>
              </div>
            )}
          </div>
          
          <div className="text-sm text-muted-foreground" data-testid="last-sync-time">
            Last sync: {formatLastSync(syncStatus?.lastSyncTime || null)}
          </div>
        </div>
        
        {syncStatus?.status === 'in_progress' && syncStatus.progressPercentage !== undefined && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Progress</span>
              <span className="text-foreground font-medium">{Math.round(syncStatus.progressPercentage)}%</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div 
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${syncStatus.progressPercentage}%` }}
              ></div>
            </div>
          </div>
        )}

        {(syncStatus?.recordsProcessed || 0) > 0 && syncStatus?.status !== 'in_progress' && (
          <div className="flex items-center space-x-4 text-sm">
            <div className="flex items-center space-x-2">
              <i className="fas fa-users text-primary"></i>
              <span className="text-foreground font-medium">{syncStatus?.recordsProcessed || 0}</span>
              <span className="text-muted-foreground">clients processed</span>
            </div>
          </div>
        )}

        
        {syncStatus?.status === 'error' && syncStatus?.errorMessage && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
            <div className="flex items-start space-x-2">
              <i className="fas fa-exclamation-triangle text-destructive mt-0.5"></i>
              <div>
                <p className="text-sm font-medium text-destructive">Sync Error</p>
                <p className="text-sm text-destructive/80 mt-1" data-testid="error-message">
                  {syncStatus.errorMessage}
                </p>
              </div>
            </div>
          </div>
        )}
        
        <div className="border-t border-border pt-4">
          <h4 className="text-sm font-medium text-foreground mb-2">How to connect your data:</h4>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Upload your Excel file to OneDrive, SharePoint, or make it publicly accessible</li>
            <li>
              <strong>For SharePoint/OneDrive:</strong> Use the sharing link directly - the system will automatically convert it to a download URL
            </li>
            <li>
              <strong>For other services:</strong> Get a direct download link to your Excel file
            </li>
            <li>Click "Connect Data Source" and paste the URL</li>
            <li>Your data will be automatically processed and synced every 30 minutes</li>
          </ol>
          
          <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-md">
            <div className="flex items-start space-x-2">
              <i className="fas fa-info-circle text-blue-600 dark:text-blue-400 mt-0.5"></i>
              <div className="text-sm">
                <p className="font-medium text-blue-800 dark:text-blue-300">SharePoint/OneDrive Tips:</p>
                <ul className="text-blue-700 dark:text-blue-400 mt-1 space-y-1">
                  <li>• SharePoint sharing links are automatically supported</li>
                  <li>• Make sure the file is shared with "Anyone with the link can view"</li>
                  <li>• If you get authentication errors, contact your IT admin for a public link</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}