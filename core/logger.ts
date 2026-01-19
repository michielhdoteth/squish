type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogContext {
  [key: string]: any;
}

class Logger {
  private prefix: string;
  private debugEnabled: boolean;

  constructor(prefix: string = 'squish') {
    this.prefix = prefix;
    this.debugEnabled = process.env.DEBUG === 'true' || process.env.DEBUG === '1';
  }

  private format(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const ctx = context ? ` ${JSON.stringify(context)}` : '';
    return `[${this.prefix}:${level}] ${message}${ctx}`;
  }

  info(message: string, context?: LogContext): void {
    console.log(this.format('info', message, context));
  }

  warn(message: string, context?: LogContext): void {
    console.warn(this.format('warn', message, context));
  }

  error(message: string, error?: Error | any, context?: LogContext): void {
    const errorMsg = error instanceof Error ? error.message : error;
    const ctx = { ...context, error: errorMsg };
    console.error(this.format('error', message, ctx));
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
  }

  debug(message: string, context?: LogContext): void {
    if (this.debugEnabled) {
      console.log(this.format('debug', message, context));
    }
  }
}

export const logger = new Logger();
