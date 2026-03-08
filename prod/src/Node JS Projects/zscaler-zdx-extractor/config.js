require('dotenv').config();

module.exports = {
    baseUrl: process.env.BASE_URL || 'https://api.zdxcloud.net/v1',
    apiKey: process.env.API_KEY,
    apiSecret: process.env.API_SECRET,
    pollingInterval: parseInt(process.env.POLLING_INTERVAL) || 10,
    logLevel: process.env.LOG_LEVEL || 'DEBUG',
    maxRetries: parseInt(process.env.MAX_RETRIES) || 5,
    baseWaitMs: parseInt(process.env.BASE_WAIT_MS) || 1000,
    
    // Daemon configuration
    dataRetrievalPeriodHours: parseInt(process.env.DATA_RETRIEVAL_PERIOD_HOURS) || 4,
    dataRetrievalStartHour: parseInt(process.env.DATA_RETRIEVAL_START_HOUR) || 0,
    outputFolder: process.env.OUTPUT_FOLDER || './output',
    errorEmailTo: process.env.ERROR_EMAIL_TO || '',
    
    // Email configuration
    smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
    smtpPort: parseInt(process.env.SMTP_PORT) || 587,
    smtpSecure: process.env.SMTP_SECURE === 'true',
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,
    emailFrom: process.env.EMAIL_FROM,
    emailTo: process.env.EMAIL_TO,
    emailSubject: process.env.EMAIL_SUBJECT || 'Zscaler ZDX Battery Report',
    
    // Report criteria (optional - if not set or empty, criteria is not applied)
    minTotalDurationHours: process.env.MIN_TOTAL_DURATION_HOURS ? parseFloat(process.env.MIN_TOTAL_DURATION_HOURS) : null,
    minUnpluggedDurationHours: process.env.MIN_UNPLUGGED_DURATION_HOURS ? parseFloat(process.env.MIN_UNPLUGGED_DURATION_HOURS) : null,
    minUnpluggedPercent: process.env.MIN_UNPLUGGED_PERCENT ? parseFloat(process.env.MIN_UNPLUGGED_PERCENT) : null
};
