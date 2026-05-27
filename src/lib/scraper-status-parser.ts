// Enhanced status parsing for the legislative scraper
export class ScraperStatusParser {
  // Common abbreviations and their full forms
  private static readonly STATUS_NORMALIZATIONS: Record<string, string> = {
    '1st': 'first',
    '2nd': 'second',
    '3rd': 'third',
    'sched': 'scheduled',
    'rdg': 'reading',
    'comm': 'committee'
  };

  // Patterns that often cause misclassification
  private static readonly PROBLEMATIC_PATTERNS = [
    // Pattern: "First reading 03/15/2024" (past date, but scraped as future)
    /first\s+reading\s+\d{1,2}\/\d{1,2}\/\d{2,4}/i,
    // Pattern: "First reading - passed" (status continuation)
    /first\s+reading\s*[-–]\s*\w+/i,
    // Pattern: "Scheduled first reading (completed)"
    /scheduled\s+first\s+reading\s*\([^)]*completed[^)]*\)/i
  ];

  public static parseStatus(rawStatusText: string, scrapedDate?: Date): string {
    if (!rawStatusText) return '';

    let cleanStatus = rawStatusText.trim();

    // Normalize common abbreviations
    for (const [abbrev, full] of Object.entries(this.STATUS_NORMALIZATIONS)) {
      const regex = new RegExp(`\\b${abbrev}\\b`, 'gi');
      cleanStatus = cleanStatus.replace(regex, full);
    }

    // Handle problematic patterns
    for (const pattern of this.PROBLEMATIC_PATTERNS) {
      if (pattern.test(cleanStatus)) {
        cleanStatus = this.handleProblematicPattern(cleanStatus, pattern, scrapedDate);
      }
    }

    // Clean up extra whitespace and normalize
    cleanStatus = cleanStatus.replace(/\s+/g, ' ').trim();

    return cleanStatus;
  }

  private static handleProblematicPattern(
    statusText: string, 
    pattern: RegExp, 
    scrapedDate?: Date
  ): string {
    const match = statusText.match(pattern);
    if (!match) return statusText;

    const matchedText = match[0];

    // Handle date-based patterns
    if (matchedText.includes('/')) {
      const dateMatch = matchedText.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
      if (dateMatch && scrapedDate) {
        const statusDate = new Date(dateMatch[1]);
        const today = scrapedDate || new Date();
        
        // If the date is in the past, it's likely completed
        if (statusDate < today) {
          return statusText.replace(pattern, 'First reading completed');
        }
      }
    }

    // Handle status continuation patterns (e.g., "First reading - passed")
    if (matchedText.includes('-') || matchedText.includes('–')) {
      const parts = matchedText.split(/[-–]/);
      if (parts.length > 1) {
        const continuation = parts[1].trim().toLowerCase();
        if (['passed', 'completed', 'approved'].includes(continuation)) {
          return statusText.replace(pattern, `First reading ${continuation}`);
        }
      }
    }

    // Handle parenthetical clarifications
    if (matchedText.includes('(') && matchedText.includes('completed')) {
      return statusText.replace(pattern, 'First reading completed');
    }

    return statusText;
  }

  public static extractActionDate(statusText: string): Date | null {
    // Extract date from status text if present
    const datePatterns = [
      /\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/,
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/i,
      /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})\b/i
    ];

    for (const pattern of datePatterns) {
      const match = statusText.match(pattern);
      if (match) {
        try {
          return new Date(match[1]);
        } catch {
          continue;
        }
      }
    }

    return null;
  }

  public static isScheduledStatus(statusText: string): boolean {
    const cleanStatus = statusText.toLowerCase();
    
    // Must contain scheduling keywords
    if (!cleanStatus.includes('scheduled') && !cleanStatus.includes('calendar')) {
      return false;
    }

    // Must not contain completion keywords
    if (['passed', 'completed', 'finished', 'approved', 'adopted'].some(word => 
      cleanStatus.includes(word))) {
      return false;
    }

    // Check for future date indicators
    const actionDate = this.extractActionDate(statusText);
    if (actionDate) {
      const today = new Date();
      return actionDate > today;
    }

    // Default to true if it contains "scheduled" and no completion keywords
    return true;
  }
}