const DIGITAL_QUEUE_ID = 'cd98077a-aaaf-446e-9983-ced2bedc4aaf'; // LLA_Digital PROD
const MINIMUM_CONVERSATIONS = 12;
const MAX_PAGE_RELOADS_FOR_TOKEN = 5;
const TOKEN_RELOAD_DELAY = 2000; // 2 seconds in milliseconds

let token;



/**
 * Retrieves the stored number of reload attempts from either the Chrome extension's
 * local storage or the browser's local storage, depending on the environment.
 * If the value is found, it is parsed as an integer and returned as a promise.
 * If the value is not found or is invalid, the promise resolves to 0.
 *
 * @returns {Promise<number>} - A promise that resolves to the number of reload attempts
 */
async function getReloadAttempts() {
    const isExtension = determineEnvironment();
    if (isExtension) {
        return new Promise(resolve => {
            chrome.storage.local.get(['reloadAttempts'], function (result) {
                resolve(result.reloadAttempts || 0);
            });
        });
    } else {
        return parseInt(localStorage.getItem('reloadAttempts') || '0');
    }
}

/**
 * Sets the number of reload attempts to the given value in either the Chrome
 * extension's local storage or the browser's local storage, depending on the
 * environment.
 *
 * @param {number} count - The number of reload attempts to set
 * @returns {Promise<void>} - A promise that resolves when the value is set
 */
async function setReloadAttempts(count) {
    const isExtension = determineEnvironment();
    if (isExtension) {
        await chrome.storage.local.set({ reloadAttempts: count });
    } else {
        localStorage.setItem('reloadAttempts', count.toString());
    }
}

/**
 * Handles the process of checking the validity of a stored token
 * and manages features initialization and reload attempts.
 * 
 * If a valid token is found, it resets the reload attempts counter
 * and optionally initializes table features before fetching monitored chats.
 * If no valid token is found, it logs an error and checks the number of
 * reload attempts. If the attempts are below the maximum allowed, it
 * increments the attempts counter and reloads the page after a delay.
 * If the maximum reload attempts is reached, it logs an error and resets
 * the attempts counter.
 * 
 * @returns {Promise<void>} - A promise that resolves when the token
 * check process is complete.
 */

async function handleTokenCheck() {
    token = await getToken();

    console.log('Token:', token);
    // showLoading();
    if (token) {
        console.log('Valid token found');
        await setReloadAttempts(0); // Reset counter on successful token
    
        // await fetchData();
        await fetchFrequentAnsweredUsers(token);

        // hideLoading();

    } else {
        console.error('No valid token found');
        const attempts = await getReloadAttempts();
        console.log(`Current reload attempts: ${attempts}`);
        if (attempts < MAX_PAGE_RELOADS_FOR_TOKEN) {
            console.log(`Reload attempt ${attempts + 1} of ${MAX_PAGE_RELOADS_FOR_TOKEN}`);
            await setReloadAttempts(attempts + 1);
            setTimeout(() => {
                console.log('Reloading page...');
                window.location.reload();
            }, TOKEN_RELOAD_DELAY);
        } else {
            console.error('Max reload attempts reached');
            await setReloadAttempts(0); // Reset counter on successful token
        }
    }
}


async function refreshTable() {
    console.log('Refreshing table');
    const refreshButton = document.getElementById('refreshButton');
    refreshButton.disabled = true;
    try {
        // await initializeWithStoredToken();
        fetchFrequentAnsweredUsers(token);
    } finally {
        console.log('Refresh complete');
        refreshButton.disabled = false;
    }
}

// document.addEventListener('DOMContentLoaded', async function () {
//     await handleTokenCheck();
//     document.getElementById('refreshButton').addEventListener('click', refreshTable);
// });

// Initialize page
document.addEventListener('DOMContentLoaded', async function () {
    // await initializeWithStoredToken();
    await handleTokenCheck();
    document.getElementById('refreshButton').addEventListener('click', refreshTable);
});


// async function initializeWithStoredToken() {
//     token = await getToken();
//     if (token) {
//         fetchFrequentAnsweredUsers(token);
//         // hideLoading();
//     } else {
//         console.error('No valid stored token found');
//     }
// }

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

function splitDateRange(startDate, endDate) {
    const ranges = [];
    let currentStart = new Date(startDate);
    while (currentStart < endDate) {
        let currentEnd = new Date(currentStart.getTime() + 30 * 24 * 60 * 60 * 1000);
        if (currentEnd > endDate) {
            currentEnd = endDate;
        }
        ranges.push({ start: new Date(currentStart), end: new Date(currentEnd) });
        currentStart = new Date(currentEnd);
    }
    return ranges;
}

async function fetchFrequentAnsweredUsers(token) {
    console.log('Fetching frequent answered users...');
    const startTime = Date.now();

    const timeframe = document.getElementById('timeframe').value;
    const endDate = new Date();
    let startDate;

    switch (timeframe) {
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
        case '60days':
            startDate = new Date(endDate.getTime() - 60 * 24 * 60 * 60 * 1000);
            break;
        case '90days':
            startDate = new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000);
            break;
        case '120days':
            startDate = new Date(endDate.getTime() - 120 * 24 * 60 * 60 * 1000);
            break;
        case '150days':
            startDate = new Date(endDate.getTime() - 150 * 24 * 60 * 60 * 1000);
            break;
        case '180days':
            startDate = new Date(endDate.getTime() - 180 * 24 * 60 * 60 * 1000);
            break;
    }

    const interval = `${startDate.toISOString()}/${endDate.toISOString()}`;
        
    const body = {
        order: "desc",
        orderBy: "conversationStart",
        paging: { pageSize: 50, pageNumber: 1 },
        interval: interval,
        segmentFilters: [
            {
                type: "or",
                predicates: [{ dimension: "mediaType", value: "message" }]
            },
            {
                type: "or",
                predicates: [{ dimension: "queueId", value: DIGITAL_QUEUE_ID }]
            },
            // {
            //     type: "or",
            //     predicates: [
            //         // { type: "dimension", dimension: "messageType", value: "webmessaging" },
            //         { type: "dimension", dimension: "messageType", value: "open" },
            //     ]
            // },
            // {
            //     type: "and",
            //     predicates: [{ type: "dimension", dimension: "journeyCustomerId", operator: "exists" }]
            // },
        ],
        conversationFilters: [
            {
                type: "and",
                predicates: [{ type: "metric", metric: "tAbandon", operator: "notExists" }]
            },
            {
                type: "and",
                predicates: [{ type: "metric", metric: "tAnswered", operator: "exists" }]
            },
            {
                "type": "and",
                predicates: [{ type: "dimension", dimension: "conversationEnd", operator: "exists" }]
            }
        ],
        evaluationFilters: [],
        surveyFilters: []
    };

    const media = document.getElementById('media').value;
    // Modify the segmentFilters based on the selected media
    if (media !== 'all') {
        body.segmentFilters.push({
          type: "or",
          predicates: [
            {
              type: "dimension",
              dimension: "messageType",
              value: media === 'sms' ? "open" : "webmessaging"
            }
          ]
        });
      }
    
    async function fetchPage(pageNumber) {
        console.log(`Fetching page ${pageNumber}...`);
        const pageBody = { ...body, paging: { pageSize: 50, pageNumber: pageNumber } };
        const makeRequest = () => fetch('https://api.mypurecloud.com.au/api/v2/analytics/conversations/details/query', {
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

        const dateRanges = splitDateRange(startDate, endDate);
        const userMap = new Map();

        for (const range of dateRanges) {
            const interval = `${range.start.toISOString()}/${range.end.toISOString()}`;
            body.interval = interval;

            let currentPage = 1;
            let totalHits = 0;
            const pageRequests = [];

            // First request to get total hits
            const firstPageData = await fetchPage(1);
            totalHits = firstPageData.totalHits;

            console.log(`Total hits for range ${interval}: ${totalHits}`);

            // Process first page
            processConversations(firstPageData.conversations, userMap);

            // Prepare remaining page requests
            const totalPages = Math.ceil(totalHits / 50);
            for (let page = 2; page <= totalPages; page++) {
                pageRequests.push(() => fetchPage(page));
            }

            console.log(`Total pages for range ${interval}: ${totalPages}`);

            // Execute page requests with throttling (10 per second)
            const pagesData = await throttleRequests(pageRequests, 7);

            console.log(`Page requests finished for range ${interval}: ${pagesData.length} pages`);

            // Process remaining pages
            pagesData.forEach(data => processConversations(data.conversations, userMap));
        }

        console.log(`All conversations processed: ${userMap.size} users`);

        // Filter users with more than 12 conversations
        for (const [contactId, conversations] of userMap.entries()) {
            if (conversations.length <= MINIMUM_CONVERSATIONS) {
                userMap.delete(contactId);
            }
        }
        console.log(`Filtered users: ${userMap.size}`);

        // Fetch journey data for each user
        const journeyRequests = Array.from(userMap.entries()).map(([contactId, conversations]) => {
            return async () => {
                const customer = conversations[0].participants.find(p => p.purpose === 'customer');
                const isWebMessaging = customer.sessions[0].messageType === 'webmessaging';

                if (!isWebMessaging) {
                    console.log(`No need to fetch journey data for contact ${contactId}...this is SMS`);
                    return processUserJourneyData(contactId, null, conversations);
                }
                else {
                    console.log(`Fetching journey data for contact ${contactId}...`);
                    const sessionId = conversations[0].participants[0].sessions[0].journeyCustomerSessionId;
                    const makeJourneyRequest = () => fetch(`https://api.mypurecloud.com.au/api/v2/journey/sessions/${sessionId}`, {
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    });
                    try {
                        const journeyData = await handleApiRequest(makeJourneyRequest);
                        return processUserJourneyData(contactId, journeyData, conversations);
                    } catch (error) {
                        const statusMatch = error.toString().match(/HTTP (\d+)/);
                        const status = statusMatch ? parseInt(statusMatch[1]) : null;

                        if (status === 404) {
                            console.log(`Journey session not found for contact ${contactId}, trying alternate endpoint...`);
                            const makeAlternateRequest = () => fetch(`https://api.mypurecloud.com.au/api/v2/externalcontacts/contacts/${contactId}/journey/sessions`, {
                                headers: {
                                    'Authorization': `Bearer ${token}`
                                }
                            });
                            try {
                                const alternateJourneyData = await handleApiRequest(makeAlternateRequest);
                                const webSession = alternateJourneyData.entities.find(entity => entity.type === 'web');
                                if (webSession) {
                                    return processUserJourneyData(contactId, webSession, conversations);
                                } else {
                                    console.log(`No web session found for contact ${contactId}`);
                                    return processUserJourneyData(contactId, null, conversations);
                                }
                            } catch (alternateError) {
                                console.error(`Error fetching alternate journey data for contact ${contactId}:`, alternateError);
                                return processUserJourneyData(contactId, null, conversations);
                            }
                        }
                        throw error; // Re-throw other errors
                    }
                }
            };
        });

        console.log(`Journey requests prepared: ${journeyRequests.length} users`);

        // Execute journey requests with throttling
        const userData = await throttleRequests(journeyRequests, 7);
        console.log(`Journey requests finished: ${userData.length} users`);

        const endTime = Date.now();
        const totalTimeTaken = (endTime - startTime) / 1000;
        console.log(`Total time taken: ${totalTimeTaken.toFixed(2)} seconds`);

        displayUserData(userData);
    } catch (error) {
        console.error('Error fetching user data:', error);
    }
}

function processConversations(conversations, userMap) {
    if (!conversations || conversations.length === 0) return;
    conversations.forEach(conv => {
        const customer = conv.participants.find(p => p.purpose === 'customer');
        if (customer) {
            let userId;
            if (customer.sessions[0].messageType === 'webmessaging') {
                userId = customer.externalContactId;
            } else if (customer.sessions[0].messageType === 'open') {
                userId = customer.sessions[0].addressFrom;
            }

            if (userId) {
                if (!userMap.has(userId)) {
                    userMap.set(userId, []);
                }
                const userConversations = userMap.get(userId);
                if (!userConversations.some(c => c.conversationId === conv.conversationId)) {
                    userConversations.push(conv);
                }
            }
        }
    });
}

function isSameDevice(user1, user2) {
    if (user1.deviceInfo.category === 'SMS' || user2.deviceInfo.category === 'SMS'
        || !user1.deviceInfo || !user2.deviceInfo
        || user1.deviceInfo.type === 'N/A' || user2.deviceInfo.type === 'N/A') return false;
    return JSON.stringify(user1.deviceInfo.rawDevice) === JSON.stringify(user2.deviceInfo.rawDevice);
}

function isOverlapping(user1, user2) {
    const start1 = user1.totalStats.oldestChat;
    const end1 = user1.totalStats.mostRecentChat;
    const start2 = user2.totalStats.oldestChat;
    const end2 = user2.totalStats.mostRecentChat;
    return start1 <= end2 && start2 <= end1;
}

async function processUserJourneyData(contactId, entities, conversations) {
    console.log(`Processing journey data for contactId: ${contactId}`);

    const isSMS = conversations[0].participants[0].sessions[0].messageType === 'open';

    if (isSMS) {
        return {
            contactId: contactId,
            deviceInfo: {
                category: 'SMS',
                type: 'SMS',
                browserFamily: 'N/A',
                browserVersion: 'N/A',
                country: 'N/A',
                locality: 'N/A',
                region: 'N/A',
                geoSource: 'N/A',
                ipOrg: 'N/A',
                customerIdType: 'N/A',
                deviceSummary: conversations[0].participants[0].sessions[0].addressFrom
            },
            totalStats: calculateStats(conversations, null),
        };
    } else {
        // WebMessaging
        firstWebSession = entities;
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
                totalStats: calculateStats(conversations, null),
            };
        } else {
            console.log(`Using first web session data for contactId: ${contactId}`);
            const deviceSummary = [
                firstWebSession.device?.osFamily,
                firstWebSession.device?.osVersion,
                firstWebSession.device?.type,
                firstWebSession.device?.screenWidth,
                firstWebSession.device?.screenHeight,
                firstWebSession.browser?.family,
                firstWebSession.browser?.version
            ].map(item => item || '').join('-');

            return {
                contactId: contactId,
                deviceInfo: {
                    rawDevice: { device: firstWebSession.device || 'N/A', browser: firstWebSession.browser || 'N/A' },
                    category: firstWebSession.device?.category || 'N/A',
                    type: firstWebSession.device?.type || 'N/A',
                    browserFamily: firstWebSession.browser?.family || 'N/A',
                    browserVersion: firstWebSession.browser?.version || 'N/A',
                    country: firstWebSession.geolocation?.country || 'N/A',
                    locality: firstWebSession.geolocation?.locality || 'N/A',
                    region: firstWebSession.geolocation?.region || 'N/A',
                    geoSource: firstWebSession.geolocation?.source || 'N/A',
                    ipOrg: firstWebSession.ipOrganization || 'N/A',
                    customerIdType: firstWebSession.customerIdType || 'N/A',
                    // deviceHash: deviceHash,
                    deviceSummary: deviceSummary
                },
                totalStats: calculateStats(conversations, null),
            };
        }
    }
}


function calculateStats(conversations) {
    const chatDates = conversations.map(conv => new Date(conv.conversationStart));
    const oldestChat = new Date(Math.min(...chatDates));
    const mostRecentChat = new Date(Math.max(...chatDates));
    const totalChats = conversations.length;

    const activityPeriod = Math.max(1, (mostRecentChat - oldestChat) / (1000 * 60 * 60 * 24));
    // const avgPerDay = totalChats / Math.max(1, activityPeriod);
    const avgPerDay = totalChats / activityPeriod;

    const totalDuration = conversations.reduce((sum, chat) => {
        const startTime = new Date(chat.conversationStart);
        const endTime = new Date(chat.conversationEnd);
        const chatDuration = (endTime - startTime) / 1000; // Convert milliseconds to seconds
        return sum + chatDuration;
    }, 0);
    const averageDuration = totalChats > 0 ? totalDuration / totalChats : 0;

    let totalTalkDuration = 0;
    let totalTalkAnswered = 0;

    conversations.forEach(conv => {
        const agentParticipant = conv.participants.find(p => p.purpose === 'agent' && p.sessions.some(s => s.segments.some(seg => seg.segmentType === 'interact')));
        if (agentParticipant) {
            const interactSession = agentParticipant.sessions.find(s => s.segments.some(seg => seg.segmentType === 'interact'));
            if (interactSession) {
                const interactSegment = interactSession.segments.find(seg => seg.segmentType === 'interact');
                if (interactSegment) {
                    const metrics = interactSession.metrics;
                    const talkTime = metrics.filter(m => m.name === 'tTalk').reduce((sum, m) => sum + m.value / 1000, 0);
                    const heldTime = metrics.filter(m => m.name === 'tHeld').reduce((sum, m) => sum + m.value / 1000, 0);
                    totalTalkDuration += talkTime + heldTime;
                    totalTalkAnswered++;
                }
            }
        }
    });

    const averageTalkDuration = totalTalkAnswered > 0 ? totalTalkDuration / totalTalkAnswered : 0;

    return {
        oldestChat: oldestChat,
        mostRecentChat: mostRecentChat,
        avgPerDay: avgPerDay.toFixed(2),
        totalChats: totalChats,
        daysOfActivity: activityPeriod.toFixed(1),
        averageTalkDuration: formatDuration(averageTalkDuration),
        averageDuration: formatDuration(averageDuration),
    };
}

function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// function displayUserData_old(userData) {
//     const tableBody = document.getElementById('frequentUsersBody');
//     tableBody.innerHTML = '';

//     // Calculate date range for the past 30 days
//     const end = new Date();
//     const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
//     const endStr = end.toISOString().split('.')[0] + '.000Z';
//     const startStr = start.toISOString().split('.')[0] + '.000Z';

//     // Sort users by total chats
//     userData.sort((a, b) => b.totalStats.totalChats - a.totalStats.totalChats);

//     // Group users
//     const groupedUsers = [];
//     userData.forEach(user => {
//         const existingGroup = groupedUsers.find(group => 
//             group.every(groupUser => 
//                 isSameDevice(groupUser, user) && !isOverlapping(groupUser, user)
//             )
//         );
//         if (existingGroup) {
//             existingGroup.push(user);
//         } else {
//             groupedUsers.push([user]);
//         }
//     });

//     // Display grouped users
//     let groupNumber = 1;
//     groupedUsers.forEach(group => {
//         const isGrouped = group.length > 1;
//         group.forEach((user, index) => {
//             const row = tableBody.insertRow();
//             if (isGrouped) {
//                 if (index === 0) {
//                     row.classList.add('group-start');
//                 } else if (index === group.length - 1) {
//                     row.classList.add('group-end');
//                 } else {
//                     row.classList.add('group-middle');
//                 }
//             }

//             // Add group number for grouped rows
//             if (isGrouped) {
//                 const groupCell = row.insertCell(0);
//                 groupCell.textContent = groupNumber;
//                 groupCell.style.fontWeight = 'bold';
//             } else {
//                 row.insertCell(0); // Empty cell for non-grouped rows
//             }
//             // Create device category cell with link
//             const deviceCell = row.insertCell();
//             const deviceLink = document.createElement('a');
//             deviceLink.href = `https://apps.mypurecloud.com.au/directory/#/analytics/interactions?end=${encodeURIComponent(endStr)}&externalContact=externalContact%3A${user.contactId}&hasMedia=false&mediaType=message&start=${encodeURIComponent(startStr)}`;
//             deviceLink.target = '_blank';
//             deviceLink.textContent = user.deviceInfo.category;
//             deviceCell.appendChild(deviceLink);

//             const cells = [
//                 user.deviceInfo.type,
//                 // user.deviceInfo.deviceHash,
//                 user.deviceInfo.deviceSummary,
//                 // user.deviceInfo.browserFamily,
//                 // user.deviceInfo.browserVersion,
//                 user.deviceInfo.locality,
//                 user.deviceInfo.region,
//                 user.deviceInfo.ipOrg,
//                 user.totalStats.oldestChat?.toLocaleString(),
//                 user.totalStats.mostRecentChat?.toLocaleString(),
//                 user.totalStats.totalChats,
//                 user.totalStats.daysOfActivity,
//                 user.totalStats.avgPerDay,
//                 user.totalStats.averageDuration,
//                 user.totalStats.averageTalkDuration,
//             ];

//             cells.forEach(cellData => {
//                 const cell = row.insertCell();
//                 cell.textContent = cellData;
//             });                        
//         });
//         if (isGrouped) {
//             groupNumber++;
//         }
//     });
// }

function displayUserData(userData) {
    const tableBody = document.getElementById('frequentUsersBody');
    tableBody.innerHTML = '';

    // Calculate date range for the past 30 days
    const end = new Date();
    const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    const endStr = end.toISOString().split('.')[0] + '.000Z';
    const startStr = start.toISOString().split('.')[0] + '.000Z';

    // Sort users by total chats
    userData.sort((a, b) => b.totalStats.totalChats - a.totalStats.totalChats);

    // Group users
    const groupedUsers = [];
    userData.forEach(user => {
        if (user) {
            const existingGroup = groupedUsers.find(group =>
                group.every(groupUser =>
                    isSameDevice(groupUser, user) && !isOverlapping(groupUser, user)
                    // isSameDevice(groupUser.rawDevice, user.rawDevice) && !isOverlapping(groupUser, user)
                )
            );
            if (existingGroup) {
                existingGroup.push(user);
            } else {
                groupedUsers.push([user]);
            }
        }
    });

    // Display grouped users
    let groupNumber = 1;
    groupedUsers.forEach(group => {
        const isGrouped = group.length > 1;

        // Add summary row for grouped users
        if (isGrouped) {
            const summaryRow = tableBody.insertRow();
            summaryRow.classList.add('group-summary');
            summaryRow.dataset.groupIndex = groupNumber;

            const toggleCell = summaryRow.insertCell();
            const toggleButton = document.createElement('button');
            toggleButton.textContent = '▼';
            toggleButton.onclick = (function (currentGroupNumber) {
                return function () {
                    toggleGroup(currentGroupNumber);
                };
            })(groupNumber);


            toggleCell.appendChild(toggleButton);


            const summaryData = getSummaryData(group);
            // Create device category cell
            const deviceCell = summaryRow.insertCell();
            deviceCell.textContent = summaryData.deviceInfo.category;

            // Add summary data
            addCellsToRow(summaryRow, summaryData);
        }

        group.forEach((user, index) => {
            const row = tableBody.insertRow();
            row.classList.add(`group-${groupNumber}`);

            if (isGrouped) {
                row.classList.add(index === 0 ? 'group-start' : index === group.length - 1 ? 'group-end' : 'group-middle');
            }

            // Add group number or empty cell
            const groupCell = row.insertCell();
            if (isGrouped) {
                groupCell.textContent = groupNumber;
                groupCell.style.fontWeight = 'bold';
            }

            // Create device category cell with link
            const deviceCell = row.insertCell();
            const deviceLink = document.createElement('a');
            // deviceLink.href = `https://apps.mypurecloud.com.au/directory/#/analytics/interactions?end=${encodeURIComponent(endStr)}&externalContact=externalContact%3A${user.contactId}&hasMedia=false&mediaType=message&start=${encodeURIComponent(startStr)}`;
            if (user.deviceInfo.category === 'SMS') {
                deviceLink.href = `https://apps.mypurecloud.com.au/directory/#/analytics/interactions?end=${encodeURIComponent(endStr)}&remote=${user.contactId}&hasMedia=false&mediaType=message&start=${encodeURIComponent(startStr)}&queue=${DIGITAL_QUEUE_ID}&ended=ended&answered=answered`;
            } else {
                deviceLink.href = `https://apps.mypurecloud.com.au/directory/#/analytics/interactions?end=${encodeURIComponent(endStr)}&externalContact=externalContact%3A${user.contactId}&hasMedia=false&mediaType=message&start=${encodeURIComponent(startStr)}&queue=${DIGITAL_QUEUE_ID}&ended=ended&answered=answered`;
            }
            deviceLink.target = '_blank';
            deviceLink.textContent = user.deviceInfo.category;
            deviceCell.appendChild(deviceLink);

            addCellsToRow(row, user);
        });

        if (isGrouped) {
            groupNumber++;
        }
    });
}

function addCellsToRow(row, data) {
    const cells = [
        data.deviceInfo.type || 'N/A',
        data.deviceInfo.deviceSummary,
        data.deviceInfo.locality || 'N/A',
        data.deviceInfo.region || 'N/A',
        data.deviceInfo.ipOrg || 'N/A',
        data.totalStats.oldestChat?.toLocaleString(),
        data.totalStats.mostRecentChat?.toLocaleString(),
        data.totalStats.totalChats,
        data.totalStats.daysOfActivity,
        data.totalStats.avgPerDay,
        data.totalStats.averageDuration,
        data.totalStats.averageTalkDuration,
    ];

    cells.forEach(cellData => {
        const cell = row.insertCell();
        cell.textContent = cellData;
    });
}

function toggleGroup(groupIndex) {
    // const groupRows = document.querySelectorAll(`.group-${groupIndex}`);
    const groupRows = document.querySelectorAll(`.group-${groupIndex}.group-start, .group-${groupIndex}.group-middle, .group-${groupIndex}.group-end`);
    //.group-6.group-middle, .group-6.group-start
    const summaryRow = document.querySelector(`.group-summary[data-group-index="${groupIndex}"]`);
    const toggleButton = summaryRow.querySelector('button');
    const isCollapsed = toggleButton.textContent === '▶';

    if (isCollapsed) {
        // Expand group
        groupRows.forEach(row => row.style.display = '');
        // summaryRow.style.display = 'none';
        toggleButton.textContent = '▼';
    } else {
        // Collapse group
        groupRows.forEach(row => row.style.display = 'none');
        // summaryRow.style.display = '';
        toggleButton.textContent = '▶';
    }
}

function unformatDuration(formattedDuration) {
    // Assuming formatDuration returns a string in the format "HH:MM:SS"
    const [hours, minutes, seconds] = formattedDuration.split(':').map(Number);
    return (hours * 3600) + (minutes * 60) + seconds;
}

function getSummaryData(group) {
    const deviceTypes = new Set();
    const deviceSummaries = new Set();
    const localities = new Set();
    const regions = new Set();
    const ipOrgs = new Set();

    let oldestChat = new Date(Math.min(...group.map(user => user.totalStats.oldestChat)));
    let mostRecentChat = new Date(Math.max(...group.map(user => user.totalStats.mostRecentChat)));
    let totalChats = 0;
    let totalDuration = 0;
    let totalTalkDuration = 0;

    group.forEach(user => {
        deviceTypes.add(user.deviceInfo.type);
        deviceSummaries.add(user.deviceInfo.deviceSummary);
        localities.add(user.deviceInfo.locality);
        regions.add(user.deviceInfo.region);
        ipOrgs.add(user.deviceInfo.ipOrg);
        totalChats += user.totalStats.totalChats;
        totalDuration += unformatDuration(user.totalStats.averageDuration) * user.totalStats.totalChats;
        totalTalkDuration += unformatDuration(user.totalStats.averageTalkDuration) * user.totalStats.totalChats;

    });

    const daysOfActivity = (mostRecentChat - oldestChat) / (1000 * 60 * 60 * 24);
    const avgPerDay = totalChats / daysOfActivity;
    const averageDuration = totalChats > 0 ? totalDuration / totalChats : 0;
    const averageTalkDuration = totalChats > 0 ? totalTalkDuration / totalChats : 0;

    return {
        deviceInfo: {
            type: Array.from(deviceTypes).join(', '),
            deviceSummary: Array.from(deviceSummaries).join(', '),
            locality: Array.from(localities).join(', '),
            region: Array.from(regions).join(', '),
            ipOrg: Array.from(ipOrgs).join(', ')
        },
        totalStats: {
            oldestChat: oldestChat,
            mostRecentChat: mostRecentChat,
            totalChats: totalChats,
            daysOfActivity: daysOfActivity.toFixed(1),
            avgPerDay: avgPerDay.toFixed(2),
            averageDuration: formatDuration(averageDuration),
            averageTalkDuration: formatDuration(averageTalkDuration)
        }
    };
}


// Implement or import these functions: handleApiRequest, throttleRequests, initializeWithStoredToken
