// errorHandler.js
process.on("unhandledRejection", (reason) => {
  console.error("[error] Unhandled rejection:", reason?.message || reason);
});

process.on("uncaughtException", (err) => {
  console.error("[error] Uncaught exception:", err.message);
  // Don't exit - keep the process running
});