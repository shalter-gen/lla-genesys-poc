const logger = require('./logger');

class TimeUtils {
    constructor() {
        this.sydneyTimezone = 'Australia/Sydney';
        this.maxChunkHours = 2;
    }

    getCurrentSydneyTime() {
        return new Date().toLocaleString('en-AU', {
            timeZone: this.sydneyTimezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
    }

    getTimePeriod(choice, specificDate = null) {
        const now = new Date();
        let fromTime, toTime, description;

        switch (choice) {
            case '1': // Last 2 hours
                fromTime = new Date(now.getTime() - (2 * 60 * 60 * 1000));
                toTime = now;
                description = 'Last 2 hours';
                break;

            case '2': // Last 12 hours
                fromTime = new Date(now.getTime() - (12 * 60 * 60 * 1000));
                toTime = now;
                description = 'Last 12 hours';
                break;

            case '3': // Last 24 hours
                fromTime = new Date(now.getTime() - (24 * 60 * 60 * 1000));
                toTime = now;
                description = 'Last 24 hours';
                break;

            case '4': // Specific day
                if (!specificDate) {
                    throw new Error('Specific date required for option 4');
                }
                
                const dateObj = new Date(specificDate + 'T00:00:00');
                if (isNaN(dateObj.getTime())) {
                    throw new Error('Invalid date format. Please use YYYY-MM-DD');
                }
                
                fromTime = new Date(specificDate + 'T00:00:00+11:00');
                toTime = new Date(specificDate + 'T23:59:59+11:00');
                description = `Specific day: ${specificDate}`;
                break;

            default:
                throw new Error('Invalid choice');
        }

        const fromEpoch = Math.floor(fromTime.getTime() / 1000);
        const toEpoch = Math.floor(toTime.getTime() / 1000);

        logger.info('Time period calculated', {
            choice,
            description,
            fromTime: fromTime.toISOString(),
            toTime: toTime.toISOString(),
            fromEpoch,
            toEpoch
        });

        return {
            fromEpoch,
            toEpoch,
            fromTime,
            toTime,
            description
        };
    }

    splitIntoChunks(fromEpoch, toEpoch) {
        const chunks = [];
        const maxChunkSeconds = this.maxChunkHours * 60 * 60;
        
        let currentFrom = fromEpoch;
        
        while (currentFrom < toEpoch) {
            const currentTo = Math.min(currentFrom + maxChunkSeconds, toEpoch);
            
            chunks.push({
                from: currentFrom,
                to: currentTo,
                fromTime: new Date(currentFrom * 1000),
                toTime: new Date(currentTo * 1000)
            });
            
            currentFrom = currentTo;
        }
        
        logger.info(`Split time period into ${chunks.length} chunks`, {
            totalChunks: chunks.length,
            maxChunkHours: this.maxChunkHours,
            chunks: chunks.map(c => ({
                from: c.fromTime.toISOString(),
                to: c.toTime.toISOString()
            }))
        });
        
        return chunks;
    }

    generateFileName(fromTime, toTime) {
        try {
            if (!fromTime || !toTime) {
                throw new Error('Invalid time parameters for filename generation');
            }

            const formatDate = (date) => {
                if (!(date instanceof Date) || isNaN(date.getTime())) {
                    throw new Error('Invalid date object');
                }
                
                return date.toLocaleString('en-AU', {
                    timeZone: this.sydneyTimezone,
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                }).replace(/[\/\s:]/g, '-');
            };

            const fromFormatted = formatDate(fromTime);
            const toFormatted = formatDate(toTime);
            
            const fileName = `battery_report_${fromFormatted}_to_${toFormatted}.csv`;
            
            logger.debug('Generated filename', {
                fromTime: fromTime.toISOString(),
                toTime: toTime.toISOString(),
                fromFormatted,
                toFormatted,
                fileName
            });
            
            return fileName;
        } catch (error) {
            logger.error('Failed to generate filename', {
                error: error.message,
                fromTime: fromTime?.toISOString(),
                toTime: toTime?.toISOString()
            });
            
            // Fallback filename
            const fallbackName = `battery_report_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
            logger.warn('Using fallback filename', { fallbackName });
            return fallbackName;
        }
    }
}

module.exports = TimeUtils;
