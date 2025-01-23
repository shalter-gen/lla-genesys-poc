const SDB_QUEUE_ID = 'def93dca-5565-4ed0-a332-8d9ce0143334'; // LLA_ServiceDemandBot PROD
const DIGITAL_QUEUE_ID = 'cd98077a-aaaf-446e-9983-ced2bedc4aaf'; // LLA_Digital PROD
const SURVEY_QUEUE_ID = '6a5d601d-adbc-4200-bba9-e7ce228bea88'; // LLA_Survey PROD

const MAX_PAGE_RELOADS_FOR_TOKEN = 5;
const TOKEN_RELOAD_DELAY = 2000; // 2 seconds in milliseconds

async function initializeWithStoredToken() {
    token = await getToken();
    if (token) {
        fetchFrequentUsers(token);
        // hideLoading();
    } else {
        console.error('No valid stored token found');
    }
}

// Throttling helper function
async function throttleRequests(requests, maxRequestsPerSecond = 10) {
    const results = [];
    const batchSize = maxRequestsPerSecond;

    for (let i = 0; i < requests.length; i += batchSize) {
        const batch = requests.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map(req => req()));
        results.push(...batchResults);

        if (i + batchSize < requests.length) {
            // Wait 1 second before next batch
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    return results;
}

async function fetchFrequentUsers(token) {
    console.log('Fetching frequent users...');
    const startTime = Date.now(); // Get the current time in milliseconds
    // const now = new Date();
    // const startPeriod = new Date(now.getTime() - (3 * 24 * 60 * 60 * 1000));  // 3 days
    // const startPeriod = new Date(now.getTime() - (3 * 60 * 60 * 1000));  // 3 hours


    const timeframe = document.getElementById('timeframe').value;
    const endDate = new Date();
    let startDate;

    switch (timeframe) {
        case '3hours':
            startDate = new Date(endDate.getTime() - 3 * 60 * 60 * 1000);
            break;
        case '6hours':
            startDate = new Date(endDate.getTime() - 6 * 60 * 60 * 1000);
            break;
        case '12hours':
            startDate = new Date(endDate.getTime() - 12 * 60 * 60 * 1000);
            break;
        case '24hours':
            startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
            break;
        case '48hours':
            startDate = new Date(endDate.getTime() - 48 * 60 * 60 * 1000);
            break;
        case '72hours':
            startDate = new Date(endDate.getTime() - 72 * 60 * 60 * 1000);
            break;
        case '7days':
            startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
        case '30days':
            startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
    }

    const interval = `${startDate.toISOString()}/${endDate.toISOString()}`;
    const userMap = new Map();

    const body = {
        order: "desc",
        orderBy: "conversationStart",
        paging: { pageSize: 100, pageNumber: 1 },
        interval: interval,
        segmentFilters: [
            {
                type: "or",
                predicates: [{ dimension: "mediaType", value: "message" }]
            },
            {
                type: "or",
                predicates: [
                    { type: "dimension", dimension: "messageType", value: "webmessaging" }
                ]
            }
        ],
        conversationFilters: [],
        evaluationFilters: [],
        surveyFilters: []
    };

    async function fetchPage(pageNumber) {
        console.log(`Fetching page ${pageNumber}...`);
        const pageBody = { ...body, paging: { pageSize: 100, pageNumber: pageNumber } };
        const makeRequest = () => fetch('https://api.mypurecloud.com.au/api/v2/analytics/conversations/details/query?pageSize=100', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(pageBody)
        });
        return await handleApiRequest(makeRequest);
    }

    async function fetchAllJourneyPages(contactId, token) {
        let allEntities = [];
        let nextUri = `/api/v2/externalcontacts/contacts/${contactId}/journey/sessions?pageSize=200`;

        while (nextUri) {
            console.log(`Fetching journey page for contact ${contactId}: ${nextUri}`);
            const makeJourneyRequest = () => fetch(`https://api.mypurecloud.com.au${nextUri}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            const journeyData = await handleApiRequest(makeJourneyRequest);
            allEntities = allEntities.concat(journeyData.entities);
            nextUri = journeyData.nextUri;
        }

        return allEntities;
    }

    try {
        // /*
        let currentPage = 1;
        let totalHits = 0;
        const pageRequests = [];

        // First request to get total hits
        const firstPageData = await fetchPage(1);
        totalHits = firstPageData.totalHits;

        console.log(`Total hits: ${totalHits}`);

        // Process first page
        firstPageData.conversations.forEach(conv => {
            const customer = conv.participants.find(p => p.purpose === 'customer');
            if (customer?.externalContactId) {
                if (!userMap.has(customer.externalContactId)) {
                    userMap.set(customer.externalContactId, []);
                }
                userMap.get(customer.externalContactId).push(conv.conversationId);
            }
        });

        console.log(`First page processed: ${firstPageData.conversations.length} conversations`);

        // Prepare remaining page requests
        const totalPages = Math.ceil(totalHits / 100);
        for (let page = 2; page <= totalPages; page++) {
            pageRequests.push(() => fetchPage(page));
        }

        console.log(`Total pages: ${totalPages}`);

        // Execute page requests with throttling (10 per second)
        const pagesData = await throttleRequests(pageRequests, 10);

        console.log(`Page requests finished: ${pagesData.length} pages`);

        // Process remaining pages
        pagesData.forEach(data => {
            data.conversations.forEach(conv => {
                const customer = conv.participants.find(p => p.purpose === 'customer');
                if (customer?.externalContactId) {
                    if (!userMap.has(customer.externalContactId)) {
                        userMap.set(customer.externalContactId, []);
                    }
                    userMap.get(customer.externalContactId).push(conv.conversationId);
                }
            });
        });

        console.log(`Remaining pages processed: ${pagesData.length} pages, ${pagesData.reduce((acc, data) => acc + data.conversations.length, 0)} conversations`);
// */
        // const extId = "f704fe6d-d191-4a58-abb8-14abfb757791";
        // const convId = "60156076-3912-4120-b7cd-1bfddae7bff3";
        // userMap.set(extId, []);
        // userMap.get(extId).push(convId);


        // // Fetch journey data for each user
        // const journeyRequests = Array.from(userMap.entries()).map(([contactId, conversationIds]) => {
        //     return async () => {
        //         console.log(`Fetching journey data for contact ${contactId}...`);
        //         const entities = await fetchAllJourneyPages(contactId, token);
        //         return processUserJourneyData(contactId, entities, conversationIds);
        //     };
        // });

        // Fetch journey data for each user with 20 or more conversations
        const journeyRequests = Array.from(userMap.entries())
        // .filter(([_, conversationIds]) => conversationIds.length >= 20)
        .map(([contactId, conversationIds]) => {
            return async () => {
                console.log(`Fetching journey data for contact ${contactId}...`);
                const entities = await fetchAllJourneyPages(contactId, token);
                if (entities.filter(entity => entity.type === 'conversation').length >= 20) {
                    return processUserJourneyData(contactId, entities, conversationIds);
                }
                return null; // Return null for users with less than 20 conversations
            };
        });
        console.log(`Journey requests prepared: ${journeyRequests.length} users`);

        // Execute journey requests with throttling
        // const userData = await throttleRequests(journeyRequests, 10);
        const userData = (await throttleRequests(journeyRequests, 10)).filter(data => data !== null);

        console.log(`Journey requests finished: ${userData.length} users`);
        const endTime = Date.now(); // Get the current time in milliseconds
        const totalTimeTaken = (endTime - startTime) / 1000; // Calculate the total time taken in seconds
        console.log(`Total time taken: ${totalTimeTaken.toFixed(2)} seconds`); // Display the total time taken
    
        displayUserData(userData);
    } catch (error) {
        console.error('Error fetching user data:', error);
    }
}

async function fetchFrequentUsers_old(token) {
    console.log('Fetching frequent users...');
    const now = new Date();
    const threeHoursAgo = new Date(now.getTime() - (28 * 24 * 60 * 60 * 1000));
    const interval = `${threeHoursAgo.toISOString()}/${now.toISOString()}`;
    const userMap = new Map();

    const body = {
        order: "desc",
        orderBy: "conversationStart",
        paging: { pageSize: 100, pageNumber: 1 },
        interval: interval,
        segmentFilters: [
            {
                type: "or",
                predicates: [{ dimension: "mediaType", value: "message" }]
            },
            {
                type: "or",
                predicates: [
                    { type: "dimension", dimension: "messageType", value: "webmessaging" }
                ]
            }
        ],
        conversationFilters: [],
        evaluationFilters: [],
        surveyFilters: []
    };

    async function fetchPage(pageNumber) {
        console.log(`Fetching page ${pageNumber}...`);
        const pageBody = { ...body, paging: { pageSize: 100, pageNumber: pageNumber } };
        const makeRequest = () => fetch('https://api.mypurecloud.com.au/api/v2/analytics/conversations/details/query?pageSize=100', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(pageBody)
        });
        return await handleApiRequest(makeRequest);
    }

    try {
        let currentPage = 1;
        let totalHits = 0;
        const pageRequests = [];

        // First request to get total hits
        const firstPageData = await fetchPage(1);
        totalHits = firstPageData.totalHits;

        console.log(`Total hits: ${totalHits}`);

        // Process first page
        firstPageData.conversations.forEach(conv => {
            const customer = conv.participants.find(p => p.purpose === 'customer');
            if (customer?.externalContactId) {
                if (!userMap.has(customer.externalContactId)) {
                    userMap.set(customer.externalContactId, []);
                }
                userMap.get(customer.externalContactId).push(conv.conversationId);
            }
        });

        console.log(`First page processed: ${firstPageData.conversations.length} conversations`);

        // Prepare remaining page requests
        const totalPages = Math.ceil(totalHits / 100);
        for (let page = 2; page <= totalPages; page++) {
            pageRequests.push(() => fetchPage(page));
        }

        console.log(`Total pages: ${totalPages}`);

        // Execute page requests with throttling (10 per second)
        const pagesData = await throttleRequests(pageRequests, 10);

        console.log(`Page requests finished: ${pagesData.length} pages`);

        // Process remaining pages
        pagesData.forEach(data => {
            data.conversations.forEach(conv => {
                const customer = conv.participants.find(p => p.purpose === 'customer');
                if (customer?.externalContactId) {
                    if (!userMap.has(customer.externalContactId)) {
                        userMap.set(customer.externalContactId, []);
                    }
                    userMap.get(customer.externalContactId).push(conv.conversationId);
                }
            });
        });

        console.log(`Remaining pages processed: ${pagesData.length} pages, ${pagesData.reduce((acc, data) => acc + data.conversations.length, 0)} conversations`);

        // Fetch journey data for each user
        const journeyRequests = Array.from(userMap.entries()).map(([contactId, conversationIds]) => {
            return async () => {
                console.log(`Fetching journey data for contact ${contactId}...`);
                const makeJourneyRequest = () => fetch(`https://api.mypurecloud.com.au/api/v2/externalcontacts/contacts/${contactId}/journey/sessions?pageSize=200`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                const journeyData = await handleApiRequest(makeJourneyRequest);
                return processUserJourneyData(contactId, journeyData.entities, conversationIds);
            };
        });

        console.log(`Journey requests prepared: ${journeyRequests.length} users`);

        // Execute journey requests with throttling
        const userData = await throttleRequests(journeyRequests, 10);
        console.log(`Journey requests finished: ${userData.length} users`);
        displayUserData(userData);
    } catch (error) {
        console.error('Error fetching user data:', error);
    }
}


function processUserJourneyData(contactId, journeys) {
    console.log(`Processing journey data for contactId: ${contactId}`);
    const today = new Date().setHours(0, 0, 0, 0);
    const webSessions = journeys.filter(j => j.type === 'web');
    const chatSessions = journeys.filter(j => j.type === 'conversation');
    console.log(`Found ${webSessions.length} web sessions and ${chatSessions.length} chat sessions for contactId: ${contactId}`);
    const firstWebSession = webSessions[0];

    // Calculate number of unique IP addresses
    const uniqueIPs = new Set(webSessions.map(session => session.ipAddress));
    const numberOfIPs = uniqueIPs.size;
    
    if (!firstWebSession) {
        console.log(`No web sessions found for contactId: ${contactId}`);
        return {
            contactId: contactId,
            deviceInfo: {
                category: 'N/A',
                type: 'N/A',
                browserFamily: 'N/A',
                browserVersion: 'N/A',
                country: 'N/A',
                locality: 'N/A',
                region: 'N/A',
                geoSource: 'N/A',
                ipOrg: 'N/A',
                customerIdType: 'N/A'
            },
            totalStats: calculateStats(chatSessions, null),
            // todayStats: calculateStats(chatSessions, today)
            numberOfIPs: numberOfIPs
        };
    } else {
        console.log(`Using first web session data for contactId: ${contactId}`);
        return {
            contactId: contactId,
            deviceInfo: {
                category: firstWebSession.device?.category || 'N/A',
                type: firstWebSession.device?.type || 'N/A',
                browserFamily: firstWebSession.browser?.family || 'N/A',
                browserVersion: firstWebSession.browser?.version || 'N/A',
                country: firstWebSession.geolocation?.country || 'N/A',
                locality: firstWebSession.geolocation?.locality || 'N/A',
                region: firstWebSession.geolocation?.region || 'N/A',
                geoSource: firstWebSession.geolocation?.source || 'N/A',
                ipOrg: firstWebSession.ipOrganization || 'N/A',
                customerIdType: firstWebSession.customerIdType || 'N/A'
            },
            totalStats: calculateStats(chatSessions, null),
            // todayStats: calculateStats(chatSessions, today)
            numberOfIPs: numberOfIPs
        };
    }
}

function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function calculateStats(journeys, dateFilter) {
    const filteredJourneys = dateFilter ?
        journeys.filter(j => new Date(j.createdDate).setHours(0, 0, 0, 0) === dateFilter) :
        journeys;

        const oldestChat = new Date(Math.min(...filteredJourneys.map(j => new Date(j.createdDate))));
        const mostRecentChat = new Date(Math.max(...filteredJourneys.map(j => new Date(j.createdDate))));
        const totalChats = filteredJourneys.length;    
    
        // Calculate activity period in days
        const activityPeriod = (mostRecentChat - oldestChat) / (1000 * 60 * 60 * 24);

        // // Calculate average chats per day
        // const daysDiff = Math.max(1, (mostRecentChat - oldestChat) / (1000 * 60 * 60 * 24));
        // const avgPerDay = totalChats / daysDiff;

        // Calculate average chats per day
        const avgPerDay = totalChats / Math.max(1, activityPeriod);

        const answeredChats = filteredJourneys.filter(j => j.lastAcdOutcome === 'Answered');
        const totalAnswered = answeredChats.length;
        const answeredAvgPerDay = totalAnswered / Math.max(1, activityPeriod);

        // Calculate average duration for answered chats
        const totalDuration = answeredChats.reduce((sum, chat) => sum + (chat.durationInSeconds || 0), 0);
        const avgDuration = totalAnswered > 0 ? totalDuration / totalAnswered : 0;
        
    return {
        oldestChat: oldestChat,
        mostRecentChat: mostRecentChat,
        avgPerDay: avgPerDay.toFixed(2),
        totalChats: totalChats,
        totalSDBChats: filteredJourneys.filter(j => j.lastConnectedQueue?.id === SDB_QUEUE_ID).length,
        totalQueuedChats: filteredJourneys.filter(j => j.lastConnectedQueue?.id === DIGITAL_QUEUE_ID || j.lastConnectedQueue?.id === SURVEY_QUEUE_ID).length,
        // totalQueuedChats: filteredJourneys.filter(j =>  j.lastAcdOutcome === 'Abandon' ||  j.lastAcdOutcome === 'Abandon').length,
        totalAbandoned: filteredJourneys.filter(j =>
            // j.lastConnectedQueue?.id === DIGITAL_QUEUE_ID &&
            j.lastAcdOutcome === 'Abandon'
        ).length,
        totalAnswered: totalAnswered,
        totalTimedout: filteredJourneys.filter(j => !j.lastConnectedQueue).length,
        activityPeriod: activityPeriod.toFixed(1),
        answeredAvgPerDay: answeredAvgPerDay.toFixed(2),
        answeredAvgDuration: formatDuration(avgDuration)
    };
}

function displayUserData(userData) {
    const tableBody = document.getElementById('frequentUsersBody');
    tableBody.innerHTML = '';

    // Calculate date range for the past 30 days
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);

    // Format dates for URL
    const endStr = end.toISOString().split('.')[0] + '.000Z';
    const startStr = start.toISOString().split('.')[0] + '.000Z';


    userData.sort((a, b) => b.totalStats.totalChats - a.totalStats.totalChats)
        .forEach(user => {
            const row = tableBody.insertRow();

            // Create device category cell with link
            const deviceCell = row.insertCell();
            const deviceLink = document.createElement('a');
            deviceLink.href = `https://apps.mypurecloud.com.au/directory/#/analytics/interactions?end=${encodeURIComponent(endStr)}&externalContact=externalContact%3A${user.contactId}&hasMedia=false&mediaType=message&start=${encodeURIComponent(startStr)}`;
            deviceLink.target = '_blank';
            deviceLink.textContent = user.deviceInfo.category;
            deviceCell.appendChild(deviceLink);

            const cells = [
                // Group 1
                // user.deviceInfo.category,
                user.deviceInfo.type,
                user.deviceInfo.browserFamily,
                user.deviceInfo.browserVersion,
                // user.deviceInfo.country,
                user.deviceInfo.locality,
                user.deviceInfo.region,
                user.deviceInfo.ipOrg,
                user.numberOfIPs,
                // Group 2
                user.totalStats.oldestChat.toLocaleString(),
                user.totalStats.mostRecentChat.toLocaleString(),
                user.totalStats.totalChats,
                user.totalStats.activityPeriod,
                user.totalStats.avgPerDay,
                user.totalStats.totalTimedout,
                user.totalStats.totalSDBChats,
                user.totalStats.totalQueuedChats,
                user.totalStats.totalAbandoned,
                user.totalStats.totalAnswered,
                // Group 3
                user.totalStats.answeredAvgPerDay,
                user.totalStats.answeredAvgDuration

                // <th>Most Recent Chat</th>
                // <th>Chats Attempts</th>
                // <th>Days of Activity</th>
                // <!-- <th>Avg/day</th> -->
                // <th>Attempts (avg/day)</th>
                // <th>Timedout</th>
                // <th>SDB</th>
                // <th>Queued Chats</th>
                // <th>Abandoned</th>
                // <th>Answered</th>
                // <!-- Group 3 -->
                // <th>Answered (avg/day)</th>
                // <th>Answered average duration</th>
        ];

            cells.forEach(cellData => {
                const cell = row.insertCell();
                cell.textContent = cellData;
            });
        });
}

// Initialize page
document.addEventListener('DOMContentLoaded', async function () {
    // await handleTokenCheck(true);
    await initializeWithStoredToken();
    document.getElementById('refreshButton').addEventListener('click', refreshTable);
});

async function refreshTable() {
    console.log('Refreshing table');
    const refreshButton = document.getElementById('refreshButton');
    refreshButton.disabled = true;
    try {
        console.log('Calling initializeWithStoredToken');
        // await handleTokenCheck(false);
        await initializeWithStoredToken();
    } finally {
        console.log('Refresh complete');
        refreshButton.disabled = false;
    }
}
