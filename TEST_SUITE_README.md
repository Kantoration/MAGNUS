# AutoMessager Comprehensive Test Suite

This document describes the comprehensive table-driven test suite for the AutoMessager system, implementing all requirements from the specification.

## Overview

The test suite provides complete coverage of the AutoMessager system with focus on:
- **Template parity validation** for all 9 canonical task types
- **Idempotency verification** with deterministic key generation
- **Daily de-duplication** with 24-hour window validation
- **Fallback chain testing** for missing data scenarios
- **Write-back robustness** with SFDC outage simulation
- **Compliance guardrails** for opt-in and template validation
- **Rate-limit/retry mechanisms** with bounded retries and jitter
- **Operations & monitoring** dashboard metrics
- **Production hardening** security and reliability tests
- **Runbook procedures** and acceptance criteria validation

## Test Structure

### Core Test Files

1. **`test/table-driven.comprehensive.spec.ts`** - Main comprehensive test suite
   - Template parity tests for all 9 task types
   - Idempotency tests with deterministic key validation
   - Daily de-duplication tests with 24h window validation
   - Fallback chain tests for missing data scenarios
   - Write-back robustness tests with SFDC outage simulation
   - Compliance guardrails tests for opt-in and template validation
   - Rate-limit and retry mechanism tests

2. **`test/ops-monitoring.dashboard.spec.ts`** - Operations & monitoring tests
   - Sends/Success % by task key (9 lines)
   - Blocks vs Skips by taxonomy code (stacked)
   - Retry rate & final failure rate (SLA early-warning)
   - Duplicates prevented (daily)
   - Median end-to-end latency metrics
   - Top 5 failure reasons with sample TaskIds

3. **`test/production-hardening.spec.ts`** - Production readiness tests
   - Opt-in source of truth validation
   - Locale exactness (he vs he_IL)
   - Idempotency scope enhancement
   - ExternalId/ConversationId capture
   - PII retention policy compliance
   - SFDC permissions validation
   - Contact/Lead merge & conversion
   - Media templates validation
   - Config freeze & versioning
   - Canary rollout procedures

4. **`test/runbook-acceptance.spec.ts`** - Operational procedures tests
   - Retryable vs Non-retryable error classification
   - Manual resend path validation
   - Acceptance criteria verification
   - Operational runbook procedures
   - Monitoring and alerting configuration
   - SLA commitments validation

5. **`test/test-config.ts`** - Centralized test configuration
   - Test data fixtures for all 9 canonical tasks
   - Mock configurations for Glassix templates
   - Test environment setup
   - Acceptance criteria thresholds
   - Dashboard metrics configuration
   - Production hardening settings

### Supporting Infrastructure

- **`scripts/run-comprehensive-tests.ts`** - Comprehensive test runner with detailed reporting
- **`test-reports/`** - Directory for generated test reports (JSON format)

## Running the Tests

### Individual Test Suites

```bash
# Run specific test suite
npm run test:table-driven
npm run test:ops-monitoring
npm run test:production-hardening
npm run test:runbook-acceptance

# Run all comprehensive tests
npm run test:comprehensive

# Run standard unit tests
npm run test:run

# Run tests in watch mode
npm run test:watch
```

### Comprehensive Test Runner

The comprehensive test runner provides detailed reporting and dashboard-ready metrics:

```bash
npm run test:comprehensive
```

This will:
- Run all test suites in sequence
- Generate detailed console output with metrics
- Create JSON report files in `test-reports/`
- Exit with appropriate codes (0=success, 1=non-critical failures, 2=critical failures)

## Test Data & Fixtures

### Canonical Tasks (9 Types)

The test suite includes comprehensive data for all 9 canonical task types:

1. **NEW_PHONE_READY** - New phone delivery notifications
2. **PAYMENT_REMINDER** - Payment due reminders
3. **APPOINTMENT_CONFIRMATION** - Service appointment confirmations
4. **WELCOME_MESSAGE** - New customer welcome messages
5. **SERVICE_REMINDER** - Service maintenance reminders
6. **DELIVERY_NOTIFICATION** - Package delivery notifications
7. **CANCELLATION_NOTICE** - Service cancellation notices
8. **RENEWAL_REMINDER** - Service renewal reminders
9. **SURVEY_INVITATION** - Customer satisfaction surveys

Each task includes:
- Canonical variables and expected parameter counts
- Hebrew subject generation
- Template mapping validation
- Glassix template integration

### Mock Data

- **Glassix Templates**: 9 approved Hebrew templates matching canonical tasks
- **Salesforce Tasks**: Mock task records with proper field mappings
- **Contact/Lead Data**: Mock contact and lead records with phone numbers
- **Error Scenarios**: Comprehensive error taxonomy test cases

## Acceptance Criteria

The test suite validates all acceptance criteria:

### ✅ 0 parameter-mismatch sends in 24-hour canary
- Validates parameter count/order EXACT match
- Ensures `validateTemplateParameters()` passes for all task types

### ✅ Duplicate-send prevention > 99.9%
- Tests deterministic key generation
- Validates daily deduplication within 24h window
- Ensures Contact/Lead audit NOT duplicated

### ✅ Contact/Lead audit Task created for ≥ 99.5% of successful sends
- Tests write-back robustness with SFDC outage simulation
- Validates audit trail creation for successful sends
- Ensures non-fatal audit failures

### ✅ End-to-end P50 < 10s, P95 < 45s
- Measures latency from task fetch to SFDC audit written
- Tests performance under various conditions
- Validates SLA compliance

### ✅ Error taxonomy coverage = 100% of failures
- Tests all error classification scenarios
- Ensures no "unknown" errors
- Validates actionable vs retryable classification

### ✅ No WhatsApp policy violations observed in canary
- Tests compliance guardrails
- Validates opt-in requirements
- Ensures approved template usage

## Dashboard Metrics

The test suite generates dashboard-ready metrics:

### Task Success Rates (9 lines)
```
NEW_PHONE_READY: 90.0%
PAYMENT_REMINDER: 95.0%
APPOINTMENT_CONFIRMATION: 96.3%
WELCOME_MESSAGE: 93.3%
SERVICE_REMINDER: 94.3%
DELIVERY_NOTIFICATION: 91.1%
CANCELLATION_NOTICE: 95.0%
RENEWAL_REMINDER: 88.1%
SURVEY_INVITATION: 97.8%
```

### Error Breakdown by Taxonomy
- Blocks vs Skips by taxonomy code (stacked)
- Retry rate & final failure rate (SLA early-warning)
- Top 5 failure reasons with sample TaskIds

### Performance Metrics
- Median end-to-end latency (P50, P95, P99)
- Duplicates prevented (daily count)
- Retry patterns and success rates

## Production Hardening

The test suite validates production readiness:

### Security & Compliance
- **PII Retention**: Phone masking beyond last 4 digits, log TTL policies
- **Opt-in Validation**: Exact SFDC field usage, treat unset as "no"
- **Locale Exactness**: Lock he vs he_IL to template catalog
- **Config Freeze**: Version Hebrew subject generators and template maps

### Reliability & Operations
- **Idempotency Scope**: Include template language + namespace in keys
- **External ID Capture**: Persist Glassix IDs on audit Tasks
- **SFDC Permissions**: Confirm FLS/profile can create Tasks
- **Canary Rollout**: 10% eligible tasks, auto-promote when failure < 2%

### Monitoring & Alerting
- **SLA Thresholds**: Success rate > 95%, latency < 30s, error rate < 5%
- **Escalation Matrix**: Critical (15min), High (1hr), Medium (4hr), Low (24hr)
- **Health Checks**: Connectivity, data, performance, compliance

## Runbook Procedures

The test suite validates operational procedures:

### Error Classification
- **Retryable**: GLASSIX_429, GLASSIX_5XX, SFDC_RATE_LIMIT → auto-retry
- **Non-retryable**: NO_TEMPLATE_MATCH, NO_OPT_IN, MISSING_PHONE → skip + annotate
- **Manual Review**: Template validation failures, unknown errors

### Manual Resend Path
1. Edit variables in SFDC Task record
2. Set `Ready_for_Automation__c = true`
3. Generate new deterministic key (variable hash changes)
4. Trigger automation run
5. Verify successful send and audit trail

### Escalation Procedures
- **Critical Issues**: On-call engineer, 15-minute response
- **High Volume Failures**: Immediate escalation if >10% failure rate
- **Rollback Procedures**: Canary, partial, or full rollback options

## Test Reports

The comprehensive test runner generates detailed JSON reports in `test-reports/`:

```json
{
  "timestamp": "2024-10-09T12:00:00.000Z",
  "totalSuites": 10,
  "totalTests": 127,
  "totalPassed": 125,
  "totalFailed": 2,
  "totalSkipped": 0,
  "coverage": {
    "templateParity": true,
    "idempotency": true,
    "dailyDedupe": true,
    "fallbacks": true,
    "writebackRobustness": true,
    "complianceGuardrails": true,
    "rateLimitRetry": true,
    "opsMonitoring": true,
    "productionHardening": true,
    "runbookAcceptance": true
  },
  "dashboard": {
    "taskSuccessRates": [...],
    "errorBreakdown": {...},
    "latencyMetrics": {...},
    "complianceMetrics": {...}
  }
}
```

## Development Guidelines

### Adding New Tests

1. **Follow Table-Driven Pattern**: Use `it.each()` for multiple test cases
2. **Use Test Configuration**: Import from `test/test-config.ts`
3. **Mock External APIs**: Use proper mocking for Salesforce and Glassix
4. **Validate Acceptance Criteria**: Ensure new tests align with acceptance criteria
5. **Update Documentation**: Add new test cases to this README

### Test Data Management

- **Centralized Fixtures**: All test data in `test/test-config.ts`
- **Realistic Data**: Use Hebrew names, Israeli phone numbers, realistic scenarios
- **Edge Cases**: Include boundary conditions and error scenarios
- **Consistency**: Ensure data consistency across all test suites

### Mock Strategy

- **API Mocking**: Mock Salesforce and Glassix APIs completely
- **File System**: Mock Excel file operations
- **Time**: Mock date/time functions for deterministic tests
- **Network**: Mock network calls for reliability

## Troubleshooting

### Common Issues

1. **Test Timeouts**: Increase timeout in vitest config for slow tests
2. **Mock Failures**: Ensure proper mock setup in beforeEach hooks
3. **Environment Issues**: Check test environment variables and config
4. **Coverage Gaps**: Add tests for uncovered code paths

### Debug Mode

Run tests with verbose output:
```bash
npm run test:comprehensive -- --verbose
```

Check individual test files:
```bash
npm run test:table-driven -- --reporter=verbose
```

## Contributing

When contributing to the test suite:

1. **Maintain Coverage**: Ensure new features are fully tested
2. **Update Acceptance Criteria**: Keep acceptance criteria tests current
3. **Document Changes**: Update this README with new test cases
4. **Run Full Suite**: Always run comprehensive tests before submitting
5. **Validate Metrics**: Ensure dashboard metrics remain accurate

## Support

For questions about the test suite:
- Check existing test files for patterns
- Review `test/test-config.ts` for available fixtures
- Run individual test suites for debugging
- Generate comprehensive reports for detailed analysis
