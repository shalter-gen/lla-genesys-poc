const axios = require('axios');
const config = require('./config');
const logger = require('./logger');

class AzureAuthManager {
    constructor() {
        this.token = null;
        this.tokenExpiry = null;
        logger.info('AzureAuthManager initialized');
    }

    async getToken() {
        if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry) {
            logger.debug('Using cached Azure token');
            return this.token;
        }

        try {
            logger.debug('Requesting new Azure authentication token');
            
            const response = await axios.post(
                `https://login.microsoftonline.com/${config.azureTenantId}/oauth2/v2.0/token`,
                new URLSearchParams({
                    client_id: config.azureClientId,
                    client_secret: config.azureClientSecret,
                    scope: 'https://graph.microsoft.com/.default',
                    grant_type: 'client_credentials'
                }),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );

            this.token = response.data.access_token;
            // Set expiry 5 minutes before actual expiry for safety
            this.tokenExpiry = Date.now() + (response.data.expires_in - 300) * 1000;
            
            logger.info('Azure authentication token obtained successfully', {
                expiresIn: response.data.expires_in,
                tokenType: response.data.token_type
            });
            
            return this.token;
        } catch (error) {
            logger.error('Failed to get Azure authentication token', {
                error: error.message,
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data
            });
            throw error;
        }
    }

    async getAuthHeaders() {
        const token = await this.getToken();
        return {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };
    }
}

module.exports = new AzureAuthManager();