const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const path = require('path');
const logger = require('./logger');

class CsvExporter {
    constructor() {
        this.csvWriter = null;
        this.fileName = null;
    }

    formatDuration(minutes, hasBatteryData = true) {
        // If no battery data, return empty string
        if (!hasBatteryData && (minutes === null || minutes === undefined)) {
            return '';
        }
        // If has battery data but value is 0, show 00:00
        if (hasBatteryData && (minutes === 0 || minutes === null || minutes === undefined)) {
            return '00:00';
        }
        // Normal formatting for positive values
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    }

    formatTimestamp(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp * 1000);
        return date.toLocaleString('en-AU', {
            timeZone: 'Australia/Sydney',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
    }

    formatPercentage(percentage, hasBatteryData = true) {
        // If no battery data, return empty string
        if (!hasBatteryData) return '';
        // If has battery data, return the value (including 0)
        if (percentage === null || percentage === undefined) return 0;
        return percentage;
    }

    setFileName(fileName) {
        if (!fileName || typeof fileName !== 'string') {
            throw new Error('Invalid filename provided to CSV exporter');
        }
        
        this.fileName = fileName;
        const fullPath = path.join(__dirname, fileName);
        
        this.csvWriter = createCsvWriter({
            path: fullPath,
            header: [
                { id: 'userId', title: 'User ID' },
                { id: 'deviceId', title: 'Device ID' },
                { id: 'userEmail', title: 'User Email' },
                { id: 'userName', title: 'User Name' },
                { id: 'deviceName', title: 'Device Name' },
                { id: 'totalDuration', title: 'Total Duration (hh:mm)' },
                { id: 'startSession', title: 'Start Session (hh:mm)' },
                { id: 'endSession', title: 'End Session (hh:mm)' },
                { id: 'batteryData', title: 'Battery Data' },
                { id: 'pluggedDuration', title: 'Plugged (hh:mm)' },
                { id: 'unpluggedDuration', title: 'Unplugged (hh:mm)' },
                { id: 'unknownDuration', title: 'Unknown (hh:mm)' },
                { id: 'pluggedPercentage', title: 'Plugged (%)' },
                { id: 'unpluggedPercentage', title: 'Unplugged (%)' }
            ]
        });
        
        logger.info(`CSV file configured successfully`, { 
            fileName: fileName,
            fullPath: fullPath
        });
    }

    async exportData(batteryReports) {
        if (!this.csvWriter) {
            const defaultFileName = `battery_report_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
            logger.warn('CSV writer not configured, using default filename', { defaultFileName });
            this.setFileName(defaultFileName);
        }

        if (!Array.isArray(batteryReports)) {
            throw new Error('Battery reports must be an array');
        }

        try {
            // Format the data before writing
            const formattedReports = batteryReports.map(report => ({
                userId: report.userId,
                deviceId: report.deviceId,
                userEmail: report.userEmail,
                userName: report.userName,
                deviceName: report.deviceName,
                totalDuration: this.formatDuration(report.totalDuration, true), // Always format total duration
                startSession: this.formatTimestamp(report.startSession),
                endSession: this.formatTimestamp(report.endSession),
                batteryData: report.hasBatteryData ? 'Yes' : 'No',
                pluggedDuration: this.formatDuration(report.pluggedDuration, report.hasBatteryData),
                unpluggedDuration: this.formatDuration(report.unpluggedDuration, report.hasBatteryData),
                unknownDuration: this.formatDuration(report.unknownDuration, report.hasBatteryData),
                pluggedPercentage: this.formatPercentage(report.pluggedPercentage, report.hasBatteryData),
                unpluggedPercentage: this.formatPercentage(report.unpluggedPercentage, report.hasBatteryData)
            }));

            logger.debug('Starting CSV export with formatted data', { 
                recordCount: formattedReports.length,
                fileName: this.fileName,
                writerPath: this.csvWriter.path
            });

            await this.csvWriter.writeRecords(formattedReports);
            
            console.log(`\n✅ Battery report exported successfully!`);
            console.log(`📁 File: ${this.fileName}`);
            console.log(`📊 Total records: ${formattedReports.length}`);
            
            logger.info('CSV export completed successfully', {
                fileName: this.fileName,
                recordCount: formattedReports.length,
                fullPath: this.csvWriter.path
            });
        } catch (error) {
            logger.error('Failed to export CSV', { 
                error: error.message,
                fileName: this.fileName,
                writerPath: this.csvWriter?.path,
                recordCount: batteryReports?.length
            });
            throw error;
        }
    }
}

module.exports = CsvExporter;
