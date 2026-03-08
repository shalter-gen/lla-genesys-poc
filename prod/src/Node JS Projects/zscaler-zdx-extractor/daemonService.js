const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./logger');
const TimeUtils = require('./timeUtils');
const EmailService = require('./emailService');

class DaemonService {
    constructor(dataExtractor) {
        this.dataExtractor = dataExtractor;
        this.timeUtils = new TimeUtils();
        this.emailService = new EmailService();
        this.isRunning = false;
        this.ensureOutputDirectory();
        logger.info('Daemon service initialized', {
            retrievalPeriodHours: config.dataRetrievalPeriodHours,
            startHour: config.dataRetrievalStartHour,
            outputFolder: config.outputFolder
        });
    }

    ensureOutputDirectory() {
        if (!fs.existsSync(config.outputFolder)) {
            fs.mkdirSync(config.outputFolder, { recursive: true });
            logger.info('Created output directory', { path: config.outputFolder });
        }
    }

    generateCronExpression() {
        const hour = config.dataRetrievalStartHour;
        const period = config.dataRetrievalPeriodHours;
        if (period === 24) {
            return `0 ${hour} * * *`;
        } else if (24 % period === 0) {
            return `0 ${hour}-23/${period} * * *`;
        } else {
            const hours = [];
            let currentHour = hour;
            while (currentHour < 24) {
                hours.push(currentHour);
                currentHour += period;
            }
            return `0 ${hours.join(',')} * * *`;
        }
    }

    async performDataRetrieval() {
        if (this.isRunning) {
            logger.warn('Data retrieval already in progress, skipping this cycle');
            return;
        }
        this.isRunning = true;
        const mode = 'daemon';
        const errorList = [];
        let timePeriod = null;
        try {
            logger.info('Starting scheduled data retrieval');
            console.log('\n🔄 Starting scheduled data retrieval...');
            const now = new Date();
            const fromTime = new Date(now.getTime() - (config.dataRetrievalPeriodHours * 60 * 60 * 1000));
            timePeriod = {
                fromEpoch: Math.floor(fromTime.getTime() / 1000),
                toEpoch: Math.floor(now.getTime() / 1000),
                fromTime: fromTime,
                toTime: now,
                description: `Last ${config.dataRetrievalPeriodHours} hours`
            };
            console.log(`⏰ Period: ${timePeriod.description}`);
            console.log(`📅 From: ${timePeriod.fromTime.toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })}`);
            console.log(`📅 To: ${timePeriod.toTime.toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })}`);
            const fileName = this.timeUtils.generateFileName(timePeriod.fromTime, timePeriod.toTime);
            const filePath = path.join(config.outputFolder, fileName);
            this.dataExtractor.csvExporter.setFileName(filePath);
            const timeChunks = this.timeUtils.splitIntoChunks(timePeriod.fromEpoch, timePeriod.toEpoch);
            console.log(`📊 Data will be collected in ${timeChunks.length} chunks (max 2 hours each)`);
            console.log('🔋 Collecting battery data...');
            const reports = await this.dataExtractor.collectBatteryDataByChunk(timeChunks, mode, errorList, timePeriod, this.emailService);
            if (reports && reports.length > 0) {
                console.log(`✅ Data collection completed: ${reports.length} devices processed`);
                console.log('📧 Sending email report...');
                await this.emailService.sendReport(filePath, reports, timePeriod);
                logger.info('Scheduled data retrieval completed successfully', {
                    deviceCount: reports.length,
                    fileName: fileName,
                    timePeriod: timePeriod.description
                });
            } else {
                console.log('⚠️  No data collected for this period');
                logger.warn('No data collected during scheduled retrieval', {
                    timePeriod: timePeriod.description
                });
            }
        } catch (error) {
            console.error('❌ Error during scheduled data retrieval:', error.message);
            logger.error('Scheduled data retrieval failed', { error: error.message, stack: error.stack });
            // Send error summary email if there are errors
            if (errorList.length > 0) {
                await this.emailService.sendErrorSummary(
                    `ZDX Battery Report: Error Summary for ${timePeriod?.description || ''}`,
                    errorList,
                    timePeriod
                );
            }
        } finally {
            this.isRunning = false;
        }
    }

    start(runImmediately = false) {
        const cronExpression = this.generateCronExpression();
        console.log('\n🚀 Starting daemon mode...');
        console.log(`⏰ Schedule: Every ${config.dataRetrievalPeriodHours} hours starting at ${config.dataRetrievalStartHour}:00`);
        console.log(`📁 Output folder: ${config.outputFolder}`);
        console.log(`📧 Email recipients: ${config.emailTo}`);
        console.log(`🔄 Cron expression: ${cronExpression}`);
        if (runImmediately) {
            console.log('🎯 Run immediately option enabled - starting first retrieval now...');
        }
        logger.info('Daemon started', {
            cronExpression,
            retrievalPeriodHours: config.dataRetrievalPeriodHours,
            startHour: config.dataRetrievalStartHour,
            outputFolder: config.outputFolder,
            emailRecipients: config.emailTo,
            runImmediately
        });
        cron.schedule(cronExpression, () => {
            this.performDataRetrieval();
        });
        if (runImmediately) {
            console.log('🚀 Starting immediate test retrieval...');
            setTimeout(() => this.performDataRetrieval(), 5000);
        } else {
            const currentHour = new Date().getHours();
            if (currentHour === config.dataRetrievalStartHour) {
                console.log('🎯 Current time matches start hour, running initial retrieval...');
                setTimeout(() => this.performDataRetrieval(), 5000);
            }
        }
        console.log('✅ Daemon is running. Press Ctrl+C to stop.');
        process.on('SIGINT', () => {
            console.log('\n🛑 Daemon stopping...');
            logger.info('Daemon stopped by user');
            process.exit(0);
        });
    }
}

module.exports = DaemonService;
