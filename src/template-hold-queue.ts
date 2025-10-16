/**
 * Template Hold Queue System
 * 
 * Manages tasks that cannot be processed due to unapproved templates,
 * preventing 132001 errors and ensuring proper retry logic
 */

import { getLogger } from './logger.js';
// import { getConfig } from './config.js'; // Not used in current implementation

const logger = getLogger();

export interface HoldQueueEntry {
  taskId: string;
  taskKey: string;
  templateName: string;
  templateStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'DISABLED';
  queuedAt: string;
  retryCount: number;
  maxRetries: number;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  customerPhone: string;
  customerName: string;
  context: Record<string, any>;
  lastChecked: string;
  failureReason?: string;
}

export interface HoldQueueStats {
  totalQueued: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  oldestEntry: string | null;
  retryableCount: number;
  escalatedCount: number;
}

/**
 * Template Hold Queue Manager
 * 
 * Manages tasks waiting for template approval and handles retry logic
 */
export class TemplateHoldQueue {
  // private config = getConfig(); // Not used in current implementation
  private holdQueue = new Map<string, HoldQueueEntry>();
  private maxRetries = 3;
  private retryIntervalMs = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Add task to hold queue due to unapproved template
   */
  async addToHoldQueue(
    taskId: string,
    taskKey: string,
    templateName: string,
    templateStatus: Exclude<HoldQueueEntry['templateStatus'], 'APPROVED'>,
    customerPhone: string,
    customerName: string,
    context: Record<string, any>,
    priority: HoldQueueEntry['priority'] = 'NORMAL',
    failureReason?: string
  ): Promise<void> {
    const entry: HoldQueueEntry = {
      taskId,
      taskKey,
      templateName,
      templateStatus,
      queuedAt: new Date().toISOString(),
      retryCount: 0,
      maxRetries: this.maxRetries,
      priority,
      customerPhone,
      customerName,
      context,
      lastChecked: new Date().toISOString(),
      failureReason,
    };

    this.holdQueue.set(taskId, entry);

    logger.warn(
      {
        taskId,
        taskKey,
        templateName,
        templateStatus,
        priority,
        customerPhone: this.maskPhone(customerPhone),
        failureReason
      },
      'Task added to hold queue due to unapproved template'
    );
  }

  /**
   * Check hold queue for tasks that can be retried
   */
  async processHoldQueue(): Promise<{
    retried: HoldQueueEntry[];
    escalated: HoldQueueEntry[];
    stillWaiting: HoldQueueEntry[];
  }> {
    const now = new Date();
    const retried: HoldQueueEntry[] = [];
    const escalated: HoldQueueEntry[] = [];
    const stillWaiting: HoldQueueEntry[] = [];

    logger.info(
      { queueSize: this.holdQueue.size },
      'Processing template hold queue'
    );

    for (const [taskId, entry] of this.holdQueue) {
      const queuedAt = new Date(entry.queuedAt);
      const timeInQueue = now.getTime() - queuedAt.getTime();
      const canRetry = timeInQueue >= this.retryIntervalMs && entry.retryCount < entry.maxRetries;

      if (entry.templateStatus === 'APPROVED') {
        // Template approved - retry immediately
        retried.push(entry);
        this.holdQueue.delete(taskId);
        
        logger.info(
          {
            taskId,
            templateName: entry.templateName,
            timeInQueue: Math.round(timeInQueue / (1000 * 60 * 60)) + ' hours'
          },
          'Task retried - template approved'
        );
      } else if (canRetry) {
        // Check if template status has changed
        const currentStatus = await this.checkTemplateStatus(entry.templateName);
        
        if (currentStatus === 'APPROVED') {
          retried.push(entry);
          this.holdQueue.delete(taskId);
          
          logger.info(
            {
              taskId,
              templateName: entry.templateName,
              retryCount: entry.retryCount + 1
            },
            'Task retried after template approval check'
          );
        } else {
          // Increment retry count and update status
          entry.retryCount++;
          entry.templateStatus = currentStatus;
          entry.lastChecked = new Date().toISOString();
          
          if (entry.retryCount >= entry.maxRetries) {
            escalated.push(entry);
            this.holdQueue.delete(taskId);
            
            logger.error(
              {
                taskId,
                templateName: entry.templateName,
                retryCount: entry.retryCount,
                timeInQueue: Math.round(timeInQueue / (1000 * 60 * 60)) + ' hours'
              },
              'Task escalated - max retries exceeded'
            );
          } else {
            stillWaiting.push(entry);
            
            logger.debug(
              {
                taskId,
                templateName: entry.templateName,
                retryCount: entry.retryCount,
                nextRetry: new Date(queuedAt.getTime() + this.retryIntervalMs).toISOString()
              },
              'Task remains in hold queue - waiting for template approval'
            );
          }
        }
      } else {
        stillWaiting.push(entry);
      }
    }

    logger.info(
      {
        retried: retried.length,
        escalated: escalated.length,
        stillWaiting: stillWaiting.length,
        totalProcessed: retried.length + escalated.length + stillWaiting.length
      },
      'Hold queue processing completed'
    );

    return { retried, escalated, stillWaiting };
  }

  /**
   * Update template status for all queued tasks
   */
  async updateTemplateStatus(templateName: string, newStatus: HoldQueueEntry['templateStatus']): Promise<void> {
    let updatedCount = 0;

    for (const [taskId, entry] of this.holdQueue) {
      if (entry.templateName === templateName && entry.templateStatus !== newStatus) {
        entry.templateStatus = newStatus;
        entry.lastChecked = new Date().toISOString();
        updatedCount++;

        logger.info(
          {
            taskId,
            templateName,
            oldStatus: entry.templateStatus,
            newStatus
          },
          'Updated template status in hold queue'
        );
      }
    }

    if (updatedCount > 0) {
      logger.info(
        {
          templateName,
          newStatus,
          updatedCount
        },
        'Template status updated in hold queue'
      );
    }
  }

  /**
   * Remove task from hold queue (e.g., when manually resolved)
   */
  removeFromHoldQueue(taskId: string, reason: string): boolean {
    const entry = this.holdQueue.get(taskId);
    
    if (entry) {
      this.holdQueue.delete(taskId);
      
      logger.info(
        {
          taskId,
          templateName: entry.templateName,
          reason,
          timeInQueue: Math.round((Date.now() - new Date(entry.queuedAt).getTime()) / (1000 * 60 * 60)) + ' hours'
        },
        'Task removed from hold queue'
      );
      
      return true;
    }
    
    return false;
  }

  /**
   * Get hold queue statistics
   */
  getHoldQueueStats(): HoldQueueStats {
    const stats: HoldQueueStats = {
      totalQueued: this.holdQueue.size,
      byStatus: {},
      byPriority: {},
      oldestEntry: null,
      retryableCount: 0,
      escalatedCount: 0,
    };

    let oldestTime = Date.now();

    for (const entry of this.holdQueue.values()) {
      // Count by status
      stats.byStatus[entry.templateStatus] = (stats.byStatus[entry.templateStatus] || 0) + 1;
      
      // Count by priority
      stats.byPriority[entry.priority] = (stats.byPriority[entry.priority] || 0) + 1;
      
      // Find oldest entry
      const queuedTime = new Date(entry.queuedAt).getTime();
      if (queuedTime < oldestTime) {
        oldestTime = queuedTime;
        stats.oldestEntry = entry.queuedAt;
      }
      
      // Count retryable
      if (entry.retryCount < entry.maxRetries) {
        stats.retryableCount++;
      }
    }

    return stats;
  }

  /**
   * Get all tasks in hold queue
   */
  getHoldQueueEntries(): HoldQueueEntry[] {
    return Array.from(this.holdQueue.values());
  }

  /**
   * Get tasks by template name
   */
  getTasksByTemplate(templateName: string): HoldQueueEntry[] {
    return Array.from(this.holdQueue.values()).filter(
      entry => entry.templateName === templateName
    );
  }

  /**
   * Get tasks by priority
   */
  getTasksByPriority(priority: HoldQueueEntry['priority']): HoldQueueEntry[] {
    return Array.from(this.holdQueue.values()).filter(
      entry => entry.priority === priority
    );
  }

  /**
   * Check template status (placeholder for actual API call)
   */
  private async checkTemplateStatus(templateName: string): Promise<HoldQueueEntry['templateStatus']> {
    // In a real implementation, this would query Glassix API or template monitor
    // For now, we'll simulate status checking
    
    try {
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Simulate status checking (replace with actual implementation)
      // This could call the TemplateStatusMonitor or Glassix API directly
      
      // For demo purposes, randomly return different statuses
      const statuses: HoldQueueEntry['templateStatus'][] = ['PENDING', 'REJECTED', 'DISABLED'];
      return statuses[Math.floor(Math.random() * statuses.length)];
    } catch (error) {
      logger.warn(
        {
          templateName,
          error: error instanceof Error ? error.message : String(error)
        },
        'Failed to check template status - assuming PENDING'
      );
      
      return 'PENDING';
    }
  }

  /**
   * Mask phone number for logging
   */
  private maskPhone(phone: string): string {
    if (phone.length <= 4) return phone;
    return phone.slice(0, -4) + '****';
  }

  /**
   * Clean up old entries (older than 7 days)
   */
  async cleanupOldEntries(): Promise<number> {
    const cutoffTime = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days
    let cleanedCount = 0;

    for (const [taskId, entry] of this.holdQueue) {
      const queuedTime = new Date(entry.queuedAt).getTime();
      
      if (queuedTime < cutoffTime) {
        this.holdQueue.delete(taskId);
        cleanedCount++;
        
        logger.warn(
          {
            taskId,
            templateName: entry.templateName,
            queuedAt: entry.queuedAt,
            age: Math.round((Date.now() - queuedTime) / (1000 * 60 * 60 * 24)) + ' days'
          },
          'Removed old entry from hold queue'
        );
      }
    }

    if (cleanedCount > 0) {
      logger.info(
        { cleanedCount },
        'Cleaned up old hold queue entries'
      );
    }

    return cleanedCount;
  }
}
