const cron = require('node-cron');
const fs = require('fs');
const config = require('./config');
const logger = require('./logger');
const genesysApi = require('./genesysApiClient');
const azureApi = require('./azureApiClient');
const DataProcessor = require('./dataProcessor');
const EmailService = require('./emailService');
const { log } = require('console');

class DaemonService {
    constructor() {
        this.dataProcessor = new DataProcessor();
        this.emailService = new EmailService();
        this.isRunning = false;
        this.ensureOutputDirectory();
        logger.info('Daemon service initialized', {
            reportScheduleHour: config.reportScheduleHour,
            droppedCallsLookbackHours: config.droppedCallsLookbackHours,
            signInLogsLookbackHours: config.signInLogsLookbackHours,
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
        const hour = config.reportScheduleHour;
        return `0 ${hour} * * *`; // Daily at specified hour
    }

    async performDataRetrieval() {
        if (this.isRunning) {
            logger.warn('Data retrieval already in progress, skipping this cycle');
            return;
        }

        this.isRunning = true;
        const errorList = [];
        let timePeriod = null;

        try {
            logger.info('Starting scheduled dropped calls report generation');
            console.log('\n🔄 Starting scheduled dropped calls report generation...');

            const now = new Date();
            const droppedCallsFromTime = new Date(now.getTime() - (config.droppedCallsLookbackHours * 60 * 60 * 1000));
            const signInLogsFromTime = new Date(now.getTime() - (config.signInLogsLookbackHours * 60 * 60 * 1000));

            timePeriod = {
                fromTime: droppedCallsFromTime,
                toTime: now,
                description: `Last ${config.droppedCallsLookbackHours} hours`
            };

            console.log(`⏰ Dropped Calls Period: ${timePeriod.description}`);
            console.log(`📅 From: ${timePeriod.fromTime.toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })}`);
            console.log(`📅 To: ${timePeriod.toTime.toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })}`);
            console.log(`🔑 Sign-In Logs: Last ${config.signInLogsLookbackHours} hours`);

            // Load static data
            console.log('📋 Loading static data...');
            await this.dataProcessor.loadStaticData();

            // Load queues
            console.log('📋 Loading Genesys queues...');
            const queueMap = await genesysApi.getQueues();

            // Fetch dropped call events
            console.log('📞 Fetching dropped call events...');
            const interval = `${droppedCallsFromTime.toISOString()}/${now.toISOString()}`;
            const events = await genesysApi.getDroppedCallEvents(interval);
            console.log(`   Found ${events.length} dropped call events`);

            // Fetch dropped call from conversations
            console.log('📞 Fetching dropped call from conversations...');
            const conversations = await genesysApi.getAllDroppedCallConversations(interval);
            console.log(`   Found ${conversations.length} dropped call conversations`);

            for (const conversation of conversations) {
                const eventId = { conversation: { id: conversation?.conversationId } };
                events.push(eventId);
            }

            // Process events in batches
            console.log('🔍 Processing dropped calls...');
            const droppedCalls = [];
            const userMap = new Map();

            for (let i = 0; i < events.length; i += 5) {
                const batch = events.slice(i, i + 5);
                const batchPromises = batch.map(async event => {
                    try {
                        const conversationData = await genesysApi.getConversationDetails(event.conversation.id);

                        // Get user details if needed
                        const errorParticipant = conversationData.participants.find(p => p.disconnectType === 'error');
                        if (errorParticipant?.user?.id && !userMap.has(errorParticipant.user.id)) {
                            const userEmail = await genesysApi.getUserDetails(errorParticipant.user.id);
                            userMap.set(errorParticipant.user.id, userEmail);
                        }

                        return await this.dataProcessor.processDroppedCallEvent(event, conversationData, queueMap, userMap);
                    } catch (error) {
                        logger.error(`Error processing event ${event.conversation.id}:`, error);
                        return null;
                    }
                });

                const batchResults = await Promise.all(batchPromises);
                droppedCalls.push(...batchResults.filter(result => result !== null));

                if (i + 5 < events.length) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

                process.stdout.write(`\r   Processed ${Math.min(i + 5, events.length)}/${events.length} events`);
            }
            console.log('\n');

            // Sorting dropped calls by their disconnect time (descending order)
            droppedCalls.sort((a, b) => new Date(b.disconnectTime).getTime() - new Date(a.disconnectTime).getTime());

            // Fetch Azure sign-in logs
            console.log('🔐 Fetching Azure sign-in logs...');
            const signInLogs = await azureApi.getSignInLogs(signInLogsFromTime);
            const signInData = azureApi.parseSignInLogs(signInLogs);
            console.log(`   Found ${signInData.length} sign-in records`);

            // Enrich with device data
            console.log('💻 Enriching with device data...');
            this.dataProcessor.enrichCallsWithDeviceData(droppedCalls, signInData);

            // Generate summary statistics
            console.log('📊 Generating summary statistics...');
            const summaryStats = await this.generateSummaryStats(interval, droppedCalls);

            // Generate CSV report
            console.log('📄 Generating CSV report...');
            const csvPath = await this.generateCSVReport(droppedCalls, timePeriod);

            // Send email report
            console.log('📧 Sending email report...');
            await this.emailService.sendReport(droppedCalls, timePeriod, summaryStats, csvPath);

            logger.info('Scheduled report generation completed successfully', {
                droppedCalls: droppedCalls.length,
                activeDroppedCalls: droppedCalls.filter(c => c.actorType === 'Active in Call').length,
                timePeriod: timePeriod.description
            });

            console.log('✅ Report generation completed successfully!');

        } catch (error) {
            console.error('❌ Error during scheduled report generation:', error.message);
            logger.error('Scheduled report generation failed', { error: error.message, stack: error.stack });

            errorList.push({
                endpoint: 'performDataRetrieval',
                error: error.message + "\n\nStack:\n" + error.stack
            });
            if (errorList.length > 0) {
                await this.emailService.sendErrorSummary(
                    `Dropped Calls Report: Error Summary for ${timePeriod?.description || ''}`,
                    errorList,
                    timePeriod
                );
            }
        } finally {
            this.isRunning = false;
        }
    }

    async generateSummaryStats(interval, droppedCalls) {
        try {
            const externalCalls = droppedCalls.filter(call =>
                call.actorType === 'Active in Call' && call.queueName !== 'No Queue'
            );
            const internalCalls = droppedCalls.filter(call =>
                call.actorType === 'Active in Call' && call.queueName === 'No Queue'
            );
            const monitoringCalls = droppedCalls.filter(call =>
                call.actorType === 'Monitoring Call'
            );

            // Fetch answered calls counts
            const totalAnswered = await this.fetchAnsweredCallsCount(interval, 'all');
            const totalMonitored = await this.fetchAnsweredCallsCount(interval, 'monitored');
            const externalAnswered = await this.fetchAnsweredCallsCount(interval, 'external');
            const internalAnswered = totalAnswered - externalAnswered;

            // Calculate percentages
            const externalPercent = externalAnswered > 0 ? ((externalCalls.length / externalAnswered) * 100).toFixed(2) : '0.00';
            const internalPercent = internalAnswered > 0 ? ((internalCalls.length / internalAnswered) * 100).toFixed(2) : '0.00';
            const monitoringPercent = totalMonitored > 0 ? ((monitoringCalls.length / totalMonitored) * 100).toFixed(2) : '0.00';

            const totalDropped = externalCalls.length + internalCalls.length + monitoringCalls.length;
            const dropsPer1000 = totalAnswered > 0 ? ((totalDropped / totalAnswered) * 1000).toFixed(2) : '0.00';

            return {
                totalAnswered,
                totalMonitored,
                externalAnswered,
                internalAnswered,
                externalDrops: externalCalls.length,
                internalDrops: internalCalls.length,
                monitoringDrops: monitoringCalls.length,
                externalPercent,
                internalPercent,
                monitoringPercent,
                dropsPer1000
            };
        } catch (error) {
            logger.error('Error generating summary stats:', error);
            const externalCalls = droppedCalls.filter(call =>
                call.actorType === 'Active in Call' && call.queueName !== 'No Queue'
            );
            const internalCalls = droppedCalls.filter(call =>
                call.actorType === 'Active in Call' && call.queueName === 'No Queue'
            );
            return {
                totalAnswered: 0,
                totalMonitored: 0,
                externalAnswered: 0,
                internalAnswered: 0,
                externalDrops: externalCalls.length,
                internalDrops: internalCalls.length,
                monitoringDrops: droppedCalls.filter(call => call.actorType === 'Monitoring Call').length,
                externalPercent: '0.00',
                internalPercent: '0.00',
                monitoringPercent: '0.00',
                dropsPer1000: '0.00'
            };
        }
    }

    async generateCSVReport(droppedCalls, timePeriod) {
        try {
            const path = require('path');
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const fileName = `dropped_calls_${timestamp}.csv`;
            const filePath = path.join(config.outputFolder, fileName);

            // Prepare CSV headers
            const headers = [
                'Conversation ID',
                'Queue Name',
                'Recording',
                'Link',
                'User Name',
                'Answer Time',
                'Disconnect Time',
                'Actor Type',
                'Error Info',
                'Device Name',
                'Managed/Unmanaged',
                'IP Address',
                'Model [OS]',
                'Centre',
                'Zscaler'
            ];

            // Build CSV rows
            const rows = droppedCalls.map(call => {
                const displayName = call.userName.includes('@')
                    ? call.userName.split('@')[0]
                    : call.userName;

                return [
                    call.conversationId,
                    call.queueName,
                    call.recording,
                    call.link,
                    displayName,
                    call.answerTimeDisplay,
                    call.disconnectTimeDisplay,
                    call.actorType,
                    `"${call.errorInfo.replace(/"/g, '""')}"`,
                    call.deviceName || '',
                    call.managedStatus || '',
                    call.ipAddress || '',
                    call.os || '',
                    call.centre || '',
                    call.zscaler !== null ? (call.zscaler ? 'true' : 'false') : ''
                ].join(',');
            });

            // Combine headers and rows
            const csvContent = [headers.join(','), ...rows].join('\n');

            // Write to file
            fs.writeFileSync(filePath, csvContent, 'utf8');

            logger.info('CSV report generated', {
                filePath,
                recordCount: droppedCalls.length
            });

            return filePath;
        } catch (error) {
            logger.error('Error generating CSV report:', error);
            throw error;
        }
    }

    // async fetchAnsweredCallsCount_old(interval) {
    async fetchAnsweredCallsCount(interval, purpose = 'all') {
        try {
            const segmentFilters = [
                {
                    type: "or",
                    predicates: [
                        { dimension: "mediaType", value: "voice" }
                    ]
                },
                {
                    type: "or",
                    predicates: [
                        { dimension: "direction", value: "inbound" },
                        { dimension: "direction", value: "outbound" }
                    ]
                }
            ];

            // Add purpose filter based on parameter
            if (purpose === 'external') {
                segmentFilters.push({
                    type: "or",
                    clauses: [
                        {
                            type: "and",
                            predicates: [
                                {
                                    dimension: "purpose",
                                    operator: "matches",
                                    value: "acd"
                                }
                            ]
                        }
                    ]
                });
            }
            if (purpose === 'monitored') {
                segmentFilters.push({
                    type: "or",
                    clauses: [
                        {
                            type: "and",
                            predicates: [
                                {
                                    type: "dimension",
                                    dimension: "monitoredParticipantId",
                                    operator: "exists"
                                }
                            ]
                        }
                    ]
                });
            }


            const data = await genesysApi.makeRequest(
                '/analytics/conversations/details/query',
                {},
                'POST',
                {
                    order: "desc",
                    orderBy: "conversationStart",
                    paging: {
                        pageSize: 1,
                        pageNumber: 1
                    },
                    interval,
                    segmentFilters,
                    conversationFilters: [
                        {
                            type: "or",
                            predicates: [
                                {
                                    metric: "tTalk",
                                    range: {
                                        gt: 0,
                                        lte: 84600000
                                    }
                                }
                            ]
                        }
                    ]
                }
            );

            return data.totalHits || 0;
        } catch (error) {
            logger.error('Error fetching answered calls count:', error);
            return 0;
        }
    }

    start(runImmediately = false) {
        const cronExpression = this.generateCronExpression();
        console.log('\n🚀 Starting daemon mode...');
        console.log(`⏰ Schedule: Daily at ${config.reportScheduleHour}:00`);
        console.log(`📂 Output folder: ${config.outputFolder}`);
        console.log(`📧 Email recipients: ${config.emailTo}`);
        console.log(`📅 Cron expression: ${cronExpression}`);

        if (runImmediately) {
            console.log('🎯 Run immediately option enabled - starting first retrieval now...');
        }

        logger.info('Daemon started', {
            cronExpression,
            reportScheduleHour: config.reportScheduleHour,
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
            if (currentHour === config.reportScheduleHour) {
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