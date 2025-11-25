import XLSX from 'xlsx';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';

// Data quality tracking (matching Python implementation)
interface DataQualityReport {
  warnings: string[];
  errors: string[];
  info: string[];
  hasIssues: boolean;
}

let qualityReport: DataQualityReport = {
  warnings: [],
  errors: [],
  info: [],
  hasIssues: false
};

function addWarning(message: string) {
  qualityReport.warnings.push(message);
  console.error(`[DATA WARNING] ${message}`);
}

function addError(message: string) {
  qualityReport.errors.push(message);
  console.error(`[DATA ERROR] ${message}`);
}

function addInfo(message: string) {
  qualityReport.info.push(message);
  console.error(`[DATA INFO] ${message}`);
}

function resetQualityReport() {
  qualityReport = {
    warnings: [],
    errors: [],
    info: [],
    hasIssues: false
  };
}

// Convert SharePoint URL to direct download URL
function convertSharePointUrl(url: string): string {
  try {
    if (url.includes('sharepoint.com') && url.includes(':x:')) {
      if (url.includes('?e=')) {
        url = url.split('?e=')[0];
      }
      
      if (url.includes('/_layouts/15/guestaccess.aspx')) {
        return url;
      } else if (url.includes('/:x:/')) {
        const parts = url.split('/:x:/');
        if (parts.length === 2) {
          const baseUrl = parts[0];
          let filePath = parts[1];
          if (filePath.includes('?')) {
            filePath = filePath.split('?')[0];
          }
          const downloadUrl = `${baseUrl}/_layouts/15/download.aspx?share=${filePath}`;
          return downloadUrl;
        }
      }
    }
    
    if (url.includes('onedrive.live.com')) {
      if (url.includes('?e=')) {
        url = url.split('?e=')[0];
      }
      if (url.includes('/redir?')) {
        return url.replace('/redir?', '/download?');
      } else if (url.includes('/view.aspx')) {
        return url.replace('/view.aspx', '/download.aspx');
      }
    }
    
    return url;
  } catch {
    return url;
  }
}

// Download Excel file from URL or load from local path
async function downloadExcelData(urlOrPath: string): Promise<XLSX.WorkBook> {
  if (!urlOrPath) {
    throw new Error('No URL or file path provided');
  }

  // Check if it's a local file path
  const isLocalPath = (
    urlOrPath.startsWith('/') ||
    urlOrPath.startsWith('./') ||
    urlOrPath.startsWith('../') ||
    urlOrPath.startsWith('uploads/') ||
    (urlOrPath.length > 3 && urlOrPath[1] === ':') ||
    (!urlOrPath.startsWith('http://') && !urlOrPath.startsWith('https://') && fs.existsSync(urlOrPath))
  );

  if (isLocalPath) {
    if (!fs.existsSync(urlOrPath)) {
      throw new Error(`Local file not found: ${urlOrPath}`);
    }

    try {
      const workbook = XLSX.readFile(urlOrPath);
      return workbook;
    } catch (error) {
      throw new Error(`Failed to read local Excel file: ${error}`);
    }
  }

  // Download from URL
  const convertedUrl = convertSharePointUrl(urlOrPath);
  
  return new Promise((resolve, reject) => {
    const protocol = convertedUrl.startsWith('https') ? https : http;
    
    protocol.get(convertedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    }, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Handle redirect
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          downloadExcelData(redirectUrl).then(resolve).catch(reject);
          return;
        }
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download file: HTTP ${response.statusCode}`));
        return;
      }

      const chunks: Buffer[] = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        try {
          const buffer = Buffer.concat(chunks);
          const workbook = XLSX.read(buffer, { type: 'buffer' });
          resolve(workbook);
        } catch (error) {
          reject(new Error(`Failed to parse Excel file: ${error}`));
        }
      });
    }).on('error', (error) => {
      reject(new Error(`Failed to download file: ${error.message}`));
    });
  });
}

// Fuzzy column matching
function findFuzzyColumn(columnName: string, availableColumns: string[], threshold: number = 0.8): string | null {
  const normalizedTarget = columnName.toLowerCase().trim();
  
  for (const col of availableColumns) {
    const normalizedCol = col.toLowerCase().trim();
    if (normalizedCol === normalizedTarget) {
      return col;
    }
  }

  // Simple similarity matching
  for (const col of availableColumns) {
    const normalizedCol = col.toLowerCase().trim();
    if (normalizedCol.includes(normalizedTarget) || normalizedTarget.includes(normalizedCol)) {
      const similarity = Math.min(normalizedCol.length, normalizedTarget.length) / Math.max(normalizedCol.length, normalizedTarget.length);
      if (similarity >= threshold) {
        return col;
      }
    }
  }
  
  return null;
}

interface ProcessedRow {
  [key: string]: any;
}

// Prepare data with column mapping and validation
function prepareDataVectorized(workbook: XLSX.WorkBook): { data: ProcessedRow[], featureColumns: string[] } {
  try {
    // Validate workbook has sheets
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new Error('Excel file contains no sheets. Please upload a valid Excel file.');
    }
    
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    if (!worksheet) {
      throw new Error('Excel sheet is empty or corrupted. Please upload a valid Excel file.');
    }
    
    // Convert to JSON with header row
    const rawData: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: null });
    
    if (rawData.length === 0) {
      throw new Error('Excel file contains no data rows. Please upload a file with client data.');
    }
    
    if (!rawData[0] || typeof rawData[0] !== 'object') {
      throw new Error('Excel file has invalid data format. Please ensure the first row contains column headers.');
    }

    addInfo(`Excel file contains ${rawData.length} rows and ${Object.keys(rawData[0]).length} columns`);
    
    // Standardize column names
    const originalColumns = Object.keys(rawData[0]);
    
    // Check for blank or auto-generated header names
    const hasBlankHeaders = originalColumns.some(col => 
      !col || 
      col.trim() === '' || 
      col.startsWith('__EMPTY') || 
      /^Column\d+$/i.test(col) // Auto-generated like "Column1", "Column2"
    );
    
    if (hasBlankHeaders) {
      throw new Error('Excel file has blank or missing column headers. Please ensure the first row contains descriptive column names (e.g., Client ID, Client Name, Outstanding, etc.).');
    }
    
    addInfo(`Column names: ${originalColumns.join(', ')}`);

    // Column mapping
    const columnMapping: Record<string, string> = {
      'client id': 'Client ID',
      'client name': 'Client Name',
      'loan officer id': 'Loan Officer ID',
      'lo id': 'Loan Officer ID',
      'officer id': 'Loan Officer ID',
      'bm id': 'Manager ID',
      'outstanding': 'OUTSTANDING',
      'outstanding at risk': 'Outstanding at risk',
      'at risk': 'Outstanding at risk',
      'par per loan': 'PAR PER LOAN',
      'par': 'PAR PER LOAN',
      'late days': 'late days',
      'days late': 'late days',
      'total delayed instalments': 'total delayed instalments',
      'delayed instalments': 'total delayed instalments',
      'paid instalments': 'paid instalments',
      'instalments paid': 'paid instalments',
      'count_reschedule': 'COUNT_RESCHEDULE',
      'reschedule count': 'COUNT_RESCHEDULE',
      'reschedules': 'COUNT_RESCHEDULE',
      'payment_montly': 'PAYMENT_MONTLY',
      'payment_monthly': 'PAYMENT_MONTLY',
      'payment monthly': 'PAYMENT_MONTLY',
      'monthly payment': 'PAYMENT_MONTLY'
    };

    const mappedColumns = new Set<string>();
    const normalizedColumns = originalColumns.map(col => col.toLowerCase().trim());

    // Process each row
    const processedData = rawData.map(row => {
      const newRow: ProcessedRow = {};
      
      // Apply column mapping
      for (const [oldName, newName] of Object.entries(columnMapping)) {
        const matchingCol = normalizedColumns.find((col, idx) => {
          if (col === oldName) return true;
          const fuzzy = findFuzzyColumn(oldName, [originalColumns[idx]], 0.85);
          return fuzzy !== null;
        });

        if (matchingCol !== undefined) {
          const originalColName = originalColumns[normalizedColumns.indexOf(matchingCol)];
          newRow[newName] = row[originalColName];
          mappedColumns.add(newName);
        }
      }

      // Copy unmapped columns as-is
      for (const originalCol of originalColumns) {
        const normalizedCol = originalCol.toLowerCase().trim();
        const isMapped = Object.values(columnMapping).some(mappedName => 
          newRow.hasOwnProperty(mappedName)
        );
        
        if (!isMapped && !newRow.hasOwnProperty(originalCol)) {
          newRow[originalCol] = row[originalCol];
        }
      }

      return newRow;
    });

    // Debug: Log what columns were successfully mapped
    addInfo(`Successfully mapped columns: ${Array.from(mappedColumns).join(', ')}`);
    
    // Check critical columns
    const criticalColumns = ['Client ID', 'Client Name', 'Loan Officer ID'];
    
    for (const col of criticalColumns) {
      if (!mappedColumns.has(col) && !processedData[0].hasOwnProperty(col)) {
        if (col === 'Loan Officer ID') {
          addError(`Critical column '${col}' is missing - using default 'UNKNOWN'`);
          processedData.forEach(row => row[col] = 'UNKNOWN');
        } else if (col === 'Client ID') {
          addError(`Critical column '${col}' is missing - generating sequential IDs`);
          processedData.forEach((row, i) => row[col] = `CLT-${String(i + 1).padStart(6, '0')}`);
        } else if (col === 'Client Name') {
          addError(`Critical column '${col}' is missing - generating default names`);
          processedData.forEach((row, i) => row[col] = `Client ${i + 1}`);
        }
      }
    }
    
    // Debug: Check first row to see what we have
    if (processedData.length > 0) {
      addInfo(`First row keys: ${Object.keys(processedData[0]).join(', ')}`);
      addInfo(`First row Loan Officer ID: ${processedData[0]['Loan Officer ID']}`);
    }

    // Financial columns with defaults
    const financialColumns: Record<string, number> = {
      'OUTSTANDING': 0,
      'Outstanding at risk': 0,
      'PAR PER LOAN': 0,
      'late days': 0,
      'total delayed instalments': 0,
      'paid instalments': 0,
      'COUNT_RESCHEDULE': 0,
      'PAYMENT_MONTLY': 0
    };

    const missingFinancial: string[] = [];
    for (const [col, defaultValue] of Object.entries(financialColumns)) {
      if (!processedData[0].hasOwnProperty(col)) {
        missingFinancial.push(col);
        processedData.forEach(row => row[col] = defaultValue);
      }
    }

    if (missingFinancial.length > 0) {
      addWarning(`Missing financial columns (using defaults): ${missingFinancial.join(', ')}`);
    }

    // Convert to numeric and validate
    const numericColumns = Object.keys(financialColumns);
    
    for (const col of numericColumns) {
      let conversionErrors = 0;
      let zeroCount = 0;

      processedData.forEach(row => {
        const value = row[col];
        const numValue = typeof value === 'number' ? value : parseFloat(String(value));
        
        if (isNaN(numValue)) {
          conversionErrors++;
          row[col] = 0;
        } else {
          row[col] = numValue;
        }

        if (row[col] === 0) zeroCount++;
      });

      if (conversionErrors > 0) {
        addWarning(
          `Column '${col}': ${conversionErrors} non-numeric values converted to 0 ` +
          `(${((conversionErrors / processedData.length) * 100).toFixed(1)}% of data)`
        );
      }

      if (zeroCount > processedData.length * 0.8 && (col === 'OUTSTANDING' || col === 'late days')) {
        addWarning(
          `Column '${col}': ${zeroCount} zero values (${((zeroCount / processedData.length) * 100).toFixed(1)}%) - ` +
          `data may be incomplete or unrealistic`
        );
      }
    }

    const featureColumns = ['OUTSTANDING', 'Outstanding at risk', 'PAR PER LOAN', 'late days', 
                           'total delayed instalments', 'COUNT_RESCHEDULE'];

    return { data: processedData, featureColumns };

  } catch (error) {
    throw new Error(`Data preparation failed: ${error}`);
  }
}

// Default weights matching frontend
export interface WeightSettings {
  riskLateDaysWeight: number;
  riskOutstandingAtRiskWeight: number;
  riskParPerLoanWeight: number;
  riskReschedulesWeight: number;
  riskPaymentConsistencyWeight: number;
  riskDelayedInstalmentsWeight: number;
  urgencyRiskScoreWeight: number;
  urgencyDaysSinceVisitWeight: number;
  urgencyFeedbackScoreWeight: number;
}

// Calculate risk scores vectorized
function calculateRiskScoreVectorized(data: ProcessedRow[], featureColumns: string[], customWeights?: Partial<WeightSettings>): ProcessedRow[] {
  try {
    // Validate data quality
    const totalClients = data.length;
    const clientsWithOutstanding = data.filter(row => (row['OUTSTANDING'] || 0) > 0).length;
    const clientsWithoutRiskData = data.filter(row => 
      (row['OUTSTANDING'] || 0) > 0 &&
      (row['late days'] || 0) === 0 &&
      (row['Outstanding at risk'] || 0) === 0 &&
      (row['PAR PER LOAN'] || 0) === 0
    ).length;

    if (clientsWithOutstanding > 0 && clientsWithoutRiskData > clientsWithOutstanding * 0.5) {
      addWarning(
        `Risk data quality issue: ${clientsWithoutRiskData}/${clientsWithOutstanding} clients ` +
        `with outstanding loans have no risk indicators (late days, at-risk amount, or PAR). ` +
        `(${((clientsWithoutRiskData / clientsWithOutstanding) * 100).toFixed(1)}% of active loans). ` +
        `Risk scores may not reflect reality.`
      );
    }

    // Default weights - UNIFIED across all systems
    const defaultWeights: WeightSettings = {
      riskLateDaysWeight: 25,
      riskOutstandingAtRiskWeight: 20,
      riskParPerLoanWeight: 20,
      riskReschedulesWeight: 15,
      riskPaymentConsistencyWeight: 10,
      riskDelayedInstalmentsWeight: 10,
      urgencyRiskScoreWeight: 50,
      urgencyDaysSinceVisitWeight: 40,
      urgencyFeedbackScoreWeight: 10
    };

    const weights = { ...defaultWeights, ...customWeights };
    addInfo(`Using risk weights: ${JSON.stringify(weights)}`);

    // Convert percentage weights to decimals
    const riskWeights = {
      late_days: weights.riskLateDaysWeight / 100,
      outstanding_at_risk: weights.riskOutstandingAtRiskWeight / 100,
      par_per_loan: weights.riskParPerLoanWeight / 100,
      reschedules: weights.riskReschedulesWeight / 100,
      payment_consistency: weights.riskPaymentConsistencyWeight / 100,
      delayed_instalments: weights.riskDelayedInstalmentsWeight / 100
    };

    // Calculate risk scores
    data.forEach(row => {
      const hasOutstanding = (row['OUTSTANDING'] || 0) > 0;
      
      // Risk factors with thresholds
      const riskFactors = [
        {
          name: 'late_days',
          data: row['late days'] || 0,
          weight: riskWeights.late_days,
          maxThreshold: 90,
          inverse: false,
          baseline: hasOutstanding && (row['late days'] || 0) === 0 ? 0.1 : 0
        },
        {
          name: 'outstanding_at_risk',
          data: row['Outstanding at risk'] || 0,
          weight: riskWeights.outstanding_at_risk,
          maxThreshold: 10000,
          inverse: false,
          baseline: hasOutstanding && (row['Outstanding at risk'] || 0) === 0 ? 0.05 : 0
        },
        {
          name: 'par_per_loan',
          data: row['PAR PER LOAN'] || 0,
          weight: riskWeights.par_per_loan,
          maxThreshold: 1.0,
          inverse: false,
          baseline: hasOutstanding && (row['PAR PER LOAN'] || 0) === 0 ? 0.02 : 0
        },
        {
          name: 'reschedules',
          data: row['COUNT_RESCHEDULE'] || 0,
          weight: riskWeights.reschedules,
          maxThreshold: 5,
          inverse: false,
          baseline: 0
        },
        {
          name: 'payment_consistency',
          data: row['paid instalments'] || 0,
          weight: riskWeights.payment_consistency,
          maxThreshold: 50,
          inverse: true,
          baseline: 0
        },
        {
          name: 'delayed_instalments',
          data: row['total delayed instalments'] || 0,
          weight: riskWeights.delayed_instalments,
          maxThreshold: 20,
          inverse: false,
          baseline: 0
        }
      ];

      let totalRiskScore = 0;

      riskFactors.forEach(factor => {
        let normalizedValue = Math.min(factor.data, factor.maxThreshold) / factor.maxThreshold;
        
        if (factor.inverse) {
          normalizedValue = 1 - normalizedValue;
        }

        normalizedValue = Math.max(normalizedValue, factor.baseline);

        // Apply sigmoid transformation
        const sigmoidValue = 1 / (1 + Math.exp(-6 * (normalizedValue - 0.5)));
        
        const componentScore = sigmoidValue * 100 * factor.weight;
        totalRiskScore += componentScore;
      });

      row['risk_score'] = Math.max(1, Math.min(99, Math.round(totalRiskScore)));
    });

    return data;

  } catch (error) {
    throw new Error(`Risk scoring failed: ${error}`);
  }
}

// Calculate urgency scores
function calculateUrgencyVectorized(data: ProcessedRow[], customWeights?: Partial<WeightSettings>): ProcessedRow[] {
  try {
    // Default weights - UNIFIED
    const defaultWeights: WeightSettings = {
      riskLateDaysWeight: 25,
      riskOutstandingAtRiskWeight: 20,
      riskParPerLoanWeight: 20,
      riskReschedulesWeight: 15,
      riskPaymentConsistencyWeight: 10,
      riskDelayedInstalmentsWeight: 10,
      urgencyRiskScoreWeight: 50,
      urgencyDaysSinceVisitWeight: 40,
      urgencyFeedbackScoreWeight: 10
    };

    const weights = { ...defaultWeights, ...customWeights };

    const urgencyWeights = {
      risk_score: weights.urgencyRiskScoreWeight,
      days_since_interaction: weights.urgencyDaysSinceVisitWeight,
      feedback_score: weights.urgencyFeedbackScoreWeight
    };

    const totalWeight = urgencyWeights.risk_score + urgencyWeights.days_since_interaction + urgencyWeights.feedback_score;
    const normalizedWeights = {
      risk_score: urgencyWeights.risk_score / totalWeight,
      days_since_interaction: urgencyWeights.days_since_interaction / totalWeight,
      feedback_score: urgencyWeights.feedback_score / totalWeight
    };

    data.forEach(row => {
      // Add defaults if not present
      if (!row.hasOwnProperty('days_since_last_interaction')) {
        row['days_since_last_interaction'] = 30;
      }
      if (!row.hasOwnProperty('feedback_score')) {
        row['feedback_score'] = 3;
      }

      // Scale components to 0-100
      const riskUrgency = Math.max(0, Math.min(100, row['risk_score'] || 0));
      const daysUrgency = Math.min(100, ((row['days_since_last_interaction'] || 30) / 180) * 100);
      const feedbackUrgency = Math.max(0, Math.min(100, (5 - (row['feedback_score'] || 3)) * 25));

      // Calculate weighted composite urgency
      const compositeUrgency = 
        riskUrgency * normalizedWeights.risk_score +
        daysUrgency * normalizedWeights.days_since_interaction +
        feedbackUrgency * normalizedWeights.feedback_score;

      row['composite_urgency'] = Math.max(0, Math.min(100, Math.round(compositeUrgency * 10) / 10));
    });

    return data;

  } catch (error) {
    throw new Error(`Urgency calculation failed: ${error}`);
  }
}

// Process clients to final format
function processClientsVectorized(data: ProcessedRow[], organizationId: string): any[] {
  try {
    return data.map(row => ({
      organizationId,
      clientId: String(row['Client ID'] || ''),
      name: String(row['Client Name'] || ''),
      loanOfficerId: String(row['Loan Officer ID'] || 'UNKNOWN'),
      outstanding: parseFloat(String(row['OUTSTANDING'] || 0)),
      outstandingAtRisk: parseFloat(String(row['Outstanding at risk'] || 0)),
      parPerLoan: parseFloat(String(row['PAR PER LOAN'] || 0)),
      lateDays: parseInt(String(row['late days'] || 0)),
      totalDelayedInstalments: parseInt(String(row['total delayed instalments'] || 0)),
      paidInstalments: parseInt(String(row['paid instalments'] || 0)),
      countReschedule: parseInt(String(row['COUNT_RESCHEDULE'] || 0)),
      paymentMonthly: parseFloat(String(row['PAYMENT_MONTLY'] || 0)),
      isAtRisk: (row['risk_score'] || 0) > 60,
      riskScore: parseFloat((row['risk_score'] || 0).toFixed(2)),
      compositeUrgency: parseFloat((row['composite_urgency'] || 0).toFixed(2)),
      urgencyClassification: 'Low Urgency',
      lastVisitDate: null,
      lastPhoneCallDate: null,
      feedbackScore: row['feedback_score'] || 3
    }));

  } catch (error) {
    throw new Error(`Client processing failed: ${error}`);
  }
}

// Extract unique loan officer IDs from processed data
function extractUniqueLoanOfficers(data: ProcessedRow[]): string[] {
  const officerSet = new Set<string>();
  data.forEach(row => {
    const officerId = String(row['Loan Officer ID'] || 'UNKNOWN').trim();
    if (officerId && officerId !== 'UNKNOWN') {
      officerSet.add(officerId);
    }
  });
  return Array.from(officerSet);
}

// Main processing function
export async function processExcelData(
  urlOrPath: string, 
  organizationId: string,
  customWeights?: Partial<WeightSettings>
): Promise<{
  success: boolean;
  clients?: any[];
  uniqueLoanOfficers?: string[];
  qualityReport?: DataQualityReport;
  error?: string;
}> {
  const startTime = Date.now();
  
  try {
    resetQualityReport();

    addInfo('Loading Excel data...');
    const workbook = await downloadExcelData(urlOrPath);
    addInfo(`Loaded workbook with ${workbook.SheetNames.length} sheets`);

    const { data, featureColumns } = prepareDataVectorized(workbook);
    addInfo(`Prepared ${data.length} records`);

    const dataWithRisk = calculateRiskScoreVectorized(data, featureColumns, customWeights);
    const dataWithUrgency = calculateUrgencyVectorized(dataWithRisk, customWeights);

    // Extract unique loan officers before processing clients
    const uniqueLoanOfficers = extractUniqueLoanOfficers(dataWithUrgency);
    addInfo(`Found ${uniqueLoanOfficers.length} unique loan officers in data`);

    const clients = processClientsVectorized(dataWithUrgency, organizationId);

    const processingTime = ((Date.now() - startTime) / 1000).toFixed(1);
    addInfo(`Processing completed in ${processingTime} seconds`);

    qualityReport.hasIssues = qualityReport.warnings.length > 0 || qualityReport.errors.length > 0;

    return {
      success: true,
      clients,
      uniqueLoanOfficers,
      qualityReport
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    addError(errorMessage);
    qualityReport.hasIssues = true;

    return {
      success: false,
      error: errorMessage,
      qualityReport
    };
  }
}
