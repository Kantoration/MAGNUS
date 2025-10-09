# Strengthened Utilities Documentation

## Date Utilities (src/utils/date.ts)

### Timezone Support

All date operations default to **Asia/Jerusalem** timezone to ensure consistency regardless of system timezone.

### Exported Functions

#### `nowTz(tz?: string): dayjs.Dayjs`
Returns a dayjs instance pinned to the specified timezone (defaults to Asia/Jerusalem).

```typescript
import { nowTz } from './utils/date.js';

const now = nowTz(); // Asia/Jerusalem
const nowNY = nowTz('America/New_York'); // Custom timezone
```

#### `todayIso(tz?: string): string`
Returns today's date in ISO format (YYYY-MM-DD) for the specified timezone.

```typescript
import { todayIso } from './utils/date.js';

const date = todayIso(); // "2025-10-09" (in Asia/Jerusalem)
const dateNY = todayIso('America/New_York'); // Custom timezone
```

#### `todayHe(tz?: string): string`
Returns today's date in Hebrew format (DD/MM/YYYY) for the specified timezone.

```typescript
import { todayHe } from './utils/date.js';

const date = todayHe(); // "09/10/2025" (in Asia/Jerusalem)
```

### Key Features

- **No implicit local timezone usage**: All dates are explicitly tied to Asia/Jerusalem
- **DST-aware**: Correctly handles daylight saving time transitions
- **Testable**: Supports custom timezones for testing scenarios
- **Consistent**: Date boundaries respect the configured timezone, not system time

### Testing

See `test/date.tz.spec.ts` for comprehensive timezone tests including:
- Date boundary scenarios (near UTC midnight)
- DST transitions
- Format consistency
- Timezone independence

---

## Phone Utilities (src/phone.ts)

### Strict Israeli Mobile Validation

Phone normalization enforces strict Israeli mobile number patterns by default.

### Exported Functions

#### `normalizeE164(phone: string, country?: CountryCode, permitLandlines?: boolean): string | null`
Standalone function to normalize a phone number to E.164 format.

```typescript
import { normalizeE164 } from './phone.js';

// Valid Israeli mobile
const e164 = normalizeE164('052-123-4567'); // "+972521234567"

// Landline (rejected by default)
const landline = normalizeE164('03-9123456'); // null

// Landline (with permitLandlines flag)
const allowed = normalizeE164('03-9123456', 'IL', true); // "+97239123456"
```

#### `isLikelyILMobile(e164: string): boolean`
Checks if an E.164 number is likely an Israeli mobile number.

```typescript
import { isLikelyILMobile } from './phone.js';

isLikelyILMobile('+972521234567'); // true (052 prefix)
isLikelyILMobile('+972501234567'); // true (050 prefix)
isLikelyILMobile('+972391234567'); // false (03 landline)
```

Valid Israeli mobile prefixes: `050`, `052`, `053`, `054`, `055`, `058`

#### `mask(e164: string): string`
Masks an E.164 phone number for privacy/logging.

Keeps first 5 characters + last 2 visible, middle becomes asterisks.

```typescript
import { mask } from './phone.js';

mask('+972521234567'); // "+9725******67"
mask('+14155551234');  // "+1415*****34"
```

### Accepted Formats (Israeli Mobile)

| Input Format         | Normalized Output  | Notes                    |
|----------------------|-------------------|--------------------------|
| `052-123-4567`       | `+972521234567`   | Local with separators    |
| `0521234567`         | `+972521234567`   | Local without separators |
| `972521234567`       | `+972521234567`   | International no +       |
| `+972521234567`      | `+972521234567`   | Standard E.164           |

### Rejected Patterns

- **Israeli landlines** (default): `03`, `02`, `04`, `08`, `09` prefixes
- **Invalid mobile prefixes**: `056`, `057`, `059` (not allocated)
- **Non-numeric input**: Returns `null`
- **Too short/long**: Must be valid 10-digit Israeli format

### Configuration

The `PhoneNormalizer` class accepts a `permitLandlines` parameter:

```typescript
import { PhoneNormalizer } from './phone.js';

// Default: Reject landlines
const normalizer = new PhoneNormalizer('IL', logger, false);

// Allow landlines
const permissive = new PhoneNormalizer('IL', logger, true);
```

You can also set `PERMIT_LANDLINES=1` in your environment (optional feature).

### Key Features

- **Deterministic**: Same input always produces same output
- **Strict by default**: Rejects non-mobile numbers
- **Israeli-optimized**: Handles all common Israeli number formats
- **Logging**: All normalization attempts are logged for debugging
- **Privacy**: Mask function for secure logging

### Testing

See `test/phone.hardened.spec.ts` for comprehensive tests including:
- All Israeli mobile prefix validation
- Landline rejection/acceptance
- Edge cases (empty, invalid, international)
- Masking correctness

---

## Integration Usage

### In Templates (src/templates.ts)

The template system automatically injects dates using `todayIso()` and `todayHe()`:

```typescript
import { renderMessage } from './templates.js';

const context = {
  first_name: 'דניאל',
  account_name: 'MAGNUS',
  // date_iso and date_he are auto-injected if not provided
};

const result = renderMessage(mapping, context);
// Dates are automatically added using Asia/Jerusalem timezone
```

### In Main Orchestrator (src/run.ts)

Phone normalization is integrated via `PhoneNormalizer`:

```typescript
import { PhoneNormalizer } from './phone.js';

const phoneNormalizer = new PhoneNormalizer('IL');
const e164 = phoneNormalizer.normalize(rawPhone);

if (e164) {
  // Valid mobile number, safe to send
  await glassixClient.sendMessage(e164, message);
}
```

---

## Test Coverage

### Date Timezone Tests (`test/date.tz.spec.ts`)
- ✅ 17 tests covering timezone awareness
- ✅ Date boundary scenarios near UTC midnight
- ✅ DST transition handling
- ✅ Format consistency between ISO and Hebrew dates
- ✅ Custom timezone support

### Phone Hardened Tests (`test/phone.hardened.spec.ts`)
- ✅ 26 tests covering strict validation
- ✅ All Israeli mobile prefixes (050, 052, 053, 054, 055, 058)
- ✅ Landline rejection and permitLandlines flag
- ✅ Masking correctness for various number lengths
- ✅ Edge cases (empty, invalid, international formats)

### Total Test Suite
- **100 tests** passing
- **6 test files**
- Full coverage of date, phone, template, and verification systems

---

## Configuration

### Environment Variables

```bash
# Optional: Allow Israeli landline numbers (default: false)
PERMIT_LANDLINES=1

# Timezone is hardcoded to Asia/Jerusalem but can be overridden in code
# by passing the tz parameter to nowTz(), todayIso(), or todayHe()
```

### Code Configuration

```typescript
// Custom timezone
const date = todayIso('America/New_York');

// Allow landlines
const normalizer = new PhoneNormalizer('IL', logger, true);
```

---

## Best Practices

### Date Handling
1. Always use `nowTz()`, `todayIso()`, or `todayHe()` instead of native Date or dayjs()
2. For custom timezones, pass the `tz` parameter explicitly
3. In tests, use `vi.useFakeTimers()` and `vi.setSystemTime()` for deterministic results

### Phone Normalization
1. Always normalize before sending messages
2. Use `mask()` when logging phone numbers for privacy
3. Handle `null` returns gracefully (invalid numbers)
4. Enable `permitLandlines` only when explicitly required
5. Use `isLikelyILMobile()` for additional validation checks

### Template Integration
1. Let the template system inject dates automatically
2. Provide `date_iso` and `date_he` in context only if you need specific dates
3. Use `link` in context to override mapping link

---

## Debugging

### Enable Debug Logging

```bash
LOG_LEVEL=debug npm run dev
```

### Check Phone Normalization

```typescript
import { normalizeE164, mask } from './phone.js';

const phone = '052-123-4567';
const e164 = normalizeE164(phone);
console.log(`Normalized: ${e164}`); // "+972521234567"
console.log(`Masked: ${mask(e164!)}`); // "+9725******67"
```

### Check Timezone

```typescript
import { nowTz, todayIso, todayHe } from './utils/date.js';

console.log('Current time (IL):', nowTz().format());
console.log('Today ISO:', todayIso());
console.log('Today Hebrew:', todayHe());
```

---

## Migration Notes

### From Previous Version

1. **Date functions now accept timezone parameter**:
   ```typescript
   // Before
   const date = todayIso();

   // After (same behavior, but now timezone-aware)
   const date = todayIso(); // Defaults to Asia/Jerusalem
   ```

2. **Phone validation is now stricter**:
   - Israeli landlines are rejected by default
   - Only valid mobile prefixes (050, 052, 053, 054, 055, 058) are accepted
   - Set `permitLandlines: true` if you need landline support

3. **New masking function**:
   ```typescript
   // Before: Manual masking or plain logging
   logger.info({ phone: e164 }, 'Sending message');

   // After: Use mask() for privacy
   logger.info({ phone: mask(e164) }, 'Sending message');
   ```

---

## Performance

- **Date operations**: O(1), uses dayjs with timezone plugin
- **Phone normalization**: O(n) where n is string length, uses libphonenumber-js/max
- **Masking**: O(n) string operation
- **Caching**: Template map caches based on file mtime

---

## Support

For issues or questions about these utilities:
1. Check the test files for usage examples
2. Review this documentation
3. Enable debug logging for detailed operation info

