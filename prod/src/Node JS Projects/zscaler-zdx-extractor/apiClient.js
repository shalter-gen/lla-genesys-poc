const axios = require('axios');
const config = require('./config');
const authManager = require('./auth');
const logger = require('./logger');

async function waitAndRetryRequest(requestFunc, maxRetries = config.maxRetries, baseWait = config.baseWaitMs, mode = 'interactive', errorList = [], endpoint = '', timePeriod = null, emailService = null) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const response = await requestFunc();
            if (attempt > 0) {
                logger.info(`Request succeeded after ${attempt + 1} attempts`);
            }
            return response;
        } catch (error) {
            const status = error.response?.status;
            // Retry on 429 and 500
            if (status === 429 || status === 500) {
                let waitTime = baseWait * Math.pow(2, attempt);
                let retryAfter = error.response?.headers?.['retry-after'];
                if (status === 429 && retryAfter) {
                    waitTime = /^\d+$/.test(retryAfter) ? parseInt(retryAfter) * 1000 : waitTime;
                }
                logger.warn(`HTTP ${status} - retrying in ${waitTime} ms (attempt ${attempt + 1}/${maxRetries})`, { endpoint, status, retryAfter });
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
            }
            // For other errors, or if not in daemon, throw
            throw error;
        }
    }
    // Retries exhausted
    const finalError = new Error(`Retries exhausted for endpoint ${endpoint}`);
    logger.error('Retries exhausted', { endpoint, error: finalError.message });
    if (mode === 'daemon' && emailService && errorList.length > 0) {
        await emailService.sendErrorSummary(
            `ZDX Battery Report: Error Summary for ${timePeriod?.description || ''}`,
            errorList,
            timePeriod
        );
    }
    throw finalError;
}

class ApiClient {
    constructor() {
        this.timePeriod = null;
        this.dataProcessor = null; // Will be set to access user info
    }

    setDataProcessor(dataProcessor) {
        this.dataProcessor = dataProcessor;
    }

    setTimePeriod(fromEpoch, toEpoch) {
        this.timePeriod = { from: fromEpoch, to: toEpoch };
        logger.debug('Time period set for API requests', this.timePeriod);
    }

    // async makeRequest(endpoint, params = {}, context = {}) {
    async makeRequest(endpoint, params = {}, context = {}, mode = 'interactive', errorList = [], timePeriod = null, emailService = null) {
        const requestFunc = async () => {
            logger.debug(`Attempting API request`, {
                endpoint,
                params,
                userName: context.userName || 'Unknown',
                userEmail: context.userEmail || 'Unknown',
                deviceName: context.deviceName || 'Unknown'
            });

            const headers = await authManager.getAuthHeaders();

            // Add time parameters if set
            const finalParams = { ...params };
            if (this.timePeriod) {
                finalParams.from = this.timePeriod.from;
                finalParams.to = this.timePeriod.to;
                logger.debug('Added time parameters to request', {
                    endpoint,
                    from: finalParams.from,
                    to: finalParams.to,
                    userName: context.userName || 'Unknown'
                });
            }

            const response = await axios.get(`${config.baseUrl}${endpoint}`, {
                headers,
                params: finalParams,
                timeout: 30000
            });

            logger.debug(`API request successful`, {
                endpoint,
                status: response.status,
                dataSize: JSON.stringify(response.data).length,
                userName: context.userName || 'Unknown',
                userEmail: context.userEmail || 'Unknown',
                deviceName: context.deviceName || 'Unknown'
            });
            return response.data;
        };

        try {
            return await waitAndRetryRequest(requestFunc, config.maxRetries, config.baseWaitMs, mode, errorList, endpoint, timePeriod, emailService);
        } catch (error) {
            // Add to errorList for summary email if in daemon mode
            if (mode === 'daemon' && errorList) {
                errorList.push({
                    endpoint,
                    error: error.message,
                    stack: error.stack
                });
            }
            throw error;
        }
    }

    async getAllPaginatedData(endpoint) {
        let allData = [];
        let offset = '';
        let pageCount = 0;

        do {
            pageCount++;
            const params = offset ? { offset } : {};
            logger.debug(`Fetching paginated data`, {
                endpoint,
                page: pageCount,
                offset,
                timePeriod: this.timePeriod
            });

            if (pageCount > 1) {
                // Small delay between paginated requests to be API-friendly
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            const response = await this.makeRequest(endpoint, params);

            if (response.devices) {
                allData = allData.concat(response.devices);
                logger.debug(`Paginated devices loaded`, {
                    page: pageCount,
                    devicesInPage: response.devices.length,
                    deviceNames: response.devices.slice(0, 3).map(d => d.name)
                });
            } else if (response.users) {
                allData = allData.concat(response.users);
                logger.debug(`Paginated users loaded`, {
                    page: pageCount,
                    usersInPage: response.users.length,
                    userNames: response.users.slice(0, 3).map(u => `${u.name} (${u.email})`)
                });
            }

            offset = response.next_offset || '';
        } while (offset);

        logger.info(`Completed paginated request`, {
            endpoint,
            totalPages: pageCount,
            totalItems: allData.length,
            timePeriod: this.timePeriod
        });

        return allData;
    }

    async getDevices() {
        return await this.getAllPaginatedData('/devices');
    }

    async getUsers() {
        return await this.getAllPaginatedData('/users');
    }

    async getDeviceHealthMetrics(deviceId) {
        // Get device and user context for logging
        let context = {};
        if (this.dataProcessor) {
            const device = this.dataProcessor.getDeviceInfo(deviceId);
            const user = device ? this.dataProcessor.getUserInfo(device.userid) : null;
            context = {
                deviceName: device?.name || 'Unknown',
                userName: user?.name || 'Unknown',
                userEmail: user?.email || 'Unknown'
            };
        }

        const metrics = await this.makeRequest(`/devices/${deviceId}/health-metrics`, {}, context);

        logger.debug(`Retrieved health metrics for user device`, {
            deviceId,
            deviceName: context.deviceName || 'Unknown',
            userName: context.userName || 'Unknown',
            userEmail: context.userEmail || 'Unknown',
            categoriesCount: metrics.length,
            categories: metrics.map(m => m.category),
            timePeriod: this.timePeriod
        });

        return metrics;
    }
}

module.exports = new ApiClient();
