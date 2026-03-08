const logger = require('./logger');

class DataProcessor {
    constructor() {
        this.devices = new Map();
        this.users = new Map();
        this.deviceBatteryData = new Map(); // Store aggregated battery data per device
        logger.info('DataProcessor initialized');
    }

    updateDevices(devices) {
        devices.forEach(device => {
            this.devices.set(device.id, device);
        });
        logger.debug(`Updated ${devices.length} devices in memory`, { 
            deviceCount: devices.length,
            deviceNames: devices.slice(0, 5).map(d => d.name) // Log first 5 device names
        });
    }

    updateUsers(users) {
        users.forEach(user => {
            this.users.set(user.id, user);
        });
        logger.debug(`Updated ${users.length} users in memory`, { 
            userCount: users.length,
            userNames: users.slice(0, 5).map(u => `${u.name} (${u.email})`) // Log first 5 users
        });
    }

    initializeDeviceBatteryData(deviceId) {
        if (!this.deviceBatteryData.has(deviceId)) {
            const device = this.getDeviceInfo(deviceId);
            const user = device ? this.getUserInfo(device.userid) : null;
            
            this.deviceBatteryData.set(deviceId, {
                allDatapoints: [],
                allCpuDatapoints: [], // Add CPU datapoints for fallback
                chunkCount: 0,
                hasBatteryData: false,
                hasCpuData: false
            });
            
            logger.debug('Initialized battery data tracking for device', {
                deviceId,
                deviceName: device?.name || 'Unknown',
                userId: device?.userid || 'Unknown',
                userName: user?.name || 'Unknown',
                userEmail: user?.email || 'Unknown'
            });
        }
    }

    addBatteryDataChunk(deviceId, healthMetrics, chunkInfo) {
        this.initializeDeviceBatteryData(deviceId);
        
        const device = this.getDeviceInfo(deviceId);
        const user = device ? this.getUserInfo(device.userid) : null;
        const deviceData = this.deviceBatteryData.get(deviceId);
        
        // Try to get battery data first
        const batteryCategory = healthMetrics.find(category => category.category === 'battery');
        
        if (batteryCategory && batteryCategory.instances && batteryCategory.instances[0]) {
            const levelMetric = batteryCategory.instances[0].metrics.find(metric => metric.metric === 'level');
            
            if (levelMetric && levelMetric.datapoints) {
                deviceData.allDatapoints = deviceData.allDatapoints.concat(levelMetric.datapoints);
                deviceData.hasBatteryData = true;
                
                logger.debug(`Added battery datapoints for user device`, {
                    deviceId,
                    deviceName: device?.name || 'Unknown',
                    userName: user?.name || 'Unknown',
                    userEmail: user?.email || 'Unknown',
                    datapointsAdded: levelMetric.datapoints.length,
                    totalDatapoints: deviceData.allDatapoints.length,
                    chunksProcessed: deviceData.chunkCount,
                    chunkInfo
                });
            }
        }
        
        // If no battery data, try to get CPU data for session tracking
        if (!deviceData.hasBatteryData) {
            const cpuCategory = healthMetrics.find(category => category.category === 'cpu');
            
            if (cpuCategory && cpuCategory.instances && cpuCategory.instances[0]) {
                const totalMetric = cpuCategory.instances[0].metrics.find(metric => metric.metric === 'total');
                
                if (totalMetric && totalMetric.datapoints) {
                    deviceData.allCpuDatapoints = deviceData.allCpuDatapoints.concat(totalMetric.datapoints);
                    deviceData.hasCpuData = true;
                    
                    logger.debug(`Added CPU datapoints for session tracking (no battery data)`, {
                        deviceId,
                        deviceName: device?.name || 'Unknown',
                        userName: user?.name || 'Unknown',
                        userEmail: user?.email || 'Unknown',
                        cpuDatapointsAdded: totalMetric.datapoints.length,
                        totalCpuDatapoints: deviceData.allCpuDatapoints.length,
                        chunksProcessed: deviceData.chunkCount,
                        chunkInfo
                    });
                }
            }
        }
        
        deviceData.chunkCount++;
        
        // Log if no data found at all
        if (!deviceData.hasBatteryData && !deviceData.hasCpuData) {
            logger.debug(`No battery or CPU data in chunk for device`, {
                deviceId,
                deviceName: device?.name || 'Unknown',
                userName: user?.name || 'Unknown',
                userEmail: user?.email || 'Unknown',
                chunkInfo
            });
        }
    }

    processBatteryData(deviceId) {
        const device = this.getDeviceInfo(deviceId);
        const user = device ? this.getUserInfo(device.userid) : null;
        const deviceData = this.deviceBatteryData.get(deviceId);
        
        if (!deviceData) {
            logger.debug(`No device data found`, {
                deviceId,
                deviceName: device?.name || 'Unknown',
                userName: user?.name || 'Unknown',
                userEmail: user?.email || 'Unknown'
            });
            return null;
        }

        logger.debug(`Processing device data`, {
            deviceId,
            deviceName: device?.name || 'Unknown',
            userName: user?.name || 'Unknown',
            userEmail: user?.email || 'Unknown',
            hasBatteryData: deviceData.hasBatteryData,
            hasCpuData: deviceData.hasCpuData,
            batteryDatapoints: deviceData.allDatapoints.length,
            cpuDatapoints: deviceData.allCpuDatapoints.length,
            chunksProcessed: deviceData.chunkCount
        });

        // If we have battery data, process it normally
        if (deviceData.hasBatteryData && deviceData.allDatapoints.length > 0) {
            return this.analyzeBatteryDatapoints(deviceData.allDatapoints, device, user, true);
        }
        
        // If no battery data but we have CPU data, extract session info from CPU
        if (deviceData.hasCpuData && deviceData.allCpuDatapoints.length > 0) {
            return this.extractSessionFromCpuData(deviceData.allCpuDatapoints, device, user);
        }
        
        // No usable data at all - return null values
        logger.debug(`No usable data for device - returning null values`, {
            deviceId,
            deviceName: device?.name || 'Unknown',
            userName: user?.name || 'Unknown',
            userEmail: user?.email || 'Unknown'
        });
        
        return {
            pluggedDuration: null,
            unpluggedDuration: null,
            unknownDuration: null,
            pluggedPercentage: null,
            unpluggedPercentage: null,
            totalDuration: null,
            startSession: null,
            endSession: null,
            hasBatteryData: false
        };
    }

    extractSessionFromCpuData(cpuDatapoints, device = null, user = null) {
        const deviceId = device?.id || 'Unknown';
        const deviceName = device?.name || 'Unknown';
        const userName = user?.name || 'Unknown';
        const userEmail = user?.email || 'Unknown';
        
        logger.debug(`Extracting session info from CPU data for user`, {
            deviceId,
            deviceName,
            userName,
            userEmail,
            totalCpuDatapoints: cpuDatapoints.length
        });
        
        if (cpuDatapoints.length === 0) {
            return {
                pluggedDuration: null,
                unpluggedDuration: null,
                unknownDuration: null,
                pluggedPercentage: null,
                unpluggedPercentage: null,
                totalDuration: null,
                startSession: null,
                endSession: null,
                hasBatteryData: false
            };
        }
        
        // Sort CPU datapoints by timestamp
        const sortedPoints = cpuDatapoints.sort((a, b) => a.timestamp - b.timestamp);
        
        // Remove duplicate timestamps
        const uniquePoints = [];
        for (let i = 0; i < sortedPoints.length; i++) {
            if (i === 0 || sortedPoints[i].timestamp !== sortedPoints[i-1].timestamp) {
                uniquePoints.push(sortedPoints[i]);
            }
        }
        
        // Calculate session start and end times from CPU data
        const startSession = uniquePoints.length > 0 ? uniquePoints[0].timestamp : null;
        const endSession = uniquePoints.length > 0 ? uniquePoints[uniquePoints.length - 1].timestamp : null;
        const totalSessionDuration = startSession && endSession ? endSession - startSession : 0;
        
        const result = {
            pluggedDuration: null, // No battery data available - use null instead of 0
            unpluggedDuration: null, // No battery data available - use null instead of 0
            unknownDuration: null, // No battery data available - use null instead of 0
            pluggedPercentage: null, // No battery data available - use null instead of 0
            unpluggedPercentage: null, // No battery data available - use null instead of 0
            totalDuration: totalSessionDuration > 0 ? Math.round(totalSessionDuration / 60) : null,
            startSession: startSession,
            endSession: endSession,
            hasBatteryData: false
        };
        
        logger.info(`Session info extracted from CPU data for user`, {
            deviceId,
            deviceName,
            userName,
            userEmail,
            totalCpuDatapoints: cpuDatapoints.length,
            uniqueCpuDatapoints: uniquePoints.length,
            totalMinutes: result.totalDuration,
            sessionStart: startSession ? new Date(startSession * 1000).toISOString() : null,
            sessionEnd: endSession ? new Date(endSession * 1000).toISOString() : null,
            dataSource: 'CPU_FALLBACK'
        });
        
        return result;
    }

    analyzeBatteryDatapoints(datapoints, device = null, user = null, hasBatteryData = true) {
        const deviceId = device?.id || 'Unknown';
        const deviceName = device?.name || 'Unknown';
        const userName = user?.name || 'Unknown';
        const userEmail = user?.email || 'Unknown';
        
        logger.debug(`Analyzing battery datapoints for user`, {
            deviceId,
            deviceName,
            userName,
            userEmail,
            totalDatapoints: datapoints.length
        });
        
        // Filter out datapoints where value is -1 (user not connected to Zscaler)
        const filteredPoints = datapoints.filter(dp => dp.value !== -1);
        logger.debug(`Filtered disconnected datapoints for user`, {
            deviceId,
            deviceName,
            userName,
            userEmail,
            originalCount: datapoints.length,
            filteredCount: filteredPoints.length,
            excludedCount: datapoints.length - filteredPoints.length
        });
        
        if (filteredPoints.length < 2) {
            logger.debug('Insufficient valid datapoints for user analysis', {
                deviceId,
                deviceName,
                userName,
                userEmail,
                validDatapoints: filteredPoints.length
            });
            return {
                pluggedDuration: 0,
                unpluggedDuration: 0,
                unknownDuration: 0,
                pluggedPercentage: 0,
                unpluggedPercentage: 0,
                totalDuration: 0,
                startSession: null,
                endSession: null,
                hasBatteryData: hasBatteryData
            };
        }

        let pluggedDuration = 0;
        let unpluggedDuration = 0;
        let unknownDuration = 0;
        
        // Sort filtered datapoints by timestamp to handle overlapping chunks
        const sortedPoints = filteredPoints.sort((a, b) => a.timestamp - b.timestamp);
        
        // Remove duplicate timestamps (can happen at chunk boundaries)
        const uniquePoints = [];
        for (let i = 0; i < sortedPoints.length; i++) {
            if (i === 0 || sortedPoints[i].timestamp !== sortedPoints[i-1].timestamp) {
                uniquePoints.push(sortedPoints[i]);
            }
        }
        
        // Calculate session start and end times
        const startSession = uniquePoints.length > 0 ? uniquePoints[0].timestamp : null;
        const endSession = uniquePoints.length > 0 ? uniquePoints[uniquePoints.length - 1].timestamp : null;
        const totalSessionDuration = startSession && endSession ? endSession - startSession : 0;
        
        logger.debug('Processed and deduplicated datapoints for user', {
            deviceId,
            deviceName,
            userName,
            userEmail,
            originalCount: sortedPoints.length,
            uniqueCount: uniquePoints.length,
            startSession: startSession ? new Date(startSession * 1000).toISOString() : null,
            endSession: endSession ? new Date(endSession * 1000).toISOString() : null,
            totalSessionSeconds: totalSessionDuration,
            firstValue: uniquePoints[0]?.value,
            lastValue: uniquePoints[uniquePoints.length - 1]?.value
        });
        
        for (let i = 1; i < uniquePoints.length; i++) {
            const current = uniquePoints[i];
            const previous = uniquePoints[i - 1];
            const duration = current.timestamp - previous.timestamp;
            
            logger.debug(`Battery transition for user ${userName}`, {
                deviceId,
                deviceName,
                userName,
                userEmail,
                datapointIndex: i,
                previousValue: previous.value,
                currentValue: current.value,
                durationSeconds: duration
            });
            
            // Determine the state based on battery level changes
            if (current.value > previous.value) {
                pluggedDuration += duration;
                logger.debug(`User device plugged detected`, {
                    deviceId,
                    deviceName,
                    userName,
                    userEmail,
                    previousLevel: previous.value,
                    currentLevel: current.value,
                    state: 'PLUGGED'
                });
            } else if (current.value < previous.value) {
                unpluggedDuration += duration;
                logger.debug(`User device unplugged detected`, {
                    deviceId,
                    deviceName,
                    userName,
                    userEmail,
                    previousLevel: previous.value,
                    currentLevel: current.value,
                    state: 'UNPLUGGED'
                });
            } else {
                if (current.value === 100) {
                    pluggedDuration += duration;
                    logger.debug(`User device at full charge`, {
                        deviceId,
                        deviceName,
                        userName,
                        userEmail,
                        level: current.value,
                        state: 'PLUGGED (100%)'
                    });
                } else {
                    unknownDuration += duration;
                    logger.debug(`User device state unknown`, {
                        deviceId,
                        deviceName,
                        userName,
                        userEmail,
                        level: current.value,
                        state: 'UNKNOWN'
                    });
                }
            }
        }

        // Calculate percentages excluding unknown duration
        const knownDuration = pluggedDuration + unpluggedDuration;
        const pluggedPercentage = knownDuration > 0 ? (pluggedDuration / knownDuration) * 100 : 0;
        const unpluggedPercentage = knownDuration > 0 ? (unpluggedDuration / knownDuration) * 100 : 0;

        const result = {
            pluggedDuration: Math.round(pluggedDuration / 60), // Convert to minutes
            unpluggedDuration: Math.round(unpluggedDuration / 60), // Convert to minutes
            unknownDuration: Math.round(unknownDuration / 60), // Convert to minutes
            pluggedPercentage: Math.round(pluggedPercentage * 100) / 100,
            unpluggedPercentage: Math.round(unpluggedPercentage * 100) / 100,
            totalDuration: Math.round(totalSessionDuration / 60), // Convert to minutes
            startSession: startSession,
            endSession: endSession,
            hasBatteryData: hasBatteryData
        };

        logger.info(`Battery analysis completed for user`, {
            deviceId,
            deviceName,
            userName,
            userEmail,
            totalDatapoints: datapoints.length,
            validDatapoints: filteredPoints.length,
            uniqueDatapoints: uniquePoints.length,
            excludedDatapoints: datapoints.length - filteredPoints.length,
            pluggedMinutes: result.pluggedDuration,
            unpluggedMinutes: result.unpluggedDuration,
            unknownMinutes: result.unknownDuration,
            totalMinutes: result.totalDuration,
            pluggedPercentage: result.pluggedPercentage,
            unpluggedPercentage: result.unpluggedPercentage,
            sessionStart: startSession ? new Date(startSession * 1000).toISOString() : null,
            sessionEnd: endSession ? new Date(endSession * 1000).toISOString() : null,
            dataSource: 'BATTERY'
        });
        
        return result;
    }

    clearDeviceBatteryData() {
        logger.debug('Clearing all device battery data for new analysis cycle');
        this.deviceBatteryData.clear();
    }

    getDeviceInfo(deviceId) {
        const device = this.devices.get(deviceId);
        if (!device) {
            logger.debug(`Device not found in memory`, { deviceId });
        }
        return device;
    }

    getUserInfo(userId) {
        const user = this.users.get(userId);
        if (!user) {
            logger.debug(`User not found in memory`, { userId });
        }
        return user;
    }
}

module.exports = DataProcessor;
