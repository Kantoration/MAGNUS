/**
 * Template Approval Status Monitoring System
 * 
 * Monitors Glassix template approval status, handles rejections,
 * and manages template lifecycle for production reliability
 */

import { getLogger } from './logger.js';
// import { getConfig } from './config.js'; // Not used in current implementation
import { getApprovedTemplates, GlassixTemplate } from './glassix.js';

const logger = getLogger();

export interface TemplateStatus {
  templateId: string;
  name: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'DISABLED';
  rejectedReason?: string;
  submittedAt?: string;
  approvedAt?: string;
  rejectedAt?: string;
  lastChecked: string;
}

export interface TemplateRejectionDetails {
  templateId: string;
  name: string;
  reason: string;
  suggestions: string[];
  category: 'FORMATTING' | 'CONTENT' | 'POLICY' | 'CATEGORY' | 'UNKNOWN';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  autoFixable: boolean;
}

export interface TemplateAuditEntry {
  timestamp: string;
  templateId: string;
  name: string;
  action: 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'DISABLED' | 'RESUBMITTED';
  details: string;
  rejectionReason?: string;
  autoFixed?: boolean;
  escalated?: boolean;
}

/**
 * Template Status Monitor
 * 
 * Monitors template approval status and manages rejection handling
 */
export class TemplateStatusMonitor {
  // private config = getConfig(); // Not used in current implementation
  private statusCache = new Map<string, TemplateStatus>();
  private auditLog: TemplateAuditEntry[] = [];
  private rejectionHandlers = new Map<string, (details: TemplateRejectionDetails) => Promise<boolean>>();

  constructor() {
    this.initializeRejectionHandlers();
  }

  /**
   * Monitor all templates and check for status changes
   */
  async monitorTemplateStatuses(): Promise<{
    statusChanges: TemplateStatus[];
    rejections: TemplateRejectionDetails[];
    approvals: TemplateStatus[];
  }> {
    try {
      logger.info('Starting template status monitoring cycle');

      const currentTemplates = await getApprovedTemplates();
      const statusChanges: TemplateStatus[] = [];
      const rejections: TemplateRejectionDetails[] = [];
      const approvals: TemplateStatus[] = [];

      for (const template of currentTemplates) {
        const previousStatus = this.statusCache.get(template.id);
        const currentStatus = await this.getTemplateStatus(template);

        // Check for status changes
        if (!previousStatus || previousStatus.status !== currentStatus.status) {
          statusChanges.push(currentStatus);
          
          // Handle rejections
          if (currentStatus.status === 'REJECTED' && currentStatus.rejectedReason) {
            const rejectionDetails = this.analyzeRejection(currentStatus);
            rejections.push(rejectionDetails);
            
            // Try automatic correction
            if (rejectionDetails.autoFixable) {
              await this.handleRejection(rejectionDetails);
            } else {
              await this.escalateRejection(rejectionDetails);
            }
          }

          // Handle approvals
          if (currentStatus.status === 'APPROVED') {
            approvals.push(currentStatus);
            await this.handleApproval(currentStatus);
          }

          // Update audit log
          this.auditTemplateEvent(currentStatus, previousStatus);
        }

        // Update cache
        this.statusCache.set(template.id, currentStatus);
      }

      logger.info(
        {
          statusChanges: statusChanges.length,
          rejections: rejections.length,
          approvals: approvals.length,
          totalTemplates: currentTemplates.length
        },
        'Template monitoring cycle completed'
      );

      return { statusChanges, rejections, approvals };
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Template status monitoring failed'
      );
      throw error;
    }
  }

  /**
   * Get detailed status for a specific template
   */
  private async getTemplateStatus(template: GlassixTemplate): Promise<TemplateStatus> {
    // In a real implementation, this would query Glassix API for detailed status
    // For now, we'll use the template data and simulate status checking
    
    const status: TemplateStatus = {
      templateId: template.id,
      name: template.name,
      status: template.status as any,
      lastChecked: new Date().toISOString(),
    };

    // Simulate detailed status checking (replace with actual API call)
    if (template.status === 'APPROVED') {
      status.approvedAt = new Date().toISOString();
    }

    return status;
  }

  /**
   * Analyze rejection reason and categorize it
   */
  private analyzeRejection(status: TemplateStatus): TemplateRejectionDetails {
    const reason = status.rejectedReason || 'Unknown rejection reason';
    
    // Analyze rejection reason and categorize
    const category = this.categorizeRejection(reason);
    const suggestions = this.generateSuggestions(reason, category);
    const autoFixable = this.isAutoFixable(category, reason);
    const severity = this.assessSeverity(category, reason);

    return {
      templateId: status.templateId,
      name: status.name,
      reason,
      suggestions,
      category,
      severity,
      autoFixable,
    };
  }

  /**
   * Categorize rejection reason
   */
  private categorizeRejection(reason: string): TemplateRejectionDetails['category'] {
    const lowerReason = reason.toLowerCase();

    if (lowerReason.includes('variable') || lowerReason.includes('format') || lowerReason.includes('{{')) {
      return 'FORMATTING';
    }
    
    if (lowerReason.includes('promotional') || lowerReason.includes('marketing') || lowerReason.includes('buy')) {
      return 'CONTENT';
    }
    
    if (lowerReason.includes('policy') || lowerReason.includes('guideline') || lowerReason.includes('violation')) {
      return 'POLICY';
    }
    
    if (lowerReason.includes('category') || lowerReason.includes('classification')) {
      return 'CATEGORY';
    }
    
    return 'UNKNOWN';
  }

  /**
   * Generate suggestions for fixing rejection
   */
  private generateSuggestions(_reason: string, category: string): string[] {
    const suggestions: string[] = [];

    switch (category) {
      case 'FORMATTING':
        suggestions.push('Ensure variables are sequential: {{1}}, {{2}}, {{3}}');
        suggestions.push('Variables must be embedded in static text');
        suggestions.push('Remove any standalone variables');
        break;
        
      case 'CONTENT':
        suggestions.push('Remove promotional language like "Buy Now!" or "Limited Time!"');
        suggestions.push('Use neutral, informative language');
        suggestions.push('Focus on utility and customer service');
        break;
        
      case 'POLICY':
        suggestions.push('Review WhatsApp Business Messaging Policy');
        suggestions.push('Ensure content aligns with template category');
        suggestions.push('Remove any prohibited content');
        break;
        
      case 'CATEGORY':
        suggestions.push('Verify template category matches content');
        suggestions.push('Consider changing to UTILITY category');
        suggestions.push('Ensure user opt-in status aligns with category');
        break;
        
      default:
        suggestions.push('Review template content for compliance');
        suggestions.push('Contact support for detailed guidance');
    }

    return suggestions;
  }

  /**
   * Determine if rejection can be auto-fixed
   */
  private isAutoFixable(category: string, reason: string): boolean {
    switch (category) {
      case 'FORMATTING':
        return reason.includes('variable') || reason.includes('{{');
      case 'CONTENT':
        return reason.includes('promotional') || reason.includes('exclamation');
      default:
        return false;
    }
  }

  /**
   * Assess severity of rejection
   */
  private assessSeverity(category: string, reason: string): TemplateRejectionDetails['severity'] {
    if (category === 'POLICY' || reason.includes('violation')) {
      return 'CRITICAL';
    }
    
    if (category === 'CONTENT' && reason.includes('promotional')) {
      return 'HIGH';
    }
    
    if (category === 'FORMATTING') {
      return 'MEDIUM';
    }
    
    return 'LOW';
  }

  /**
   * Handle template rejection with automatic correction
   */
  private async handleRejection(details: TemplateRejectionDetails): Promise<void> {
    logger.warn(
      {
        templateId: details.templateId,
        templateName: details.name,
        reason: details.reason,
        category: details.category,
        severity: details.severity,
        autoFixable: details.autoFixable
      },
      'Template rejected - attempting automatic correction'
    );

    try {
      // Get the rejection handler for this category
      const handler = this.rejectionHandlers.get(details.category);
      
      if (handler) {
        const fixed = await handler(details);
        
        if (fixed) {
          logger.info(
            { templateId: details.templateId, templateName: details.name },
            'Template automatically corrected and resubmitted'
          );
          
          this.auditTemplateEvent({
            templateId: details.templateId,
            name: details.name,
            status: 'PENDING',
            lastChecked: new Date().toISOString()
          }, undefined, 'RESUBMITTED', 'Auto-corrected and resubmitted', undefined, true);
        } else {
          await this.escalateRejection(details);
        }
      } else {
        await this.escalateRejection(details);
      }
    } catch (error) {
      logger.error(
        {
          templateId: details.templateId,
          templateName: details.name,
          error: error instanceof Error ? error.message : String(error)
        },
        'Failed to handle template rejection'
      );
      
      await this.escalateRejection(details);
    }
  }

  /**
   * Escalate rejection for manual intervention
   */
  private async escalateRejection(details: TemplateRejectionDetails): Promise<void> {
    logger.error(
      {
        templateId: details.templateId,
        templateName: details.name,
        reason: details.reason,
        category: details.category,
        severity: details.severity,
        suggestions: details.suggestions
      },
      'Template rejection escalated for manual intervention'
    );

    // In a real implementation, this would:
    // 1. Send email notification to administrators
    // 2. Create support ticket
    // 3. Update dashboard with rejection status
    // 4. Log to monitoring system

    this.auditTemplateEvent({
      templateId: details.templateId,
      name: details.name,
      status: 'REJECTED',
      lastChecked: new Date().toISOString(),
      rejectedReason: details.reason
    }, undefined, 'REJECTED', details.reason, details.reason, false, true);
  }

  /**
   * Handle template approval
   */
  private async handleApproval(status: TemplateStatus): Promise<void> {
    logger.info(
      {
        templateId: status.templateId,
        templateName: status.name,
        approvedAt: status.approvedAt
      },
      'Template approved - activating for production use'
    );

    // In a real implementation, this would:
    // 1. Update template status in database
    // 2. Process any tasks in hold queue for this template
    // 3. Notify relevant systems
    // 4. Update monitoring dashboards

    this.auditTemplateEvent(status, undefined, 'APPROVED', 'Template approved and activated');
  }

  /**
   * Initialize rejection handlers for different categories
   */
  private initializeRejectionHandlers(): void {
    // Formatting issues handler
    this.rejectionHandlers.set('FORMATTING', async (details) => {
      // Auto-fix variable formatting issues
      return await this.fixVariableFormatting(details);
    });

    // Content issues handler
    this.rejectionHandlers.set('CONTENT', async (details) => {
      // Auto-fix promotional language
      return await this.fixPromotionalLanguage(details);
    });
  }

  /**
   * Auto-fix variable formatting issues
   */
  private async fixVariableFormatting(details: TemplateRejectionDetails): Promise<boolean> {
    // In a real implementation, this would:
    // 1. Retrieve the template content
    // 2. Fix variable formatting (e.g., make sequential)
    // 3. Resubmit the template
    // 4. Return success/failure
    
    logger.info(
      { templateId: details.templateId },
      'Attempting to fix variable formatting issues'
    );
    
    // Simulate auto-fix (replace with actual implementation)
    return Math.random() > 0.3; // 70% success rate for demo
  }

  /**
   * Auto-fix promotional language
   */
  private async fixPromotionalLanguage(details: TemplateRejectionDetails): Promise<boolean> {
    // In a real implementation, this would:
    // 1. Retrieve the template content
    // 2. Replace promotional language with neutral alternatives
    // 3. Resubmit the template
    // 4. Return success/failure
    
    logger.info(
      { templateId: details.templateId },
      'Attempting to fix promotional language issues'
    );
    
    // Simulate auto-fix (replace with actual implementation)
    return Math.random() > 0.4; // 60% success rate for demo
  }

  /**
   * Audit template lifecycle events
   */
  private auditTemplateEvent(
    currentStatus: TemplateStatus,
    previousStatus?: TemplateStatus,
    action?: TemplateAuditEntry['action'],
    details?: string,
    rejectionReason?: string,
    autoFixed?: boolean,
    escalated?: boolean
  ): void {
    const auditEntry: TemplateAuditEntry = {
      timestamp: new Date().toISOString(),
      templateId: currentStatus.templateId,
      name: currentStatus.name,
      action: action || (currentStatus.status as any),
      details: details || `Status changed from ${previousStatus?.status || 'UNKNOWN'} to ${currentStatus.status}`,
      rejectionReason,
      autoFixed,
      escalated,
    };

    this.auditLog.push(auditEntry);
    
    // Keep only last 1000 entries to prevent memory bloat
    if (this.auditLog.length > 1000) {
      this.auditLog = this.auditLog.slice(-1000);
    }

    logger.debug(
      {
        templateId: currentStatus.templateId,
        templateName: currentStatus.name,
        action: auditEntry.action,
        details: auditEntry.details
      },
      'Template audit event logged'
    );
  }

  /**
   * Get audit log for monitoring and compliance
   */
  getAuditLog(): TemplateAuditEntry[] {
    return [...this.auditLog];
  }

  /**
   * Get current template statuses
   */
  getTemplateStatuses(): TemplateStatus[] {
    return Array.from(this.statusCache.values());
  }

  /**
   * Get rejected templates requiring attention
   */
  getRejectedTemplates(): TemplateStatus[] {
    return Array.from(this.statusCache.values()).filter(
      status => status.status === 'REJECTED'
    );
  }
}
