# AutoMessager - Quick Start Guide

## ✅ Project Status

Your TypeScript monorepo-lite is fully scaffolded and ready to use!

### What's Included

✅ **Complete source code** in `src/`:
- `config.ts` - Environment variable parsing with Zod validation
- `logger.ts` - Pino logger (singleton, no duplicate handlers)
- `sf.ts` - Salesforce API client using jsforce
- `glassix.ts` - Glassix WhatsApp API client with rate limiting
- `templates.ts` - Excel template loader and message renderer
- `phone.ts` - E.164 phone number normalizer with Israel heuristics
- `run.ts` - Main orchestrator
- `types.ts` - TypeScript type definitions
- `utils/date.ts` - Hebrew/English date formatters

✅ **Unit tests** in `test/`:
- 25 passing tests covering phone normalization, templates, and date formatting
- Vitest configured and working

✅ **Build tools configured**:
- TypeScript strict mode with `moduleResolution: "bundler"`
- ESLint with TypeScript support
- Prettier for code formatting
- All builds, tests, and lints passing ✓

✅ **npm scripts ready**:
- `npm run dev` - Run the worker with tsx
- `npm run build` - Compile TypeScript
- `npm test` - Run tests
- `npm run lint` - Check code quality
- `npm run format` - Format code

## 🚀 Getting Started

### 1. Configure Environment

Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Edit `.env` with your actual credentials:
```env
SF_LOGIN_URL=https://login.salesforce.com
SF_USERNAME=your-salesforce-username@example.com
SF_PASSWORD=your-salesforce-password
SF_TOKEN=your-salesforce-security-token

GLASSIX_BASE_URL=https://api.glassix.com
GLASSIX_API_KEY=your-glassix-api-key

TASKS_QUERY_LIMIT=200
XSLX_MAPPING_PATH=C:\Users\User\Desktop\MAGNUS\AutoMessager\הודעות יומיות לאוטומציה.xlsx
DEFAULT_LANG=he
LOG_LEVEL=info
```

### 2. Prepare Excel Template

Ensure your Excel file (`הודעות יומיות לאוטומציה.xlsx`) has the correct structure:

| TaskType | TemplateHe | TemplateEn | Variables |
|----------|------------|------------|-----------|
| reminder | שלום {{name}}, תזכורת לתאריך {{date}} | Hello {{name}}, reminder for {{date}} | name,date |
| followup | היי {{name}}, מעקב על {{subject}} | Hi {{name}}, follow up on {{subject}} | name,subject |

### 3. Run the Worker

Development mode (with hot reload):
```bash
npm run dev
```

Production build:
```bash
npm run build
node dist/run.js
```

## 📋 Features

### Salesforce Integration
- Fetches tasks for today with status != 'Completed'
- Looks up contact/lead phone numbers automatically
- Configurable query limit

### Phone Number Normalization
- Converts Israeli phone numbers to E.164 format
- Handles various input formats: 050-1234567, 0501234567, +972501234567
- Priority order: MobilePhone → Phone → HomePhone → OtherPhone

### WhatsApp Messaging
- Rate-limited API calls (max 5 concurrent, 100ms between calls)
- Automatic retry logic with Bottleneck
- Detailed logging of success/failures

### Template Rendering
- Loads templates from Excel
- Supports both `{{variable}}` and `{variable}` syntax
- Hebrew and English templates
- Falls back to default message if template not found

### Logging
- Structured JSON logging with Pino
- Configurable log levels (trace, debug, info, warn, error, fatal)
- Pretty printing in development
- No duplicate handlers (singleton pattern)

## 🧪 Testing

Run tests:
```bash
npm test
```

Watch mode:
```bash
npm run test:watch
```

## 🔧 Code Quality

Check linting:
```bash
npm run lint
```

Auto-fix linting issues:
```bash
npm run lint:fix
```

Format code:
```bash
npm run format
```

## 📊 Project Structure

```
AutoMessager/
├── src/
│   ├── config.ts           # Zod-validated config
│   ├── logger.ts           # Pino singleton
│   ├── sf.ts              # Salesforce client
│   ├── glassix.ts         # WhatsApp API client
│   ├── templates.ts       # Excel template loader
│   ├── phone.ts           # Phone normalizer
│   ├── run.ts             # Main orchestrator
│   ├── types.ts           # Type definitions
│   └── utils/
│       └── date.ts        # Date formatters
├── test/
│   ├── phone.test.ts      # Phone tests (13 tests)
│   ├── templates.test.ts  # Template tests (6 tests)
│   └── date.test.ts       # Date tests (6 tests)
├── dist/                  # Compiled JS (gitignored)
├── .env.example           # Environment template
├── package.json           # Dependencies & scripts
├── tsconfig.json          # TypeScript config
├── .eslintrc.json         # ESLint config
├── .prettierrc.json       # Prettier config
├── vitest.config.ts       # Vitest config
└── README.md              # Full documentation

```

## 📝 Next Steps

1. ✅ Configure `.env` with real credentials
2. ✅ Ensure Excel template is properly formatted
3. ✅ Test Salesforce connection: `npm run dev`
4. ✅ Monitor logs for any issues
5. ✅ Set up as a scheduled job (cron/Task Scheduler)

## 🎯 Acceptance Criteria - All Met ✓

- ✅ `npm run dev` runs `src/run.ts` with tsx
- ✅ Lint passes with zero errors
- ✅ All 25 tests pass
- ✅ Logger initialized once (singleton pattern)
- ✅ No duplicate handlers
- ✅ TypeScript strict mode enabled
- ✅ `moduleResolution: "bundler"` configured
- ✅ All source files complete with working code
- ✅ No TODOs left in code

## 🆘 Troubleshooting

### "Invalid environment configuration"
- Ensure all required variables are set in `.env`
- Check that file paths are correct (especially the Excel path)

### "No matching version found for jsforce"
- Already fixed: using jsforce v3.10.8

### "Could not find template"
- Check Excel file exists at specified path
- Verify TaskType column matches exactly (case-insensitive)

### Phone number returns null
- Check phone format in Salesforce
- Israeli numbers should start with 0 or +972
- Run tests to verify normalizer: `npm test -- phone`

---

**Built with ❤️ by your Senior Staff Engineer AI Assistant**

