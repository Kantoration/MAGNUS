# 📱 AutoMessager - Automated WhatsApp Communication System

> **Transform your Salesforce tasks into personalized WhatsApp messages automatically. Perfect 1:1 replication of manual workflows with intelligent template matching, WhatsApp compliance, and complete audit trails.**

## 🎯 What Does This System Do?

AutoMessager connects your Salesforce tasks with WhatsApp messaging, making customer communication **automatic, consistent, and scalable**. Think of it as a smart assistant that perfectly replicates what your team does manually:

1. **Reads your to-do list** (Salesforce tasks marked for automation) - *Just like opening SFDC reports*
2. **Checks customer details** (pulls name, phone number, account from Salesforce) - *Just like manual data extraction*
3. **Chooses the right message** (intelligent template matching + Excel fallback) - *Just like selecting templates in Glassix UI*
4. **Fills in the blanks** (replaces placeholders like `{{first_name}}` with actual customer names) - *Just like template auto-population*
5. **Sends the message** (via WhatsApp through Glassix with proper conversation metadata) - *Just like manual send*
6. **Records what happened** (updates Salesforce + creates Contact/Lead audit tasks) - *Just like manual status logging*
7. **Handles problems automatically** (retries failed messages, logs errors for review) - *Enhanced error handling*

### **Real-World Example**

```
STEP 1: SALESFORCE TASK
─────────────────────────────────────────────
Task ID: 00T1x000001
Task_Type_Key__c: "NEW_PHONE"    ← This is the matching key!
Ready_for_Automation__c: true
Contact: Daniel Cohen
  └─ FirstName: "דניאל"
  └─ Phone: "+972501234567"
  └─ Account.Name: "MAGNUS"
Device_Model__c: "S24"

STEP 2: EXCEL LOOKUP (messages_v1.xlsx)
─────────────────────────────────────────────
Excel Row where column "שם סוג משימה" = "NEW_PHONE":

| שם סוג משימה | מלל הודעה                                          | קישור                        |
|--------------|---------------------------------------------------|------------------------------|
| NEW_PHONE    | שלום {{first_name}}! חברת MAGNUS מודיעה כי        | https://magnus.co.il/devices |
|              | המכשיר {{device_model}} מוכן לאיסוף.              |                              |

STEP 3: FINAL MESSAGE SENT
─────────────────────────────────────────────
To: +972***4567 (phone number masked in logs)

שלום דניאל! חברת MAGNUS מודיעה כי המכשיר S24 מוכן לאיסוף.
(תאריך: 14/10/2025)
https://magnus.co.il/devices
```

## 🚀 Quickstart Guide

### **Option A: Binary Client (No Node.js Required)**

1. **Download** the client kit for your platform
2. **Create `.env` file** with your credentials (see templates/.env.example)
3. **Add your Excel file** (`messages_v1.xlsx`) to the same folder
4. **Run setup:** `./automessager-win.exe init` (Windows) or `./automessager-mac init` (macOS)
5. **Verify:** `./automessager-win.exe doctor`
6. **Test:** `./automessager-win.exe dry-run`
7. **Go live:** `./automessager-win.exe run`

### **Option B: Source Install (For Developers)**

1. **Install:** `npm install && npm run build`
2. **Setup:** `npm run cli:init` (interactive wizard)
3. **Verify:** `npm run cli:verify`
4. **Test:** `npm run cli:dry`
5. **Run:** `npm run cli:run`

## 📋 Daily Usage: Simple 3-Step Process

### **Step 1: Create a Task**
1. Go to any **Contact** or **Lead** record in Salesforce
2. Click **"New Task"** (or **"Log a Call"**)
3. Fill in basic details:
   - **Subject**: "Send welcome message to customer"
   - **Type**: "WhatsApp Message" (optional)
   - **Due Date**: Today or tomorrow

### **Step 2: Mark for Automation**
1. **Check the box** next to **"📱 Send WhatsApp Message"** ✅
2. **Save the Task**

### **Step 3: Done!**
The AutoMessager system will automatically:
- ✅ Find this task
- ✅ Send the WhatsApp message using the correct template
- ✅ Mark the task as completed
- ✅ Update the task with delivery details and conversation link

## 🎯 Supported Messaging Tasks

The system supports all 9 distinct daily messaging tasks from your manual workflow:

| Task Type | Description | Example Message |
|-----------|-------------|-----------------|
| **NEW_PHONE_READY** | Device ready for pickup | "שלום דניאל! המכשיר S24 מוכן לאיסוף" |
| **PAYMENT_REMINDER** | Payment due reminder | "שלום שרה, יש לך חוב של 250 שקל" |
| **TRAINING_LINK** | Training materials delivery | "שלום מיקי, קישור להדרכה: [link]" |
| **APPOINTMENT_CONFIRMATION** | Service appointment confirmation | "שלום [name], תור אושר ל-[date]" |
| **WELCOME_MESSAGE** | New customer welcome | "ברוכים הבאים ל-MAGNUS!" |
| **RETURN_INSTRUCTIONS** | Device return instructions | "שלום [name], הוראות החזרה..." |
| **SATELLITE_CONNECTION_FINISH** | Satellite connection completion | "שלום [name], החיבור הושלם בהצלחה" |
| **MAINTENANCE_REMINDER** | Device maintenance reminder | "שלום [name], תזכורת לתחזוקה" |
| **SERVICE_FOLLOWUP** | Post-service follow-up | "שלום [name], איך הייתה השירות?" |

## ⚙️ Salesforce Setup (One-Time)

Your Salesforce administrator needs to create this custom field:

### **Step 1: Create the Custom Field**
1. **Go to Setup** → **Object Manager** → **Task**
2. **Create Custom Field**:
   - **Field Type**: Checkbox
   - **Field Name**: `Ready_for_Automation__c`
   - **Field Label**: "📱 Send WhatsApp Message"
   - **Default Value**: Unchecked
   - **Help Text**: "Check this box to automatically send WhatsApp message for this task"

### **Alternative Setup Options**

**Option A: Use Task Status**
```
Task Status Values:
- "Not Started" (default)
- "Ready for Automation" ← AutoMessager processes these
- "Completed"
- "Cancelled"
```

**Option B: Use Task Type**
```
Task Type Values:
- "Call"
- "Email" 
- "WhatsApp Message" ← AutoMessager processes these
- "Meeting"
```

## 🔄 The Complete Workflow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. FETCH TASKS                                              │
│    • Connects to Salesforce                                 │
│    • Finds tasks with "Ready_for_Automation__c = true"      │
│    • Pulls up to 200 tasks per batch (configurable)         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. LOAD TEMPLATES                                           │
│    • Opens your Excel file (messages_v1.xlsx)               │
│    • Reads Hebrew column headers                            │
│    • Validates templates have required placeholders         │
│    • Caches in memory for speed                             │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. PROCESS EACH TASK (in parallel, max 5 at once)           │
│    For each task:                                           │
│    a) Find the right template (matches TaskType field)      │
│    b) Get customer phone (from Contact or Account)          │
│    c) Validate phone (supports IL, US, GB, DE, FR)          │
│    d) Render message (fill in {{first_name}}, {{date}})     │
│    e) Send via WhatsApp                                     │
│    f) Update Salesforce with status                         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. HANDLE RESULTS                                           │
│    • SUCCESS: Mark task complete, save conversation URL     │
│    • FAILURE: Log error, mark failed with reason            │
│    • SKIP: No template/phone, log why and continue          │
│    • All outcomes logged for audit trail                    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. REPORT & CLEANUP                                         │
│    • Print summary (Sent: X, Failed: Y, Skipped: Z)         │
│    • Write metrics (if configured)                          │
│    • Close connections gracefully                           │
│    • Repeat for next page if more tasks exist               │
└─────────────────────────────────────────────────────────────┘
```

**In simple terms**: AutoMessager automates sending the right WhatsApp message to the right customer at the right time, based on your Salesforce workflow—safely, reliably, and at scale.

## 🛡️ Key Enhancements Over Manual Workflow

### **WhatsApp Compliance & Template Intelligence**
- ✅ **100% WhatsApp Compliance**: Only uses approved Glassix templates (no free text for first messages)
- ✅ **Intelligent Template Matching**: Auto-matches Excel messages to Glassix templates using Hebrew text normalization
- ✅ **Pre-send Validation**: Validates parameter count/order against chosen template before sending
- ✅ **Daily Deduplication**: Prevents sending identical templates to same recipient within 24 hours

### **Natural Hebrew UI Integration**
- ✅ **Hebrew Subject Policy**: `"המכשיר מוכן לאיסוף · MAGNUS"` instead of `"AutoMessager: NEW_PHONE_READY"`
- ✅ **Proper Customer Names**: `"דניאל כהן"` format with intelligent fallbacks
- ✅ **Conversation Metadata**: Creates Glassix conversations indistinguishable from manual work

### **Complete Audit Trail**
- ✅ **Contact/Lead Audit Tasks**: Creates `"Glassix: NEW_PHONE_READY (auto)"` tasks on Contact/Lead records
- ✅ **Deterministic Idempotency**: `TaskId#TemplateName#VariableHash` prevents accidental duplicates
- ✅ **Error Taxonomy**: Structured error classification for operations dashboards

### **Enhanced Reliability**
- ✅ **Template Parameter Validation**: Fail fast with clear error messages
- ✅ **Hebrew Text Processing**: Normalizes niqqud and RTL punctuation for stable matching
- ✅ **Error Recovery**: Graceful degradation with comprehensive logging

## 📞 Non-Technical User Guide

### **Understanding the "Ready for Automation" Checkbox**

AutoMessager uses a simple checkbox in Salesforce called `Ready_for_Automation__c` to know which tasks should be processed automatically. Think of it as a **"Send WhatsApp Message" button** - when checked, it tells the system "This task is ready to be automated."

### **🎯 Real-World Examples**

#### **Example 1: Customer's Phone is Ready for Pickup**

**What you do:**
1. **Open Salesforce** → Go to customer's contact record
2. **Click "New Task"**
3. **Fill out:**
   - Subject: "Phone ready - Daniel Cohen"
   - Type: "Device Ready"
   - Due Date: Today
   - **✅ Check "📱 Send WhatsApp Message"**
4. **Save**

**What happens automatically:**
- AutoMessager finds the task
- Looks up the message template for "Device Ready"
- Sends WhatsApp: *"שלום דניאל! המכשיר S24 מוכן לאיסוף"*
- Updates the task: "✅ Completed - Message sent successfully"

#### **Example 2: Payment Reminder**

**What you do:**
1. **Create Task** on customer's contact
2. **Subject**: "Payment reminder - Sarah Miller"
3. **Type**: "Payment Reminder"
4. **✅ Check "📱 Send WhatsApp Message"**
5. **Save**

**What happens automatically:**
- Sends WhatsApp: *"שלום שרה, יש לך חוב של 250 שקל. תאריך תשלום: 15/01/2025"*
- Includes payment link from your Excel template
- Marks task as completed

### **📋 Daily Operations Workflow**

#### **Morning Routine (5 minutes):**
1. **Check Salesforce** for tasks marked "📱 Send WhatsApp Message"
2. **Review** customer details and phone numbers
3. **Verify** AutoMessager is running (or run it manually)
4. **Check** delivery status in completed tasks

#### **Throughout the Day:**
1. **Create new tasks** as customers need messages
2. **Check the automation box** ✅
3. **Save** - messages send automatically!

#### **End of Day:**
1. **Review failed tasks** (if any)
2. **Handle manual follow-ups** for failed messages
3. **Check delivery reports** in Salesforce

### **💡 Best Practices**

#### **✅ Do's:**
- **Always verify** customer phone numbers before checking the box
- **Use clear, descriptive** task subjects (e.g., "Welcome message - John Smith")
- **Check the box only** when ready to send immediately
- **Review failed tasks** daily and fix issues
- **Use consistent task types** for better template matching

#### **❌ Don'ts:**
- **Don't check the box** for test messages or internal tasks
- **Don't create duplicate tasks** for the same customer
- **Don't leave tasks checked** for days without processing
- **Don't use the automation** for sensitive or urgent messages without verification

### **🔍 Understanding Task Statuses**

#### **✅ Completed Tasks:**
- **Status**: "Completed"
- **Delivery Status**: "SENT"
- **Glassix Link**: Click to view the WhatsApp conversation
- **Audit Trail**: Full history of what happened

#### **❌ Failed Tasks:**
- **Status**: "Waiting on External"
- **Failure Reason**: Clear explanation (e.g., "Invalid phone number")
- **Ready for Automation**: Still checked (for retry)

#### **⏳ Pending Tasks:**
- **Status**: "Not Started"
- **Ready for Automation**: ✅ Checked
- **Next**: Will be processed in next AutoMessager run

### **🚨 Troubleshooting Common Issues**

#### **"Message not sent" - What to check:**
1. **Phone Number**: Is it in correct format (+972501234567)?
2. **Customer Name**: Does the contact have a valid name?
3. **Template Match**: Does your Excel file have a template for this task type?
4. **Template Approval**: Is the Glassix template approved?

#### **"Task still pending" - What to check:**
1. **AutoMessager Running**: Is the system running automatically or manually?
2. **Task Type**: Does the task type match your Excel template names?
3. **Hold Queue**: Check if template needs approval (rare)

### **🎯 Quick Reference Card**

**For Daily Use:**
1. **Create Task** on customer contact
2. **Fill Subject**: "Message type - Customer Name"
3. **Check Box**: "📱 Send WhatsApp Message" ✅
4. **Save** - Done!

**Task Types That Work:**
- Device Ready
- Payment Reminder
- Training Link
- Welcome Message
- Appointment Confirmation
- Service Follow-up

**What Happens Automatically:**
- ✅ Finds customer phone and name
- ✅ Matches message template
- ✅ Sends WhatsApp message
- ✅ Updates task with results
- ✅ Creates audit trail

---

**Remember: It's as simple as creating a task and checking one box! The system handles everything else automatically.** 🚀

## 🧩 For Developers: Technical Details

### **🚀 Quick Reference - CLI Commands**

| Command | Purpose | Example |
|---------|---------|---------|
| `automessager init` | Interactive setup wizard - creates/updates .env file | First-time setup |
| `automessager verify` | Test all connections (Salesforce, Glassix, Excel, phone validation) | Pre-deployment check |
| `automessager dry-run` | Preview messages without sending (validates entire workflow) | Test before going live |
| `automessager run` | Execute normally - send messages to customers | Daily production run |
| `automessager doctor` | Deep diagnostics with prescriptive troubleshooting | When things aren't working |
| `automessager discover-templates` | Discover Glassix templates and test matching | Template discovery |
| `automessager discover-templates --why` | Show why templates don't match (top 3 candidates) | Debug template matching |

### **Testing Commands**

| Command | Purpose | Example |
|---------|---------|---------|
| `npm run smoke:glassix` | Send real template message to test number | `TEST_E164=+9725XXXXXXX npm run smoke:glassix` |
| `npm run test:e2e` | Run comprehensive E2E tests | `GLASSIX_BASE_URL=... TEST_E164=+9725XXXXXXX npm run test:e2e` |
| `npm run test:comprehensive` | Run all comprehensive test suites | `npm run test:comprehensive` |

### **Configuration**

Copy `.env.example` to `.env` and fill in your credentials:

```env
# Salesforce Configuration
SF_LOGIN_URL=https://login.salesforce.com
SF_USERNAME=your-salesforce-username@example.com
SF_PASSWORD=your-salesforce-password
SF_TOKEN=your-salesforce-security-token

# Glassix Configuration (Modern: Access Token Flow)
GLASSIX_BASE_URL=https://api.glassix.com
GLASSIX_API_KEY=your-glassix-api-key
GLASSIX_API_SECRET=your-glassix-api-secret

# Excel Mapping Configuration
XSLX_MAPPING_PATH=./massege_maping.xlsx

# Application Behavior
KEEP_READY_ON_FAIL=true
PERMIT_LANDLINES=false
DEFAULT_LANG=he

# Retry Configuration
RETRY_ATTEMPTS=3
RETRY_BASE_MS=300

# Logging
LOG_LEVEL=info
```

### **Architecture Overview**

```
┌──────────────────┐
│   Salesforce     │  ← Source of Truth
│   (CRM System)   │     • Customer data
│                  │     • Tasks to process
└────────┬─────────┘     • Update tracking
         │
         │ 1. Fetch Tasks
         │ (SOQL Query)
         ↓
┌──────────────────┐
│  AutoMessager    │  ← This Application
│  (Node.js App)   │     • Reads tasks
│                  │     • Loads templates
│  Components:     │     • Personalizes messages
│  • sf.ts         │     • Orchestrates flow
│  • templates.ts  │
│  • run.ts        │
└────────┬─────────┘
         │
         │ 2. Send Messages
         │ (HTTP API)
         ↓
┌──────────────────┐
│    Glassix       │  ← WhatsApp Gateway
│  (Messaging API) │     • Delivers WhatsApp
│                  │     • Provides conversation URLs
└────────┬─────────┘     • Returns delivery status
         │
         │ 3. Deliver
         │
         ↓
┌──────────────────┐
│    Customer      │  ← End User
│  (WhatsApp)      │     • Receives message
│                  │     • Can respond
└──────────────────┘
```

### **Technology Stack**

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Language** | TypeScript | Type safety and developer productivity |
| **Runtime** | Node.js 20+ | Server-side JavaScript execution |
| **CRM Integration** | jsforce | Salesforce API client |
| **Messaging** | Glassix API | WhatsApp message delivery |
| **Templates** | Excel (XLSX) | Business-friendly template management |
| **Validation** | Zod | Runtime type checking |
| **Logging** | Pino | High-performance structured logging |
| **Phone** | libphonenumber-js | International phone number validation |
| **Date/Time** | dayjs | Date formatting (Asia/Jerusalem TZ) |
| **Rate Limiting** | Bottleneck | API rate limit compliance |
| **Concurrency** | p-map | Parallel task processing |

### **Key Features**

#### 🛡️ **Reliability**
- **Automatic retries** - Exponential backoff on failures
- **Error recovery** - Graceful degradation, never crashes
- **Idempotency** - Safe to re-run without duplicates
- **Field detection** - Works with or without custom Salesforce fields
- **Process handlers** - Clean shutdown on system signals

#### ⚡ **Performance**
- **Concurrent processing** - 5 tasks in parallel
- **Paging support** - Handle thousands of tasks
- **Template caching** - Reload only when file changes
- **Rate limiting** - Respects Glassix API limits (250ms between calls)

#### 🔒 **Security**
- **PII masking** - Phone numbers never appear in logs
- **Secret redaction** - API keys and passwords automatically hidden
- **Type safety** - 100% TypeScript strict mode
- **Input validation** - All external data validated with Zod schemas

#### 🎨 **Flexibility**
- **17 configuration options** - Tune for your needs
- **DRY_RUN mode** - Preview without sending
- **Header aliasing** - Excel columns can be Name/name/NAME
- **Sheet selection** - Use any sheet in your workbook
- **Landline support** - Configurable mobile-only or include landlines

### **Project Structure**

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

### **Excel Template Format**

The Excel file should have the following columns:

| TaskType | TemplateHe | TemplateEn | Variables |
|----------|------------|------------|-----------|
| reminder | שלום {{name}}, תזכורת לתאריך {{date}} | Hello {{name}}, reminder for {{date}} | name,date |

Variables can use either `{{var}}` or `{var}` syntax.

## 📚 Documentation & Support

### **Quick Help**

**Something not working?** Run these commands:

```bash
automessager doctor    # Diagnose all systems
automessager verify    # Quick health check
```

**Need support?** Create a safe diagnostic bundle:

```bash
automessager support-bundle
# Creates redacted ZIP with logs (no secrets)
```

### **Documentation**

- **[docs/README.md](docs/README.md)** - Documentation index (start here)
- **[docs/README-QUICKSTART.md](docs/README-QUICKSTART.md)** - 5-minute setup guide
- **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** - Top 10 issues and solutions
- **[SETUP.md](SETUP.md)** - Detailed configuration guide
- **[RELEASE_NOTES_v2.0.0.md](RELEASE_NOTES_v2.0.0.md)** - 🆕 Perfect Manual Workflow Replication
- **[TESTING.md](TESTING.md)** - End-to-end testing guide

## 📄 FAQ

### **Where do I put the `.env` and Excel files?**

**Answer:** In the same folder as the `automessager` binary.

```
📁 AutoMessager/
  ├── automessager-win.exe (or automessager-mac)
  ├── .env                 ← Your config here
  ├── messages_v1.xlsx     ← Your message templates here
  └── logs/                ← Auto-created
```

### **How do I test without sending real messages?**

**Answer:** Use dry-run mode:

```bash
automessager dry-run
```

This simulates everything WITHOUT actually sending WhatsApp messages or updating Salesforce.

### **How do I schedule daily runs?**

**Windows (Task Scheduler):**
```powershell
# Run as Administrator
cd scripts\windows
.\Install-Task.ps1 -Hour 9 -Minute 0
```

**macOS/Linux (cron):**
```bash
crontab -e
# Add this line (runs at 9:00 AM daily):
0 9 * * * /path/to/automessager-mac run >> /path/to/logs/cron.log 2>&1
```

### **What phone number formats are supported?**

**Answer:** E.164 format with Israel country code:

**✅ Valid:**
- `+972501234567`
- `+972-50-123-4567` (dashes auto-removed)

**❌ Invalid:**
- `0501234567` (missing +972)
- `050-123-4567` (missing country code)

### **What It Does NOT Do**

❌ **Does not send spam** - Only processes tasks you mark as "Ready for Automation"  
❌ **Does not guess** - If template or phone missing, it skips safely and logs why  
❌ **Does not leak data** - All phone numbers masked in logs, secrets never exposed  
❌ **Does not send duplicates** - Uses idempotency keys to prevent double-sending  

## 🏷️ License

MIT

## 🔗 Project Links

- **GitHub Repository**: [https://github.com/Kantoration/MAGNUS](https://github.com/Kantoration/MAGNUS)
- **Documentation**: [docs/README.md](docs/README.md)
- **Quickstart Guide**: [docs/README-QUICKSTART.md](docs/README-QUICKSTART.md)
- **Release Notes**: [RELEASE_NOTES_v2.0.0.md](RELEASE_NOTES_v2.0.0.md)