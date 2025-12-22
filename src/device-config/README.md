# Device Configuration Script

Interactive menu-driven script for configuring TST devices.

## Usage

```bash
npm run config
```

or

```bash
node device-config.js
```

## Features

The script provides a menu with all available device configuration options:

1. **PSM Configuration** - Power Saving Mode settings
2. **Network Configuration** - Network settings (WEV)
3. **Server Parameters** - Server connection parameters
4. **Transmission Windows** - Transmission window settings
5. **Reading Windows** - Reading window settings
6. **DNS Configuration** - DNS server settings
7. **Authorization Parameters** - Authentication credentials
8. **Magnet Activation** - Enable/disable magnet
9. **RTC Adjustment** - Adjust RTC to network time
10. **NTP Configuration** - NTP server settings
11. **Remote Server Parameters** - Remote server configuration
12. **Temporary Remote Server** - Temporary remote server parameters
13. **Max Connection Time** - Maximum connection time
14. **Temporary Max Connection Time** - Temporary maximum connection time
15. **WMBUS Reading Time** - WMBUS reading time configuration

## Configuration Value Format

The script prompts for configuration values. The exact format depends on the device protocol documentation. Currently, the script provides basic prompts, but you may need to adjust the `getConfigParameters()` function in `device-config.js` based on your device documentation.

## Device State

Before sending configurations, make sure to set:
- **Frame ID** - Current frame sequence number
- **Session ID** - Device session (H and L bytes)
- **Target Host/Port** - Device IP address and port

These can be configured from the menu options.

## Frame Format

The script generates CONFIG frames (type `11`) with:
- Frame type: `11` (CODE_S_CONF)
- ACK field: Configuration code (e.g., `01` for PSM)
- Frame ID: Current device frame ID
- Session: Current device session
- Size: Configuration value size (little-endian)
- Value: Configuration parameters (hex)
- CRC: Calculated CRC

## Note

Configuration value formats may need to be adjusted based on the device protocol documentation located at:
`C:\Users\juanillo\Documents\TRABAJO\Pableras\Avant`

Please refer to that documentation for the exact format of each configuration type.

