'use server'
import { limitFixedWindow, retryAfterMs } from '@/lib/core/ratelimit-memory';
// NOTE: due to the archive of 2025, bill URLS have changed
// - when going to that link it appends the 'Archives' segment and redirects, so we need to handle both cases
// - at this moment, scraping this will return NO UPDATES, luckily we don't save the updates!
// https://www.capitol.hawaii.gov/session/archives/measure_indiv_Archives.aspx?billtype=SB&billnumber=1186&year=2025

const SCRAPER_RATE_LIMIT = { limit: 30, windowMs: 60_000 };

export async function scrapeForUpdates(billID: string) {
    console.log('[SCRAPER FOR UPDATES] calling scraping service with billID classifier:', billID)
    const rl = limitFixedWindow(`scrape:updates:${billID}`, SCRAPER_RATE_LIMIT.limit, SCRAPER_RATE_LIMIT.windowMs);
    if (!rl.ok) {
      console.warn('Scrape rate limited for bill', { billID, retryAfterMs: retryAfterMs(rl.resetAt) });
      return null;
    }
    const response = await fetch(`${process.env.SCRAPER_API_URL}/scrape-individual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({classifier: billID})        
      });
  
      if (!response.ok) {
        throw new Error(`Scraping API returned ${response.status}: ${response.statusText}`);
      }
  
    const data = await response.json();

    console.log('[SCRAPER FOR UPDATES] Successfully scraped: ', data.individualBill.description)
    console.log('[SCRAPER FOR UPDATES] Successfully scraped: ', data.individualBill.updates)
    console.log('[SCRAPER FOR UPDATES] Total Updates: ', data.individualBill.updates.length)

    return data
}

/**
 * Returns data for the bill (with new status updates), if it is an unrecognized bill URL
 * then scraper service will insert this new bill to database
 * @param billURL - the URL of the bill to find
 * @returns individual bill data
 */
export async function findBill(billURL: string) {
  console.log('[SCRAPER FOR FIND BILL] calling scraping service with billURL classifier:', billURL)
    const rl = limitFixedWindow(`scrape:find:${billURL}`, SCRAPER_RATE_LIMIT.limit, SCRAPER_RATE_LIMIT.windowMs);
    if (!rl.ok) {
      console.warn('Scrape rate limited for bill url lookup', { billURL, retryAfterMs: retryAfterMs(rl.resetAt) });
      return null;
    }
  
    const response = await fetch(`${process.env.SCRAPER_API_URL}/scrape-individual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({classifier: billURL})    
      });
  
      if (!response.ok) {
        throw new Error(`Scraping API returned ${response.status}: ${response.statusText}`);
      }
  
    const data = await response.json();

    console.log('[SCRAPER FOR FIND BILL] Successfully scraped: ', data)
    // console.log('[SCRAPER FOR FIND BILL] Successfully scraped: ', data.individualBill.billTitle)

    return data
}
