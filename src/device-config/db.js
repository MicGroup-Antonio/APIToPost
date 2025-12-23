import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database file path - stored in the device-config folder
const DB_PATH = path.join(__dirname, "device-config.db");

let db = null;

/**
 * Initialize the database connection and create tables if they don't exist
 */
export function initDatabase() {
  try {
    db = new Database(DB_PATH);
    
    // Enable foreign keys
    db.pragma("foreign_keys = ON");
    
    // Create tables
    createTables();
    
    console.log(`✅ Database initialized: ${DB_PATH}`);
    return db;
  } catch (error) {
    console.error("❌ Error initializing database:", error.message);
    throw error;
  }
}

/**
 * Create all necessary tables
 */
function createTables() {
  // Table for storing device information
  db.exec(`
    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Table for storing device configurations (pending and sent)
  db.exec(`
    CREATE TABLE IF NOT EXISTS device_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL,
      config_type TEXT NOT NULL,
      config_code TEXT NOT NULL,
      config_value TEXT NOT NULL,
      frame_hex TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      response TEXT,
      sent_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
    )
  `);
  
  // Table for storing transmission window parameters (up to 8 windows per config)
  // Each window: 6 bytes = start_time_minutes (2 bytes) + end_time_minutes (2 bytes) + sampling_interval_minutes (2 bytes)
  // All times in minutes UTC, stored as little-endian 16-bit values
  db.exec(`
    CREATE TABLE IF NOT EXISTS transmission_windows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_config_id INTEGER NOT NULL,
      window_number INTEGER NOT NULL CHECK(window_number >= 1 AND window_number <= 8),
      start_time_minutes INTEGER NOT NULL CHECK(start_time_minutes >= 0 AND start_time_minutes <= 1440),
      end_time_minutes INTEGER NOT NULL CHECK(end_time_minutes >= 0 AND end_time_minutes <= 1440),
      sampling_interval_minutes INTEGER NOT NULL CHECK(sampling_interval_minutes >= 0),
      enabled INTEGER DEFAULT 1 CHECK(enabled IN (0, 1)),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (device_config_id) REFERENCES device_configs(id) ON DELETE CASCADE,
      UNIQUE(device_config_id, window_number)
    )
  `);
  
  // Table for storing reading window parameters (up to 8 windows per config)
  // Each window: 6 bytes = start_time_minutes (2 bytes) + end_time_minutes (2 bytes) + sampling_interval_minutes (2 bytes)
  // All times in minutes UTC, stored as little-endian 16-bit values
  db.exec(`
    CREATE TABLE IF NOT EXISTS reading_windows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_config_id INTEGER NOT NULL,
      window_number INTEGER NOT NULL CHECK(window_number >= 1 AND window_number <= 8),
      start_time_minutes INTEGER NOT NULL CHECK(start_time_minutes >= 0 AND start_time_minutes <= 1440),
      end_time_minutes INTEGER NOT NULL CHECK(end_time_minutes >= 0 AND end_time_minutes <= 1440),
      sampling_interval_minutes INTEGER NOT NULL CHECK(sampling_interval_minutes >= 0),
      enabled INTEGER DEFAULT 1 CHECK(enabled IN (0, 1)),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (device_config_id) REFERENCES device_configs(id) ON DELETE CASCADE,
      UNIQUE(device_config_id, window_number)
    )
  `);
  
  // Table for storing authorization parameters (username and password)
  // Format: username (32 bytes) + password (32 bytes) = 64 bytes total
  db.exec(`
    CREATE TABLE IF NOT EXISTS authorization_parameters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_config_id INTEGER NOT NULL,
      username TEXT NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (device_config_id) REFERENCES device_configs(id) ON DELETE CASCADE,
      UNIQUE(device_config_id)
    )
  `);
  
  // Create indexes for better performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_device_configs_device ON device_configs(device_id);
    CREATE INDEX IF NOT EXISTS idx_device_configs_status ON device_configs(status);
    CREATE INDEX IF NOT EXISTS idx_device_configs_sent_at ON device_configs(sent_at);
    CREATE INDEX IF NOT EXISTS idx_transmission_windows_config ON transmission_windows(device_config_id);
    CREATE INDEX IF NOT EXISTS idx_transmission_windows_number ON transmission_windows(device_config_id, window_number);
    CREATE INDEX IF NOT EXISTS idx_reading_windows_config ON reading_windows(device_config_id);
    CREATE INDEX IF NOT EXISTS idx_reading_windows_number ON reading_windows(device_config_id, window_number);
    CREATE INDEX IF NOT EXISTS idx_authorization_parameters_config ON authorization_parameters(device_config_id);
  `);
}

/**
 * Get database instance (initialize if needed)
 */
export function getDatabase() {
  if (!db) {
    initDatabase();
  }
  return db;
}

/**
 * Close database connection
 */
export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

// Device operations
export const deviceDB = {
  /**
   * Get all devices
   */
  getAll() {
    const db = getDatabase();
    return db.prepare("SELECT * FROM devices ORDER BY name").all();
  },
  
  /**
   * Get device by ID
   */
  getById(id) {
    const db = getDatabase();
    return db.prepare("SELECT * FROM devices WHERE id = ?").get(id);
  },
  
  /**
   * Create or update device (by name)
   */
  upsert(name, description = null) {
    const db = getDatabase();
    const existing = db.prepare("SELECT id FROM devices WHERE name = ?").get(name);
    
    if (existing) {
      // Update existing
      db.prepare(`
        UPDATE devices 
        SET description = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(description || "", existing.id);
      return existing.id;
    } else {
      // Insert new
      const result = db.prepare(`
        INSERT INTO devices (name, description)
        VALUES (?, ?)
      `).run(name, description || "");
      return result.lastInsertRowid;
    }
  },
  
  /**
   * Update device by ID
   */
  update(id, name, description = null) {
    const db = getDatabase();
    db.prepare(`
      UPDATE devices 
      SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(name, description || "", id);
  },
  
  /**
   * Delete device
   */
  delete(id) {
    const db = getDatabase();
    return db.prepare("DELETE FROM devices WHERE id = ?").run(id);
  }
};

// Device configurations operations
export const deviceConfigsDB = {
  /**
   * Add a configuration (defaults to 'pending' status)
   */
  add(deviceId, configType, configCode, configValue, frameHex) {
    const db = getDatabase();
    const result = db.prepare(`
      INSERT INTO device_configs (device_id, config_type, config_code, config_value, frame_hex, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `).run(deviceId, configType, configCode, configValue, frameHex);
    return result.lastInsertRowid;
  },
  
  /**
   * Get all pending configurations for a device
   */
  getPendingByDeviceId(deviceId) {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM device_configs 
      WHERE device_id = ? AND status = 'pending'
      ORDER BY created_at ASC
    `).all(deviceId);
  },
  
  /**
   * Get all sent configurations for a device
   */
  getSentByDeviceId(deviceId, limit = 50) {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM device_configs 
      WHERE device_id = ? AND status = 'sent'
      ORDER BY sent_at DESC 
      LIMIT ?
    `).all(deviceId, limit);
  },
  
  /**
   * Get all configurations for a device (regardless of status)
   */
  getByDeviceId(deviceId) {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM device_configs 
      WHERE device_id = ?
      ORDER BY created_at DESC
    `).all(deviceId);
  },
  
  /**
   * Get all pending configurations (across all devices)
   */
  getAllPending() {
    const db = getDatabase();
    return db.prepare(`
      SELECT dc.*, d.name as device_name
      FROM device_configs dc
      JOIN devices d ON dc.device_id = d.id
      WHERE dc.status = 'pending'
      ORDER BY dc.created_at ASC
    `).all();
  },
  
  /**
   * Mark configuration as sent (with optional response)
   */
  markAsSent(id, response = null) {
    const db = getDatabase();
    db.prepare(`
      UPDATE device_configs 
      SET status = 'sent', sent_at = CURRENT_TIMESTAMP, response = ?
      WHERE id = ?
    `).run(response, id);
  },
  
  /**
   * Update configuration value and frame
   */
  update(id, configValue, frameHex) {
    const db = getDatabase();
    db.prepare(`
      UPDATE device_configs 
      SET config_value = ?, frame_hex = ?, created_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(configValue, frameHex, id);
  },
  
  /**
   * Delete configuration
   */
  delete(id) {
    const db = getDatabase();
    return db.prepare("DELETE FROM device_configs WHERE id = ?").run(id);
  },
  
  /**
   * Delete all pending configurations for a device
   */
  deletePendingByDeviceId(deviceId) {
    const db = getDatabase();
    return db.prepare("DELETE FROM device_configs WHERE device_id = ? AND status = 'pending'").run(deviceId);
  },
  
  /**
   * Delete all configurations for a device (regardless of status)
   */
  deleteByDeviceId(deviceId) {
    const db = getDatabase();
    return db.prepare("DELETE FROM device_configs WHERE device_id = ?").run(deviceId);
  }
};

// Transmission windows operations
export const transmissionWindowsDB = {
  /**
   * Add or update a transmission window
   * @param {Object} params - Window parameters
   * @param {number} params.deviceConfigId - Device config ID
   * @param {number} params.windowNumber - Window number (1-8)
   * @param {number} params.startTimeMinutes - Start time in minutes UTC (0-1440)
   * @param {number} params.endTimeMinutes - End time in minutes UTC (0-1440)
   * @param {number} params.samplingIntervalMinutes - Sampling interval in minutes
   * @param {boolean} params.enabled - Whether window is enabled (default: true)
   */
  upsert(params) {
    const { deviceConfigId, windowNumber, startTimeMinutes, endTimeMinutes, samplingIntervalMinutes, enabled = true } = params;
    const db = getDatabase();
    const existing = db.prepare(`
      SELECT id FROM transmission_windows 
      WHERE device_config_id = ? AND window_number = ?
    `).get(deviceConfigId, windowNumber);
    
    if (existing) {
      db.prepare(`
        UPDATE transmission_windows 
        SET start_time_minutes = ?, end_time_minutes = ?, sampling_interval_minutes = ?, enabled = ?
        WHERE id = ?
      `).run(
        startTimeMinutes, endTimeMinutes, samplingIntervalMinutes,
        enabled ? 1 : 0,
        existing.id
      );
      return existing.id;
    } else {
      const result = db.prepare(`
        INSERT INTO transmission_windows 
        (device_config_id, window_number, start_time_minutes, end_time_minutes, sampling_interval_minutes, enabled)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        deviceConfigId, windowNumber, startTimeMinutes, endTimeMinutes, samplingIntervalMinutes,
        enabled ? 1 : 0
      );
      return result.lastInsertRowid;
    }
  },
  
  /**
   * Get all transmission windows for a device config
   */
  getByDeviceConfigId(deviceConfigId) {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM transmission_windows 
      WHERE device_config_id = ?
      ORDER BY window_number ASC
    `).all(deviceConfigId);
  },
  
  /**
   * Get a specific transmission window
   */
  getByWindowNumber(deviceConfigId, windowNumber) {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM transmission_windows 
      WHERE device_config_id = ? AND window_number = ?
    `).get(deviceConfigId, windowNumber);
  },
  
  /**
   * Delete a transmission window
   */
  delete(deviceConfigId, windowNumber) {
    const db = getDatabase();
    return db.prepare(`
      DELETE FROM transmission_windows 
      WHERE device_config_id = ? AND window_number = ?
    `).run(deviceConfigId, windowNumber);
  },
  
  /**
   * Delete all transmission windows for a device config
   */
  deleteByDeviceConfigId(deviceConfigId) {
    const db = getDatabase();
    return db.prepare(`
      DELETE FROM transmission_windows 
      WHERE device_config_id = ?
    `).run(deviceConfigId);
  },
  
  /**
   * Get count of windows for a device config
   */
  getCount(deviceConfigId) {
    const db = getDatabase();
    const result = db.prepare(`
      SELECT COUNT(*) as count FROM transmission_windows 
      WHERE device_config_id = ?
    `).get(deviceConfigId);
    return result.count;
  }
};

// Reading windows operations
export const readingWindowsDB = {
  /**
   * Add or update a reading window
   * @param {Object} params - Window parameters
   * @param {number} params.deviceConfigId - Device config ID
   * @param {number} params.windowNumber - Window number (1-8)
   * @param {number} params.startTimeMinutes - Start time in minutes UTC (0-1440)
   * @param {number} params.endTimeMinutes - End time in minutes UTC (0-1440)
   * @param {number} params.samplingIntervalMinutes - Sampling interval in minutes
   * @param {boolean} params.enabled - Whether window is enabled (default: true)
   */
  upsert(params) {
    const { deviceConfigId, windowNumber, startTimeMinutes, endTimeMinutes, samplingIntervalMinutes, enabled = true } = params;
    const db = getDatabase();
    const existing = db.prepare(`
      SELECT id FROM reading_windows 
      WHERE device_config_id = ? AND window_number = ?
    `).get(deviceConfigId, windowNumber);
    
    if (existing) {
      db.prepare(`
        UPDATE reading_windows 
        SET start_time_minutes = ?, end_time_minutes = ?, sampling_interval_minutes = ?, enabled = ?
        WHERE id = ?
      `).run(
        startTimeMinutes, endTimeMinutes, samplingIntervalMinutes,
        enabled ? 1 : 0,
        existing.id
      );
      return existing.id;
    } else {
      const result = db.prepare(`
        INSERT INTO reading_windows 
        (device_config_id, window_number, start_time_minutes, end_time_minutes, sampling_interval_minutes, enabled)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        deviceConfigId, windowNumber, startTimeMinutes, endTimeMinutes, samplingIntervalMinutes,
        enabled ? 1 : 0
      );
      return result.lastInsertRowid;
    }
  },
  
  /**
   * Get all reading windows for a device config
   */
  getByDeviceConfigId(deviceConfigId) {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM reading_windows 
      WHERE device_config_id = ?
      ORDER BY window_number ASC
    `).all(deviceConfigId);
  },
  
  /**
   * Get a specific reading window
   */
  getByWindowNumber(deviceConfigId, windowNumber) {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM reading_windows 
      WHERE device_config_id = ? AND window_number = ?
    `).get(deviceConfigId, windowNumber);
  },
  
  /**
   * Delete a reading window
   */
  delete(deviceConfigId, windowNumber) {
    const db = getDatabase();
    return db.prepare(`
      DELETE FROM reading_windows 
      WHERE device_config_id = ? AND window_number = ?
    `).run(deviceConfigId, windowNumber);
  },
  
  /**
   * Delete all reading windows for a device config
   */
  deleteByDeviceConfigId(deviceConfigId) {
    const db = getDatabase();
    return db.prepare(`
      DELETE FROM reading_windows 
      WHERE device_config_id = ?
    `).run(deviceConfigId);
  },
  
  /**
   * Get count of windows for a device config
   */
  getCount(deviceConfigId) {
    const db = getDatabase();
    const result = db.prepare(`
      SELECT COUNT(*) as count FROM reading_windows 
      WHERE device_config_id = ?
    `).get(deviceConfigId);
    return result.count;
  }
};

// Authorization parameters operations
export const authorizationParametersDB = {
  /**
   * Add or update authorization parameters for a device config
   * @param {Object} params - Authorization parameters
   * @param {number} params.deviceConfigId - Device config ID
   * @param {string} params.username - Username (max 32 chars)
   * @param {string} params.password - Password (max 32 chars)
   */
  upsert(params) {
    const { deviceConfigId, username, password } = params;
    const db = getDatabase();
    const existing = db.prepare(`
      SELECT id FROM authorization_parameters 
      WHERE device_config_id = ?
    `).get(deviceConfigId);
    
    if (existing) {
      db.prepare(`
        UPDATE authorization_parameters 
        SET username = ?, password = ?
        WHERE id = ?
      `).run(username || "", password || "", existing.id);
      return existing.id;
    } else {
      const result = db.prepare(`
        INSERT INTO authorization_parameters 
        (device_config_id, username, password)
        VALUES (?, ?, ?)
      `).run(deviceConfigId, username || "", password || "");
      return result.lastInsertRowid;
    }
  },
  
  /**
   * Get authorization parameters for a device config
   */
  getByDeviceConfigId(deviceConfigId) {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM authorization_parameters 
      WHERE device_config_id = ?
    `).get(deviceConfigId);
  },
  
  /**
   * Delete authorization parameters for a device config
   */
  deleteByDeviceConfigId(deviceConfigId) {
    const db = getDatabase();
    return db.prepare(`
      DELETE FROM authorization_parameters 
      WHERE device_config_id = ?
    `).run(deviceConfigId);
  }
};

