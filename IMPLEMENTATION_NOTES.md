# Template System Implementation Notes

## Overview

The new template system has been successfully implemented with the following features:

## Key Features

### 1. **Hebrew Column Support**
The system correctly parses Excel files with Hebrew column names:
- `name` - Task type key
- `מלל הודעה` - Message body (Hebrew label)
- `Link` - URL to include
- `שם הודעה מובנית בגלאסיקס` - Glassix built-in template ID (optional)

### 2. **File Change Detection**
- Uses `fs.stat()` to check file modification time (mtime)
- Caches template map in memory
- Only reloads when file changes detected
- Async implementation for non-blocking I/O

### 3. **Task Key Normalization**
Task keys are normalized for consistent matching:
- Converted to UPPERCASE
- Spaces replaced with underscores
- Non-word characters removed (except underscore)
- Examples:
  - `"Send Reminder"` → `"SEND_REMINDER"`
  - `"follow-up"` → `"FOLLOWUP"`
  - `"URGENT TASK"` → `"URGENT_TASK"`

### 4. **Template Rendering**
The rendering engine supports:

**Variable Substitution:**
- Both `{{var}}` and `{var}` syntax
- Built-in variables: `first_name`, `account_name`, `device_model`, `imei`, `date_iso`, `date_he`, `link`
- Custom variables from context
- Empty string replacement for missing variables

**Date Handling:**
- Automatic date placeholder replacement: `{{date}}`, `{{date_he}}`, `{{date_iso}}`
- Auto-append date for Hebrew messages when no placeholder exists: ` (תאריך: DD/MM/YYYY)`
- No auto-append for English messages

**Link Handling:**
- Context link takes precedence over mapping link
- Falls back to mapping link if context doesn't provide one

**Glassix Template Integration:**
- Returns `viaGlassixTemplate` field when template ID exists
- Message still rendered with variables for Glassix to process

## API

### Exports

```typescript
// Load template map from Excel file (with caching)
async function loadTemplateMap(): Promise<Map<string, NormalizedMapping>>

// Find template by task key (normalized lookup)
function pickTemplate(
  taskKey: string, 
  map: Map<string, NormalizedMapping>
): NormalizedMapping | undefined

// Render message with context
function renderMessage(
  mapping: NormalizedMapping,
  ctx: RenderContext,
  opts?: { defaultLang?: 'he' | 'en' }
): { text: string; viaGlassixTemplate?: string }

// Clear cache (useful for testing)
function clearTemplateCache(): void
```

### Types

```typescript
type RawMappingRow = {
  name: string;
  'מלל הודעה': string;
  'Link': string;
  'שם הודעה מובנית בגלאסיקס'?: string;
}

type NormalizedMapping = {
  taskKey: string;
  messageBody?: string;
  link?: string;
  glassixTemplateId?: string;
}

type RenderContext = {
  first_name?: string;
  account_name?: string;
  device_model?: string;
  imei?: string;
  date_iso?: string;
  date_he?: string;
  link?: string;
  [k: string]: unknown;
}
```

## Integration with run.ts

The main orchestrator has been updated to:

1. Load template map at startup
2. Pass map to task processing function
3. Pick template by task type
4. Skip tasks with no matching template
5. Render message with context
6. Send message via Glassix with metadata

## Test Coverage

**20 comprehensive tests covering:**
- ✓ Hebrew column name parsing
- ✓ Task key normalization (uppercase, space → underscore, special char removal)
- ✓ Optional Glassix template ID handling
- ✓ Empty row skipping
- ✓ File mtime-based caching
- ✓ Whitespace trimming
- ✓ Template lookup (case-insensitive)
- ✓ Variable substitution (all types)
- ✓ Missing variable handling (empty string replacement)
- ✓ Link precedence (context > mapping)
- ✓ Glassix template ID passthrough
- ✓ Date placeholder injection
- ✓ Auto-append date for Hebrew (when no placeholder)
- ✓ No auto-append for English
- ✓ Date alias (`{{date}}` = `{{date_he}}`)
- ✓ Both `{{var}}` and `{var}` syntax support
- ✓ Custom context keys

## File Structure

```
src/
├── templates.ts     # NEW: Template loader & renderer
├── types.ts         # UPDATED: Added RawMappingRow, NormalizedMapping, RenderContext
└── run.ts          # UPDATED: Uses new template API

test/
└── templates.test.ts  # NEW: 20 comprehensive tests
```

## Configuration

Updated `.env.example`:
```env
XSLX_MAPPING_PATH=C:\Users\User\Desktop\MAGNUS\AutoMessager\massege_maping.xlsx
```

## Performance Considerations

- **Caching:** Template map cached in memory with mtime check
- **Async I/O:** Uses `fs.promises` for non-blocking file operations
- **Lazy Logger:** Logger initialized only when needed (no config at module load)
- **Regex Compilation:** Variable patterns compiled per render (potential optimization point)

## Future Enhancements

Consider these optimizations if needed:
1. Pre-compile regex patterns per template
2. Add template validation at load time
3. Support template inheritance/includes
4. Add template versioning
5. Support multiple Excel sheets
6. Add hot-reload watching (current: manual reload on mtime change)

## Migration Notes

**Breaking Changes from Old System:**
- No more `TemplateManager` class
- Functions instead of methods
- Template map passed as parameter (not instance variable)
- Different rendering API (returns object with `text` and optional `viaGlassixTemplate`)

**Backward Compatibility:**
- The old template system has been completely replaced
- Old tests removed and replaced with new comprehensive suite
- `src/run.ts` updated to use new API

---

**Status:** ✅ All implemented, tested, and passing (39/39 tests)

