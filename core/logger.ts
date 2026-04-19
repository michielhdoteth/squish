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

  private isQuiet(): boolean {
    return process.env.SQUISH_QUIET === 'true' || process.env.SQUISH_QUIET === '1';
  }

  info(message: string, context?: LogContext): void {
    if (this.isQuiet()) {
      return;
    }
    console.log(this.format('info', message, context));
  }

  warn(message: string, context?: LogContext): void {
    if (this.isQuiet()) {
      return;
    }
    console.error(this.format('warn', message, context));
  }

  error(message: string, error?: Error | any, context?: LogContext): void {
    if (this.isQuiet()) {
      return;
    }
    const errorMsg = error instanceof Error ? error.message : error;
    const ctx = { ...context, error: errorMsg };
    console.error(this.format('error', message, ctx));
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
  }

  debug(message: string, context?: LogContext): void {
    if (this.debugEnabled && !this.isQuiet()) {
      console.log(this.format('debug', message, context));
    }
  }
}

export const logger = new Logger();
