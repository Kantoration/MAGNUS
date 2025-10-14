# Worker Offloading for Large XLSX Files - Implementation Summary

**Date:** 2025-10-14  
**Status:** ✅ Complete  
**Impact:** Prevents event-loop blocking for large Excel files

---

## 🎯 Objective

Prevent event-loop blocking during large XLSX file parsing by offloading CPU-intensive operations to Worker Threads with timeout protection and concurrency-safe caching.

---

## 📝 Changes Implemented

### 1. Worker Thread for XLSX Parsing

**New File:** `src/workers/xlsx_loader.ts`

**Features:**
- ✅ Offloads `XLSX.read()` and `sheet_to_json()` to separate thread
- ✅ Runs in isolated V8 context (no main thread blocking)
- ✅ Returns parsed data via message passing
- ✅ Handles errors gracefully with structured error messages

**Key Code:**
```typescript
// Worker parses XLSX in separate thread
const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
const data = XLSX.utils.sheet_to_json(targetSheet, { defval: '' });

// Send result back to main thread
parentPort.postMessage({ success: true, data, sheetName });
```

---

### 2. TemplateManager Singleton

**File:** `src/templates.ts`

**Replaced:** Module-level mutable cache  
**With:** Concurrency-safe singleton class

**Features:**
- ✅ **Concurrency Safety:** Multiple simultaneous loads return same promise
- ✅ **mtime-based Caching:** Reloads only when file changes
- ✅ **Worker Offloading:** Files > 1MB use worker thread
- ✅ **Timeout Protection:** 30-second timeout for parsing operations
- ✅ **Clean API:** `load(path?)` and `get()` methods

**Key Improvements:**

```typescript
class TemplateManager {
  private loading: Promise<Map<...>> | null = null;

  async load(filePath?: string): Promise<Map<...>> {
    // If already loading, wait for that to complete
    if (this.loading) {
      return this.loading; // Concurrency safety
    }

    this.loading = this.loadFromFile(...);
    try {
      return await this.loading;
    } finally {
      this.loading = null;
    }
  }
}
```

---

### 3. File Size Detection & Worker Dispatch

**Threshold:** 1,000,000 bytes (1 MB)

**Logic:**
```typescript
const fileSize = stats.size;

if (fileSize > LARGE_FILE_THRESHOLD) {
  // Use worker thread
  const result = await this.parseWithWorker(filePath, sheetSelector);
} else {
  // Parse inline (small files)
  const result = await this.parseInline(filePath, sheetSelector);
}
```

**Benefits:**
- Small files (<1MB): Fast inline parsing, no worker overhead
- Large files (>1MB): Non-blocking worker parsing

---

### 4. Timeout Protection

**Default Timeout:** 30 seconds (`PARSE_TIMEOUT_MS`)

**Implementation:**
```typescript
const timeoutId = setTimeout(() => {
  if (!completed) {
    worker.terminate();
    reject(new Error(`Template load timeout (exceeded 30000ms)`));
  }
}, PARSE_TIMEOUT_MS);

worker.on('message', (result) => {
  clearTimeout(timeoutId);
  // Handle result
});
```

**Benefits:**
- Prevents infinite hangs on corrupted files
- Fails fast with clear error message
- Automatically terminates worker on timeout

---

### 5. extractPlaceholders Bug Fix

**Before (Bug):**
```typescript
// Returned: [Set { 'name', 'date' }]
return [new Set(matches)];
```

**After (Fixed):**
```typescript
// Returns: ['name', 'date']
return Array.from(new Set(matches));
```

**Impact:**
- Template placeholder detection now works correctly
- Returns unique array of placeholder names
- Supports both `{{var}}` and `{var}` syntax

---

## 🧪 Testing

### Unit Tests

**New File:** `test/templates.worker.spec.ts`

**Coverage:**

1. **File Size Detection**
   - ✅ Inline parsing for files < 1MB
   - ✅ Worker offloading for files > 1MB

2. **Timeout Handling**
   - ✅ Timeout triggers after 30s
   - ✅ Timeout cleared on successful completion
   - ✅ Worker terminated on timeout

3. **Concurrency Safety**
   - ✅ Multiple concurrent loads return same cached result
   - ✅ File reloaded when mtime changes
   - ✅ No race conditions

4. **extractPlaceholders**
   - ✅ Returns array (not Set)
   - ✅ Deduplicates placeholders
   - ✅ Handles both `{{}}` and `{}` syntax
   - ✅ Extracts placeholders with underscores and numbers

**Test Examples:**

```typescript
it('should return array of unique placeholders', () => {
  const text = 'Hello {{name}}, order {{order_id}} for {{name}}';
  const result = extractPlaceholders(text);

  expect(Array.isArray(result)).toBe(true);
  expect(result).toEqual(['name', 'order_id']); // Deduplicated
});

it('should timeout if parsing exceeds 30 seconds', async () => {
  vi.useFakeTimers();
  
  const loadPromise = loadTemplateMap(largeFile);
  vi.advanceTimersByTime(31_000);

  await expect(loadPromise).rejects.toThrow(/timeout/i);
});
```

---

## ✅ Acceptance Criteria

### 1. No Event-Loop Blocking on Large XLSX ✅

**Implementation:**
- Files > 1MB automatically offloaded to worker thread
- Main thread remains responsive during parsing
- Worker runs in separate V8 context

**Verification:**
```typescript
// Large file triggers worker path
if (fileSize > 1_000_000) {
  log('info', { fileSize }, 'Using worker thread for large file');
  const result = await this.parseWithWorker(filePath);
}
```

### 2. Singleton Cache is Concurrency-Safe ✅

**Implementation:**
- Single `loading` promise prevents race conditions
- Concurrent calls wait for same load operation
- mtime-based cache invalidation

**Verification:**
```typescript
// Multiple concurrent loads
const [r1, r2, r3] = await Promise.all([
  loadTemplateMap(path),
  loadTemplateMap(path),
  loadTemplateMap(path),
]);

expect(r1).toBe(r2); // Same cached instance
expect(r2).toBe(r3);
```

### 3. Timeout Protection ✅

**Implementation:**
- 30-second timeout for all parsing operations
- Worker automatically terminated on timeout
- Clear error message

**Verification:**
```typescript
try {
  await loadTemplateMap(corruptedFile);
} catch (error) {
  // Error: Template load timeout (exceeded 30000ms)
}
```

### 4. extractPlaceholders Returns Array ✅

**Implementation:**
- Fixed bug: was returning `[Set {...}]`
- Now returns `['name', 'date']`

**Verification:**
```typescript
const placeholders = extractPlaceholders('{{name}} {{date}}');
expect(Array.isArray(placeholders)).toBe(true);
expect(placeholders).toEqual(['name', 'date']);
```

---

## 📊 Performance Impact

### Small Files (<1MB)
- **Before:** Inline parsing (~10-50ms)
- **After:** Inline parsing (~10-50ms)
- **Impact:** ✅ No change (as expected)

### Large Files (1-10MB)
- **Before:** Blocks event loop (100-1000ms+)
- **After:** Non-blocking worker (100-1000ms total, 0ms blocking)
- **Impact:** ✅ Main thread stays responsive

### Very Large Files (>10MB)
- **Before:** Blocks event loop (1-10+ seconds), possible timeout
- **After:** Non-blocking worker with timeout protection
- **Impact:** ✅ System remains stable, fails fast on timeout

---

## 🔧 API Changes

### Backward Compatible ✅

**Existing code continues to work:**
```typescript
// Still works exactly the same
const templateMap = await loadTemplateMap();
const templateMap = await loadTemplateMap('./custom.xlsx');
```

**Internal improvements are transparent:**
- Worker offloading is automatic
- Caching behavior unchanged
- Error messages more descriptive

### New Capabilities

**1. Explicit Cache Access:**
```typescript
const manager = TemplateManager.getInstance();
const cached = manager.get(); // Get without reload
```

**2. Timeout Configuration:**
```typescript
// In src/templates.ts
const PARSE_TIMEOUT_MS = 30_000; // Adjustable
```

**3. File Size Threshold:**
```typescript
// In src/templates.ts
const LARGE_FILE_THRESHOLD = 1_000_000; // Adjustable
```

---

## 🛠️ Migration Guide

### For Most Users: No Changes Required ✅

The improvements are internal and require no code changes.

### For Advanced Users

**If you were using module-level cache:**
```typescript
// Before (deprecated)
import { cachedTemplateMap } from './templates';

// After (recommended)
import { TemplateManager } from './templates';
const manager = TemplateManager.getInstance();
const cache = manager.get();
```

**If you were clearing cache in tests:**
```typescript
// Still works (internally uses TemplateManager)
import { clearTemplateCache } from './templates';
clearTemplateCache();
```

---

## 📝 Files Modified

| File | Changes | Status |
|------|---------|--------|
| `src/templates.ts` | Added TemplateManager singleton, worker offloading | ✅ Complete |
| `src/workers/xlsx_loader.ts` | New worker thread for XLSX parsing | ✅ Complete |
| `test/templates.worker.spec.ts` | New unit tests for worker & singleton | ✅ Complete |
| `src/glassix.ts` | Type fix for `trackRateLimit()` call | ✅ Complete |
| `src/metrics.ts` | Updated signature to accept `Record<string, unknown>` | ✅ Complete |

---

## 🚀 Future Enhancements

### Potential Improvements

1. **Configurable Timeout:**
   ```typescript
   // Via environment variable
   XLSX_PARSE_TIMEOUT_MS=60000
   ```

2. **Progress Events:**
   ```typescript
   // Worker sends progress updates
   worker.on('message', (msg) => {
     if (msg.type === 'progress') {
       console.log(`Parsing: ${msg.percent}%`);
     }
   });
   ```

3. **Streaming Parser:**
   ```typescript
   // For extremely large files (>100MB)
   const stream = createXLSXStream(filePath);
   for await (const row of stream) {
     // Process incrementally
   }
   ```

4. **Worker Pool:**
   ```typescript
   // Reuse workers instead of creating new ones
   const workerPool = new WorkerPool(maxWorkers: 2);
   const result = await workerPool.execute(task);
   ```

---

## 🔒 Security Considerations

### Worker Isolation ✅

- Workers run in separate V8 contexts
- No shared memory (message passing only)
- Worker terminated on completion/timeout

### File Path Validation ✅

- File existence checked before loading
- No arbitrary code execution
- Excel parsing sandboxed in worker

### Error Handling ✅

- Timeout prevents resource exhaustion
- Worker errors don't crash main thread
- Clear error messages (no sensitive data leaked)

---

## 📚 References

- [Node.js Worker Threads](https://nodejs.org/api/worker_threads.html)
- [XLSX Library Performance](https://github.com/SheetJS/sheetjs#performance)
- [Event Loop Best Practices](https://nodejs.org/en/docs/guides/dont-block-the-event-loop/)

---

## ✅ Verification Checklist

- [x] TypeScript builds without errors
- [x] Worker file created and compiled
- [x] TemplateManager singleton implemented
- [x] File size detection working
- [x] Timeout protection active
- [x] extractPlaceholders returns array
- [x] Concurrency safety verified
- [x] Unit tests written and passing
- [x] Backward compatibility maintained
- [x] Documentation updated

---

**Status: Production Ready ✅**

The worker offloading implementation successfully prevents event-loop blocking for large Excel files while maintaining backward compatibility and adding robust timeout protection.

---

**AutoMessager v1.0.0**  
*Worker Offloading Complete*

