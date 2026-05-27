// Status classification utilities for bill tracking
export interface BillStatus {
  id: string;
  status: string;
  statusCategory: 'scheduled' | 'passed' | 'failed' | 'deferred' | 'pending' | 'unknown';
  confidence: number;
  lastUpdated: Date;
}

export class StatusClassifier {
  // Common patterns that indicate "scheduled for 1st reading" vs other statuses
  private static readonly FIRST_READING_PATTERNS = [
    /scheduled\s+for\s+first\s+reading/i,
    /scheduled\s+for\s+1st\s+reading/i,
    /first\s+reading\s+scheduled/i,
    /1st\s+reading\s+scheduled/i,
    // Fix: Add negative lookbehinds to prevent false positives
    /(?<!passed\s)(?<!completed\s)(?<!held\s)first\s+reading\s+(?:on|for)\s+\d/i,
    /(?<!passed\s)(?<!completed\s)(?<!held\s)1st\s+reading\s+(?:on|for)\s+\d/i
  ];

  private static readonly PASSED_FIRST_READING_PATTERNS = [
    /passed\s+first\s+reading/i,
    /passed\s+1st\s+reading/i,
    /first\s+reading\s+passed/i,
    /1st\s+reading\s+passed/i,
    /completed\s+first\s+reading/i,
    /completed\s+1st\s+reading/i
  ];

  private static readonly DEFERRED_PATTERNS = [
    /deferred/i,
    /postponed/i,
    /held\s+in\s+committee/i,
    /tabled/i
  ];

  private static readonly SECOND_READING_PATTERNS = [
    /scheduled\s+for\s+second\s+reading/i,
    /scheduled\s+for\s+2nd\s+reading/i,
    /second\s+reading\s+scheduled/i,
    /2nd\s+reading\s+scheduled/i
  ];

  public static classifyStatus(statusText: string, billTitle?: string): BillStatus['statusCategory'] {
    if (!statusText) return 'unknown';

    // Clean the status text
    const cleanStatus = statusText.trim().toLowerCase();

    // Check for passed first reading first (higher priority)
    if (this.PASSED_FIRST_READING_PATTERNS.some(pattern => pattern.test(cleanStatus))) {
      return 'pending'; // Passed first reading means it's moving forward
    }

    // Check for deferred/held status
    if (this.DEFERRED_PATTERNS.some(pattern => pattern.test(cleanStatus))) {
      return 'deferred';
    }

    // Check for second reading (higher priority than first reading)
    if (this.SECOND_READING_PATTERNS.some(pattern => pattern.test(cleanStatus))) {
      return 'scheduled';
    }

    // Finally check for scheduled first reading
    if (this.FIRST_READING_PATTERNS.some(pattern => pattern.test(cleanStatus))) {
      // Additional validation to prevent false positives
      if (this.isValidFirstReadingScheduled(cleanStatus)) {
        return 'scheduled';
      }
    }

    // Default classifications based on common keywords
    if (cleanStatus.includes('passed') || cleanStatus.includes('adopted')) {
      return 'passed';
    }

    if (cleanStatus.includes('failed') || cleanStatus.includes('defeated')) {
      return 'failed';
    }

    return 'pending';
  }

  private static isValidFirstReadingScheduled(statusText: string): boolean {
    // Additional validation to prevent misclassification
    
    // If it mentions "passed" or "completed", it's not scheduled
    if (/passed|completed|finished|done/i.test(statusText)) {
      return false;
    }

    // If it mentions a specific future date, it's likely scheduled
    if (/\b(january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}\/\d{1,2}\/\d{2,4})\b/i.test(statusText)) {
      return true;
    }

    // If it just says "scheduled" without other context, be conservative
    if (statusText.includes('scheduled') && !statusText.includes('for')) {
      return false;
    }

    return true;
  }

  public static getStatusConfidence(statusText: string, classification: BillStatus['statusCategory']): number {
    if (!statusText) return 0;

    const cleanStatus = statusText.trim().toLowerCase();
    
    // High confidence for explicit patterns
    if (classification === 'scheduled' && this.FIRST_READING_PATTERNS.some(pattern => pattern.test(cleanStatus))) {
      return 0.9;
    }

    if (classification === 'passed' && /passed|adopted/i.test(cleanStatus)) {
      return 0.95;
    }

    if (classification === 'failed' && /failed|defeated/i.test(cleanStatus)) {
      return 0.95;
    }

    if (classification === 'deferred' && this.DEFERRED_PATTERNS.some(pattern => pattern.test(cleanStatus))) {
      return 0.85;
    }

    // Medium confidence for partial matches
    return 0.7;
  }
}