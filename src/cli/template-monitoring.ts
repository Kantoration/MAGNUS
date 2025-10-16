/**
 * Template Monitoring CLI Command
 * 
 * Provides CLI commands for monitoring template approval status,
 * managing hold queue, and validating compliance
 */

import { Command } from 'commander';
import { getLogger } from '../logger.js';
import { TemplateStatusMonitor } from '../template-monitor.js';
import { TemplateHoldQueue } from '../template-hold-queue.js';
import { TemplateComplianceValidator } from '../template-compliance.js';

const logger = getLogger();

export function templateMonitoringCommand() {
  const program = new Command();

  program
    .name('template-monitoring')
    .description('Monitor and manage template approval status and compliance');

  program
    .command('status')
    .description('Check template approval statuses')
    .option('--verbose', 'Show detailed status information')
    .action(async (options) => {
      try {
        const monitor = new TemplateStatusMonitor();
        const results = await monitor.monitorTemplateStatuses();

        console.log('\n📊 Template Status Summary:');
        console.log('=' .repeat(50));
        
        if (options.verbose) {
          console.log(`\n✅ Approved Templates: ${results.approvals.length}`);
          results.approvals.forEach(template => {
            console.log(`   • ${template.name} (${template.templateId})`);
          });

          console.log(`\n❌ Rejected Templates: ${results.rejections.length}`);
          results.rejections.forEach(rejection => {
            console.log(`   • ${rejection.name} (${rejection.category})`);
            console.log(`     Reason: ${rejection.reason}`);
            console.log(`     Auto-fixable: ${rejection.autoFixable ? 'Yes' : 'No'}`);
            if (rejection.suggestions.length > 0) {
              console.log(`     Suggestions: ${rejection.suggestions.join(', ')}`);
            }
          });

          console.log(`\n🔄 Status Changes: ${results.statusChanges.length}`);
          results.statusChanges.forEach(change => {
            console.log(`   • ${change.name}: ${change.status}`);
          });
        } else {
          console.log(`✅ Approved: ${results.approvals.length}`);
          console.log(`❌ Rejected: ${results.rejections.length}`);
          console.log(`🔄 Changed: ${results.statusChanges.length}`);
        }

        // Show audit log summary
        const auditLog = monitor.getAuditLog();
        if (auditLog.length > 0) {
          console.log(`\n📝 Recent Activity (last 10 entries):`);
          auditLog.slice(-10).forEach(entry => {
            const time = new Date(entry.timestamp).toLocaleString();
            console.log(`   ${time}: ${entry.action} - ${entry.name}`);
          });
        }

      } catch (error) {
        logger.error({ error }, 'Failed to check template status');
        process.exit(1);
      }
    });

  program
    .command('hold-queue')
    .description('Manage template hold queue')
    .option('--stats', 'Show hold queue statistics')
    .option('--list', 'List all tasks in hold queue')
    .option('--process', 'Process hold queue (check for retries)')
    .option('--cleanup', 'Clean up old entries (7+ days)')
    .action(async (options) => {
      try {
        const holdQueue = new TemplateHoldQueue();

        if (options.stats) {
          const stats = holdQueue.getHoldQueueStats();
          
          console.log('\n📋 Hold Queue Statistics:');
          console.log('=' .repeat(40));
          console.log(`Total Queued: ${stats.totalQueued}`);
          console.log(`Retryable: ${stats.retryableCount}`);
          console.log(`Escalated: ${stats.escalatedCount}`);
          
          if (stats.oldestEntry) {
            const age = Math.round((Date.now() - new Date(stats.oldestEntry).getTime()) / (1000 * 60 * 60 * 24));
            console.log(`Oldest Entry: ${age} days ago`);
          }

          console.log('\nBy Status:');
          Object.entries(stats.byStatus).forEach(([status, count]) => {
            console.log(`   ${status}: ${count}`);
          });

          console.log('\nBy Priority:');
          Object.entries(stats.byPriority).forEach(([priority, count]) => {
            console.log(`   ${priority}: ${count}`);
          });
        }

        if (options.list) {
          const entries = holdQueue.getHoldQueueEntries();
          
          console.log(`\n📋 Hold Queue Entries (${entries.length}):`);
          console.log('=' .repeat(80));
          
          entries.forEach(entry => {
            const age = Math.round((Date.now() - new Date(entry.queuedAt).getTime()) / (1000 * 60 * 60));
            console.log(`Task: ${entry.taskId}`);
            console.log(`  Template: ${entry.templateName} (${entry.templateStatus})`);
            console.log(`  Customer: ${entry.customerName} (${maskPhone(entry.customerPhone)})`);
            console.log(`  Priority: ${entry.priority}`);
            console.log(`  Age: ${age} hours`);
            console.log(`  Retries: ${entry.retryCount}/${entry.maxRetries}`);
            if (entry.failureReason) {
              console.log(`  Reason: ${entry.failureReason}`);
            }
            console.log('');
          });
        }

        if (options.process) {
          console.log('\n🔄 Processing Hold Queue...');
          const results = await holdQueue.processHoldQueue();
          
          console.log(`✅ Retried: ${results.retried.length}`);
          console.log(`⚠️  Escalated: ${results.escalated.length}`);
          console.log(`⏳ Still Waiting: ${results.stillWaiting.length}`);
          
          if (results.retried.length > 0) {
            console.log('\nRetried Tasks:');
            results.retried.forEach(entry => {
              console.log(`   • ${entry.taskId} - ${entry.templateName}`);
            });
          }
          
          if (results.escalated.length > 0) {
            console.log('\nEscalated Tasks:');
            results.escalated.forEach(entry => {
              console.log(`   • ${entry.taskId} - ${entry.templateName} (${entry.retryCount} retries)`);
            });
          }
        }

        if (options.cleanup) {
          console.log('\n🧹 Cleaning up old entries...');
          const cleaned = await holdQueue.cleanupOldEntries();
          console.log(`✅ Cleaned up ${cleaned} old entries`);
        }

      } catch (error) {
        logger.error({ error }, 'Failed to manage hold queue');
        process.exit(1);
      }
    });

  program
    .command('compliance')
    .description('Validate template compliance')
    .argument('<template-name>', 'Template name to validate')
    .argument('<content>', 'Template content')
    .option('--auto-fix', 'Attempt to auto-fix compliance issues')
    .option('--category <category>', 'Template category', 'UTILITY')
    .action(async (templateName, content, options) => {
      try {
        const validator = new TemplateComplianceValidator();
        
        // Extract variables from content
        const variableMatches = content.match(/\{\{([^}]+)\}\}/g);
        const variables = variableMatches ? variableMatches.map((m: string) => m.slice(2, -2)) : [];

        console.log(`\n🔍 Validating Template: ${templateName}`);
        console.log('=' .repeat(60));
        console.log(`Content: ${content}`);
        console.log(`Variables: ${variables.join(', ') || 'None'}`);
        console.log(`Category: ${options.category}`);

        const report = options.autoFix 
          ? validator.autoFixTemplate(templateName, content, variables, options.category)
          : validator.validateTemplate(templateName, content, variables, options.category);

        console.log(`\n📊 Compliance Report:`);
        console.log(`Score: ${report.score}/100`);
        console.log(`Status: ${report.status}`);
        console.log(`Issues: ${report.issues.length}`);

        if (report.issues.length > 0) {
          console.log('\n❌ Issues Found:');
          report.issues.forEach(issue => {
            console.log(`   ${issue.severity}: ${issue.message}`);
            console.log(`   Suggestion: ${issue.suggestion}`);
            console.log(`   Auto-fixable: ${issue.autoFixable ? 'Yes' : 'No'}`);
            console.log('');
          });
        }

        if (report.autoFixed) {
          console.log('\n🔧 Auto-Fix Applied:');
          console.log(`Original: ${report.autoFixed.originalContent}`);
          console.log(`Fixed:    ${report.autoFixed.fixedContent}`);
        }

        if (report.recommendations.length > 0) {
          console.log('\n💡 Recommendations:');
          report.recommendations.forEach(rec => {
            console.log(`   • ${rec}`);
          });
        }

      } catch (error) {
        logger.error({ error }, 'Failed to validate template compliance');
        process.exit(1);
      }
    });

  program
    .command('rules')
    .description('List all compliance rules')
    .option('--category <category>', 'Filter by category')
    .action(async (options) => {
      try {
        const validator = new TemplateComplianceValidator();
        let rules = validator.getComplianceRules();

        if (options.category) {
          rules = rules.filter(rule => rule.category === options.category.toUpperCase());
        }

        console.log('\n📋 Compliance Rules:');
        console.log('=' .repeat(60));

        rules.forEach(rule => {
          console.log(`\n${rule.name} (${rule.id})`);
          console.log(`  Category: ${rule.category}`);
          console.log(`  Severity: ${rule.severity}`);
          console.log(`  Auto-fixable: ${rule.autoFixable ? 'Yes' : 'No'}`);
          console.log(`  Description: ${rule.description}`);
        });

      } catch (error) {
        logger.error({ error }, 'Failed to list compliance rules');
        process.exit(1);
      }
    });

  return program;
}

/**
 * Mask phone number for display
 */
function maskPhone(phone: string): string {
  if (phone.length <= 4) return phone;
  return phone.slice(0, -4) + '****';
}
