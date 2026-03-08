require('dotenv').config();

module.exports = {
    // Genesys Cloud API Configuration
    genesysRegion: process.env.GENESYS_REGION || 'mypurecloud.com.au',
    genesysClientId: process.env.GENESYS_CLIENT_ID,
    genesysClientSecret: process.env.GENESYS_CLIENT_SECRET,
    
    // Azure AD Configuration
    azureTenantId: process.env.AZURE_TENANT_ID,
    azureClientId: process.env.AZURE_CLIENT_ID,
    azureClientSecret: process.env.AZURE_CLIENT_SECRET,
    azureGenesysAppId: '8293d214-ba8f-4370-9a77-f007405fe3c5', // Genesys Cloud application ID in Azure
    
    // Daemon configuration
    reportScheduleHour: parseInt(process.env.REPORT_SCHEDULE_HOUR) || 8, // 08:00 AM
    droppedCallsLookbackHours: parseInt(process.env.DROPPED_CALLS_LOOKBACK_HOURS) || 24,
    signInLogsLookbackHours: parseInt(process.env.SIGNIN_LOGS_LOOKBACK_HOURS) || 48,
    outputFolder: process.env.OUTPUT_FOLDER || './output',
    
    // Email configuration
    smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
    smtpPort: parseInt(process.env.SMTP_PORT) || 587,
    smtpSecure: process.env.SMTP_SECURE === 'true',
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,
    emailFrom: process.env.EMAIL_FROM,
    emailTo: process.env.EMAIL_TO,
    emailSubject: process.env.EMAIL_SUBJECT || 'Genesys Cloud Dropped Calls Report',
    errorEmailTo: process.env.ERROR_EMAIL_TO || '',
    
    // API Configuration
    maxRetries: parseInt(process.env.MAX_RETRIES) || 5,
    baseWaitMs: parseInt(process.env.BASE_WAIT_MS) || 1000,
    
    // Logging
    logLevel: process.env.LOG_LEVEL || 'DEBUG',
    
    // Zscaler IP ranges (for network analysis)
    zscalerRanges: [
        { cidr: '147.161.212.0/23', start: '147.161.212.0', end: '147.161.213.255' },
        { cidr: '147.161.214.0/23', start: '147.161.214.0', end: '147.161.215.255' },
        { cidr: '147.161.218.0/23', start: '147.161.218.0', end: '147.161.219.255' },
        { cidr: '165.225.114.0/23', start: '165.225.114.0', end: '165.225.115.255' },
        { cidr: '165.225.226.0/23', start: '165.225.226.0', end: '165.225.227.255' },
        { cidr: '165.225.232.0/23', start: '165.225.232.0', end: '165.225.233.255' },
        { cidr: '167.103.100.0/23', start: '167.103.100.0', end: '167.103.101.255' },
        { cidr: '167.103.102.0/23', start: '167.103.102.0', end: '167.103.103.255' },
        { cidr: '167.103.104.0/23', start: '167.103.104.0', end: '167.103.105.255' },
        { cidr: '167.103.106.0/23', start: '167.103.106.0', end: '167.103.107.255' },
        { cidr: '167.103.130.0/23', start: '167.103.130.0', end: '167.103.131.255' },
        { cidr: '167.103.214.0/23', start: '167.103.214.0', end: '167.103.215.255' },
        { cidr: '167.103.248.0/23', start: '167.103.248.0', end: '167.103.249.255' },
        { cidr: '167.103.250.0/23', start: '167.103.250.0', end: '167.103.251.255' },
        { cidr: '167.103.252.0/23', start: '167.103.252.0', end: '167.103.253.255' },
        { cidr: '167.103.254.0/23', start: '167.103.254.0', end: '167.103.255.255' },
        { cidr: '167.103.80.0/23', start: '167.103.80.0', end: '167.103.81.255' },
        { cidr: '167.103.82.0/23', start: '167.103.82.0', end: '167.103.83.255' },
        { cidr: '167.103.98.0/23', start: '167.103.98.0', end: '167.103.99.255' },
        { cidr: '101.2.212.0/23', start: '101.2.212.0', end: '101.2.213.255' }
    ],
    
    // Static data file paths
    centreMappingFile: process.env.CENTRE_MAPPING_FILE || './data/centre-pcs.csv',
    managedDevicesFile: process.env.MANAGED_DEVICES_FILE || './data/managed-pcs.csv'
};