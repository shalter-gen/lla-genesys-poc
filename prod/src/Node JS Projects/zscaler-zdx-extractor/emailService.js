const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./logger');

class EmailService {
    constructor() {
        this.transporter = nodemailer.createTransport({
            host: config.smtpHost,
            port: config.smtpPort,
            secure: config.smtpSecure,
            auth: {
                user: config.smtpUser,
                pass: config.smtpPass
            }
        });
        logger.info('Email service initialized');
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

    generateReportTable(filteredReports) {
        if (filteredReports.length === 0) {
            return '<p>No devices met the reporting criteria.</p>';
        }

        // Sort by unplugged duration (decreasing)
        const sortedReports = filteredReports.sort((a, b) => {
            const aUnplugged = this.parseTimeToMinutes(a.unpluggedDuration);
            const bUnplugged = this.parseTimeToMinutes(b.unpluggedDuration);
            return bUnplugged - aUnplugged;
        });

        let tableHtml = `
            <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; font-family: Arial, sans-serif;">
                <thead style="background-color: #f2f2f2;">
                    <tr>
                        <th>User Name</th>
                        <th>User Email</th>
                        <th>Device Name</th>
                        <th>Total Duration</th>
                        <th>Start Session</th>
                        <th>End Session</th>
                        <th>Plugged</th>
                        <th>Unplugged</th>
                        <th>Unknown</th>
                        <th>Plugged %</th>
                        <th>Unplugged %</th>
                    </tr>
                </thead>
                <tbody>
        `;

        sortedReports.forEach((report, index) => {
            const rowStyle = index % 2 === 0 ? 'background-color: #f9f9f9;' : '';

            // Format durations using the same logic as CSV
            const totalDuration = this.formatDuration(report.totalDuration, true);
            const startSession = this.formatTimestamp(report.startSession);
            const endSession = this.formatTimestamp(report.endSession);
            const pluggedDuration = this.formatDuration(report.pluggedDuration, report.hasBatteryData);
            const unpluggedDuration = this.formatDuration(report.unpluggedDuration, report.hasBatteryData);
            const unknownDuration = this.formatDuration(report.unknownDuration, report.hasBatteryData);
            const pluggedPercentage = report.hasBatteryData && report.pluggedPercentage !== null ? report.pluggedPercentage : '';
            const unpluggedPercentage = report.hasBatteryData && report.unpluggedPercentage !== null ? report.unpluggedPercentage : '';

            tableHtml += `
                <tr style="${rowStyle}">
                    <td>${report.userName}</td>
                    <td>${report.userEmail}</td>
                    <td>${report.deviceName}</td>
                    <td>${totalDuration}</td>
                    <td>${startSession}</td>
                    <td>${endSession}</td>
                    <td>${pluggedDuration}</td>
                    <td style="font-weight: bold; color: #d32f2f;">${unpluggedDuration}</td>
                    <td>${unknownDuration}</td>
                    <td>${pluggedPercentage}${pluggedPercentage !== '' ? '%' : ''}</td>
                    <td style="font-weight: bold; color: #d32f2f;">${unpluggedPercentage}${unpluggedPercentage !== '' ? '%' : ''}</td>
                </tr>
            `;
        });

        tableHtml += `
                </tbody>
            </table>
        `;

        return tableHtml;
    }

    parseTimeToMinutes(timeString) {
        // Handle null, undefined, or empty values
        if (!timeString || timeString === '' || timeString === null || timeString === undefined) {
            return 0;
        }

        // If it's already a number, return it (assuming it's already in minutes)
        if (typeof timeString === 'number') {
            return timeString;
        }

        // Convert to string if it's not already
        const timeStr = String(timeString);

        // Check if it contains a colon (HH:MM format)
        if (timeStr.includes(':')) {
            try {
                const [hours, minutes] = timeStr.split(':').map(Number);
                // Validate that we got valid numbers
                if (isNaN(hours) || isNaN(minutes)) {
                    logger.warn('Invalid time format, returning 0', { timeString: timeStr });
                    return 0;
                }
                return (hours * 60) + minutes;
            } catch (error) {
                logger.warn('Error parsing time string, returning 0', {
                    timeString: timeStr,
                    error: error.message
                });
                return 0;
            }
        }

        // If it's just a number as string, parse it
        const numValue = parseFloat(timeStr);
        if (!isNaN(numValue)) {
            return numValue;
        }

        // If we can't parse it, log a warning and return 0
        logger.warn('Unable to parse time string, returning 0', { timeString: timeStr });
        return 0;
    }

    getActiveCriteria() {
        const criteria = [];

        if (config.minTotalDurationHours !== null) {
            criteria.push(`Total session duration ≥ ${config.minTotalDurationHours} hour(s)`);
        }

        if (config.minUnpluggedDurationHours !== null) {
            criteria.push(`Unplugged duration ≥ ${config.minUnpluggedDurationHours} hour(s)`);
        }

        if (config.minUnpluggedPercent !== null) {
            criteria.push(`Unplugged percentage ≥ ${config.minUnpluggedPercent}%`);
        }

        return criteria;
    }

    filterReportsByCriteria(reports) {
        return reports.filter(report => {
            try {
                // First filter: Only include devices with battery data
                if (!report.hasBatteryData) {
                    logger.debug('Excluding device without battery data', {
                        userName: report.userName,
                        deviceName: report.deviceName
                    });
                    return false;
                }

                // Parse values for criteria checking
                const totalMinutes = this.parseTimeToMinutes(report.totalDuration);
                const totalHours = totalMinutes / 60;
                const unpluggedMinutes = this.parseTimeToMinutes(report.unpluggedDuration);
                const unpluggedHours = unpluggedMinutes / 60;
                const unpluggedPercent = parseFloat(report.unpluggedPercentage) || 0;

                // Apply criteria only if they are configured (not null)
                const criteriaResults = [];

                // Check total duration criteria (if configured)
                if (config.minTotalDurationHours !== null) {
                    const totalDurationMet = totalHours >= config.minTotalDurationHours;
                    criteriaResults.push(totalDurationMet);
                    logger.debug('Total duration criteria', {
                        userName: report.userName,
                        deviceName: report.deviceName,
                        totalHours,
                        minRequired: config.minTotalDurationHours,
                        met: totalDurationMet
                    });
                }

                // Check unplugged duration criteria (if configured)
                if (config.minUnpluggedDurationHours !== null) {
                    const unpluggedDurationMet = unpluggedHours >= config.minUnpluggedDurationHours;
                    criteriaResults.push(unpluggedDurationMet);
                    logger.debug('Unplugged duration criteria', {
                        userName: report.userName,
                        deviceName: report.deviceName,
                        unpluggedHours,
                        minRequired: config.minUnpluggedDurationHours,
                        met: unpluggedDurationMet
                    });
                }

                // Check unplugged percentage criteria (if configured)
                if (config.minUnpluggedPercent !== null) {
                    const unpluggedPercentMet = unpluggedPercent >= config.minUnpluggedPercent;
                    criteriaResults.push(unpluggedPercentMet);
                    logger.debug('Unplugged percentage criteria', {
                        userName: report.userName,
                        deviceName: report.deviceName,
                        unpluggedPercent,
                        minRequired: config.minUnpluggedPercent,
                        met: unpluggedPercentMet
                    });
                }

                // If no criteria are configured, include all devices with battery data
                if (criteriaResults.length === 0) {
                    logger.debug('No criteria configured, including device with battery data', {
                        userName: report.userName,
                        deviceName: report.deviceName
                    });
                    return true;
                }

                // All configured criteria must be met (logical AND)
                const meetsCriteria = criteriaResults.every(result => result === true);

                logger.debug('Overall criteria result', {
                    userName: report.userName,
                    deviceName: report.deviceName,
                    criteriaCount: criteriaResults.length,
                    meetsCriteria
                });

                return meetsCriteria;
            } catch (error) {
                logger.error('Error filtering report', {
                    userName: report.userName,
                    deviceName: report.deviceName,
                    error: error.message,
                    report: report
                });
                return false; // Exclude reports that cause errors
            }
        });
    }

    async sendReport(csvFilePath, reports, timePeriod) {
        try {
            // Filter reports based on criteria
            const filteredReports = this.filterReportsByCriteria(reports);
            const activeCriteria = this.getActiveCriteria();

            logger.info('Preparing email report', {
                totalReports: reports.length,
                reportsWithBatteryData: reports.filter(r => r.hasBatteryData).length,
                reportsWithoutBatteryData: reports.filter(r => !r.hasBatteryData).length,
                filteredReports: filteredReports.length,
                activeCriteria: activeCriteria.length,
                csvFile: path.basename(csvFilePath)
            });

            // Generate HTML table
            const reportTable = this.generateReportTable(filteredReports);

            // Generate criteria list HTML
            let criteriaHtml = '<li>Device must have battery data available</li>';
            if (activeCriteria.length > 0) {
                criteriaHtml += activeCriteria.map(criteria => `<li>${criteria}</li>`).join('');
            } else {
                criteriaHtml += '<li><em>No additional criteria configured - showing all devices with battery data</em></li>';
            }

            // Create email body
            const emailBody = `
                <html>
                <head>
                    <style>
                        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                        .header { background-color: #f4f4f4; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
                        .summary { background-color: #e8f5e8; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
                        .criteria { background-color: #fff3cd; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h2>Zscaler ZDX Battery Usage Report</h2>
                        <p><strong>Period:</strong> ${timePeriod.description}</p>
                        <p><strong>From:</strong> ${timePeriod.fromTime.toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })}</p>
                        <p><strong>To:</strong> ${timePeriod.toTime.toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })}</p>
                        <p><strong>Generated:</strong> ${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })}</p>
                    </div>

                    <div class="summary">
                        <h3>Summary</h3>
                        <p><strong>Total Devices Processed:</strong> ${reports.length}</p>
                        <p><strong>Devices with Battery Data:</strong> ${reports.filter(r => r.hasBatteryData).length}</p>
                        <p><strong>Devices without Battery Data:</strong> ${reports.filter(r => !r.hasBatteryData).length}</p>
                        <p><strong>Devices Meeting Alert Criteria:</strong> ${filteredReports.length}</p>
                    </div>

                    <div class="criteria">
                        <h3>Alert Criteria ${activeCriteria.length > 0 ? '(All must be met)' : ''}</h3>
                        <ul>
                            ${criteriaHtml}
                        </ul>
                    </div>

                    <h3>Devices Meeting Alert Criteria (Sorted by Unplugged Duration)</h3>
                    ${reportTable}

                    <p style="margin-top: 30px; font-size: 12px; color: #666;">
                        Complete data for all devices (including those without battery data) is available in the attached CSV file.
                    </p>
                </body>
                </html>
            `;

            // Prepare email options
            const mailOptions = {
                from: config.emailFrom,
                to: config.emailTo,
                subject: `${config.emailSubject} - ${timePeriod.description}`,
                html: emailBody,
                attachments: [
                    {
                        filename: path.basename(csvFilePath),
                        path: csvFilePath
                    }
                ]
            };

            // Send email
            const info = await this.transporter.sendMail(mailOptions);

            logger.info('Report email sent successfully', {
                messageId: info.messageId,
                recipients: config.emailTo,
                attachmentFile: path.basename(csvFilePath),
                filteredReports: filteredReports.length,
                devicesWithBatteryData: reports.filter(r => r.hasBatteryData).length,
                activeCriteria: activeCriteria.length
            });

            console.log(`📧 Report email sent successfully to: ${config.emailTo}`);
            console.log(`📊 ${filteredReports.length} devices met the alert criteria`);
            console.log(`🔋 ${reports.filter(r => r.hasBatteryData).length} devices had battery data`);
            console.log(`⚙️  ${activeCriteria.length} criteria configured`);

        } catch (error) {
            logger.error('Failed to send report email', {
                error: error.message,
                csvFile: csvFilePath,
                stack: error.stack
            });
            throw error;
        }
    }

    async sendErrorSummary(subject, errorList, timePeriod) {
        if (!config.errorEmailTo) return;
        const errorLines = errorList.map((err, i) =>
            `<tr><td>${i + 1}</td><td>${err.endpoint || ''}</td><td>${err.error || ''}</td><td>${err.stack || ''}</td></tr>`
        ).join('');
        const html = `
            <h2>ZDX Battery Report: Error Summary</h2>
            <p><strong>Period:</strong> ${timePeriod?.description || 'N/A'}</p>
            <table border="1" cellpadding="6" style="border-collapse:collapse;">
            <tr><th>#</th><th>Endpoint</th><th>Error</th><th>Stack</th></tr>
            ${errorLines}
            </table>
            <p>See logs for more details.</p>
        `;
        await this.transporter.sendMail({
            from: config.emailFrom,
            to: config.errorEmailTo,
            subject,
            html
        });
    }

}

module.exports = EmailService;
