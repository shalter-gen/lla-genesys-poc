const axios = require('axios');
const config = require('./config');
const genesysAuth = require('./genesysAuth');
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

class GenesysApiClient {
    constructor() {
        this.baseUrl = `https://api.${config.genesysRegion}/api/v2`;
    }

    async makeRequest(endpoint, params = {}, method = 'GET', data = null) {
        const requestFunc = async () => {
            logger.debug(`Making Genesys API request`, { endpoint, method, params, data });
            const headers = await genesysAuth.getAuthHeaders();
            
            const config = {
                method,
                url: `${this.baseUrl}${endpoint}`,
                headers,
                timeout: 30000
            };

            if (method === 'GET') {
                config.params = params;
            } else if (method === 'POST') {
                config.data = data || params;
                if (Object.keys(params).length > 0 && data) {
                    config.params = params;
                }
            }

            const response = await axios(config);

            logger.debug(`Genesys API request successful`, {
                endpoint,
                method,
                status: response.status
            });
            return response.data;
        };

        return await waitAndRetryRequest(requestFunc);
    }

    async getQueues() {
        const queues = new Map();
        let pageNumber = 1;
        let hasMore = true;

        logger.info('Loading Genesys queues');

        while (hasMore) {
            const data = await this.makeRequest('/routing/queues', {
                pageSize: 100,
                pageNumber
            });
            
            data.entities.forEach(queue => {
                queues.set(queue.id, queue.name);
            });

            hasMore = data.entities.length === 100;
            pageNumber++;
            
            if (hasMore) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        logger.info(`Loaded ${queues.size} queues`);
        return queues;
    }

    async getUserDetails(userId) {
        try {
            const data = await this.makeRequest(`/users/${userId}`);
            return data.email || 'Unknown';
        } catch (error) {
            logger.error(`Error fetching user ${userId}:`, error);
            return 'Unknown';
        }
    }

    async getDroppedCallEvents(interval) {
        const allEvents = [];
        let currentInterval = interval;
        let hasMore = true;

        logger.info('Fetching dropped call events', { interval });

        while (hasMore) {
            const data = await this.makeRequest(
                '/usage/events/query',
                { pageSize: 200 },
                'POST',
                {
                    interval: currentInterval,
                    eventDefinitionIds: [
                        'TELEPHONY-0010',
                        'TELEPHONY-0012'
                    ],
                    sortOrder: 'DESC'
                }
            );

            allEvents.push(...data.entities);

            if (data.entities.length === 200) {
                const oldestEvent = data.entities[data.entities.length - 1];
                const oldestDate = new Date(oldestEvent.dateCreated);
                const intervalStart = interval.split('/')[0];
                
                const newEndDate = new Date(oldestDate.getTime() - 1);
                currentInterval = `${intervalStart}/${newEndDate.toISOString()}`;
                
                if (new Date(intervalStart) >= newEndDate) {
                    hasMore = false;
                }
            } else {
                hasMore = false;
            }

            if (hasMore) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        logger.info(`Fetched ${allEvents.length} dropped call events`);
        return allEvents;
    }

    async getConversationDetails(conversationId) {
        try {
            return await this.makeRequest(`/conversations/calls/${conversationId}`);
        } catch (error) {
            logger.error(`Error fetching conversation ${conversationId}:`, error);
            throw error;
        }
    }

    async getAllDroppedCallConversations(interval) {
        let allConversations = [];
        let pageNumber = 1;
        let hasMore = true;
        
        logger.info('Fetching dropped call conversations', { interval });
        
        while (hasMore) {
            const data = await this.makeRequest(
                '/analytics/conversations/details/query',
                {},
                'POST',
                {
                    order: "desc",
                    orderBy: "conversationStart",
                    paging: {
                        pageSize: 50,
                        pageNumber: pageNumber
                    },
                    interval: interval,
                    segmentFilters: [
                        {
                            type: "or",
                            predicates: [
                                {
                                    dimension: "mediaType",
                                    value: "voice"
                                }
                            ]
                        },
                        {
                            type: "or",
                            predicates: [
                                {
                                    dimension: "direction",
                                    value: "inbound"
                                },
                                {
                                    dimension: "direction",
                                    value: "outbound"
                                }
                            ]
                        },
                        {
                            type: "or",
                            predicates: [
                                {
                                    dimension: "errorCode",
                                    value: "error.ininedgecontrol.connection.webrtc.endpoint.mediaRecovery"
                                }
                            ]
                        }
                    ],
                    conversationFilters: [
                        {
                            type: "and",
                            predicates: [
                                {
                                    type: "metric",
                                    metric: "tAnswered",
                                    operator: "exists"
                                }
                            ]
                        },
                        {
                            type: "and",
                            predicates: [
                                {
                                    metric: "nError",
                                    range: {
                                        gt: 0
                                    }
                                }
                            ]
                        }
                    ],
                    evaluationFilters: [],
                    surveyFilters: []
                }
            );

            // allConversations = allConversations.concat(data.conversations);
            if (data?.conversations?.length > 0) {
                allConversations = allConversations.concat(data?.conversations);
            }
                      
            hasMore = data?.conversations?.length === 50;
            pageNumber++;
            
            if (hasMore) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        
        logger.info(`Fetched ${allConversations.length} dropped call conversations`);
        return allConversations;
    }
}

module.exports = new GenesysApiClient();