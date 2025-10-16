import { getApprovedTemplates } from '../glassix.js';
import { loadTemplateMap } from '../templates.js';
import { findBestTemplateMatch, rankTemplates } from '../template-matcher.js';

export async function discoverTemplates(): Promise<void> {
  // Check for --why flag
  const args = process.argv.slice(2);
  const showWhy = args.includes('--why');
  console.log('Discovering Glassix approved templates...\n');
  
  try {
    const templates = await getApprovedTemplates();
    
    console.log(`Found ${templates.length} approved templates in Glassix:\n`);
    
    templates.forEach((t, i) => {
      console.log(`${i + 1}. ${t.name}`);
      console.log(`   Language: ${t.language}`);
      console.log(`   Preview: ${t.content.substring(0, 80)}...`);
      console.log('');
    });
    
    console.log('Testing template matching with your Excel file...\n');
    
    const templateMap = await loadTemplateMap();
    let matched = 0;
    let unmatched = 0;
    
    for (const [taskKey, mapping] of templateMap) {
      if (!mapping.messageBody) continue;
      
      const match = await findBestTemplateMatch(mapping.messageBody, taskKey);
      
      console.log(`Task: ${taskKey}`);
      
      if (match) {
        matched++;
        console.log(`  ✓ Match: ${match.template.name} (${match.confidence}, score: ${match.score.toFixed(2)})`);
        console.log(`  Reason: ${match.reason}`);
      } else {
        unmatched++;
        console.log(`  ✗ No match - this task will be skipped at runtime`);
        if (showWhy) {
          const ranked = await rankTemplates(mapping.messageBody, taskKey);
          ranked.slice(0, 3).forEach(r =>
            console.log(`    • candidate: ${r.template.name} (score ${r.score.toFixed(2)}) — ${r.reason}`)
          );
        }
      }
      console.log('');
    }
    
    console.log(`Summary: ${matched} matched, ${unmatched} unmatched\n`);
    
    if (unmatched > 0) {
      console.log('⚠ Warning: Tasks without template matches will be skipped to ensure WhatsApp compliance.');
      console.log('Consider creating matching templates in Glassix or updating Excel message content.\n');
    }
    
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
