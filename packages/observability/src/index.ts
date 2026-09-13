import pino, { type Logger } from 'pino';

export interface LoggerOptions {
  service: string;
  level?: string;
  environment?: string;
}

export function createLogger(options: LoggerOptions): Logger {
  return pino({
    level: options.level ?? 'info',
    base: {
      service: options.service,
      environment: options.environment ?? process.env.NODE_ENV ?? 'development',
    },
    redact: {
      paths: [
        'req.headers.authorization',
        'headers.authorization',
        'password',
        '*.password',
        'token',
        '*.token',
        'secret',
        '*.secret',
      ],
      censor: '[REDACTED]',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}
