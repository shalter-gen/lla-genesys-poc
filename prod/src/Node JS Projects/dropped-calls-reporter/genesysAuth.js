const axios = require('axios');
const config = require('./config');
const logger = require('./logger');

class GenesysAuthManager {
    constructor() {
        this.token = null;
        this.tokenExpiry = null;
        logger.info('GenesysAuthManager initialized');
    }

    async getToken() {
        if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry) {
            logger.debug('Using cached Genesys token');
            return this.token;
        }

        try {
            logger.debug('Requesting new Genesys authentication token');
            
            const credentials = Buffer.from(
                `${config.genesysClientId}:${config.genesysClientSecret}`
            ).toString('base64');

            const response = await axios.post(
                `https://login.${config.genesysRegion}/oauth/token`,
                'grant_type=client_credentials',
                {
                    headers: {
                        'Authorization': `Basic ${credentials}`,
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );

            this.token = response.data.access_token;
            // Set expiry 5 minutes before actual expiry for safety
            this.tokenExpiry = Date.now() + (response.data.expires_in - 300) * 1000;
            
            logger.info('Genesys authentication token obtained successfully', {
                expiresIn: response.data.expires_in,
                tokenType: response.data.token_type
            });
            
            return this.token;
        } catch (error) {
            logger.error('Failed to get Genesys authentication token', {
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

module.exports = new GenesysAuthManager();