const fs = require('fs');
const config = require('./config');
const logger = require('./logger');

class DataProcessor {
    constructor() {
        this.queueMap = new Map();
        this.userMap = new Map();
        this.centreMap = new Map();
        this.managedDevicesMap = new Map();
        this.zscalerRanges = this.initializeZscalerRanges();
    }

    initializeZscalerRanges() {
        return config.zscalerRanges.map(range => ({
            cidr: range.cidr,
            start: this.ipToInt(range.start),
            end: this.ipToInt(range.end)
        }));
    }

    ipToInt(ip) {
        return ip.split('.').reduce((int, oct) => (int << 8) + parseInt(oct, 10), 0) >>> 0;
    }

    isZscalerIP(ip) {
        if (ip.includes(':')) return false; // Skip IPv6
        
        const ipInt = this.ipToInt(ip);
        return this.zscalerRanges.some(range => ipInt >= range.start && ipInt <= range.end);
    }

    async loadStaticData() {
        try {
            if (fs.existsSync(config.centreMappingFile)) {
                const centreText = fs.readFileSync(config.centreMappingFile, 'utf8');
                this.parseCentreCSV(centreText);
                logger.info('Loaded centre mapping data');
            } else {
                logger.warn('Centre mapping file not found', { path: config.centreMappingFile });
            }
            
            if (fs.existsSync(config.managedDevicesFile)) {
                const devicesText = fs.readFileSync(config.managedDevicesFile, 'utf8');
                this.parseManagedDevicesCSV(devicesText);
                logger.info('Loaded managed devices data');
            } else {
                logger.warn('Managed devices file not found', { path: config.managedDevicesFile });
            }
        } catch (error) {
            logger.error('Error loading static data:', error);
        }
    }

    parseCentreCSV(csvText) {
        const lines = csvText.split('\n');
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const values = this.parseCSVLine(line);
            if (values.length >= 8) {
                const publicIP = values[3];
                const centre = values[7];
                if (publicIP && centre) {
                    this.centreMap.set(publicIP, centre);
                }
            }
        }
        logger.info(`Parsed ${this.centreMap.size} centre mappings`);
    }

    parseManagedDevicesCSV(csvText) {
        const lines = csvText.split('\n');
        const headers = this.parseCSVLine(lines[0]);
        
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const values = this.parseCSVLine(line);
            if (values.length >= headers.length) {
                const deviceId = values[4];
                const deviceName = values[1];
                const os = values[10] + " [" + values[38] + " " + values[5] + "]";
                const ipAddress = values[29];
                
                if (deviceId) {
                    this.managedDevicesMap.set(deviceId, {
                        deviceName: deviceName || 'Unknown',
                        os: os || 'Unknown',
                        ipAddress: ipAddress || 'Unknown',
                        managed: true
                    });
                }
            }
        }
        logger.info(`Parsed ${this.managedDevicesMap.size} managed devices`);
    }

    parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current.trim());
        
        return result;
    }

    formatDateTimeAU(dateString) {
        if (!dateString || dateString === 'N/A') return 'N/A';
        
        const date = new Date(dateString);
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const seconds = date.getSeconds().toString().padStart(2, '0');
        
        return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
    }

    async processDroppedCallEvent(event, conversationData, queueMap, userMap) {
        try {
            const conversationId = event.conversation.id;
            
            const customerParticipant = conversationData.participants.find(p => p.purpose === 'customer');
            const queueId = customerParticipant?.queue?.id;
            const queueName = queueId ? queueMap.get(queueId) || 'Unknown Queue' : 'No Queue';
            
            let hasRecording = false;
            if (queueId && customerParticipant?.direction === 'inbound') {
                const recordingStatus = customerParticipant.attributes?.['Recording Status'];
                hasRecording = recordingStatus !== 'Opt Out';
            }
            
            const errorParticipant = conversationData.participants.find(p => p.disconnectType === 'error');
            
            if (!errorParticipant) {
                return null;
            }
            
            const userId = errorParticipant.user?.id;
            const userName = userId ? (userMap.get(userId) || 'Unknown User') : 'Unknown User';
            
            const actorType = errorParticipant.mediaRoles?.includes('full') ? 'Active in Call' : 
                             errorParticipant.mediaRoles?.includes('monitor') ? 'Monitoring Call' : 
                             'Unknown';
            
            const errorInfo = errorParticipant.errorInfo?.message || 'No error message';
            
            return {
                conversationId,
                queueName,
                recording: hasRecording ? 'true' : 'false',
                link: `https://apps.${config.genesysRegion}/directory/#/analytics/interactions/${conversationId}/admin/timeline?tabId=a0dc12af-86ea-4390-a564-e2bfbd7afdea`,
                userName,
                answerTime: errorParticipant.connectedTime || null,
                disconnectTime: errorParticipant.endTime || null,
                answerTimeDisplay: errorParticipant.connectedTime ? this.formatDateTimeAU(errorParticipant.connectedTime) : 'N/A',
                disconnectTimeDisplay: errorParticipant.endTime ? this.formatDateTimeAU(errorParticipant.endTime) : 'N/A',
                actorType,
                errorInfo,
                userEmail: userName,
                deviceName: null,
                managedStatus: null,
                ipAddress: null,
                os: null,
                centre: null,
                zscaler: null
            };
        } catch (error) {
            logger.error(`Error processing event for conversation ${event.conversation.id}:`, error);
            return null;
        }
    }

    enrichCallsWithDeviceData(droppedCalls, signInData) {
        logger.info('Enriching dropped calls with device data', {
            droppedCalls: droppedCalls.length,
            signInRecords: signInData.length
        });

        droppedCalls.forEach(call => {
            const disconnectTime = new Date(call.disconnectTime);
            
            const matchingSignIn = signInData.find(signIn => 
                signIn.username.toLowerCase() === call.userEmail.toLowerCase() &&
                signIn.date <= disconnectTime
            );
            
            if (matchingSignIn) {
                let deviceInfo = null;
                if (matchingSignIn.deviceId && this.managedDevicesMap.has(matchingSignIn.deviceId)) {
                    deviceInfo = this.managedDevicesMap.get(matchingSignIn.deviceId);
                }
                
                call.deviceName = deviceInfo?.deviceName || 'Unknown';
                call.managedStatus = deviceInfo?.managed ? 'Managed' : (matchingSignIn.managed === 'true' ? 'Managed' : 'Unmanaged');
                call.ipAddress = matchingSignIn.ipAddress || 'Unknown';
                call.os = deviceInfo?.os || matchingSignIn.os || 'Unknown';
                call.centre = this.centreMap.get(matchingSignIn.ipAddress) || 'Not Mapped';
                call.zscaler = this.isZscalerIP(matchingSignIn.ipAddress);
            } else {
                call.deviceName = 'No Sign-In Found';
                call.managedStatus = 'Unknown';
                call.ipAddress = 'Unknown';
                call.os = 'Unknown';
                call.centre = 'Unknown';
                call.zscaler = false;
            }
        });

        logger.info('Device data enrichment complete');
        return droppedCalls;
    }
}

module.exports = DataProcessor;