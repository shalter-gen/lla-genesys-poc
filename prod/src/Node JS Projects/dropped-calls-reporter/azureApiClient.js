const axios = require('axios');
const config = require('./config');
const azureAuth = require('./azureAuth');
const logger = require('./logger');

async function waitAndRetryRequest(requestFunc, maxRetries = config.maxRetries, baseWait = config.baseWaitMs) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const response = await requestFunc();
            if (attempt > 0) {
                logger.info(`Request succeeded after ${attempt + 1} attempts`);
            }
            return response;
        } catch (error) {
            const status = error.response?.status;
            if (status === 429 || status === 500) {
                let waitTime = baseWait * Math.pow(2, attempt);
                let retryAfter = error.response?.headers?.['retry-after'];
                if (status === 429 && retryAfter) {
                    waitTime = /^\d+$/.test(retryAfter) ? parseInt(retryAfter) * 1000 : waitTime;
                }
                logger.warn(`HTTP ${status} - retrying in ${waitTime} ms (attempt ${attempt + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
            }
            throw error;
        }
    }
    throw new Error('Retries exhausted');
}

class AzureApiClient {
    constructor() {
        this.baseUrl = 'https://graph.microsoft.com/v1.0';
    }

    async makeRequest(endpoint, params = {}, isFullUrl = false) {
        const requestFunc = async () => {
            const url = isFullUrl ? endpoint : `${this.baseUrl}${endpoint}`;
            logger.debug(`Making Azure API request`, { endpoint: url, params });
            const headers = await azureAuth.getAuthHeaders();
            
            const response = await axios.get(url, {
                headers,
                params: isFullUrl ? {} : params, // Don't add params if using full URL
                timeout: 30000
            });

            logger.debug(`Azure API request successful`, {
                endpoint: url,
                status: response.status
            });
            return response.data;
        };

        return await waitAndRetryRequest(requestFunc);
    }

    async getSignInLogs(startDate) {
        const allSignIns = [];
        let nextLink = null;
        
        // Format date for Azure API (ISO 8601)
        const filterDate = startDate.toISOString();
        
        logger.info('Fetching Azure sign-in logs', { 
            startDate: filterDate,
            appId: config.azureGenesysAppId 
        });

        const filter = `appId eq '${config.azureGenesysAppId}' and createdDateTime ge ${filterDate} and status/errorCode eq 0`;
        
        do {
            let data;
            
            if (nextLink) {
                // Use the full nextLink URL directly
                data = await this.makeRequest(nextLink, {}, true);
            } else {
                // First request with filter
                data = await this.makeRequest('/auditLogs/signIns', {
                    $filter: filter,
                    $top: 999
                });
            }
            
            if (data.value && data.value.length > 0) {
                allSignIns.push(...data.value);
                logger.debug(`Fetched ${data.value.length} sign-in records (total: ${allSignIns.length})`);
            }

            nextLink = data['@odata.nextLink'] || null;
            
            if (nextLink) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } while (nextLink);

        logger.info(`Fetched ${allSignIns.length} total sign-in logs`);
        return allSignIns;
    }

    parseSignInLogs(signInLogs) {
        const parsedData = signInLogs.map(signIn => {
            const date = new Date(signIn.createdDateTime);
            const username = signIn.userPrincipalName || 'Unknown';
            const ipAddress = signIn.ipAddress || 'Unknown';
            const deviceId = signIn.deviceDetail?.deviceId || '';
            const os = signIn.deviceDetail?.operatingSystem || 'Unknown';
            const managed = signIn.deviceDetail?.isManaged ? 'true' : 'false';

            return {
                date,
                username,
                ipAddress,
                deviceId,
                os,
                managed
            };
        });

        // Sort by date descending for faster lookup
        parsedData.sort((a, b) => b.date - a.date);

        logger.info(`Parsed ${parsedData.length} sign-in records`);
        return parsedData;
    }
}

module.exports = new AzureApiClient();