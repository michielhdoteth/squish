class Logger {
    prefix;
    debugEnabled;
    constructor(prefix = 'squish') {
        this.prefix = prefix;
        this.debugEnabled = process.env.DEBUG === 'true' || process.env.DEBUG === '1';
    }
    format(level, message, context) {
        const timestamp = new Date().toISOString();
        const ctx = context ? ` ${JSON.stringify(context)}` : '';
        return `[${this.prefix}:${level}] ${message}${ctx}`;
    }
    info(message, context) {
        console.log(this.format('info', message, context));
    }
    warn(message, context) {
        console.warn(this.format('warn', message, context));
    }
    error(message, error, context) {
        const errorMsg = error instanceof Error ? error.message : error;
        const ctx = { ...context, error: errorMsg };
        console.error(this.format('error', message, ctx));
        if (error instanceof Error && error.stack) {
            console.error(error.stack);
        }
    }
    debug(message, context) {
        if (this.debugEnabled) {
            console.log(this.format('debug', message, context));
        }
    }
}
export const logger = new Logger();
//# sourceMappingURL=logger.js.map