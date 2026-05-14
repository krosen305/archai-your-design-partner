type LogLevel = "debug" | "info" | "warn" | "error";

function write(level: LogLevel, ...args: unknown[]) {
  if (level === "debug" && !import.meta.env.DEV) return;
  if (level === "info" && import.meta.env.PROD) return;
  const fn = level === "debug" ? console.debug : console[level];
  fn(...args);
}

export const logger = {
  debug: (...args: unknown[]) => write("debug", ...args),
  info: (...args: unknown[]) => write("info", ...args),
  warn: (...args: unknown[]) => write("warn", ...args),
  error: (...args: unknown[]) => write("error", ...args),
};
