import { Client } from "@shared/schema";

export interface WeightSettings {
  // Risk Score Component Weights (should total 100)
  riskLateDaysWeight: number;
  riskOutstandingAtRiskWeight: number;
  riskParPerLoanWeight: number;
  riskReschedulesWeight: number;
  riskPaymentConsistencyWeight: number;
  riskDelayedInstalmentsWeight: number;
  
  // Urgency Score Component Weights (should total 100)
  urgencyRiskScoreWeight: number;
  urgencyDaysSinceVisitWeight: number;
  urgencyFeedbackScoreWeight: number;
  
  // Feedback Score Component Weights (should total 100)
  feedbackPaymentWillingnessWeight: number;
  feedbackFinancialSituationWeight: number;
  feedbackCommunicationQualityWeight: number;
  feedbackComplianceCooperationWeight: number;
  feedbackFutureOutlookWeight: number;
}

export interface UrgencyBreakdown {
  riskScore: {
    value: number;
    scaledValue: number;
    weight: number;
    normalizedWeight: number;
    contribution: number;
  };
  daysSinceInteraction: {
    value: number;
    scaledValue: number;
    weight: number;
    normalizedWeight: number;
    contribution: number;
  };
  feedbackScore: {
    value: number;
    scaledValue: number;
    weight: number;
    normalizedWeight: number;
    contribution: number;
  };
  finalUrgencyScore: number;
}

/**
 * Client-side calculation service for risk and urgency scoring
 * Replicates the server-side Python ML logic in JavaScript
 */
export class CalculationService {
  /**
   * Calculate continuous risk score using financial indicators
   * Replicates ml-service.py calculate_continuous_risk_score function
   */
  static calculateRiskScore(client: Client, weights: WeightSettings): number {
    // Convert percentage weights to decimals and normalize
    const riskWeights = {
      late_days: weights.riskLateDaysWeight / 100,
      outstanding_at_risk: weights.riskOutstandingAtRiskWeight / 100,
      par_per_loan: weights.riskParPerLoanWeight / 100,
      reschedules: weights.riskReschedulesWeight / 100,
      payment_consistency: weights.riskPaymentConsistencyWeight / 100,
      delayed_instalments: weights.riskDelayedInstalmentsWeight / 100
    };

    // Risk factors with thresholds (matching Python logic)
    const riskFactors = {
      late_days_score: {
        value: client.lateDays || 0,
        weight: riskWeights.late_days,
        max_threshold: 90,
        inverse: false
      },
      outstanding_risk_score: {
        value: client.outstandingAtRisk || 0,
        weight: riskWeights.outstanding_at_risk,
        max_threshold: 10000,
        inverse: false
      },
      par_score: {
        value: client.parPerLoan || 0,
        weight: riskWeights.par_per_loan,
        max_threshold: 1.0,
        inverse: false
      },
      reschedule_score: {
        value: client.countReschedule || 0,
        weight: riskWeights.reschedules,
        max_threshold: 5,
        inverse: false
      },
      payment_consistency_score: {
        value: client.paidInstalments || 0,
        weight: riskWeights.payment_consistency,
        max_threshold: 50,
        inverse: true // Lower paid instalments = higher risk
      },
      delayed_instalments_score: {
        value: client.totalDelayedInstalments || 0,
        weight: riskWeights.delayed_instalments,
        max_threshold: 20,
        inverse: false
      }
    };

    let totalRiskScore = 0;

    // Calculate each risk component
    Object.entries(riskFactors).forEach(([key, factor]) => {
      let normalizedValue = Math.min(factor.value, factor.max_threshold) / factor.max_threshold;
      
      // For inverse factors (payment consistency), flip the value
      if (factor.inverse) {
        normalizedValue = 1 - normalizedValue;
      }
      
      // Handle cases where individual clients have zero financial indicators (data quality issue)
      // Apply minimum baseline risk if client has outstanding amounts but zero indicators
      const hasOutstanding = (client.outstanding || 0) > 0;
      
      if (key === 'late_days_score' && factor.value === 0 && hasOutstanding) {
        normalizedValue = Math.max(normalizedValue, 0.1); // 10% baseline for active loans
      } else if (key === 'outstanding_risk_score' && factor.value === 0 && hasOutstanding) {
        normalizedValue = Math.max(normalizedValue, 0.05); // 5% baseline
      } else if (key === 'par_score' && factor.value === 0 && hasOutstanding) {
        normalizedValue = Math.max(normalizedValue, 0.02); // 2% baseline
      }
      
      // Apply sigmoid transformation for smoother distribution
      const sigmoidValue = 1 / (1 + Math.exp(-6 * (normalizedValue - 0.5)));
      
      // Scale to 0-100 and apply weight
      const componentScore = sigmoidValue * 100 * factor.weight;
      totalRiskScore += componentScore;
    });

    // Normalize to 1-99 range (matching Python logic)
    return Math.max(1, Math.min(99, Math.round(totalRiskScore)));
  }

  /**
   * Calculate days since last interaction (visits OR phone calls)
   * Replicates ml-service.py get_days_since_last_interaction logic
   */
  static calculateDaysSinceLastInteraction(client: Client): number {
    const now = new Date();
    const dates: Date[] = [];
    
    if (client.lastVisitDate) {
      dates.push(new Date(client.lastVisitDate));
    }
    if (client.lastPhoneCallDate) {
      dates.push(new Date(client.lastPhoneCallDate));
    }
    
    if (dates.length > 0) {
      const mostRecent = new Date(Math.max(...dates.map(d => d.getTime())));
      const daysDiff = Math.floor((now.getTime() - mostRecent.getTime()) / (1000 * 60 * 60 * 24));
      return Math.max(0, daysDiff);
    }
    
    return 30; // Default for new clients
  }

  /**
   * Calculate composite urgency score
   * Replicates ml-service.py calculate_composite_urgency function
   */
  static calculateUrgencyScore(client: Client, weights: WeightSettings): { score: number; breakdown: UrgencyBreakdown } {
    // Get component values - always recalculate risk score with current weights
    const riskScore = this.calculateRiskScore(client, weights);
    const daysSinceInteraction = this.calculateDaysSinceLastInteraction(client);
    const feedbackScore = client.feedbackScore || 3;

    // Runtime validation: clamp weights to be non-negative
    const urgencyWeights = {
      risk_score: Math.max(0, weights.urgencyRiskScoreWeight || 0),
      days_since_interaction: Math.max(0, weights.urgencyDaysSinceVisitWeight || 0),
      feedback_score: Math.max(0, weights.urgencyFeedbackScoreWeight || 0)
    };

    const totalWeight = urgencyWeights.risk_score + urgencyWeights.days_since_interaction + urgencyWeights.feedback_score;
    
    // Fallback to safe defaults if total weight is invalid
    if (totalWeight <= 0) {
      console.warn('[URGENCY BUG] Invalid weights detected, using defaults:', {
        originalWeights: weights,
        clampedWeights: urgencyWeights,
        totalWeight
      });
      urgencyWeights.risk_score = 25;
      urgencyWeights.days_since_interaction = 50;
      urgencyWeights.feedback_score = 25;
    }
    
    const finalTotalWeight = urgencyWeights.risk_score + urgencyWeights.days_since_interaction + urgencyWeights.feedback_score;
    const normalizedWeights = {
      risk_score: urgencyWeights.risk_score / finalTotalWeight,
      days_since_interaction: urgencyWeights.days_since_interaction / finalTotalWeight,
      feedback_score: urgencyWeights.feedback_score / finalTotalWeight
    };

    // Debug logging for inverse relationship
    const debugInfo = {
      clientId: client.clientId,
      riskScore,
      daysSinceInteraction,
      feedbackScore,
      weights: urgencyWeights,
      normalizedWeights,
      totalWeight: finalTotalWeight
    };
    console.log('[URGENCY DEBUG]', debugInfo);

    // Scale each component to 0-100 where 100 = most urgent
    
    // 1. Risk score: already 0-100, higher = more urgent
    const riskUrgency = Math.max(0, Math.min(100, riskScore));
    
    // 2. Days since interaction: scale to 0-100, cap at 180 days
    const daysUrgency = Math.min(100, (daysSinceInteraction / 180) * 100);
    
    // 3. Feedback score: convert 1-5 scale to 0-100, inverted (lower feedback = higher urgency)
    const feedbackUrgency = Math.max(0, Math.min(100, (5 - feedbackScore) * 25));

    // Calculate weighted composite urgency
    const compositeUrgency = 
      (riskUrgency * normalizedWeights.risk_score) +
      (daysUrgency * normalizedWeights.days_since_interaction) +
      (feedbackUrgency * normalizedWeights.feedback_score);

    const finalScore = Math.max(0, Math.min(100, Math.round(compositeUrgency * 10) / 10));

    const breakdown: UrgencyBreakdown = {
      riskScore: {
        value: riskScore,
        scaledValue: riskUrgency,
        weight: urgencyWeights.risk_score,
        normalizedWeight: normalizedWeights.risk_score * 100,
        contribution: riskUrgency * normalizedWeights.risk_score
      },
      daysSinceInteraction: {
        value: daysSinceInteraction,
        scaledValue: daysUrgency,
        weight: urgencyWeights.days_since_interaction,
        normalizedWeight: normalizedWeights.days_since_interaction * 100,
        contribution: daysUrgency * normalizedWeights.days_since_interaction
      },
      feedbackScore: {
        value: feedbackScore,
        scaledValue: feedbackUrgency,
        weight: urgencyWeights.feedback_score,
        normalizedWeight: normalizedWeights.feedback_score * 100,
        contribution: feedbackUrgency * normalizedWeights.feedback_score
      },
      finalUrgencyScore: finalScore
    };

    return { score: finalScore, breakdown };
  }

  /**
   * Calculate urgency classification based on fixed score thresholds
   * Matches server-side classification logic exactly
   */
  static calculateUrgencyClassifications(clients: Client[]): Map<string, string> {
    const classifications = new Map<string, string>();
    
    clients.forEach((client) => {
      const urgencyScore = client.compositeUrgency || 0;
      let classification = 'Low Urgency';
      
      // Use same fixed thresholds as server-side
      if (urgencyScore >= 60) {
        classification = 'Extremely Urgent';
      } else if (urgencyScore >= 40) {
        classification = 'Urgent';
      } else if (urgencyScore >= 20) {
        classification = 'Moderately Urgent';
      } else {
        classification = 'Low Urgency';
      }
      
      classifications.set(client.id, classification);
    });
    
    return classifications;
  }

  /**
   * Recalculate all scores for a loan officer's clients
   * This is the main function that replaces server-side processing
   */
  static recalculateClientScores(clients: Client[], weights: WeightSettings): Client[] {
    console.log(`[CLIENT CALC] Recalculating scores for ${clients.length} clients with updated weights`);
    
    // Calculate new risk and urgency scores for all clients
    const updatedClients = clients.map(client => {
      const newRiskScore = this.calculateRiskScore(client, weights);
      const { score: newUrgencyScore, breakdown } = this.calculateUrgencyScore(client, weights);
      
      return {
        ...client,
        riskScore: newRiskScore,
        compositeUrgency: newUrgencyScore,
        urgencyBreakdown: breakdown
      };
    });

    // Calculate new classifications based on updated scores
    const classifications = this.calculateUrgencyClassifications(updatedClients);
    
    // Apply classifications to clients
    const finalClients = updatedClients.map(client => ({
      ...client,
      urgencyClassification: classifications.get(client.id) || 'Low Urgency'
    }));

    console.log(`[CLIENT CALC] Completed score recalculation for ${finalClients.length} clients`);
    return finalClients;
  }
}