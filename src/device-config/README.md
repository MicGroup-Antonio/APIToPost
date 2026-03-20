# Device Configuration Script

Interactive menu-driven script for configuring TST devices with database-backed configuration management.

## Usage

```bash
npm run config
```

or

```bash
node src/device-config/device-config.js
```

## Features

### Device Management
- **Add Devices** - Create and save device profiles with name and description
- **Manage Devices** - Update device information or delete devices
- **Device Selection** - Choose from saved devices or add new ones
- **Database Storage** - All devices and configurations are stored in SQLite database (`device-config.db`)

### Configuration Management
- **Pending Configurations** - Save configurations to be sent when devices connect
- **Configuration History** - View sent configurations with status tracking
- **Update Configurations** - Modify pending configurations before sending
- **Delete Configurations** - Remove pending configurations individually or in bulk

### Available Configuration Options

The script provides a menu with all available device configuration options:

1. **PSM Configuration** - Power Saving Mode settings (hex input)
2. **Network Configuration** - Network settings (WEV, hex input)
3. **Server Parameters** - Server connection parameters (host/IP and port)
4. **Transmission Windows** - Transmission window settings (interactive, up to 8 windows)
5. **Reading Windows** - Reading window settings (interactive, up to 8 windows)
6. **DNS Configuration** - DNS server settings (hex input)
7. **Authorization Parameters** - Authentication credentials (username and password)
8. **Magnet Activation** - Enable/disable magnet (boolean)
9. **RTC Adjustment** - Adjust RTC to network time (hex input)
10. **NTP Configuration** - NTP server settings (server address)
11. **Remote Server Parameters** - Remote server configuration (hex input)
12. **Temporary Remote Server** - Temporary remote server parameters (hex input)
13. **Max Connection Time** - Maximum connection time (seconds)
14. **Temporary Max Connection Time** - Temporary maximum connection time (seconds)
15. **WMBUS Reading Time** - WMBUS reading time configuration (seconds)

### Special Configuration Types

Some configuration types have enhanced interactive prompts:

#### Transmission Windows & Reading Windows
- Configure up to 8 time windows per device
- Each window requires:
  - Start time (HH:MM format, UTC)
  - End time (HH:MM format, UTC)
  - Sampling interval (minutes)
  - Enable/disable status
- Windows are stored in the database for easy editing
- Validation ensures end time is greater than start time

#### Authorization Parameters
- Username (max 32 characters)
- Password (max 32 characters)
- Stored securely in database
- Can be updated before sending

#### Server Parameters (spec 10.3.5.3)
- **160-byte value**: IP ASCII (50 bytes, null-padded), reserved byte, port (uint16 LE), mode (0=UDP, 1=UDP-DTLS, 2=LwM2M), PSK_ID (40 bytes), reserved, PSK_Content (64 bytes), reserved

#### Remote Server Parameters (CODE_C_RSER)
- Same **160-byte** layout as Server Parameters; used for temporary / alternate server (e.g. OTAP).

#### Time-based Configurations
- Max Connection Time, Temporary Max Connection Time, WMBUS Reading Time
- Accept seconds as input
- Automatically converted to little-endian 4-byte format

## Database Structure

The script uses SQLite database (`device-config.db`) with the following tables:

- **`devices`** - Device information (name, description)
- **`device_configs`** - Configuration records (pending/sent status, values, frames)
- **`transmission_windows`** - Transmission window parameters (linked to configs)
- **`reading_windows`** - Reading window parameters (linked to configs)
- **`authorization_parameters`** - Authorization credentials (linked to configs)

## Configuration Workflow

1. **Select or Add Device** - Choose a device from the database or create a new one
2. **Choose Configuration Type** - Select from the 15 available configuration options
3. **Enter Parameters** - Provide configuration values (format depends on type)
4. **Save Configuration** - Configuration is saved as "pending" in the database
5. **View & Manage** - View pending configurations, update, or delete as needed
6. **Automatic Sending** - When the device connects to the server, pending configurations are automatically sent

## Frame Format

The script generates CONFIG frames (type `11`) with:
- Frame type: `11` (CODE_S_CONF)
- ACK field: Configuration code (e.g., `01` for PSM)
- Frame ID: `00` (not used for config frames)
- Session: `00` (not used for config frames)
- Size: Configuration value size in bytes (little-endian, 2 bytes)
- Value: Configuration parameters (hex format)
- CRC: Calculated CRC

## Configuration Value Formats

### Hex Input Types
- PSM, Network (WEV), DNS, RTC, Remote Server, Temporary Remote Server
- Enter hexadecimal values directly (e.g., `01a2b3c4`)

### Interactive Types
- **Transmission/Reading Windows**: Interactive prompts for time windows
- **Authorization**: Username and password prompts
- **Server Parameters**: IP (≤50 chars), port, mode, optional PSK fields → 160-byte hex value
- **NTP**: Server address prompt
- **Magnet**: Boolean enable/disable prompt
- **Time-based**: Seconds input (converted to 4-byte little-endian)

## Menu Navigation

### Root Menu
- Choose device from list
- Add new device
- Manage devices (update/delete)
- Exit

### Configuration Menu
- Select configuration type (1-15)
- Change device
- View pending/sent configurations
- Back to main menu

### Configuration Management
- View pending and sent configurations
- Manage individual configurations (update/delete)
- Delete all pending configurations

## Notes

- All configurations are stored in the database and persist between sessions
- Pending configurations are automatically sent when devices connect to the server
- Configuration history is tracked for sent configurations
- The database file (`device-config.db`) is created automatically in the `src/device-config/` directory
- For detailed protocol documentation, refer to: `C:\Users\juanillo\Documents\TRABAJO\Pableras\Avant`

