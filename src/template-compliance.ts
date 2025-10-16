/**
 * Template Compliance Validation System
 * 
 * Proactively validates templates before submission to prevent rejections
 * and ensures ongoing compliance with WhatsApp Business Messaging Policies
 */

import { getLogger } from './logger.js';

const logger = getLogger();

export interface ComplianceRule {
  id: string;
  name: string;
  description: string;
  category: 'FORMATTING' | 'CONTENT' | 'POLICY' | 'CATEGORY';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  autoFixable: boolean;
  validator: (content: string, variables: string[]) => ComplianceIssue[];
  autoFix?: (content: string, variables: string[]) => { fixed: string; variables: string[] };
}

export interface ComplianceIssue {
  ruleId: string;
  category: ComplianceRule['category'];
  severity: ComplianceRule['severity'];
  message: string;
  position?: { start: number; end: number };
  suggestion: string;
  autoFixable: boolean;
}

export interface ComplianceReport {
  templateName: string;
  content: string;
  variables: string[];
  category: string;
  issues: ComplianceIssue[];
  score: number; // 0-100
  status: 'COMPLIANT' | 'WARNING' | 'NON_COMPLIANT' | 'CRITICAL';
  recommendations: string[];
  autoFixed?: {
    originalContent: string;
    fixedContent: string;
    originalVariables: string[];
    fixedVariables: string[];
  };
}

/**
 * Template Compliance Validator
 * 
 * Validates templates against WhatsApp Business Messaging Policies
 * and provides automatic fixes for common issues
 */
export class TemplateComplianceValidator {
  private rules: ComplianceRule[] = [];

  constructor() {
    this.initializeComplianceRules();
  }

  /**
   * Validate template compliance
   */
  validateTemplate(
    templateName: string,
    content: string,
    variables: string[],
    category: string = 'UTILITY'
  ): ComplianceReport {
    logger.debug(
      {
        templateName,
        contentLength: content.length,
        variableCount: variables.length,
        category
      },
      'Validating template compliance'
    );

    const issues: ComplianceIssue[] = [];
    
    // Run all compliance rules
    for (const rule of this.rules) {
      try {
        const ruleIssues = rule.validator(content, variables);
        issues.push(...ruleIssues);
      } catch (error) {
        logger.warn(
          {
            templateName,
            ruleId: rule.id,
            error: error instanceof Error ? error.message : String(error)
          },
          'Compliance rule validation failed'
        );
      }
    }

    // Calculate compliance score
    const score = this.calculateComplianceScore(issues);
    const status = this.determineComplianceStatus(issues);
    const recommendations = this.generateRecommendations(issues, content, variables);

    const report: ComplianceReport = {
      templateName,
      content,
      variables,
      category,
      issues,
      score,
      status,
      recommendations,
    };

    logger.info(
      {
        templateName,
        score,
        status,
        issueCount: issues.length,
        criticalIssues: issues.filter(i => i.severity === 'CRITICAL').length,
        highIssues: issues.filter(i => i.severity === 'HIGH').length
      },
      'Template compliance validation completed'
    );

    return report;
  }

  /**
   * Auto-fix template compliance issues
   */
  autoFixTemplate(
    templateName: string,
    content: string,
    variables: string[],
    category: string = 'UTILITY'
  ): ComplianceReport {
    logger.info(
      { templateName },
      'Attempting to auto-fix template compliance issues'
    );

    let fixedContent = content;
    let fixedVariables = [...variables];
    let autoFixed = false;

    // Apply auto-fixes for applicable rules
    for (const rule of this.rules) {
      if (rule.autoFixable && rule.autoFix) {
        try {
          const issues = rule.validator(fixedContent, fixedVariables);
          const criticalIssues = issues.filter(i => i.severity === 'CRITICAL' || i.severity === 'HIGH');
          
          if (criticalIssues.length > 0) {
            const result = rule.autoFix(fixedContent, fixedVariables);
            if (result.fixed !== fixedContent || JSON.stringify(result.variables) !== JSON.stringify(fixedVariables)) {
              fixedContent = result.fixed;
              fixedVariables = result.variables;
              autoFixed = true;
              
              logger.info(
                {
                  templateName,
                  ruleId: rule.id,
                  ruleName: rule.name
                },
                'Applied auto-fix for compliance issue'
              );
            }
          }
        } catch (error) {
          logger.warn(
            {
              templateName,
              ruleId: rule.id,
              error: error instanceof Error ? error.message : String(error)
            },
            'Auto-fix failed for compliance rule'
          );
        }
      }
    }

    // Re-validate with fixed content
    const report = this.validateTemplate(templateName, fixedContent, fixedVariables, category);
    
    if (autoFixed) {
      report.autoFixed = {
        originalContent: content,
        fixedContent,
        originalVariables: variables,
        fixedVariables,
      };
    }

    return report;
  }

  /**
   * Initialize compliance rules
   */
  private initializeComplianceRules(): void {
    // Variable formatting rules
    this.rules.push({
      id: 'VARIABLE_FORMATTING',
      name: 'Variable Formatting',
      description: 'Variables must be sequential and properly formatted',
      category: 'FORMATTING',
      severity: 'CRITICAL',
      autoFixable: true,
      validator: (content, _variables) => {
        const issues: ComplianceIssue[] = [];
        
        // Check for sequential numbering
        const variableMatches = content.match(/\{\{(\d+)\}\}/g);
        if (variableMatches) {
          const numbers = variableMatches.map(m => parseInt(m.match(/\{(\d+)\}/)?.[1] || '0'));
          const expectedSequence = Array.from({ length: numbers.length }, (_, i) => i + 1);
          
          if (JSON.stringify(numbers.sort()) !== JSON.stringify(expectedSequence)) {
          issues.push({
            ruleId: 'VARIABLE_FORMATTING',
            category: 'FORMATTING',
            severity: 'CRITICAL',
            message: 'Variables must be sequential starting from {{1}}',
            suggestion: 'Ensure variables are numbered sequentially: {{1}}, {{2}}, {{3}}, etc.',
            autoFixable: true,
          });
          }
        }
        
        // Check for standalone variables
        if (content.includes('{{') && !content.match(/\{\{\d+\}\}/)) {
          issues.push({
            ruleId: 'VARIABLE_FORMATTING',
            category: 'FORMATTING',
            severity: 'CRITICAL',
            message: 'Variables must be numbered (e.g., {{1}}, {{2}})',
            suggestion: 'Replace variable placeholders with numbered format',
            autoFixable: true,
          });
        }
        
        return issues;
      },
      autoFix: (content, variables) => {
        let fixed = content;
        let fixedVars = [...variables];
        
        // Fix sequential numbering
        const variableMatches = fixed.match(/\{\{([^}]+)\}\}/g);
        if (variableMatches) {
          let counter = 1;
          for (const match of variableMatches) {
            fixed = fixed.replace(match, `{{${counter}}}`);
            counter++;
          }
        }
        
        return { fixed, variables: fixedVars };
      },
    });

    // Promotional language rules
    this.rules.push({
      id: 'PROMOTIONAL_LANGUAGE',
      name: 'Promotional Language',
      description: 'Remove promotional and marketing language',
      category: 'CONTENT',
      severity: 'HIGH',
      autoFixable: true,
      validator: (content) => {
        const issues: ComplianceIssue[] = [];
        
        const promotionalPatterns = [
          { pattern: /buy\s+now/gi, message: 'Contains promotional language "buy now"' },
          { pattern: /limited\s+time/gi, message: 'Contains promotional language "limited time"' },
          { pattern: /act\s+now/gi, message: 'Contains promotional language "act now"' },
          { pattern: /don't\s+miss/gi, message: 'Contains promotional language "don\'t miss"' },
          { pattern: /exclusive\s+offer/gi, message: 'Contains promotional language "exclusive offer"' },
          { pattern: /!!!+$/gm, message: 'Contains multiple exclamation marks' },
        ];
        
        for (const { pattern, message } of promotionalPatterns) {
          if (pattern.test(content)) {
            issues.push({
              ruleId: 'PROMOTIONAL_LANGUAGE',
              category: 'CONTENT',
              severity: 'HIGH',
              message,
              suggestion: 'Use neutral, informative language instead of promotional terms',
              autoFixable: true,
            });
          }
        }
        
        return issues;
      },
      autoFix: (content) => {
        let fixed = content;
        
        // Replace promotional language
        const replacements = [
          { pattern: /buy\s+now/gi, replacement: 'available' },
          { pattern: /limited\s+time/gi, replacement: 'for a period' },
          { pattern: /act\s+now/gi, replacement: 'proceed' },
          { pattern: /don't\s+miss/gi, replacement: 'please note' },
          { pattern: /exclusive\s+offer/gi, replacement: 'special arrangement' },
          { pattern: /!!!+/g, replacement: '!' },
        ];
        
        for (const { pattern, replacement } of replacements) {
          fixed = fixed.replace(pattern, replacement);
        }
        
        return { fixed, variables: [] };
      },
    });

    // Content length rules
    this.rules.push({
      id: 'CONTENT_LENGTH',
      name: 'Content Length',
      description: 'Template content should be concise and clear',
      category: 'CONTENT',
      severity: 'MEDIUM',
      autoFixable: false,
      validator: (content) => {
        const issues: ComplianceIssue[] = [];
        
        if (content.length > 1024) {
          issues.push({
            ruleId: 'CONTENT_LENGTH',
            category: 'CONTENT',
            severity: 'MEDIUM',
            message: `Content is too long (${content.length} characters)`,
            suggestion: 'Keep template content concise and under 1024 characters',
            autoFixable: false,
          });
        }
        
        if (content.length < 10) {
          issues.push({
            ruleId: 'CONTENT_LENGTH',
            category: 'CONTENT',
            severity: 'MEDIUM',
            message: 'Content is too short',
            suggestion: 'Provide meaningful content for the template',
            autoFixable: false,
          });
        }
        
        return issues;
      },
    });

    // Variable count rules
    this.rules.push({
      id: 'VARIABLE_COUNT',
      name: 'Variable Count',
      description: 'Limit number of variables for clarity',
      category: 'FORMATTING',
      severity: 'MEDIUM',
      autoFixable: false,
      validator: (_content, variables) => {
        const issues: ComplianceIssue[] = [];
        
        if (variables.length > 10) {
          issues.push({
            ruleId: 'VARIABLE_COUNT',
            category: 'FORMATTING',
            severity: 'MEDIUM',
            message: `Too many variables (${variables.length})`,
            suggestion: 'Limit variables to 10 or fewer for better user experience',
            autoFixable: false,
          });
        }
        
        return issues;
      },
    });

    // Language and character rules
    this.rules.push({
      id: 'LANGUAGE_CHARACTERS',
      name: 'Language and Characters',
      description: 'Ensure appropriate language and character usage',
      category: 'CONTENT',
      severity: 'LOW',
      autoFixable: true,
      validator: (content) => {
        const issues: ComplianceIssue[] = [];
        
        // Check for emoji usage
        const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
        if (emojiRegex.test(content)) {
          issues.push({
            ruleId: 'LANGUAGE_CHARACTERS',
            category: 'CONTENT',
            severity: 'LOW',
            message: 'Contains emoji characters',
            suggestion: 'Avoid emojis in business templates for better compatibility',
            autoFixable: true,
          });
        }
        
        return issues;
      },
      autoFix: (content) => {
        // Remove emojis
        const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
        const fixed = content.replace(emojiRegex, '');
        
        return { fixed, variables: [] };
      },
    });
  }

  /**
   * Calculate compliance score
   */
  private calculateComplianceScore(issues: ComplianceIssue[]): number {
    if (issues.length === 0) return 100;
    
    const severityWeights = {
      CRITICAL: 40,
      HIGH: 25,
      MEDIUM: 15,
      LOW: 5,
    };
    
    const totalWeight = issues.reduce((sum, issue) => sum + severityWeights[issue.severity], 0);
    const maxPossibleWeight = issues.length * severityWeights.CRITICAL;
    
    return Math.max(0, Math.round(100 - (totalWeight / maxPossibleWeight) * 100));
  }

  /**
   * Determine compliance status
   */
  private determineComplianceStatus(issues: ComplianceIssue[]): ComplianceReport['status'] {
    const criticalIssues = issues.filter(i => i.severity === 'CRITICAL');
    const highIssues = issues.filter(i => i.severity === 'HIGH');
    
    if (criticalIssues.length > 0) return 'CRITICAL';
    if (highIssues.length > 2) return 'NON_COMPLIANT';
    if (issues.length > 0) return 'WARNING';
    return 'COMPLIANT';
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    issues: ComplianceIssue[],
    content: string,
    variables: string[]
  ): string[] {
    const recommendations: string[] = [];
    
    // Group issues by category
    const criticalIssues = issues.filter(i => i.severity === 'CRITICAL');
    const highIssues = issues.filter(i => i.severity === 'HIGH');
    
    if (criticalIssues.length > 0) {
      recommendations.push('Fix critical issues before submitting template');
    }
    
    if (highIssues.length > 0) {
      recommendations.push('Address high-severity issues for better approval chances');
    }
    
    // Category-specific recommendations
    const formattingIssues = issues.filter(i => i.category === 'FORMATTING');
    if (formattingIssues.length > 0) {
      recommendations.push('Review variable formatting and ensure sequential numbering');
    }
    
    const contentIssues = issues.filter(i => i.category === 'CONTENT');
    if (contentIssues.length > 0) {
      recommendations.push('Review content for promotional language and length');
    }
    
    // General recommendations
    if (content.length > 500) {
      recommendations.push('Consider shortening template content for better readability');
    }
    
    if (variables.length > 5) {
      recommendations.push('Consider reducing number of variables for simplicity');
    }
    
    return recommendations;
  }

  /**
   * Get all compliance rules
   */
  getComplianceRules(): ComplianceRule[] {
    return [...this.rules];
  }

  /**
   * Validate template category alignment
   */
  validateCategoryAlignment(content: string, category: string): ComplianceIssue[] {
    const issues: ComplianceIssue[] = [];
    
    // Check if content aligns with template category
    const contentLower = content.toLowerCase();
    
    if (category === 'UTILITY' && (
      contentLower.includes('promotion') ||
      contentLower.includes('offer') ||
      contentLower.includes('sale')
    )) {
      issues.push({
        ruleId: 'CATEGORY_ALIGNMENT',
        category: 'CATEGORY',
        severity: 'HIGH',
        message: 'Content contains marketing language but category is UTILITY',
        suggestion: 'Either change category to MARKETING or remove promotional language',
        autoFixable: false,
      });
    }
    
    return issues;
  }
}
