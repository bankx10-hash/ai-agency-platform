type LogLevel = 'info' | 'warn' | 'error' | 'debug'

interface LogEntry {
  level: LogLevel
  message: string
  timestamp: string
  data?: unknown
}

function formatLog(level: LogLevel, message: string, data?: unknown): LogEntry {
  return {
    level,
    message,
    timestamp: new Date().toISOString(),
    data
  }
}

function writeLog(entry: LogEntry): void {
  const output = JSON.stringify(entry)
  if (entry.level === 'error') {
    console.error(output)
  } else if (entry.level === 'warn') {
    console.warn(output)
  } else {
    console.log(output)
  }
}

export const logger = {
  info: (message: string, data?: unknown) => {
    writeLog(formatLog('info', message, data))
  },
  warn: (message: string, data?: unknown) => {
    writeLog(formatLog('warn', message, data))
  },
  error: (message: string, data?: unknown) => {
    writeLog(formatLog('error', message, data))
  },
  debug: (message: string, data?: unknown) => {
    if (process.env.NODE_ENV !== 'production') {
      writeLog(formatLog('debug', message, data))
    }
  }
}
