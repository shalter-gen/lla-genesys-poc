# Dropped Calls Reporter

Automated daily reporting system for Genesys Cloud dropped calls with Azure AD sign-in integration.

## Features

- **Automated Daily Reports**: Runs at 08:00 AM daily by default
- **Genesys Cloud Integration**: Fetches dropped call events using Genesys Cloud API
- **Azure AD Integration**: Enriches reports with Azure sign-in data for device information
- **Device Data Enrichment**: Includes device name, OS, IP address, centre location, and Zscaler status
- **Email Reports**: Sends formatted HTML email reports with detailed statistics
- **Error Handling**: Robust retry logic and error reporting

## Architecture

The project follows the same structure as the zscaler-zdx-extractor:

```
dropped-calls-reporter/
├── app.js                    # Main application entry point
├── config.js                 # Configuration management
├── logger.js                 # Logging service
├── daemonService.js          # Scheduled task management
├── genesysAuth.js           # Genesys Cloud authentication
├── azureAuth.js             # Azure AD authentication
├── genesysApiClient.js      # Genesys API client
├── azureApiClient.js        # Azure Graph API client
├── dataProcessor.js         # Data processing and enrichment
├── emailService.js          # Email report generation
├── package.json             # Node.js dependencies
├── .env                     # Environment configuration
└── data/                    # Static data files
    ├── centre-pcs.csv       # Centre mapping data
    └── managed-pcs.csv      # Managed devices data
```

## Prerequisites

- Node.js (v14 or higher)
- Genesys Cloud OAuth credentials (Client ID and Secret)
- Azure AD App registration with:
  - `AuditLog.Read.All` permission
  - Client ID and Secret
- SMTP server for email delivery

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd dropped-calls-reporter
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file from the example:
```bash
cp .env.example .env
```

4. Configure your `.env` file with appropriate values:
```env
# Genesys Cloud Configuration
GENESYS_REGION=mypurecloud.com.au
GENESYS_CLIENT_ID=your_genesys_client_id
GENESYS_CLIENT_SECRET=your_genesys_client_secret

# Azure AD Configuration
AZURE_TENANT_ID=your_azure_tenant_id
AZURE_CLIENT_ID=your_azure_client_id
AZURE_CLIENT_SECRET=your_azure_client_secret

# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@example.com
SMTP_PASS=your_app_password
EMAIL_FROM=noreply@example.com
EMAIL_TO=recipient@example.com
```

5. (Optional) Place static data files in the `data/` directory:
   - `centre-pcs.csv` - Centre network mapping
   - `managed-pcs.csv` - Managed devices information

## Usage

### Daemon Mode (Production)

Run the service in daemon mode for scheduled daily reports:

```bash
npm run daemon
```

This will:
- Start the service
- Schedule reports to run daily at 08:00 AM
- Continue running until stopped

### Test Mode

Test the daemon with immediate execution:

```bash
npm run daemon-test
```

This will:
- Start the daemon
- Immediately generate a report
- Continue running for scheduled reports

### Development Mode

Run with auto-restart on file changes:

```bash
npm run dev
```

## Configuration

### Schedule Configuration

Modify the report schedule in `.env`:

```env
REPORT_SCHEDULE_HOUR=8          # Hour of day (0-23)
DROPPED_CALLS_LOOKBACK_HOURS=24 # How far back to look for dropped calls
SIGNIN_LOGS_LOOKBACK_HOURS=48   # How far back to look for sign-in logs
```

### Email Configuration

Configure SMTP settings and recipients:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@example.com
SMTP_PASS=your_app_password
EMAIL_FROM=noreply@example.com
EMAIL_TO=recipient1@example.com,recipient2@example.com
EMAIL_SUBJECT=Genesys Cloud Dropped Calls Report
ERROR_EMAIL_TO=errors@example.com
```

## Report Contents

The email report includes:

1. **Header Section**:
   - Report period
   - Generation timestamp

2. **Summary Statistics**:
   - Total answered calls
   - Active dropped calls (agents actively in call)
   - Monitoring dropped calls (agents monitoring)
   - Drops per 1000 calls ratio

3. **Detailed Table** (Active calls only):
   - Conversation ID (with link to Genesys)
   - Queue name
   - Recording status
   - User name
   - Answer and disconnect times
   - Error information
   - Device details (name, OS, managed status)
   - Network information (IP, centre, Zscaler)

## API Permissions

### Genesys Cloud

Required OAuth scopes:
- `routing:queue:view`
- `users:user:view`
- `analytics:conversationDetail:view`
- `usage:events:view`

### Azure AD

Required Microsoft Graph permissions:
- `AuditLog.Read.All` (Application permission)

## Data Enrichment

The system enriches dropped call data with:

1. **Azure Sign-In Data**:
   - Device ID and name
   - Operating system
   - IP address
   - Managed/unmanaged status

2. **Static Mapping Data**:
   - Centre location (from IP mapping)
   - Managed device details
   - Zscaler network detection

## Logging

Logs are stored in the `logs/` directory with timestamps:
- `dropped-calls-YYYY-MM-DDTHH-MM-SS.log`

Log levels:
- ERROR: Critical errors
- WARN: Warnings
- INFO: General information
- DEBUG: Detailed debugging information

Configure log level in `.env`:
```env
LOG_LEVEL=DEBUG
```

## Error Handling

The system includes:
- Automatic retry logic for API rate limits (429)
- Exponential backoff for failed requests
- Error summary emails to configured recipients
- Detailed error logging

## Monitoring

Monitor the service:
- Check logs in `logs/` directory
- Review email reports
- Monitor error emails (if configured)

## Troubleshooting

### Authentication Issues

**Genesys Cloud:**
```bash
# Verify credentials
curl -X POST "https://login.mypurecloud.com.au/oauth/token" \
  -u "CLIENT_ID:CLIENT_SECRET" \
  -d "grant_type=client_credentials"
```

**Azure AD:**
```bash
# Verify app registration and permissions in Azure Portal
# Ensure admin consent is granted for AuditLog.Read.All
```

### No Data in Reports

1. Check date range configuration
2. Verify API permissions
3. Review logs for API errors
4. Ensure events exist in Genesys for the time period

### Email Delivery Issues

1. Verify SMTP credentials
2. Check firewall/network settings
3. For Gmail: Use App Password instead of account password
4. Review email service logs

## Production Deployment

### Using PM2

```bash
npm install -g pm2
pm2 start app.js --name dropped-calls-reporter -- --daemon
pm2 save
pm2 startup
```

### Using systemd

Create `/etc/systemd/system/dropped-calls-reporter.service`:

```ini
[Unit]
Description=Dropped Calls Reporter
After=network.target

[Service]
Type=simple
User=node
WorkingDirectory=/path/to/dropped-calls-reporter
ExecStart=/usr/bin/node app.js --daemon
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable dropped-calls-reporter
sudo systemctl start dropped-calls-reporter
```

## Support

For issues or questions:
1. Check the logs in `logs/` directory
2. Review configuration in `.env`
3. Verify API credentials and permissions
4. Contact system administrator

## License

ISC