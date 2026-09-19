import { db } from '../db/index.js';
import { settings } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { decryptValue } from '../server/routers/settings.js';

async function checkLLM() {
  console.log('--- Checking LLM Provider and Key ---');
  try {
    const allSettings = await db.select().from(settings);
    console.log(`Found ${allSettings.length} settings records.`);
    
    for (const row of allSettings) {
      if (row.llmApiKey) {
        try {
          const decryptedKey = decryptValue(row.llmApiKey);
          console.log(`Team ${row.teamId}: Found LLM Key (provider: ${row.llmProvider}). Length: ${decryptedKey.length}`);
          
          if (row.llmProvider === 'openrouter') {
            console.log('Testing OpenRouter key...');
            const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
              headers: {
                'Authorization': `Bearer ${decryptedKey}`
              }
            });
            const data = await res.json();
            console.log('OpenRouter Key Status:', res.status, data);
          }
        } catch (e) {
          console.error(`Team ${row.teamId}: Error decrypting key.`, e);
        }
      } else {
        console.log(`Team ${row.teamId}: No LLM Key configured.`);
      }
    }
  } catch (err) {
    console.error('Error:', err);
  }
  process.exit(0);
}

checkLLM();
