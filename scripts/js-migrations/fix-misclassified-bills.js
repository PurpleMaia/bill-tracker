// Migration script to fix bills that were incorrectly classified as "scheduled for 1st reading"
const { Client } = require('pg');
const { StatusClassifier } = require('../src/lib/status-classifier');

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Find bills that are currently marked as "scheduled" with "1st reading" in status
    const query = `
      SELECT 
        b.id,
        b.current_status_str,
        b.title,
        b.status,
        su.created_at as last_updated,
        su.confidence,
        su.source
      FROM bills b
      LEFT JOIN LATERAL (
        SELECT created_at, confidence, source
        FROM status_updates
        WHERE bill_id = b.id
        ORDER BY created_at DESC
        LIMIT 1
      ) su ON true
      WHERE b.status = 'scheduled'
        AND (
          b.current_status_str ILIKE '%1st reading%'
          OR b.current_status_str ILIKE '%first reading%'
        )
      ORDER BY su.created_at DESC;
    `;

    const result = await client.query(query);
    console.log(`Found ${result.rows.length} potentially misclassified bills`);

    let correctedCount = 0;
    let skippedCount = 0;

    for (const bill of result.rows) {
      console.log(`\nAnalyzing bill ${bill.id}: "${bill.current_status_str}"`);

      // Re-classify using improved logic
      const newCategory = StatusClassifier.classifyStatus(bill.current_status_str, bill.title);
      const newConfidence = StatusClassifier.getStatusConfidence(bill.current_status_str, newCategory);

      console.log(`  Current: scheduled -> New: ${newCategory} (confidence: ${newConfidence})`);

      // Only update if the new classification is different and has good confidence
      if (newCategory !== 'scheduled' && newConfidence >= 0.8) {
        try {
          await client.query('BEGIN');

          // Update the bill
          await client.query(
            'UPDATE bills SET status = $1, updated_at = NOW() WHERE id = $2',
            [newCategory, bill.id]
          );

          // Log the correction
          await client.query(`
            INSERT INTO status_updates (
              bill_id, status, status_category, confidence, source, 
              created_at, previous_status
            ) VALUES ($1, $2, $3, $4, 'migration', NOW(), $5)
          `, [
            bill.id,
            bill.current_status_str,
            newCategory,
            newConfidence,
            'scheduled'
          ]);

          // Log as a corrected misclassification
          await client.query(`
            INSERT INTO ai_misclassifications (
              bill_id, proposed_status, actual_status, reason,
              confidence_score, created_at, resolved
            ) VALUES ($1, $2, $3, 'corrected_by_migration', $4, NOW(), true)
          `, [
            bill.id,
            'scheduled',
            newCategory,
            newConfidence
          ]);

          await client.query('COMMIT');
          correctedCount++;
          console.log(`  ✓ Corrected to ${newCategory}`);
        } catch (error) {
          await client.query('ROLLBACK');
          console.error(`  ✗ Error updating bill ${bill.id}:`, error.message);
        }
      } else {
        skippedCount++;
        console.log(`  - Skipped (confidence: ${newConfidence}, category: ${newCategory})`);
      }
    }

    console.log(`\nMigration completed:`);
    console.log(`  Bills corrected: ${correctedCount}`);
    console.log(`  Bills skipped: ${skippedCount}`);
    console.log(`  Total analyzed: ${result.rows.length}`);

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch(console.error);