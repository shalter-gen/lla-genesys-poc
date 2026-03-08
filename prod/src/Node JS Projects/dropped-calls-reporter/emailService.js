const nodemailer = require('nodemailer');
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

    generateReportTable(droppedCalls) {
        if (droppedCalls.length === 0) {
            return '<p>No dropped calls found for this period.</p>';
        }

        // Filter to only include active dropped calls that are external (with queue)
        const filteredCalls = droppedCalls.filter(call => 
            call.actorType === 'Active in Call' && 
            call.queueName !== 'No Queue'
        );

        if (filteredCalls.length === 0) {
            return '<p>No active external dropped calls found for this period.</p>';
        }

        let tableHtml = `
            <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; font-family: Arial, sans-serif; font-size: 12px;">
                <thead style="background-color: #f2f2f2;">
                    <tr>
                        <th>Conversation ID</th>
                        <th>Queue Name</th>
                        <th>Recording</th>
                        <th>User Name</th>
                        <th>Answer Time</th>
                        <th>Disconnect Time</th>
                        <th>Error Info</th>
                        <th>Device Name</th>
                        <th>Managed</th>
                        <th>IP Address</th>
                        <th>OS</th>
                        <th>Centre</th>
                        <th>Zscaler</th>
                    </tr>
                </thead>
                <tbody>
        `;

        filteredCalls.forEach((call, index) => {
            const rowStyle = index % 2 === 0 ? 'background-color: #f9f9f9;' : '';
            const displayName = call.userName.includes('@') ? call.userName.split('@')[0] : call.userName;

            tableHtml += `
                <tr style="${rowStyle}">
                    <td><a href="${call.link}" target="_blank" style="color: #0066cc;">${call.conversationId}</a></td>
                    <td>${call.queueName}</td>
                    <td>${call.recording}</td>
                    <td>${displayName}</td>
                    <td>${call.answerTimeDisplay}</td>
                    <td>${call.disconnectTimeDisplay}</td>
                    <td style="max-width: 300px; word-wrap: break-word;">${call.errorInfo}</td>
                    <td>${call.deviceName || ''}</td>
                    <td>${call.managedStatus || ''}</td>
                    <td>${call.ipAddress || ''}</td>
                    <td>${call.os || ''}</td>
                    <td>${call.centre || ''}</td>
                    <td>${call.zscaler !== null ? (call.zscaler ? 'true' : 'false') : ''}</td>
                </tr>
            `;
        });

        tableHtml += `
                </tbody>
            </table>
        `;

        return tableHtml;
    }

    async sendReport(droppedCalls, timePeriod, summaryStats, csvFilePath) {
        try {
            const activeDroppedCalls = droppedCalls.filter(call => call.actorType === 'Active in Call');
            const externalCalls = droppedCalls.filter(call => 
                call.actorType === 'Active in Call' && 
                call.queueName !== 'No Queue'
            );
            const internalCalls = droppedCalls.filter(call => 
                call.actorType === 'Active in Call' && 
                call.queueName === 'No Queue'
            );
            const monitoringDroppedCalls = droppedCalls.filter(call => call.actorType === 'Monitoring Call');

            logger.info('Preparing email report', {
                totalDroppedCalls: droppedCalls.length,
                activeDroppedCalls: activeDroppedCalls.length,
                externalCalls: externalCalls.length,
                internalCalls: internalCalls.length,
                monitoringDroppedCalls: monitoringDroppedCalls.length,
                csvFile: csvFilePath
            });

            const reportTable = this.generateReportTable(droppedCalls);

            const emailBody = `
                <html>
                <head>
                    <style>
                        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                        .header { background-color: #f4f4f4; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
                        .summary { background-color: #e8f5e8; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
                        .warning { background-color: #fff3cd; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h2>Genesys Cloud Dropped Calls Report</h2>
                        <p><strong>Period:</strong> ${timePeriod.description}</p>
                        <p><strong>From:</strong> ${timePeriod.fromTime.toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })}</p>
                        <p><strong>To:</strong> ${timePeriod.toTime.toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })}</p>
                        <p><strong>Generated:</strong> ${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })}</p>
                    </div>

                    <div class="summary">
                        <h3>Summary Statistics</h3>
                        <p><strong>Total Answered Calls:</strong> ${summaryStats.totalAnswered.toLocaleString()}</p>
                        <p><strong>Dropped External Calls:</strong> ${summaryStats.externalDrops} out of ${summaryStats.externalAnswered.toLocaleString()} (${summaryStats.externalPercent}%)</p>
                        <p><strong>Dropped Internal Calls:</strong> ${summaryStats.internalDrops} out of ${summaryStats.internalAnswered.toLocaleString()} (${summaryStats.internalPercent}%)</p>
                        <p><strong>Dropped Monitoring:</strong> ${summaryStats.monitoringDrops} out of ${summaryStats.totalMonitored.toLocaleString()} (${summaryStats.monitoringPercent}%)</p>
                        <p><strong>Total Dropped Calls:</strong> ${droppedCalls.length}</p>
                        <p><strong>Drops per 1000 Calls:</strong> ${summaryStats.dropsPer1000}</p>
                    </div>

                    ${externalCalls.length > 10 ? `
                    <div class="warning">
                        <h3>⚠️ High Dropped Call Rate</h3>
                        <p>There were ${externalCalls.length} external dropped calls in the past 24 hours, which is ${summaryStats.dropsPer1000} drops per 1000 calls.</p>
                    </div>
                    ` : ''}

                    <h3>Dropped Calls Details (Active External Calls Only)</h3>
                    ${reportTable}

                    <p style="margin-top: 30px; font-size: 12px; color: #666;">
                        <strong>Note:</strong> This table shows only external calls (with queue) where the agent was actively participating. 
                        The attached CSV contains all dropped calls including internal calls and monitoring sessions.
                    </p>
                </body>
                </html>
            `;

            const path = require('path');
            const mailOptions = {
                from: config.emailFrom,
                to: config.emailTo,
                subject: `${config.emailSubject} - ${timePeriod.description} - ${externalCalls.length} External Drops`,
                html: emailBody,
                attachments: [
                    {
                        filename: path.basename(csvFilePath),
                        path: csvFilePath
                    }
                ]
            };

            const info = await this.transporter.sendMail(mailOptions);

            logger.info('Report email sent successfully', {
                messageId: info.messageId,
                recipients: config.emailTo,
                externalCalls: externalCalls.length,
                internalCalls: internalCalls.length,
                totalDroppedCalls: droppedCalls.length,
                csvFile: path.basename(csvFilePath)
            });

            console.log(`📧 Report email sent successfully to: ${config.emailTo}`);
            console.log(`📊 ${externalCalls.length} external dropped calls`);
            console.log(`📊 ${internalCalls.length} internal dropped calls`);
            console.log(`📉 ${summaryStats.dropsPer1000} drops per 1000 calls`);
            console.log(`📎 CSV attached: ${path.basename(csvFilePath)}`);

        } catch (error) {
            logger.error('Failed to send report email', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    async sendErrorSummary(subject, errorList, timePeriod) {
        if (!config.errorEmailTo) return;
        
        const errorLines = errorList.map((err, i) =>
            `<tr><td>${i + 1}</td><td>${err.endpoint || ''}</td><td>${err.error || ''}</td></tr>`
        ).join('');
        
        const html = `
            <h2>Dropped Calls Report: Error Summary</h2>
            <p><strong>Period:</strong> ${timePeriod?.description || 'N/A'}</p>
            <table border="1" cellpadding="6" style="border-collapse:collapse;">
            <tr><th>#</th><th>Endpoint</th><th>Error</th></tr>
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