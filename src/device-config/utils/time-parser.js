/**
 * Time parsing and conversion utilities
 * Converts between HH:MM format and minutes (0-1440)
 */

/**
 * Parse HH:MM format string to minutes
 * @param {string} timeStr - Time string in HH:MM format (e.g., "12:30", "09:05")
 * @returns {number|null} Minutes (0-1440) or null if invalid
 */
export function parseTimeToMinutes(timeStr) {
  if (!timeStr || !timeStr.trim()) {
    return null;
  }
  
  const trimmed = timeStr.trim();
  
  // Match HH:MM format (24-hour)
  const timeRegex = /^(\d{1,2}):(\d{2})$/;
  const match = trimmed.match(timeRegex);
  
  if (!match) {
    return null;
  }
  
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  
  // Validate hours (0-23) and minutes (0-59)
  if (isNaN(hours) || isNaN(minutes)) {
    return null;
  }
  
  if (hours < 0 || hours > 23) {
    return null;
  }
  
  if (minutes < 0 || minutes > 59) {
    return null;
  }
  
  // Convert to total minutes (0-1439)
  const totalMinutes = hours * 60 + minutes;
  
  // Validate total is within day range (0-1439)
  if (totalMinutes < 0 || totalMinutes > 1439) {
    return null;
  }
  
  return totalMinutes;
}

/**
 * Convert minutes to HH:MM format
 * @param {number} minutes - Minutes (0-1440)
 * @returns {string} Time string in HH:MM format (e.g., "12:30", "09:05")
 */
export function minutesToTime(minutes) {
  if (minutes === null || minutes === undefined || isNaN(minutes)) {
    return "00:00";
  }
  
  // Clamp to valid range
  const clamped = Math.max(0, Math.min(1439, Math.floor(minutes)));
  
  const hours = Math.floor(clamped / 60);
  const mins = clamped % 60;
  
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/**
 * Validate HH:MM format string
 * @param {string} timeStr - Time string to validate
 * @returns {boolean} True if valid HH:MM format
 */
export function isValidTimeFormat(timeStr) {
  return parseTimeToMinutes(timeStr) !== null;
}

/**
 * Format minutes for display (shows both HH:MM and minutes)
 * @param {number} minutes - Minutes value
 * @returns {string} Formatted string like "12:30 (750 min)"
 */
export function formatMinutesForDisplay(minutes) {
  if (minutes === null || minutes === undefined || isNaN(minutes)) {
    return "00:00 (0 min)";
  }
  
  const timeStr = minutesToTime(minutes);
  return `${timeStr} (${minutes} min)`;
}

