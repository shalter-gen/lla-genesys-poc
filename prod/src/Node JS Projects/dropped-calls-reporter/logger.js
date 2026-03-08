const fs = require('fs');
const path = require('path');

class Logger {
    constructor() {
        this.logLevels = {
            ERROR: 0,
            WARN: 1,
            INFO: 2,
            DEBUG: 3
        };
        
        // Create logs directory if it doesn't exist
        this.logsDir = path.join(__dirname, 'logs');
        if (!fs.existsSync(this.logsDir)) {
            fs.mkdirSync(this.logsDir);
        }
        
        // Create timestamped log file
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        this.logFile = path.join(this.logsDir, `dropped-calls-${timestamp}.log`);
    }

    formatMessage(level, message, data = null) {
        const timestamp = new Date().toISOString();
        let formattedMessage = `[${timestamp}] [${level}] ${message}`;
        
        if (data) {
            formattedMessage += `\nData: ${JSON.stringify(data, null, 2)}`;
        }
        
        return formattedMessage;
    }

    writeToFile(message) {
        fs.appendFileSync(this.logFile, message + '\n');
    }

    error(message, data = null) {
        const formattedMessage = this.formatMessage('ERROR', message, data);
        console.error(formattedMessage);
        this.writeToFile(formattedMessage);
    }

    warn(message, data = null) {
        const formattedMessage = this.formatMessage('WARN', message, data);
        this.writeToFile(formattedMessage);
    }

    info(message, data = null) {
        const formattedMessage = this.formatMessage('INFO', message, data);
        this.writeToFile(formattedMessage);
    }

    debug(message, data = null) {
        const formattedMessage = this.formatMessage('DEBUG', message, data);
        this.writeToFile(formattedMessage);
    }
}

module.exports = new Logger();