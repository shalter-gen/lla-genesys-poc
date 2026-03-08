const config = require('./config');
const DaemonService = require('./daemonService');
const logger = require('./logger');

class DroppedCallsReporter {
    constructor() {
        logger.info('Dropped Calls Reporter initialized');
    }

    async run() {
        try {
            const isDaemonMode = process.argv.includes('--daemon');
            const runImmediately = process.argv.includes('--run-now');
            
            if (isDaemonMode) {
                const daemonService = new DaemonService();
                daemonService.start(runImmediately);
                return;
            }

            // If not in daemon mode, show usage instructions
            console.log('\n📋 Dropped Calls Reporter');
            console.log('========================\n');
            console.log('Usage:');
            console.log('  npm run daemon         - Start daemon mode (scheduled daily reports)');
            console.log('  npm run daemon-test    - Test daemon with immediate execution');
            console.log('\nDaemon will run daily at ' + config.reportScheduleHour + ':00 and generate dropped calls reports.');
            console.log('\nTo exit this message, press Ctrl+C');
            
            logger.info('Application started in info mode');
            
        } catch (error) {
            console.error('\n❌ Error during execution:', error.message);
            logger.error('Application error', { error: error.message, stack: error.stack });
            process.exit(1);
        }
    }
}

const reporter = new DroppedCallsReporter();
reporter.run().catch(error => {
    console.error('\n💥 Fatal error:', error.message);
    logger.error('Fatal application error', { error: error.message, stack: error.stack });
    process.exit(1);
});