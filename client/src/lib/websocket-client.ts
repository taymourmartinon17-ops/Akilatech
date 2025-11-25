/**
 * WebSocket client for receiving weight updates from admin
 * Triggers automatic local recalculation when weight settings change
 */

export interface WebSocketWeightUpdate {
  type: 'weight_update';
  data: {
    riskLateDaysWeight: number;
    riskOutstandingAtRiskWeight: number;
    riskParPerLoanWeight: number;
    riskReschedulesWeight: number;
    riskPaymentConsistencyWeight: number;
    riskDelayedInstalmentsWeight: number;
    urgencyRiskScoreWeight: number;
    urgencyDaysSinceVisitWeight: number;
    urgencyFeedbackScoreWeight: number;
    feedbackPaymentWillingnessWeight: number;
    feedbackFinancialSituationWeight: number;
    feedbackCommunicationQualityWeight: number;
    feedbackComplianceCooperationWeight: number;
    feedbackFutureOutlookWeight: number;
  };
}

export interface WebSocketVisitCompletion {
  type: 'visit_completed';
  data: {
    visitId: string;
    clientId: string;
    clientName: string;
    loanOfficerId: string;
  };
}

export type WebSocketMessage = WebSocketWeightUpdate | WebSocketVisitCompletion;

class WebSocketManager {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second
  private isConnecting = false;

  connect() {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.isConnecting = true;
    
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/ws-admin`;
      
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
        this.isConnecting = false;
      };

      this.ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          
          if (message.type === 'weight_update') {
            // Dispatch custom event for React components to listen to
            const customEvent = new CustomEvent('weightsUpdated', { 
              detail: message.data 
            });
            window.dispatchEvent(customEvent);
          } else if (message.type === 'visit_completed') {
            // Dispatch custom event for React components to listen to
            const customEvent = new CustomEvent('visitCompleted', { 
              detail: message.data 
            });
            window.dispatchEvent(customEvent);
          }
        } catch (error) {
          console.error('[WEBSOCKET] Error parsing message:', error);
        }
      };

      this.ws.onclose = () => {
        this.isConnecting = false;
        this.ws = null;
        this.attemptReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('[WEBSOCKET] Connection error:', error);
        this.isConnecting = false;
      };

    } catch (error) {
      console.error('[WEBSOCKET] Failed to create connection:', error);
      this.isConnecting = false;
      this.attemptReconnect();
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff
    
    setTimeout(() => {
      this.connect();
    }, delay);
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

// Create singleton instance
const webSocketManager = new WebSocketManager();

export default webSocketManager;