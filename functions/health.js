// health.js — tiny warmup to reduce cold starts for other functions
exports.handler = async () => {
  // Do nothing; just spin up the runtime/container.
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' },
    body: 'ok',
  };
};
