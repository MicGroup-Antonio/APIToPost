# Database Tables Review

## Summary

Review of database tables in `src/device-config/db.js` and their actual usage in the codebase.

## Tables Status

### ✅ **`devices`** - **KEEP** (Required)
**Status:** Actively used  
**Usage:**
- `deviceDB.getAll()` - List all devices
- `deviceDB.getById()` - Get device by ID
- `deviceDB.getByIP()` - Get device by IP
- `deviceDB.upsert()` - Create/update device
- `deviceDB.update()` - Update device details
- `deviceDB.delete()` - Delete device

**Purpose:** Stores device information (name, IP, port, description) for the configuration tool.

---

### ❌ **`device_sessions`** - **REMOVE** (Not Used)
**Status:** Not used anywhere  
**Issues:**
- `sessionDB` is imported in `device-config.js` but **never called**
- No references to `sessionDB.getByDeviceId()` or `sessionDB.upsert()` in the codebase
- Session management is handled in `src/sessionManager.js` using in-memory storage, not database

**Recommendation:** Remove this table and the `sessionDB` export. The device-config tool doesn't need to track sessions.

---

### ⚠️ **`config_history`** - **KEEP BUT FIX** (Read-only, never written)
**Status:** Partially used - only read, never written  
**Usage:**
- ✅ `configHistoryDB.getByDeviceId()` - Called to display sent configurations in menu (line 584)
- ❌ `configHistoryDB.add()` - **Never called** - History is never populated!

**Current Behavior:**
- The menu shows "Sent Configurations" but the list is always empty because nothing writes to this table
- The table structure exists and is queried, but no code actually logs sent configurations

**Recommendation:** 
1. **Option A:** Remove the table if history tracking isn't needed
2. **Option B:** Keep it and add code to call `configHistoryDB.add()` when configurations are actually sent (when the server sends pending configs to devices)

**Note:** The `configHistoryDB.getRecent()` method is also never used.

---

### ✅ **`pending_configs`** - **KEEP** (Required)
**Status:** Actively used  
**Usage:**
- `pendingConfigsDB.add()` - Add new pending configuration
- `pendingConfigsDB.getByDeviceId()` - Get pending configs for device
- `pendingConfigsDB.getAllPending()` - Get all pending configs (not currently used, but available)
- `pendingConfigsDB.markAsSent()` - Mark as sent (not currently used, but available for server integration)
- `pendingConfigsDB.delete()` - Delete single pending config
- `pendingConfigsDB.deleteByDeviceId()` - Delete all pending configs for device

**Purpose:** Stores configurations that will be sent when devices connect to the server.

---

## Recommendations

### Immediate Actions:

1. **Remove `device_sessions` table:**
   - Remove table creation (lines 52-64 in `db.js`)
   - Remove `sessionDB` export (lines 199-233 in `db.js`)
   - Remove `sessionDB` from imports in `device-config.js` (line 4)

2. **Fix `config_history` table:**
   - **If history is needed:** Add code to call `configHistoryDB.add()` when configurations are sent (likely in server.js when sending pending configs)
   - **If history is not needed:** Remove the table and `configHistoryDB` export, and remove the "Sent Configurations" section from the menu

### Code Cleanup:

- Remove unused import: `sessionDB` from `device-config.js`
- Consider removing `configHistoryDB.getRecent()` if it's not needed
- Consider removing `pendingConfigsDB.getAllPending()` if it's not needed

---

## Table Dependencies

- `devices` - No dependencies (parent table)
- `device_sessions` - Depends on `devices` (FOREIGN KEY) - **Can be safely removed**
- `config_history` - Depends on `devices` (FOREIGN KEY) - **Keep if fixing, remove if not needed**
- `pending_configs` - Depends on `devices` (FOREIGN KEY) - **Required**

---

## Indexes Review

Current indexes:
- ✅ `idx_devices_ip` - Used for `getByIP()` lookups
- ✅ `idx_config_history_device` - Used if keeping config_history
- ✅ `idx_config_history_sent_at` - Used if keeping config_history
- ✅ `idx_pending_configs_device` - Used for `getByDeviceId()` lookups
- ✅ `idx_pending_configs_status` - Used for filtering by status

All indexes are appropriate for their respective tables.

