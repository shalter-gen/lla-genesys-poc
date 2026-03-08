const axios = require('axios');
const config = require('./config');
const logger = require('./logger');

class AuthManager {
    constructor() {
        this.token = null;
        this.tokenExpiry = null;
        logger.info('AuthManager initialized');
    }

    async getToken() {
        if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry) {
            logger.debug('Using cached token');
            return this.token;
        }

        try {
            logger.debug('Requesting new authentication token with key_id='+config.apiKey);
            const response = await axios.post(`${config.baseUrl}/oauth/token`, {
                key_id: config.apiKey,
                key_secret: config.apiSecret
            });

            this.token = response.data.token;
            // Set expiry 5 minutes before actual expiry for safety
            this.tokenExpiry = Date.now() + (response.data.expires_in - 300) * 1000;
            
            logger.info('Authentication token obtained successfully', {
                expiresIn: response.data.expires_in,
                tokenType: response.data.token_type
            });
            
            return this.token;
        } catch (error) {
            logger.error('Failed to get authentication token', {
                error: error.message,
                status: error.response?.status,
                statusText: error.response?.statusText
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

module.exports = new AuthManager();
