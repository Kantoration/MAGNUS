# Testing Guide

This document describes how to test the AutoMessager system end-to-end, including Glassix integration and template matching.

## System Alignment with Manual Workflow

The AutoMessager system is designed to **perfectly replicate** the manual daily messaging workflow described in the Daily Messaging brief:

### Manual Workflow → Automated System
- **SFDC Reports** → **Salesforce Tasks** (with `Ready_for_Automation__c = true`)
- **Manual data extraction** → **Automated SOQL queries** with polymorphic Who/What resolution
- **Glassix UI navigation** → **Glassix API calls** with proper authentication
- **Manual template selection** → **Intelligent template matching** with fallback to Excel mapping
- **Manual conversation creation** → **Automated conversation metadata** (customerName, subject)
- **Manual status logging** → **Comprehensive audit trails** in Salesforce

### 9 Daily Messaging Tasks
The system supports all 9 distinct daily messaging tasks:
1. NEW_PHONE_READY - Device ready for pickup
2. PAYMENT_REMINDER - Payment due reminder  
3. TRAINING_LINK - Training materials delivery
4. APPOINTMENT_CONFIRMATION - Service appointment confirmation
5. WELCOME_MESSAGE - New customer welcome
6. RETURN_INSTRUCTIONS - Device return instructions
7. SATELLITE_CONNECTION_FINISH - Satellite connection completion
8. MAINTENANCE_REMINDER - Device maintenance reminder
9. SERVICE_FOLLOWUP - Post-service follow-up

## Pre-flight Checklist

Before running tests, ensure you have:

- [ ] **Environment Variables**: All required `.env` variables configured
  - `GLASSIX_BASE_URL` - Your Glassix API endpoint
  - `GLASSIX_API_KEY` - Glassix API key
  - `GLASSIX_API_SECRET` - Glassix API secret (for modern auth)
  - Salesforce credentials (`SF_LOGIN_URL`, `SF_USERNAME`, `SF_PASSWORD`, `SF_TOKEN`)
  - `TEST_E164` - Test phone number (optional, for send tests)

- [ ] **Glassix Setup**: At least one approved WhatsApp template in your Glassix account
- [ ] **Excel File**: Valid `messages_v1.xlsx` with message templates
- [ ] **Test Number**: WhatsApp-enabled phone number for testing (optional)

## Comprehensive Test Suite

AutoMessager includes a comprehensive test suite that validates production scenarios, edge cases, and compliance requirements. This suite ensures the system is production-ready and handles all real-world scenarios correctly.

### Test Suite Overview

#### **Table-Driven Tests** (`test/table-driven.comprehensive.spec.ts`)
- **Template Parity**: Validates exact parameter count/order for all 9 production tasks
- **Idempotency**: Tests deterministic key generation and duplicate prevention  
- **Daily Deduplication**: Prevents duplicate sends within 24-hour windows
- **Fallbacks**: Tests graceful degradation for missing data
- **Write-back Robustness**: Ensures message sending continues despite audit failures
- **Compliance Guardrails**: Validates WhatsApp opt-in and template approval requirements
- **Rate-limit/Retry**: Tests bounded retries with exponential backoff

#### **Template Contract Tests** (`test/template-contract.spec.ts`)
- **Live Catalog Validation**: Validates against real Glassix template catalog
- **Parameter Order Validation**: Detects same count, wrong order scenarios
- **Template Version Drift**: Prevents "compiles green, deploys red" issues
- **CI Integration**: Fails builds on contract violations

#### **Hebrew RTL Edge Cases** (`test/hebrew-rtl-edge-cases.spec.ts`)
- **Niqqud Stripping**: Removes Hebrew diacritics for stable matching
- **Geresh/Gershayim Normalization**: Converts Hebrew punctuation correctly
- **Mixed LTR Tokens**: Handles device names like "iPhone 15" in Hebrew context
- **Bidi Control Characters**: Prevents bidirectional control chars from leaking
- **Property-Based Tests**: Tests Hebrew names with various edge cases

#### **Comprehensive Edge Cases** (`test/edge-cases-comprehensive.spec.ts`)
- **Locale Split in Idempotency**: Ensures `he` vs `he_IL` produces different keys
- **Opt-in Source of Truth Drift**: Handles field rename/missing scenarios
- **Namespace Duplicate Detection**: Prevents collisions across namespaces
- **Glassix Conversation Metadata**: Snapshot tests for customer names and subjects
- **Media Template Validation**: Validates media components and URL checksums
- **Rate Limit Backoff Jitter**: Tests exponential backoff with mocked timers
- **Time-zone Correctness**: Tests with frozen clock for Asia/Jerusalem timezone

#### **Operations & Monitoring** (`test/ops-monitoring.dashboard.spec.ts`)
- **Dashboard Metrics**: Sends/Success % by task key, Blocks vs Skips by taxonomy
- **SLA Testing**: Synthetic load profiles with P50/P95 budgets
- **Canary Gates**: Simulates canary rollout with auto-promote logic
- **Error Taxonomy**: 100% error classification coverage

#### **Production Hardening** (`test/production-hardening.spec.ts`)
- **Opt-in Source of Truth**: Validates WhatsApp opt-in field handling
- **Locale Exactness**: Tests Hebrew locale handling
- **Idempotency Scope**: Validates deterministic ID generation
- **External ID Capture**: Tests conversation metadata capture
- **PII Retention Policy**: Validates data retention compliance
- **Permissions**: Tests Salesforce field permissions
- **Media Template Validation**: Tests media template handling

#### **Runbook & Acceptance** (`test/runbook-acceptance.spec.ts`)
- **Runbook Snippets**: Tests operational procedures
- **Acceptance Criteria**: Validates sign-off checklist requirements
- **Compliance Testing**: Tests WhatsApp policy violations
- **Error Classification**: Tests retryable vs non-retryable errors

### Running the Comprehensive Test Suite

#### **Run All Tests**
```bash
# Run the complete comprehensive test suite
npm run test:comprehensive
```

#### **Run Individual Test Suites**
```bash
# Core functionality tests
npm run test:table-driven

# Template contract validation
npm run test:template-contract

# Hebrew RTL edge cases
npm run test:hebrew-rtl

# Additional edge cases
npm run test:edge-cases

# Operations dashboard tests
npm run test:ops-monitoring

# Production readiness tests
npm run test:production-hardening

# Compliance and runbook tests
npm run test:runbook-acceptance
```

#### **Test Configuration**
The comprehensive test suite uses `test/test-config.ts` for centralized configuration:
- **Canonical Tasks**: 9 production-aligned task definitions
- **Mock Glassix Templates**: Production-matching template definitions
- **Test Environment**: Controlled test environment settings
- **Metrics Thresholds**: SLA and performance thresholds
- **Production Hardening**: Security and compliance settings

### Test Coverage Metrics

The comprehensive test suite provides:
- ✅ **Template Parity**: 9 production tasks with exact parameter validation
- ✅ **Idempotency**: Deterministic key generation and duplicate prevention
- ✅ **Daily Deduplication**: 24-hour window duplicate prevention
- ✅ **Fallbacks**: Graceful degradation for missing data
- ✅ **Write-back Robustness**: Non-fatal audit failures
- ✅ **Compliance Guardrails**: WhatsApp opt-in and template approval
- ✅ **Rate-limit/Retry**: Bounded retries with exponential backoff
- ✅ **Hebrew RTL**: Comprehensive normalization and edge cases
- ✅ **Template Contracts**: Live catalog validation and CI integration
- ✅ **Production Hardening**: Ops monitoring and compliance testing

## Test Commands

### 1. Discover Templates and Test Matching

```bash
# Show available templates and test matching with Excel
npm run automessager discover-templates

# Show why templates don't match (top 3 candidates for unmatched tasks)
npm run automessager discover-templates -- --why

# Alternative using npm scripts
npm run discover
npm run discover -- --why
```

**Success Criteria:**
- Prints count and previews of approved templates
- Shows template matching results for Excel tasks
- `--why` flag shows top-3 candidates for unmatched rows
- Displays Hebrew subject policy and customer name formatting

### 2. Dry Run with Template Matching

```bash
# Test the complete flow without sending messages
DRY_RUN=1 npm run automessager run
```

**Success Criteria:**
- Logs `templated: true` for matched tasks
- Shows "Auto-matched Glassix template" with score/confidence
- Displays Hebrew subjects: `"המכשיר מוכן לאיסוף · MAGNUS"`
- Shows template parameter validation results
- Tasks without matches are skipped with clear warnings
- No actual messages sent (DRY_RUN mode)

### 3. Glassix Smoke Test

```bash
# Send a real template message to test number
TEST_E164=+9725XXXXXXX npm run smoke:glassix
```

**Success Criteria:**
- Fetches approved templates from Glassix
- Sends template message (not free text) to test number
- Uses Hebrew subject policy: `"Smoke Test: TEMPLATE_NAME"`
- Uses proper customer name: `"Test User"`
- Logs Glassix message ID and conversation URL
- Prints "✅ Smoke test done. Check WhatsApp & Glassix link above."

### 4. End-to-End Tests

```bash
# Run comprehensive E2E tests
GLASSIX_BASE_URL=https://your-glassix.com TEST_E164=+9725XXXXXXX npm run test:e2e
```

**Success Criteria:**
- Fetches templates (array length > 0)
- Matches Hebrew sample message to template (score ≥ 0.6)
- Validates template parameter count and order
- Sends template message if TEST_E164 provided
- Uses Hebrew subject policy and customer name formatting
- Handles invalid matches gracefully
- All tests pass or skip cleanly when credentials missing

## Test Scenarios

### Template Discovery
- **Input**: Glassix API with approved templates
- **Expected**: Array of templates with proper structure
- **Validates**: Authentication, API connectivity, data parsing

### Template Matching
- **Input**: Hebrew message "שלום דניאל! המכשיר S24 מוכן לאיסוף"
- **Expected**: Match to device-ready template with score ≥ 0.6
- **Validates**: Hebrew normalization, similarity algorithms, confidence scoring, niqqud removal

### Template Parameter Validation
- **Input**: Template with 3 required parameters, context with 2 provided
- **Expected**: Validation failure with clear error message
- **Validates**: Parameter count checking, missing parameter detection

### Daily Deduplication
- **Input**: Same template sent to same phone within 24 hours
- **Expected**: Task skipped with deduplication reason
- **Validates**: Salesforce audit trail checking, time window logic

### Message Sending
- **Input**: Template name, variables, test phone number
- **Expected**: WhatsApp message sent via approved template
- **Validates**: Template payload structure, parameter ordering, delivery

### No Match Handling
- **Input**: Message with no suitable template match
- **Expected**: Task skipped, clear failure reason logged
- **Validates**: WhatsApp compliance, graceful degradation

## Troubleshooting

### Common Issues

**"No approved templates found"**
- Check Glassix account has approved WhatsApp templates
- Verify `GLASSIX_BASE_URL` and API credentials
- Check template status in Glassix dashboard

**"Template matching failed"**
- Ensure Excel file has valid message content
- Check Hebrew text encoding in Excel
- Verify template content similarity

**"Send failed"**
- Verify `TEST_E164` is valid WhatsApp number
- Check template name exists in Glassix
- Ensure test number can receive messages

**"Authentication failed"**
- Verify `GLASSIX_API_SECRET` is set (modern auth)
- Check API key permissions in Glassix
- Ensure Salesforce credentials are valid

### Debug Mode

Enable detailed logging:
```bash
LOG_LEVEL=debug npm run smoke:glassix
```

Check logs for:
- Template fetching details
- Matching algorithm scores
- API request/response payloads
- Error stack traces

## Success Indicators

### Console Output
```
✅ Fetched 5 approved templates
✅ Matched template: NEW_PHONE_READY (HIGH, score: 0.85)
✅ Template parameter validation passed (3/3 parameters)
📱 Message ID: msg_glassix_789
🔗 Conversation: https://glassix.com/conversation/abc123
📝 Subject: המכשיר מוכן לאיסוף · MAGNUS
👤 Customer: דניאל כהן
✅ Smoke test done. Check WhatsApp & Glassix link above.
```

### WhatsApp Verification
- Message appears on test phone
- Uses approved template format (not free text)
- Variables populated correctly
- Message shows in Glassix conversation

### Salesforce Updates
- Tasks marked as completed/failed
- Clear failure reasons for skipped tasks (with error taxonomy)
- Contact/Lead audit tasks created: `"Glassix: NEW_PHONE_READY (auto)"`
- No duplicate processing (deterministic idempotency)
- Complete audit trail in task descriptions and Contact/Lead records

## Advanced Testing

### Custom Template Testing
```bash
# Test specific template
TEMPLATE_NAME=WELCOME_MESSAGE npm run smoke:glassix
```

### Batch Testing
```bash
# Test multiple scenarios
for template in NEW_PHONE_READY PAYMENT_REMINDER WELCOME_MESSAGE; do
  TEMPLATE_NAME=$template npm run smoke:glassix
done
```

### Performance Testing
```bash
# Test with large Excel file
XSLX_MAPPING_PATH=large_messages.xlsx npm run discover
```

This testing framework ensures your AutoMessager system is working correctly with real Glassix templates and provides confidence in production deployments.
