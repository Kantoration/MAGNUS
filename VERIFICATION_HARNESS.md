# Verification Harness Documentation

## Overview

A comprehensive verification harness has been implemented to confirm the Excel mapping loader (`templates.ts`) is working end-to-end with Windows paths.

## Files Created

### 1. `src/verify/mapping.verify.ts`
Automated verification script that:
- ✅ Loads Excel from configured path (defaults to `C:\Users\User\Desktop\MAGNUS\AutoMessager\massege_maping.xlsx`)
- ✅ Logs absolute path, file mtime, row count, and sample keys
- ✅ Performs assertions (throws on failure):
  - Map size > 0
  - Required columns exist (validates messageBody or glassixTemplateId present)
- ✅ Functional probes:
  - Tests first 1-2 task names from xlsx
  - Creates test RenderContext with Hebrew first name
  - Renders message and logs result
  - Verifies date injection (auto-appended or via placeholder)
  - Verifies link auto-append when no `{{link}}` placeholder
- ✅ Exit codes:
  - `0` on success
  - `1` on any failure

### 2. `test/templates.verify.spec.ts`
14 new unit tests covering:
- ✅ Cache invalidation on mtime change
- ✅ Cache reuse when mtime unchanged
- ✅ Hebrew column parsing (`מלל הודעה`, `שם הודעה מובנית בגלאסיקס`)
- ✅ Mixed Hebrew/English name normalization
- ✅ Space and hyphen normalization to underscores
- ✅ Date injection (auto-inject today's date)
- ✅ Provided date_he usage
- ✅ Link auto-append when no placeholder
- ✅ No link auto-append when placeholder exists
- ✅ Context link precedence over mapping link
- ✅ Complete verification scenario
- ✅ Error scenarios (file not found, empty file, missing fields)

### 3. Updated `README.md`
Added comprehensive verification section with:
- Command usage
- Expected output format
- Configuration details
- Failure scenario explanations

### 4. Updated `package.json`
Added npm script:
```json
"verify:mapping": "tsx src/verify/mapping.verify.ts"
```

## Usage

### Run Verification
```bash
npm run verify:mapping
```

### Expected Output
```
[info] mapping-path: C:\Users\User\Desktop\MAGNUS\AutoMessager\massege_maping.xlsx
[info] mapping-mtime: 10/9/2025, 10:34:53 AM
[info] mapping-size: 3
[info] keys-sample: ["NEW_PHONE","PAYMENT_REMINDER","WELCOME"]
[info] probe-NEW_PHONE: "שלום דניאל! קיבלנו את הזמנתך למכשיר S24 (תאריך: 09/10/2025) https://magnus.co.il/devices"
[info] probe-PAYMENT_REMINDER: "היי דניאל, תזכורת לתשלום עבור חברת MAGNUS (תאריך: 09/10/2025) https://magnus.co.il/payment"
[info] verify: OK
```

### Successful Probes
Each probe verifies:
1. ✅ Variable substitution: `{{first_name}}`, `{{device_model}}`, `{{account_name}}`
2. ✅ Date injection: Either via placeholder or auto-appended as `(תאריך: DD/MM/YYYY)`
3. ✅ Link handling:
   - If `{{link}}` in template → replaced inline
   - If no placeholder → auto-appended on new line
4. ✅ Glassix template passthrough: `hasGlassixTemplate: true/false`

## Failure Scenarios

### File Not Found
```
❌ Verification failed: Excel mapping file not found: C:\Users\...\massege_maping.xlsx
```
Shows absolute path that was attempted.

### Required Columns Missing
```
❌ Verification failed: No valid mappings found - required columns may be missing (מלל הודעה or שם הודעה מובנית בגלאסיקס)
```

### Empty Map
```
❌ Verification failed: Template map is empty - no rows loaded
```

### Link Auto-Append Failed
```
❌ Verification failed: Link auto-append failed for key NEW_PHONE: expected "https://..." in output
```

## Test Coverage

**Total: 57 tests** (43 existing + 14 new)

### New Verification Tests (14)
```
✓ should reload when file mtime changes
✓ should use cache when file mtime unchanged
✓ should correctly parse Hebrew columns
✓ should handle mixed Hebrew and English names
✓ should normalize spaces and hyphens to underscores
✓ should inject date_he when not provided in context
✓ should use provided date_he from context
✓ should append link when no {{link}} placeholder exists
✓ should NOT append link when {{link}} placeholder exists
✓ should prefer context link over mapping link
✓ should handle complete verification scenario
✓ should handle file not found gracefully
✓ should handle empty Excel file
✓ should skip rows with missing required fields
```

## Integration with CI/CD

The verification harness can be integrated into CI/CD pipelines:

```yaml
# Example GitHub Actions
- name: Verify Excel Mapping
  run: |
    npm run verify:mapping
  env:
    XSLX_MAPPING_PATH: ${{ secrets.EXCEL_PATH }}
```

## Development Workflow

1. **Make changes to template system**
   ```bash
   npm run build
   npm test
   ```

2. **Verify with actual Excel file**
   ```bash
   npm run verify:mapping
   ```

3. **Check specific scenarios**
   - Modify Excel file
   - Run verification again
   - Confirms cache invalidation and reload

## Technical Details

### File Change Detection
- Uses `fs.promises.stat()` for async mtime check
- Compares mtime with cached value
- Auto-reloads when file changes detected
- No manual cache clear needed in production

### Hebrew Transliteration
Task keys normalized with full Hebrew alphabet support:
```
"טלפון חדש" → "TLPVN_HDSH"
"תשלום" → "TSHLVM"
"NEW PHONE-123" → "NEW_PHONE_123"
```

### Date Injection
Always injects today's date if not in context:
```typescript
date_iso ||= todayIso()  // "2025-10-09"
date_he ||= todayHe()     // "09/10/2025"
```

Auto-appends for Hebrew messages when no date placeholder:
```
"שלום {{first_name}}" → "שלום דניאל (תאריך: 09/10/2025)"
```

### Link Injection
If link exists but no `{{link}}` placeholder:
```
"שלום {{first_name}}" + link → "שלום דניאל\nhttps://example.com"
```

## Acceptance Criteria - All Met ✅

- ✅ `npm run verify:mapping` succeeds with real Excel file
- ✅ Prints: path, mtime, count, keys sample, probe renders
- ✅ Fails with clear error messages:
  - File not found (shows absolute path)
  - Required columns missing
  - Map is empty
  - Link append verification failed
- ✅ Unit tests pass (57/57 including 14 new verification tests)
- ✅ README updated with verification section
- ✅ npm script added to package.json

## Status

```
Build:  ✅ PASS
Lint:   ✅ PASS
Tests:  ✅ PASS (57/57)
Verify: ✅ PASS
```

All components working correctly with Windows paths and Hebrew content!

