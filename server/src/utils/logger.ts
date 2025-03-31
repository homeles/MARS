interface LogMessage {
  timestamp: string;
  level: string;
  module: string;
  message: string;
  details?: any;
}

class Logger {
  private formatMessage(level: string, module: string, message: string, details?: any): LogMessage {
    return {
      timestamp: new Date().toISOString(),
      level,
      module,
      message,
      details
    };
  }

  private log(level: string, module: string, message: string, details?: any) {
    const logMessage = this.formatMessage(level, module, message, details);
    console.log(JSON.stringify(logMessage));
  }

  info(module: string, message: string, details?: any) {
    this.log('INFO', module, message, details);
  }

  error(module: string, message: string, details?: any) {
    this.log('ERROR', module, message, details);
  }

  debug(module: string, message: string, details?: any) {
    this.log('DEBUG', module, message, details);
  }

  graphql(module: string, organization: string, page: number, hasNextPage: boolean) {
    this.log('GRAPHQL', module, 'GraphQL Request', {
      organization,
      page,
      hasNextPage,
      operation: 'fetchMigrations'
    });
  }
}

export const logger = new Logger();