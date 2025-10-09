# AutoMessager

Automation worker that reads Salesforce Tasks and sends WhatsApp messages via Glassix.

## Features

- 📋 Fetches daily tasks from Salesforce
- 📞 Looks up contact phone numbers with E.164 normalization
- 💬 Sends personalized WhatsApp messages via Glassix API
- 📊 Loads message templates from Excel file
- 🌐 Supports Hebrew and English message templates
- 📝 Structured logging with Pino
- 🔒 Type-safe configuration with Zod validation
- ⚡ Rate-limited API calls with Bottleneck

## Prerequisites

- Node.js 20+
- npm or yarn
- Salesforce account with API access
- Glassix account with API key
- Excel file with message templates

## Installation

```bash
npm install
```

## Configuration

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Fill in your credentials in `.env`:
```env
SF_LOGIN_URL=https://login.salesforce.com
SF_USERNAME=your-salesforce-username@example.com
SF_PASSWORD=your-salesforce-password
SF_TOKEN=your-salesforce-security-token

GLASSIX_BASE_URL=https://api.glassix.com
GLASSIX_API_KEY=your-glassix-api-key

TASKS_QUERY_LIMIT=200
DEFAULT_LANG=he
LOG_LEVEL=info
```

### Excel Template File Path

By default, the app looks for `massege_maping.xlsx` in the same directory as the app.

**Option 1: Default (Recommended)**
Place your Excel file alongside the app:
```
AutoMessager/
  ├── massege_maping.xlsx  ← Place your file here
  ├── src/
  ├── package.json
  └── ...
```

**Option 2: Custom Path via Environment Variable**
Override the path in `.env` (requires proper escaping on Windows):
```env
# Windows: Use double backslashes or forward slashes
XSLX_MAPPING_PATH=C:\\Users\\User\\Desktop\\MAGNUS\\AutoMessager\\massege_maping.xlsx
# OR
XSLX_MAPPING_PATH=C:/Users/User/Desktop/MAGNUS/AutoMessager/massege_maping.xlsx

# Linux/Mac: Use absolute or relative path
XSLX_MAPPING_PATH=/home/user/templates/massege_maping.xlsx
# OR
XSLX_MAPPING_PATH=./templates/massege_maping.xlsx
```

**Important:** On Windows, backslashes in paths must be escaped (`\\`) or use forward slashes (`/`).

## Usage

### Development Mode

Run the worker with hot reload:
```bash
npm run dev
```

### Build

Compile TypeScript to JavaScript:
```bash
npm run build
```

### Test

Run unit tests:
```bash
npm test
```

Watch mode:
```bash
npm run test:watch
```

### Lint

Check code style:
```bash
npm run lint
```

Fix linting issues:
```bash
npm run lint:fix
```

### Format

Format code with Prettier:
```bash
npm run format
```

### Verification

Verify Excel mapping system is working correctly:
```bash
npm run verify:mapping
```

This verification harness:
- Confirms the Excel file is accessible
- Validates Hebrew column parsing
- Checks that mappings are loaded correctly
- Tests message rendering with date and link injection
- Provides detailed diagnostics on failure

**Expected output:**
```
[info] mapping-path: C:\Users\User\Desktop\MAGNUS\AutoMessager\massege_maping.xlsx
[info] mapping-mtime: 10/9/2025, 12:34:56 PM
[info] mapping-size: 10
[info] keys-sample: ["NEW_PHONE","PAYMENT_REMINDER","WELCOME",...]
[info] probe-NEW_PHONE: "שלום דניאל! חברת MAGNUS, מכשיר S24 (תאריך: 09/10/2025) https://..."
[info] verify: OK
```

**Configuration:**
The verification uses `XSLX_MAPPING_PATH` from your `.env` file, or defaults to:
```
C:\Users\User\Desktop\MAGNUS\AutoMessager\massege_maping.xlsx
```

**Failure scenarios:**
- ❌ File not found → Shows absolute path that was attempted
- ❌ Required columns missing → Indicates which Hebrew columns are needed
- ❌ Map is empty → No valid rows loaded
- ❌ Link auto-append failed → Link injection not working correctly

## Project Structure

```
src/
├── config.ts       # Environment configuration with Zod
├── logger.ts       # Pino logger singleton
├── sf.ts          # Salesforce API client (jsforce)
├── glassix.ts     # Glassix WhatsApp API client
├── templates.ts   # Excel template loader and renderer
├── phone.ts       # Phone number normalization (E.164)
├── run.ts         # Main orchestrator
├── types.ts       # TypeScript type definitions
└── utils/
    └── date.ts    # Hebrew/English date formatters

test/
├── phone.test.ts
├── templates.test.ts
└── date.test.ts
```

## Excel Template Format

The Excel file should have the following columns:

| TaskType | TemplateHe | TemplateEn | Variables |
|----------|------------|------------|-----------|
| reminder | שלום {{name}}, תזכורת לתאריך {{date}} | Hello {{name}}, reminder for {{date}} | name,date |

Variables can use either `{{var}}` or `{var}` syntax.

## License

MIT

