interface LogMessage {
  timestamp: string;
  level: string;
  module: string;
  message: string;
  details?: any;
  syncId?: string;
}

interface ProgressDetails {
  organization: string;
  currentPage: number;
  totalPages: number;
  migrationsFound: number;
  syncId: string;
  startTime?: string;
  elapsedTimeMs?: number;
  estimatedTimeRemainingMs?: number;
  percentComplete?: number;
  processingRate?: number; // migrations per second
}

class Logger {
  private syncStartTimes: Record<string, number> = {};
  private syncLastUpdates: Record<string, number> = {};
  private syncMigrationCounts: Record<string, number> = {};

  private formatMessage(level: string, module: string, message: string, details?: any, syncId?: string): LogMessage {
    return {
      timestamp: new Date().toISOString(),
      level,
      module,
      message,
      details,
      syncId
    };
  }

  private log(level: string, module: string, message: string, details?: any, syncId?: string) {
    const logMessage = this.formatMessage(level, module, message, details, syncId);
    console.log(JSON.stringify(logMessage));
  }

  info(module: string, message: string, details?: any, syncId?: string) {
    this.log('INFO', module, message, details, syncId);
  }

  error(module: string, message: string, details?: any, syncId?: string) {
    this.log('ERROR', module, message, details, syncId);
  }

  debug(module: string, message: string, details?: any, syncId?: string) {
    this.log('DEBUG', module, message, details, syncId);
  }
  
  warn(module: string, message: string, details?: any, syncId?: string) {
    this.log('WARN', module, message, details, syncId);
  }

  getElapsedTime(organization: string, syncId: string = 'default'): number {
    const startTime = this.syncStartTimes[`${syncId}-${organization}`] || Date.now();
    return Date.now() - startTime;
  }

  graphql(module: string, organization: string, page: number, hasNextPage: boolean, syncId: string = 'default') {
    this.log('GRAPHQL', module, 'GraphQL Request', {
      organization,
      page,
      hasNextPage,
      operation: 'fetchMigrations',
      syncId
    }, syncId);
  }

  // Track start of a sync process
  syncStart(module: string, organization: string, syncId: string = 'default') {
    const now = Date.now();
    this.syncStartTimes[`${syncId}-${organization}`] = now;
    this.syncLastUpdates[`${syncId}-${organization}`] = now;
    this.syncMigrationCounts[`${syncId}-${organization}`] = 0;
    
    this.log('SYNC_START', module, `Starting sync for ${organization}`, {
      organization,
      startTime: new Date(now).toISOString(),
      syncId
    }, syncId);
  }

  // Track end of a sync process
  syncComplete(module: string, organization: string, totalMigrations: number, syncId: string = 'default') {
    const startTime = this.syncStartTimes[`${syncId}-${organization}`] || Date.now();
    const now = Date.now();
    const elapsedTimeMs = now - startTime;
    const processingRate = totalMigrations / (elapsedTimeMs / 1000);
    
    this.log('SYNC_COMPLETE', module, `Completed sync for ${organization}`, {
      organization,
      totalMigrations,
      startTime: new Date(startTime).toISOString(),
      endTime: new Date(now).toISOString(),
      elapsedTimeMs,
      processingRatePerSecond: processingRate.toFixed(2),
      syncId
    }, syncId);
    
    // Clean up tracking for this organization
    delete this.syncStartTimes[`${syncId}-${organization}`];
    delete this.syncLastUpdates[`${syncId}-${organization}`];
    delete this.syncMigrationCounts[`${syncId}-${organization}`];
  }

  progress(module: string, organization: string, currentPage: number, totalPages: number, migrationsFound: number, syncId: string = 'default') {
    const key = `${syncId}-${organization}`;
    const now = Date.now();
    const startTime = this.syncStartTimes[key] || now;
    const lastUpdate = this.syncLastUpdates[key] || startTime;
    const lastCount = this.syncMigrationCounts[key] || 0;
    
    const elapsedTimeMs = now - startTime;
    const timeSinceLastUpdateMs = now - lastUpdate;
    const newMigrationsCount = migrationsFound - lastCount;
    
    // Update tracking values
    this.syncLastUpdates[key] = now;
    this.syncMigrationCounts[key] = migrationsFound;
    
    // Calculate metrics
    const percentComplete = totalPages > 0 ? ((currentPage / totalPages) * 100).toFixed(1) : 'unknown';
    
    // Calculate processing rate (migrations per second) if we have data points
    let processingRate = 0;
    let estimatedTimeRemainingMs = 0;
    
    if (timeSinceLastUpdateMs > 0 && newMigrationsCount > 0) {
      processingRate = (newMigrationsCount / (timeSinceLastUpdateMs / 1000));
      
      // If we have a total page count and processing rate, estimate time remaining
      if (totalPages > 0 && processingRate > 0) {
        const remainingPages = totalPages - currentPage;
        const estimatedMigrationsPerPage = migrationsFound / currentPage;
        const estimatedRemainingMigrations = remainingPages * estimatedMigrationsPerPage;
        estimatedTimeRemainingMs = Math.round((estimatedRemainingMigrations / processingRate) * 1000);
      }
    }

    const progressDetails: ProgressDetails = {
      organization,
      currentPage,
      totalPages,
      migrationsFound,
      syncId,
      startTime: new Date(startTime).toISOString(),
      elapsedTimeMs,
      percentComplete: totalPages > 0 ? parseFloat(percentComplete.toString()) : undefined,
      processingRate: processingRate > 0 ? Number(processingRate.toFixed(2)) : undefined,
      estimatedTimeRemainingMs: estimatedTimeRemainingMs > 0 ? estimatedTimeRemainingMs : undefined
    };
    
    this.log('PROGRESS', module, `Sync Progress: ${organization} - ${percentComplete}% complete`, progressDetails, syncId);
    
    return progressDetails;
  }
}

// Create and export a singleton instance of the logger
export const logger = new Logger();