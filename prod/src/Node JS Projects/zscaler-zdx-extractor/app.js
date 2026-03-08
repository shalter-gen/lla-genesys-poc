const config = require('./config');
const apiClient = require('./apiClient');
const DataProcessor = require('./dataProcessor');
const CsvExporter = require('./csvExporter');
const UserInterface = require('./userInterface');
const TimeUtils = require('./timeUtils');
const DaemonService = require('./daemonService');
const logger = require('./logger');

class ZscalerDataExtractor {
    constructor() {
        this.dataProcessor = new DataProcessor();
        this.csvExporter = new CsvExporter();
        this.userInterface = new UserInterface();
        this.timeUtils = new TimeUtils();
        this.allEncounteredDevices = new Set();
        apiClient.setDataProcessor(this.dataProcessor);
    }

    async run() {
        try {
            const isDaemonMode = process.argv.includes('--daemon');
            const runImmediately = process.argv.includes('--run-now');
            if (isDaemonMode) {
                const daemonService = new DaemonService(this);
                daemonService.start(runImmediately);
                return;
            }

            // INTERACTIVE MODE
            const mode = 'interactive';
            const errorList = [];
            console.log('\n🚀 Starting Zscaler ZDX Data Extractor...');
            logger.info('Application started by user');

            const choice = await this.userInterface.showMenu();
            if (choice === '5') {
                console.log('\n👋 Goodbye!');
                logger.info('Application terminated by user choice');
                this.userInterface.close();
                return;
            }

            let timePeriod;
            if (choice === '4') {
                const specificDate = await this.userInterface.getSpecificDate();
                timePeriod = this.timeUtils.getTimePeriod(choice, specificDate);
                logger.info('User selected specific date', { selectedDate: specificDate, timePeriod: timePeriod.description });
            } else {
                timePeriod = this.timeUtils.getTimePeriod(choice);
                logger.info('User selected time period', { choice, timePeriod: timePeriod.description });
            }

            console.log(`\n⏰ Selected period: ${timePeriod.description}`);
            console.log(`📅 From: ${timePeriod.fromTime.toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })}`);
            console.log(`📅 To: ${timePeriod.toTime.toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })}`);
            const timeChunks = this.timeUtils.splitIntoChunks(timePeriod.fromEpoch, timePeriod.toEpoch);
            console.log(`📊 Data will be collected in ${timeChunks.length} chunks (max 2 hours each)`);

            try {
                const fileName = this.timeUtils.generateFileName(timePeriod.fromTime, timePeriod.toTime);
                logger.debug('Setting CSV filename for user report', { fileName });
                this.csvExporter.setFileName(fileName);
                console.log(`📁 Output file: ${fileName}`);
            } catch (error) {
                logger.error('Failed to set filename for user report', { error: error.message });
                throw new Error(`Failed to configure output file: ${error.message}`);
            }

            console.log('\n🔋 Collecting battery data chunk by chunk...');
            await this.collectBatteryDataByChunk(timeChunks, mode, errorList, timePeriod, null);

            console.log('\n✨ Data extraction completed successfully!');
            logger.info('Data extraction completed successfully for user');
        } catch (error) {
            console.error('\n❌ Error during execution:', error.message);
            logger.error('Application error during user session', { error: error.message, stack: error.stack });
            process.exit(1);
        } finally {
            if (!process.argv.includes('--daemon')) {
                this.userInterface.close();
            }
        }
    }

    async collectBatteryDataByChunk(timeChunks, mode = 'interactive', errorList = [], timePeriod = null, emailService = null) {
        this.dataProcessor.clearDeviceBatteryData();
        this.allEncounteredDevices.clear();
        console.log(`   🔍 Processing ${timeChunks.length} time chunks...`);
        logger.info('Starting chunk-by-chunk battery data collection', { chunkCount: timeChunks.length });

        for (let chunkIndex = 0; chunkIndex < timeChunks.length; chunkIndex++) {
            const chunk = timeChunks[chunkIndex];
            console.log(`\n   📅 Chunk ${chunkIndex + 1}/${timeChunks.length}: ${chunk.fromTime.toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })} to ${chunk.toTime.toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })}`);
            apiClient.setTimePeriod(chunk.from, chunk.to);
            logger.info('Processing chunk', { chunkIndex: chunkIndex + 1, totalChunks: timeChunks.length, from: chunk.fromTime.toISOString(), to: chunk.toTime.toISOString() });

            try {
                console.log(`      🔄 Loading devices and users for this chunk...`);
                const [chunkDevices, chunkUsers] = await Promise.all([
                    apiClient.getDevices(mode, errorList, timePeriod, emailService),
                    apiClient.getUsers(mode, errorList, timePeriod, emailService)
                ]);
                this.dataProcessor.updateDevices(chunkDevices);
                this.dataProcessor.updateUsers(chunkUsers);

                console.log(`      📱 Found ${chunkDevices.length} devices in this chunk`);
                console.log(`      👥 Found ${chunkUsers.length} users in this chunk`);
                logger.info('Chunk devices and users loaded', {
                    chunkIndex: chunkIndex + 1,
                    devicesInChunk: chunkDevices.length,
                    usersInChunk: chunkUsers.length,
                    sampleDevices: chunkDevices.slice(0, 3).map(d => d.name),
                    sampleUsers: chunkUsers.slice(0, 3).map(u => `${u.name} (${u.email})`)
                });

                chunkDevices.forEach(device => {
                    this.allEncounteredDevices.add(device.id);
                });

                for (let deviceIndex = 0; deviceIndex < chunkDevices.length; deviceIndex++) {
                    const device = chunkDevices[deviceIndex];
                    const user = this.dataProcessor.getUserInfo(device.userid);
                    try {
                        process.stdout.write(`\r      📊 Device ${deviceIndex + 1}/${chunkDevices.length}: ${device.name.substring(0, 30)}...`);
                        logger.debug('Processing device battery data for user in chunk', {
                            deviceId: device.id,
                            deviceName: device.name,
                            userName: user?.name || 'Unknown',
                            userEmail: user?.email || 'Unknown',
                            chunkIndex: chunkIndex + 1,
                            deviceIndex: deviceIndex + 1,
                            totalDevicesInChunk: chunkDevices.length
                        });
                        const healthMetrics = await apiClient.getDeviceHealthMetrics(device.id, mode, errorList, timePeriod, emailService);
                        this.dataProcessor.addBatteryDataChunk(device.id, healthMetrics, {
                            chunkIndex: chunkIndex + 1,
                            totalChunks: timeChunks.length,
                            from: chunk.fromTime.toISOString(),
                            to: chunk.toTime.toISOString(),
                            devicesInChunk: chunkDevices.length
                        });
                        await new Promise(resolve => setTimeout(resolve, 50));
                    } catch (error) {
                        logger.error(`Failed to process device for user in chunk`, {
                            deviceId: device.id,
                            deviceName: device.name,
                            userName: user?.name || 'Unknown',
                            userEmail: user?.email || 'Unknown',
                            chunkIndex: chunkIndex + 1,
                            error: error.message
                        });
                        if (mode === 'interactive' && error.response && error.response.status === 500) {
                            throw error; // abort further processing on 500 in interactive mode
                        }
                    }
                }
                console.log(`\n      ✅ Completed chunk ${chunkIndex + 1}/${timeChunks.length} - processed ${chunkDevices.length} devices`);
            } catch (error) {
                logger.error('Failed to process chunk', { chunkIndex: chunkIndex + 1, error: error.message });
                console.log(`\n      ❌ Failed to process chunk ${chunkIndex + 1}/${timeChunks.length}: ${error.message}`);
                if (mode === 'interactive' && error.response && error.response.status === 500) {
                    throw error; // abort further processing on 500 in interactive mode
                }
            }
        }

        // Process aggregated data
        console.log('\n   🔄 Analyzing aggregated battery data...');
        logger.info('Starting aggregated battery analysis for all encountered devices');
        const allEncounteredDeviceIds = Array.from(this.allEncounteredDevices);
        const batteryReports = [];
        console.log(`   📈 Analyzing ${allEncounteredDeviceIds.length} devices (including those without battery data)...`);
        for (let i = 0; i < allEncounteredDeviceIds.length; i++) {
            const deviceId = allEncounteredDeviceIds[i];
            const device = this.dataProcessor.getDeviceInfo(deviceId);
            const user = device ? this.dataProcessor.getUserInfo(device.userid) : null;
            process.stdout.write(`\r   📈 Analyzing device ${i + 1}/${allEncounteredDeviceIds.length}: ${device?.name?.substring(0, 30) || 'Unknown'}...`);
            logger.debug('Analyzing device for CSV inclusion', {
                deviceId,
                deviceName: device?.name || 'Unknown',
                userName: user?.name || 'Unknown',
                userEmail: user?.email || 'Unknown',
                deviceIndex: i + 1,
                totalDevices: allEncounteredDeviceIds.length
            });
            const batteryAnalysis = this.dataProcessor.processBatteryData(deviceId);
            const report = {
                userId: device?.userid || 'Unknown',
                deviceId: deviceId,
                userEmail: user?.email || 'Unknown',
                userName: user?.name || 'Unknown',
                deviceName: device?.name || 'Unknown',
                totalDuration: batteryAnalysis?.totalDuration || null,
                startSession: batteryAnalysis?.startSession || null,
                endSession: batteryAnalysis?.endSession || null,
                hasBatteryData: batteryAnalysis?.hasBatteryData || false,
                pluggedDuration: batteryAnalysis?.pluggedDuration || null,
                unpluggedDuration: batteryAnalysis?.unpluggedDuration || null,
                unknownDuration: batteryAnalysis?.unknownDuration || null,
                pluggedPercentage: batteryAnalysis?.pluggedPercentage || null,
                unpluggedPercentage: batteryAnalysis?.unpluggedPercentage || null
            };
            batteryReports.push(report);
        }
        console.log(`\n   ✅ Analysis completed for ${allEncounteredDeviceIds.length} devices`);
        if (batteryReports.length > 0) {
            await this.csvExporter.exportData(batteryReports);
            return batteryReports;
        } else {
            console.log('   ⚠️  No devices found for the selected period');
            return [];
        }
    }
}

const extractor = new ZscalerDataExtractor();
extractor.run().catch(error => {
    console.error('\n💥 Fatal error:', error.message);
    logger.error('Fatal application error during user session', { error: error.message, stack: error.stack });
    process.exit(1);
});
