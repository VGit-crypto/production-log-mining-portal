export type LogLevel = 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
  module: string;
  exceptionType?: string;
  stackTrace?: string;
  correlationId?: string;
  // Fields consumed by the AI agents (bug title / test cases / bug story), when present in the log.
  appName?: string;
  service?: string;
  context?: string;
  url?: string;
  statusCode?: number;
  /** Raw `error` string of the log record (e.g. the HTTP client error chain). */
  error?: string;
  /** HTTP method of the failing call, from `http.method`. */
  method?: string;
  /** Where in the app the error was logged (e.g. "service", "middleware"). */
  phase?: string;
  /** Deployment environment (e.g. "ppe", "prod"). */
  environment?: string;
}
