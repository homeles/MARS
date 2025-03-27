interface LogData {
  [key: string]: any;
}

class Logger {
  private static instance: Logger;
  private serverEndpoint: string;

  private constructor() {
    this.serverEndpoint = 'http://localhost:4000/log';
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private async sendToServer(level: string, message: string, data?: LogData) {
    if (import.meta.env.PROD) return; // Don't send logs to server in production
    
    try {
      await fetch(this.serverEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          timestamp: new Date().toISOString(),
          level,
          message,
          data,
        }),
      });
    } catch (error) {
      // Silently fail in production
      if (import.meta.env.DEV) {
        console.error('Failed to send log to server:', error);
      }
    }
  }

  info(message: string, data?: LogData) {
    if (!import.meta.env.PROD) {
      console.info(`[INFO] ${message}`);
    }
    this.sendToServer('info', message, data);
  }

  error(message: string, data?: LogData) {
    console.error(`[ERROR] ${message}`);
    this.sendToServer('error', message, data);
  }

  debug(message: string, data?: LogData) {
    if (import.meta.env.DEV) {
      console.debug(`[DEBUG] ${message}`);
      this.sendToServer('debug', message, data);
    }
  }
}

export const logger = Logger.getInstance();