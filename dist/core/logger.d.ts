interface LogContext {
    [key: string]: any;
}
declare class Logger {
    private prefix;
    private debugEnabled;
    constructor(prefix?: string);
    private format;
    info(message: string, context?: LogContext): void;
    warn(message: string, context?: LogContext): void;
    error(message: string, error?: Error | any, context?: LogContext): void;
    debug(message: string, context?: LogContext): void;
}
export declare const logger: Logger;
export {};
//# sourceMappingURL=logger.d.ts.map