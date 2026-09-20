function timestamp() {
  return new Date().toISOString();
}

export function createLogger(tenantId) {
  const prefix = `[${tenantId}]`;

  const emit = (level, args) => {
    const line = `${timestamp()} ${level.toUpperCase()} ${prefix}`;
    if (level === "error") console.error(line, ...args);
    else if (level === "warn") console.warn(line, ...args);
    else console.log(line, ...args);
  };

  return {
    info: (...args) => emit("info", args),
    warn: (...args) => emit("warn", args),
    error: (...args) => emit("error", args),
  };
}
