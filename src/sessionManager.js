/* ------------------- SESSION MANAGEMENT ------------------- */
/**
 * Dictionary to manage active sessions
 * Key: sessionId (idSessionH + idSessionL as hex string)
 * Value: { 
 *   lastFrameId: string,      // last frame ID received for this session
 *   lastActivity: number,     // timestamp of last activity (milliseconds since epoch)
 *   waitingForAsk: boolean     // true if session just authenticated and is waiting for ASK frame
 * }
 */
const activeSessions = {};

/**
 * Session expiration time in milliseconds
 * Default: 10 minutes (600000 ms)
 * Can be configured via initializeSessionManager()
 */
let SESSION_EXPIRATION_TIME = 10 * 60 * 1000; // Default: 10 minutes

/**
 * Session cleanup interval in milliseconds
 * Default: same as SESSION_EXPIRATION_TIME
 * Can be configured via initializeSessionManager()
 */
let SESSION_CLEANUP_INTERVAL = SESSION_EXPIRATION_TIME; // Default: same as expiration time

/**
 * Interval ID for the cleanup timer
 */
let cleanupIntervalId = null;

/**
 * Sequential session ID counter (2-byte value: 0-65535)
 * Starts at 1 (0 is reserved/invalid)
 */
let nextSessionId = 1;

/**
 * Maximum session ID value (2 bytes = 65535)
 */
const MAX_SESSION_ID = 0xffff;

/**
 * Creates a session key from SessionH and SessionL
 * @param {string} idSessionH - Session High byte (2 hex chars)
 * @param {string} idSessionL - Session Low byte (2 hex chars)
 * @returns {string} Session key (4 hex chars) or null if invalid
 */
function getSessionKey(idSessionH, idSessionL) {
  if (!idSessionH || !idSessionL) return null;
  return (idSessionH + idSessionL).toLowerCase();
}

/**
 * Creates or updates a session in the activeSessions dictionary
 * Only called during authentication to initialize a new session
 * @param {string} idSessionH - Session High byte
 * @param {string} idSessionL - Session Low byte
 * @param {string} frameId - Frame ID from the authentication frame
 * @returns {string|null} Session key if successful, null otherwise
 */
function createOrUpdateSession(idSessionH, idSessionL, frameId) {
  const sessionKey = getSessionKey(idSessionH, idSessionL);
  if (!sessionKey) return null;

  const now = Date.now();
  activeSessions[sessionKey] = {
    lastFrameId: frameId || "00",
    lastActivity: now,
    waitingForAsk: true, // After authentication, must receive ASK next
  };
  console.log(`✅ Session created/updated: ${sessionKey}, lastFrameId: ${activeSessions[sessionKey].lastFrameId}, lastActivity: ${new Date(now).toISOString()}, waitingForAsk: true`);
  
  // Start cleanup interval if not already running
  startSessionCleanup();
  
  return sessionKey;
}

/**
 * Updates the last frame ID for an existing session
 * Also updates the last activity timestamp
 * @param {string} idSessionH - Session High byte
 * @param {string} idSessionL - Session Low byte
 * @param {string} frameId - New frame ID to record
 * @returns {boolean} True if session was updated, false otherwise
 */
function updateSessionFrameId(idSessionH, idSessionL, frameId) {
  if (!frameId) return false;
  
  const sessionKey = getSessionKey(idSessionH, idSessionL);
  if (!sessionKey || !activeSessions[sessionKey]) return false;

  const now = Date.now();
  activeSessions[sessionKey].lastFrameId = frameId;
  activeSessions[sessionKey].lastActivity = now;
  console.log(`📝 Updated session ${sessionKey}, lastFrameId: ${frameId}, lastActivity: ${new Date(now).toISOString()}`);
  return true;
}

/**
 * Clears the waitingForAsk flag for a session
 * Called after receiving ASK frame following authentication
 * @param {string} idSessionH - Session High byte
 * @param {string} idSessionL - Session Low byte
 * @returns {boolean} True if flag was cleared, false otherwise
 */
function clearWaitingForAsk(idSessionH, idSessionL) {
  const sessionKey = getSessionKey(idSessionH, idSessionL);
  if (!sessionKey || !activeSessions[sessionKey]) return false;

  if (activeSessions[sessionKey].waitingForAsk) {
    activeSessions[sessionKey].waitingForAsk = false;
    console.log(`✅ Session ${sessionKey} received ASK, cleared waitingForAsk flag`);
    return true;
  }
  return false;
}

/**
 * Checks if a session is waiting for ASK frame after authentication
 * @param {string} idSessionH - Session High byte
 * @param {string} idSessionL - Session Low byte
 * @returns {boolean} True if session is waiting for ASK, false otherwise
 */
function isWaitingForAsk(idSessionH, idSessionL) {
  const session = getSession(idSessionH, idSessionL);
  return session ? (session.waitingForAsk === true) : false;
}

/**
 * Removes a session from the activeSessions dictionary
 * @param {string} idSessionH - Session High byte
 * @param {string} idSessionL - Session Low byte
 * @returns {boolean} True if session was removed, false otherwise
 */
function removeSession(idSessionH, idSessionL) {
  const sessionKey = getSessionKey(idSessionH, idSessionL);
  if (!sessionKey || !activeSessions[sessionKey]) return false;

  delete activeSessions[sessionKey];
  console.log(`🗑️ Session removed: ${sessionKey}`);
  return true;
}

/**
 * Gets a session from the activeSessions dictionary
 * @param {string} idSessionH - Session High byte
 * @param {string} idSessionL - Session Low byte
 * @returns {object|null} Session object or null if not found
 */
function getSession(idSessionH, idSessionL) {
  const sessionKey = getSessionKey(idSessionH, idSessionL);
  if (!sessionKey) return null;
  return activeSessions[sessionKey] || null;
}

/**
 * Checks if a session exists in the activeSessions dictionary
 * @param {string} idSessionH - Session High byte
 * @param {string} idSessionL - Session Low byte
 * @returns {boolean} True if session exists, false otherwise
 */
function sessionExists(idSessionH, idSessionL) {
  return getSession(idSessionH, idSessionL) !== null;
}

/**
 * Generates a new sequential session ID and splits it into high and low bytes
 * The session ID is a 2-byte (16-bit) number where:
 * - SessionH is the high byte (most significant byte)
 * - SessionL is the low byte (least significant byte)
 * 
 * This function ensures no collision with existing active sessions by checking
 * activeSessions and wrapping around if necessary. If we reach the maximum (65535),
 * we wrap around to 1 and continue searching for a free session.
 * 
 * @returns {{idSessionH: string, idSessionL: string}|null} Object with hex strings for SessionH and SessionL, or null if all 65535 sessions are in use (extremely unlikely)
 */
function generateSequentialSessionId() {
  const startId = nextSessionId;
  let attempts = 0;

  // Try to find an available session ID, wrapping around if necessary
  // We check all possible session IDs (1-65535) before giving up
  while (attempts < MAX_SESSION_ID) {
    // Convert session ID to 2-byte hex string (4 hex chars)
    const sessionIdHex = nextSessionId.toString(16).toLowerCase().padStart(4, "0");
    
    // Split into high byte (first 2 chars) and low byte (last 2 chars)
    const idSessionH = sessionIdHex.slice(0, 2);
    const idSessionL = sessionIdHex.slice(2, 4);
    
    // Check if this session ID is already in use
    const sessionKey = getSessionKey(idSessionH, idSessionL);
    if (!sessionKey || !activeSessions[sessionKey]) {
      // Found an available session ID
      // Increment for next time, wrapping around if we reach the max
      nextSessionId = nextSessionId >= MAX_SESSION_ID ? 1 : nextSessionId + 1;
      
      console.log(`🔢 Generated sequential session ID: ${sessionIdHex} (H: ${idSessionH}, L: ${idSessionL})`);
      return { idSessionH, idSessionL };
    }
    
    // This ID is in use, try next one
    // Wrap around: if we're at max (65535), go to 1; otherwise increment
    nextSessionId = nextSessionId >= MAX_SESSION_ID ? 1 : nextSessionId + 1;
    attempts++;
    
    // If we've checked all possible session IDs and are back where we started, all sessions are in use
    if (nextSessionId === startId && attempts >= MAX_SESSION_ID) {
      console.error("❌ All session IDs (65535) are in use! Cannot generate new session.");
      return null;
    }
  }
  
  // This should never happen, but just in case
  console.error("❌ Failed to generate session ID after checking all possible IDs");
  return null;
}

/**
 * Cleans up expired sessions (sessions with no activity for SESSION_EXPIRATION_TIME)
 * @returns {number} Number of sessions removed
 */
function cleanupExpiredSessions() {
  const now = Date.now();
  const expiredSessions = [];
  
  // Find all expired sessions and store their info before deletion
  for (const [sessionKey, session] of Object.entries(activeSessions)) {
    const timeSinceLastActivity = now - session.lastActivity;
    if (timeSinceLastActivity >= SESSION_EXPIRATION_TIME) {
      expiredSessions.push({
        key: sessionKey,
        lastActivity: session.lastActivity,
        minutesInactive: Math.floor(timeSinceLastActivity / 1000 / 60),
      });
    }
  }
  
  // Remove expired sessions
  for (const expired of expiredSessions) {
    delete activeSessions[expired.key];
    console.log(`⏰ Expired session removed: ${expired.key} (no activity for ${expired.minutesInactive} minutes)`);
  }
  
  if (expiredSessions.length > 0) {
    console.log(`🧹 Cleanup: Removed ${expiredSessions.length} expired session(s). Active sessions: ${Object.keys(activeSessions).length}`);
  }
  
  // Stop cleanup interval if no active sessions
  if (Object.keys(activeSessions).length === 0 && cleanupIntervalId) {
    stopSessionCleanup();
  }
  
  return expiredSessions.length;
}

/**
 * Starts the periodic cleanup of expired sessions
 * Uses SESSION_CLEANUP_INTERVAL for the check frequency
 */
function startSessionCleanup() {
  if (cleanupIntervalId) {
    return; // Already running
  }
  
  // Run cleanup at the configured interval
  cleanupIntervalId = setInterval(() => {
    cleanupExpiredSessions();
  }, SESSION_CLEANUP_INTERVAL);
  
  console.log(`🕐 Session cleanup started (checking every ${SESSION_CLEANUP_INTERVAL / 1000 / 60} minutes, expiration: ${SESSION_EXPIRATION_TIME / 1000 / 60} minutes)`);
}

/**
 * Stops the periodic cleanup of expired sessions
 */
function stopSessionCleanup() {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
    console.log(`🛑 Session cleanup stopped`);
  }
}

/**
 * Initializes the session manager with configuration from config file
 * @param {object} config - Configuration object with sessionCleanupIntervalMinutes
 */
function initializeSessionManager(config) {
  if (config && typeof config.sessionCleanupIntervalMinutes === 'number') {
    const intervalMinutes = config.sessionCleanupIntervalMinutes;
    SESSION_EXPIRATION_TIME = intervalMinutes * 60 * 1000; // Convert minutes to milliseconds
    SESSION_CLEANUP_INTERVAL = SESSION_EXPIRATION_TIME; // Use same interval for cleanup checks
    
    console.log(`⚙️ Session manager initialized: cleanup interval = ${intervalMinutes} minutes, expiration = ${intervalMinutes} minutes`);
  } else {
    console.log(`⚙️ Session manager initialized with defaults: cleanup interval = 10 minutes, expiration = 10 minutes`);
  }
}

export {
  activeSessions,
  getSessionKey,
  createOrUpdateSession,
  updateSessionFrameId,
  removeSession,
  getSession,
  sessionExists,
  generateSequentialSessionId,
  cleanupExpiredSessions,
  startSessionCleanup,
  stopSessionCleanup,
  initializeSessionManager,
  clearWaitingForAsk,
  isWaitingForAsk,
};

