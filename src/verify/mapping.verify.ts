/**
 * Verification harness for Excel mapping loader
 * Confirms templates.ts is working end-to-end with the Windows path
 */
import { promises as fs } from 'fs';
import { getConfig } from '../config.js';
import { getLogger } from '../logger.js';
import { loadTemplateMap, pickTemplate, renderMessage } from '../templates.js';
import { todayIso, todayHe } from '../utils/date.js';

const logger = getLogger();

async function verify(): Promise<void> {
  logger.info('Starting mapping verification harness');

  try {
    const config = getConfig();
    const mappingPath = config.XSLX_MAPPING_PATH;

    // Log absolute path
    logger.info({ path: mappingPath }, 'mapping-path');

    // Check file exists and get mtime
    let stats;
    try {
      stats = await fs.stat(mappingPath);
      logger.info(
        { mtime: stats.mtime.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }) },
        'mapping-mtime'
      );
    } catch (error) {
      logger.error({ path: mappingPath, error }, 'File not found or inaccessible');
      throw new Error(`Excel mapping file not found: ${mappingPath}`);
    }

    // Load template map
    logger.info('Loading template map...');
    const templateMap = await loadTemplateMap();

    // Assert map size > 0
    const mapSize = templateMap.size;
    logger.info({ size: mapSize }, 'mapping-size');

    if (mapSize === 0) {
      throw new Error('Template map is empty - no rows loaded');
    }

    // Get sorted keys
    const allKeys = Array.from(templateMap.keys()).sort();
    const keySample = allKeys.slice(0, 5);
    logger.info({ keys: keySample }, 'keys-sample');

    // Verify required columns (at least one mapping has messageBody or glassixTemplateId)
    let hasValidMapping = false;
    for (const mapping of templateMap.values()) {
      if (mapping.messageBody || mapping.glassixTemplateId) {
        hasValidMapping = true;
        break;
      }
    }

    if (!hasValidMapping) {
      throw new Error(
        'No valid mappings found - required columns may be missing (מלל הודעה or שם הודעה מובנית בגלאסיקס)'
      );
    }

    // Functional probe: test first 1-2 task names
    const probeKeys = allKeys.slice(0, Math.min(2, allKeys.length));

    for (const key of probeKeys) {
      const mapping = pickTemplate(key, templateMap);

      if (!mapping) {
        logger.warn({ key }, 'Mapping not found (should not happen)');
        continue;
      }

      // Create render context
      const ctx = {
        first_name: 'דניאל',
        account_name: 'MAGNUS',
        device_model: 'S24',
        link: mapping.link || '',
        date_iso: todayIso(),
        date_he: todayHe(),
      };

      // Render message
      const rendered = renderMessage(mapping, ctx, { defaultLang: 'he' });

      // Log result (strip newlines for readability)
      const textOneLine = rendered.text.replace(/\n/g, ' ');
      logger.info(
        {
          key,
          text: textOneLine,
          hasGlassixTemplate: !!rendered.viaGlassixTemplate,
        },
        `probe-${key}`
      );

      // Verify date appears
      const hasDate = rendered.text.includes(ctx.date_he) || rendered.text.includes(ctx.date_iso);

      if (!hasDate) {
        logger.warn(
          { key, text: textOneLine },
          'Date not found in rendered text (may be expected for some templates)'
        );
      }

      // Verify link handling
      if (mapping.link) {
        const hasLinkPlaceholder =
          mapping.messageBody?.includes('{{link}}') || mapping.messageBody?.includes('{link}');

        if (!hasLinkPlaceholder) {
          // Link should be auto-appended
          const hasLink = rendered.text.includes(mapping.link);
          if (!hasLink) {
            throw new Error(
              `Link auto-append failed for key ${key}: expected "${mapping.link}" in output`
            );
          }
        }
      }
    }

    // Success!
    logger.info(
      {
        path: mappingPath,
        size: mapSize,
        probed: probeKeys.length,
      },
      'verify: OK'
    );

    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Verification failed');
    if (error instanceof Error) {
      console.error(`\n❌ Verification failed: ${error.message}\n`);
    } else {
      console.error('\n❌ Verification failed with unknown error\n');
    }
    process.exit(1);
  }
}

// Run verification
verify().catch((error: unknown) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
