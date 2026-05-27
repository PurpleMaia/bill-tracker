import { StatusClassifier } from './status-classifier';
import type { Database } from '@/types/database';

export interface BillStatusUpdate {
  billId: string;
  newStatus: string;
  previousStatus?: string;
  confidence: number;
  source: 'scraper' | 'manual' | 'ai';
  timestamp: Date;
  rawData?: string;
}

export class BillStatusUpdater {
  constructor(private db: Database) {}

  async updateBillStatus(update: BillStatusUpdate): Promise<boolean> {
    try {
      // Classify the new status
      const statusCategory = StatusClassifier.classifyStatus(update.newStatus);
      const confidence = StatusClassifier.getStatusConfidence(update.newStatus, statusCategory);

      // Get current bill status to compare
      const currentBill = await this.db
        .selectFrom('bills')
        .select(['id', 'current_status_str', 'status'])
        .where('id', '=', update.billId)
        .executeTakeFirst();

      if (!currentBill) {
        console.error(`Bill not found: ${update.billId}`);
        return false;
      }

      // Prevent regression: don't downgrade from a higher status to "scheduled for 1st reading"
      if (currentBill.current_status_str && statusCategory === 'scheduled') {
        const currentCategory = StatusClassifier.classifyStatus(currentBill.current_status_str);
        
        // If current status is passed, failed, or already in progress, don't downgrade
        if (['passed', 'failed', 'pending'].includes(currentCategory) && 
            currentBill.current_status_str.toLowerCase().includes('passed')) {
          console.warn(`Preventing status regression for bill ${update.billId}: ${currentBill.current_status_str} -> ${update.newStatus}`);
          
          // Log this as a potential misclassification
          await this.logMisclassification(update.billId, update.newStatus, currentBill.current_status_str, 'status_regression');
          return false;
        }
      }

      // Only update if confidence is above threshold or if it's a manual update
      const confidenceThreshold = update.source === 'manual' ? 0 : 0.7;
      if (confidence < confidenceThreshold) {
        console.warn(`Low confidence status update for bill ${update.billId}: ${confidence}`);
        await this.logMisclassification(update.billId, update.newStatus, currentBill.current_status_str, 'low_confidence');
        return false;
      }

      // Update the bill status
      await this.db.transaction().execute(async (trx) => {
        // Update the bills table
        await trx
          .updateTable('bills')
          .set({
            current_status_str: update.newStatus,
            status: statusCategory,
            updated_at: new Date()
          })
          .where('id', '=', update.billId)
          .execute();

        // Insert status update record
        await trx
          .insertInto('status_updates')
          .values({
            bill_id: update.billId,
            status: update.newStatus,
            status_category: statusCategory,
            confidence: confidence,
            source: update.source,
            raw_data: update.rawData,
            created_at: new Date(),
            previous_status: update.previousStatus || currentBill.current_status_str
          })
          .execute();
      });

      console.log(`Updated bill ${update.billId} status: ${update.newStatus} (${statusCategory}, confidence: ${confidence})`);
      return true;

    } catch (error) {
      console.error(`Error updating bill status for ${update.billId}:`, error);
      return false;
    }
  }

  private async logMisclassification(
    billId: string,
    proposedStatus: string,
    currentStatus: string,
    reason: string
  ): Promise<void> {
    try {
      await this.db
        .insertInto('ai_misclassifications')
        .values({
          bill_id: billId,
          proposed_status: proposedStatus,
          actual_status: currentStatus,
          reason: reason,
          confidence_score: 0,
          created_at: new Date(),
          resolved: false
        })
        .execute();
    } catch (error) {
      console.error('Error logging misclassification:', error);
    }
  }

  async reviewAndCorrectMisclassifications(): Promise<void> {
    try {
      // Get bills that might be misclassified as "scheduled for 1st reading"
      const suspiciousBills = await this.db
        .selectFrom('bills')
        .innerJoin('status_updates', 'bills.id', 'status_updates.bill_id')
        .select([
          'bills.id',
          'bills.current_status_str',
          'bills.title',
          'status_updates.confidence',
          'status_updates.created_at'
        ])
        .where('bills.status', '=', 'scheduled')
        .where('bills.current_status_str', 'like', '%1st reading%')
        .where('status_updates.confidence', '<', 0.8)
        .orderBy('status_updates.created_at', 'desc')
        .execute();

      console.log(`Found ${suspiciousBills.length} potentially misclassified bills`);

      for (const bill of suspiciousBills) {
        // Re-classify with updated logic
        const newCategory = StatusClassifier.classifyStatus(bill.current_status_str, bill.title);
        const newConfidence = StatusClassifier.getStatusConfidence(bill.current_status_str, newCategory);

        if (newCategory !== 'scheduled' && newConfidence > 0.8) {
          console.log(`Correcting bill ${bill.id}: ${bill.current_status_str} -> ${newCategory}`);
          
          await this.updateBillStatus({
            billId: bill.id,
            newStatus: bill.current_status_str,
            confidence: newConfidence,
            source: 'ai',
            timestamp: new Date()
          });
        }
      }
    } catch (error) {
      console.error('Error reviewing misclassifications:', error);
    }
  }
}