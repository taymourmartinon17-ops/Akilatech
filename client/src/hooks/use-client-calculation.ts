import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { CalculationService, WeightSettings } from '@/lib/calculation-service';
import { Client } from '@shared/schema';
import { useToast } from '@/hooks/use-toast';
import webSocketManager from '@/lib/websocket-client';

/**
 * Hook for client-side calculation and automatic recalculation
 * Replaces server-side processing with local computation
 */
export function useClientCalculation(loanOfficerId: string, organizationId?: string) {
  const { toast } = useToast();
  const [isRecalculating, setIsRecalculating] = useState(false);

  // Fetch global weight settings (these are the same for all loan officers)
  const { data: weightSettings } = useQuery<WeightSettings>({
    queryKey: ['/api/settings'],
    enabled: !!loanOfficerId && loanOfficerId !== 'ADMIN',
  });

  // Fetch loan officer's clients
  const { data: clients = [], refetch: refetchClients } = useQuery<Client[]>({
    queryKey: ['/api/clients', loanOfficerId],
    enabled: !!loanOfficerId,
  });

  /**
   * Recalculate all scores for current loan officer's clients
   * This runs locally instead of on the server
   */
  const recalculateScores = useCallback(async (newWeights?: WeightSettings) => {
    if (!clients.length || !(newWeights || weightSettings)) return;

    setIsRecalculating(true);
    console.log(`[CLIENT CALC] Starting local recalculation for ${clients.length} clients`);

    try {
      const weightsToUse = newWeights ?? weightSettings!;
      
      // Use our client-side calculation service
      const updatedClients = CalculationService.recalculateClientScores(clients, weightsToUse);
      
      // Update each client in the backend with new scores
      const updatePromises = updatedClients.map(async (client) => {
        return apiRequest('PUT', `/api/clients/${client.id}`, {
          riskScore: client.riskScore,
          compositeUrgency: client.compositeUrgency,
          urgencyClassification: client.urgencyClassification,
          urgencyBreakdown: client.urgencyBreakdown
        });
      });

      await Promise.all(updatePromises);

      // Refresh the client list to show updated scores
      await refetchClients();

      console.log(`[CLIENT CALC] Successfully updated ${updatedClients.length} clients locally`);
      
      toast({
        title: "Scores Updated",
        description: `Recalculated urgency and risk scores for ${updatedClients.length} clients using your current settings.`,
      });

    } catch (error) {
      console.error('[CLIENT CALC] Error during local recalculation:', error);
      toast({
        title: "Calculation Error",
        description: "Failed to recalculate scores. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsRecalculating(false);
    }
  }, [clients, weightSettings, refetchClients, toast]);

  /**
   * Recalculate scores for a single client (when data changes)
   */
  const recalculateSingleClient = useCallback(async (clientId: string, updatedData: Partial<Client>) => {
    if (!weightSettings) return;

    console.log(`[CLIENT CALC] Recalculating single client: ${clientId}`);

    try {
      const client = clients.find(c => c.id === clientId);
      if (!client) return;

      // Merge updated data with existing client data
      const updatedClient = { ...client, ...updatedData };

      // Calculate new scores
      const newRiskScore = CalculationService.calculateRiskScore(updatedClient, weightSettings);
      const { score: newUrgencyScore, breakdown } = CalculationService.calculateUrgencyScore(updatedClient, weightSettings);

      // Calculate classification (this requires all clients for percentile calculation)
      const allClientsWithUpdate = clients.map(c => 
        c.id === clientId 
          ? { ...c, ...updatedData, compositeUrgency: newUrgencyScore }
          : c
      );
      const classifications = CalculationService.calculateUrgencyClassifications(allClientsWithUpdate);
      const newClassification = classifications.get(clientId) || 'Low Urgency';

      // Update the client in the backend
      await apiRequest('PUT', `/api/clients/${clientId}`, {
        ...updatedData,
        riskScore: newRiskScore,
        compositeUrgency: newUrgencyScore,
        urgencyClassification: newClassification,
        urgencyBreakdown: breakdown
      });

      // Refresh the client list
      await refetchClients();

      console.log(`[CLIENT CALC] Updated client ${clientId} with new scores: Risk=${newRiskScore}, Urgency=${newUrgencyScore}, Class=${newClassification}`);

    } catch (error) {
      console.error(`[CLIENT CALC] Error updating single client ${clientId}:`, error);
    }
  }, [clients, weightSettings, refetchClients]);

  /**
   * Listen for weight setting changes and auto-recalculate
   * This includes both WebSocket updates from admin and local changes
   */
  useEffect(() => {
    // Connect to WebSocket for real-time weight updates from admin
    if (loanOfficerId && loanOfficerId !== 'ADMIN') {
      // Set organization ID for proper multi-tenant isolation
      if (organizationId) {
        webSocketManager.setOrganizationId(organizationId);
      }
      webSocketManager.connect();
    }

    // Listen for weight setting updates from admin (both WebSocket and manual triggers)
    const handleWeightUpdate = (event: CustomEvent) => {
      const newWeights = event.detail;
      console.log('[CLIENT CALC] Received weight update from admin via WebSocket, recalculating...');
      recalculateScores(newWeights);
    };

    window.addEventListener('weightsUpdated', handleWeightUpdate as EventListener);
    
    return () => {
      window.removeEventListener('weightsUpdated', handleWeightUpdate as EventListener);
      
      // Only disconnect if this is the only active calculation hook
      if (loanOfficerId && loanOfficerId !== 'ADMIN') {
        webSocketManager.disconnect();
      }
    };
  }, [recalculateScores, loanOfficerId]);

  return {
    clients,
    weightSettings,
    isRecalculating,
    recalculateScores,
    recalculateSingleClient,
    refetchClients
  };
}

/**
 * Hook for admin users to broadcast weight changes to all loan officers
 */
export function useWeightBroadcast() {
  const broadcastWeightUpdate = useCallback((newWeights: WeightSettings) => {
    // Broadcast weight update to all active loan officer sessions
    const event = new CustomEvent('weightsUpdated', { detail: newWeights });
    window.dispatchEvent(event);
    
    console.log('[ADMIN] Broadcasting weight update to all loan officers');
  }, []);

  return { broadcastWeightUpdate };
}