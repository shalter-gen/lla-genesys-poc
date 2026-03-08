const timeframeSelector = document.getElementById('timeframe');
const refreshButton = document.getElementById('refreshButton');
const agentsDisconnectionsTable = document.getElementById('agentsDisconnectionsTable');
const agentsDisconnectionsBody = document.getElementById('agentsDisconnectionsBody');

const DIGITAL_QUEUE_ID = 'cd98077a-aaaf-446e-9983-ced2bedc4aaf';
const BASE_URL = 'https://api.mypurecloud.com.au';
const OFFLINE_THRESHOLD = 15 * 60 * 1000; // 15 minutes

// Set this to a userId string to troubleshoot a single user, or leave empty/null to disable
let staticUserId = '';
// staticUserId = '139d5dba-eebf-458a-a8be-26cb888bd3bc'; // RozD
// staticUserId = '004b9e18-1983-4076-b95b-65731eb34723'; // Samantha Gordon
// staticUserId = '2a6d509e-0e89-4ce8-9662-c31620056fbd'; // Sia Sharma
staticUserId = '72c345a6-0bef-4373-b563-48c118d39a47'; // Brianna Ivory

let token;

async function initializeWithStoredToken() {
    token = await getToken();
    if (token) {
        // token is set, we can proceed
    } else {
        console.error('No valid stored token found');
    }
}

const makeJourneyRequest = () => {
    const timeframe = timeframeSelector.value;
    const interval = getInterval(timeframe);
    const payload = {
        "filter": {
            "type": "and",
            "clauses": [{
                "type": "or",
                "predicates": [{
                    "dimension": "queueId",
                    "value": DIGITAL_QUEUE_ID
                }]
            }, {
                "type": "or",
                "predicates": [{
                    "dimension": "mediaType",
                    "value": "message"
                }]
            }]
        },
        "metrics": [
            "tAnswered",
            "tHandle",
            "tTalkComplete",
            "tHeldComplete",
            "tAcw",
            "tDialing",
            "tContacting",
            "nTransferred",
            "nOutbound",
            "tNotResponding",
            "tAlert",
            "tMonitoring",
            "nBlindTransferred",
            "nConsultTransferred",
            "nError",
            "tParkComplete",
            "tActiveCallback"
        ],
        "groupBy": [
            "userId"
        ],
        "interval": interval
    };

    fetch(`${BASE_URL}/api/v2/analytics/conversations/aggregates/query`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
    })
        .then(response => response.json())
        .then(data => {
            const userIds = data.results.filter(result => result.group.userId).map(result => result.group.userId);
            displayUserIds(userIds, data, interval);
        })
        .catch(error => console.error(error));
};

const getInterval = (timeframe) => {
    const now = new Date();
    let start;
    switch (timeframe) {
        case '12hours':
            start = new Date(now.getTime() - 12 * 60 * 60 * 1000);
            break;
        case '1day':
            start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            break;
        case '1week':
            start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
        case '2weeks':
            start = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
            break;
        case '30days':
            start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
    }
    return `${start.toISOString()}/${now.toISOString()}`;
};

function chunkArray(arr, chunkSize = 50) {
    const chunks = [];
    for (let i = 0; i < arr.length; i += chunkSize) {
        chunks.push(arr.slice(i, i + chunkSize));
    }
    return chunks;
}

async function fetchUserDetails(userIds) {
    const userMap = new Map();
    const userIdChunks = chunkArray(userIds, 50); // Split into chunks of 50

    try {
        for (const chunk of userIdChunks) {
            let currentPage = 1;
            const pageSize = 50;

            while (true) {
                const response = await fetch(`${BASE_URL}/api/v2/users/search`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        "query": [{
                            "fields": ["id"],
                            "operator": "OR",
                            "type": "EXACT",
                            "values": chunk // Use current chunk
                        }],
                        "expand": ["dateLastLogin", "division"],
                        "pageSize": pageSize,
                        "pageNumber": currentPage
                    })
                });

                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

                const data = await response.json();
                data.results?.forEach(user => {
                    userMap.set(user.id, {
                        name: user.name,
                        division: user.division?.name || 'N/A',
                        state: user.state,
                        lastLogin: user.dateLastLogin
                            ? new Date(user.dateLastLogin).toLocaleDateString('en-AU')
                            : 'Never'
                    });
                });

                // Pagination check
                if (currentPage >= data.pageCount || data.results?.length < pageSize) break;

                currentPage++;
                await new Promise(resolve => setTimeout(resolve, 300)); // Rate limit
            }

            // Add delay between chunks
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    } catch (error) {
        console.error('Error fetching user details:', error);
    }

    return userMap;
}



async function fetchPresenceData_old(userIds, interval) {
    const allUserDetails = [];
    const pageSize = 50;
    let pageNumber = 1;
    const url = `${BASE_URL}/api/v2/analytics/users/details/query`;
    const uniqueIds = Array.from(new Set(userIds)).filter(Boolean);
    while (true) {
        const payload = {
            interval: interval,
            order: "asc",
            userFilters: [{
                type: "or",
                predicates: uniqueIds.map(userId => ({
                    type: "dimension",
                    dimension: "userId",
                    value: userId
                }))
            }],
            presenceFilters: [{
                type: "and",
                predicates: [{
                    type: "dimension",
                    dimension: "systemPresence",
                    operator: "exists"
                }]
            }],
            paging: {
                pageNumber: pageNumber,
                pageSize: pageSize
            }
        };
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        if (!data.userDetails || data.userDetails.length === 0) break;
        // data.userDetails.forEach(detail => {
        //     allUserDetails.push({
        //         userId: detail.userId,
        //         primaryPresence: detail.primaryPresence || []
        //     });
        // });
        data.userDetails.forEach(detail => {
            let existing = allUserDetails.find(d => d.userId === detail.userId);
            if (existing) {
                // Merge and sort by startTime to preserve session order
                existing.primaryPresence = existing.primaryPresence
                    .concat(detail.primaryPresence || [])
                    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
            } else {
                allUserDetails.push({
                    userId: detail.userId,
                    primaryPresence: (detail.primaryPresence || []).slice()
                });
            }
        });

        // if (data.userDetails.length < pageSize) break;
        pageNumber++;
        await new Promise(resolve => setTimeout(resolve, 300));
    }
    return allUserDetails;
}

async function fetchPresenceData(userIds, interval) {
    const allUserDetails = [];
    const pageSize = 50;
    const userIdChunks = chunkArray(userIds, 100); // Split into chunks of 100 (API limit)
    const uniqueIds = Array.from(new Set(userIds)).filter(Boolean);

    // Process each chunk of user IDs (max 100 per request)
    for (const chunk of userIdChunks) {
        let pageNumber = 1;

        while (true) {
            const payload = {
                interval: interval,
                order: "asc",
                userFilters: [{
                    type: "or",
                    // predicates: chunk.map(userId => ({
                    //     type: "dimension",
                    //     dimension: "userId",
                    //     value: userId
                    // }))
                    predicates: chunk.map(id => ({
                        type: "dimension",
                        dimension: "userId",
                        value: id
                    }))
                }],
                presenceFilters: [{
                    type: "and",
                    predicates: [{
                        type: "dimension",
                        dimension: "systemPresence",
                        operator: "exists"
                    }]
                }],
                paging: {
                    pageNumber: pageNumber,
                    pageSize: pageSize
                }
            };

            const response = await fetch(`${BASE_URL}/api/v2/analytics/users/details/query`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const data = await response.json();
            if (!data.userDetails || data.userDetails.length === 0) break;

            data.userDetails.forEach(detail => {
                let existing = allUserDetails.find(d => d.userId === detail.userId);
                if (existing) {
                    // Merge and sort by startTime to preserve session order
                    existing.primaryPresence = existing.primaryPresence
                        .concat(detail.primaryPresence || [])
                        .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
                } else {
                    allUserDetails.push({
                        userId: detail.userId,
                        primaryPresence: (detail.primaryPresence || []).slice()
                    });
                }
            });

            pageNumber++;
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        // Add delay between chunks
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    return allUserDetails;
}


async function displayUserIds(userIds, data, interval) {
    // If staticUserId is set, filter to only that user
    if (staticUserId && staticUserId.trim() !== '') {
        userIds = userIds.filter(id => id === staticUserId);
    }

    agentsDisconnectionsBody.innerHTML = '';
    // Fetch user details and presence data
    const userMap = await fetchUserDetails(userIds);
    const presenceData = await fetchPresenceData(userIds, interval);

    // Helper for formatting
    const formatDuration = (ms) => {
        if (isNaN(ms) || ms < 0) return 'N/A';
        const hours = Math.floor(ms / 3600000);
        const minutes = Math.floor((ms % 3600000) / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    };
    const createCell = (content) => {
        const td = document.createElement('td');
        td.textContent = content;
        return td;
    };

    userIds.forEach(userId => {
        const row = document.createElement('tr');
        const userInfo = userMap.get(userId) || {};
        const userResults = data.results.find(r => r.group.userId === userId);
        const userPresence = presenceData.find(d => d.userId === userId)?.primaryPresence || [];
        // User columns
        row.appendChild(createCell(userInfo.name || userId));
        row.appendChild(createCell(userInfo.division));
        row.appendChild(createCell(userInfo.state));
        row.appendChild(createCell(userInfo.lastLogin));
        // Metrics columns
        if (userResults) {
            const handled = userResults.data[0].metrics.find(m => m.metric === 'tHandle')?.stats.count || 0;
            row.appendChild(createCell(handled));
            const notResponded = userResults.data[0].metrics.find(m => m.metric === 'tNotResponding')?.stats.count || 0;
            row.appendChild(createCell(notResponded));
            const acw = userResults.data[0].metrics.find(m => m.metric === 'tAcw');
            const avgAcw = acw && acw.stats.count > 0
                ? formatDuration(acw.stats.sum / acw.stats.count)
                : '00:00:00';
            row.appendChild(createCell(avgAcw));
        } else {
            // Fallback if no results
            row.appendChild(createCell('0'));
            row.appendChild(createCell('0'));
            row.appendChild(createCell('00:00:00'));
        }

        // Session metrics
        const sessionDurations = getSessions(userPresence);
        const sessionCount = sessionDurations.length;
        const minSession = sessionCount ? Math.min(...sessionDurations) : 0;
        const maxSession = sessionCount ? Math.max(...sessionDurations) : 0;
        const avgSession = sessionCount ? sessionDurations.reduce((a, b) => a + b, 0) / sessionCount : 0;
        const sessionsTotalDuration = sessionDurations.reduce((a, b) => a + b, 0);

        row.appendChild(createCell(sessionCount));
        row.appendChild(createCell(formatDuration(minSession)));
        row.appendChild(createCell(formatDuration(maxSession)));
        row.appendChild(createCell(formatDuration(avgSession)));
        row.appendChild(createCell(formatDuration(sessionsTotalDuration)));

        // row.appendChild(createCell(sessionCount)); // New sessions column

        // row.appendChild(createCell(formatDuration(sessionDuration)));
        // Disconnect columns
        const dcStats = getDisconnectStats(userPresence);
        const disconnectCount = dcStats?.count || 0;
        const avgDisconnectsPerSession = sessionCount > 0 ? (disconnectCount / sessionCount).toFixed(2) : '0.00';

        row.appendChild(createCell(dcStats?.count || 0));
        row.appendChild(createCell(avgDisconnectsPerSession));
        row.appendChild(createCell(dcStats ? formatDuration(dcStats.min) : ''));
        row.appendChild(createCell(dcStats ? formatDuration(dcStats.max) : ''));
        row.appendChild(createCell(dcStats ? formatDuration(dcStats.avg) : ''));
        agentsDisconnectionsBody.appendChild(row);
    });

    // Add this at the end of your displayUserIds function
    initializeTableSorting();

}

function getCompleteSessions(presenceEvents) {
    if (!Array.isArray(presenceEvents) || presenceEvents.length < 3) return [];

    const now = new Date();
    const sessions = [];
    let currentSession = [];
    let sessionStart = null;

    // Find first long OFFLINE event
    let startIndex = -1;
    for (let i = 0; i < presenceEvents.length; i++) {
        const event = presenceEvents[i];
        if (event.systemPresence === 'OFFLINE' && event.startTime && event.endTime) {
            const start = new Date(event.startTime);
            const end = new Date(event.endTime);
            if (end - start >= OFFLINE_THRESHOLD) {
                startIndex = i;
                break;
            }
        }
    }

    if (startIndex === -1) return []; // No starting long OFFLINE event found

    // Process events to extract complete sessions
    for (let i = startIndex; i < presenceEvents.length; i++) {
        const event = presenceEvents[i];
        const isOffline = event.systemPresence === 'OFFLINE';
        const start = new Date(event.startTime);
        const end = event.endTime ? new Date(event.endTime) : now;
        const duration = end - start;

        if (isOffline) {
            if (duration >= OFFLINE_THRESHOLD) {
                // Long OFFLINE event - ends current session and starts a new one
                if (currentSession.length > 0) {
                    sessions.push([...currentSession, event]); // Include this OFFLINE event in the session
                    currentSession = [];
                } else {
                    // Start of a new potential session
                    currentSession = [event];
                }
            } else {
                // Short OFFLINE event - part of current session
                currentSession.push(event);
            }
        } else {
            // Non-OFFLINE event - part of current session
            currentSession.push(event);
        }
    }

    // Filter out incomplete sessions (those not ending with a long OFFLINE)
    return sessions.filter(session => {
        const lastEvent = session[session.length - 1];
        if (lastEvent.systemPresence !== 'OFFLINE') return false;

        const start = new Date(lastEvent.startTime);
        const end = lastEvent.endTime ? new Date(lastEvent.endTime) : now;
        return (end - start) >= OFFLINE_THRESHOLD;
    });
}

function getSessions(presenceEvents) {
    // Get complete sessions only
    const completeSessions = getCompleteSessions(presenceEvents);

    // Calculate duration for each session
    return completeSessions.map(session => {
        let sessionStart;
        const firstEvent = session[0];
        
        // Determine session start based on first event type
        if (firstEvent.systemPresence === 'OFFLINE') {
            // If first event is OFFLINE, session starts at its end
            sessionStart = new Date(firstEvent.endTime);
        } else {
            // If first event is not OFFLINE, session starts at its start
            sessionStart = new Date(firstEvent.startTime);
        }

        // Last event is a long OFFLINE, session ends at its start
        const sessionEnd = new Date(session[session.length - 1].startTime);

        return sessionEnd - sessionStart;
    });
}



// Helper function to calculate disconnect stats
const getDisconnectStats = (presenceEvents) => {
    // Get complete sessions only
    const completeSessions = getCompleteSessions(presenceEvents);
    if (!completeSessions.length) return null;

    // Flatten sessions and find short OFFLINE events
    const disconnectEvents = completeSessions.flatMap(session =>
        session.filter(event =>
            event.systemPresence === 'OFFLINE' &&
            event.startTime &&
            event.endTime
        ).map(event => {
            const start = new Date(event.startTime);
            const end = new Date(event.endTime);
            const duration = end - start;
            return { event, duration };
        }).filter(item => item.duration < OFFLINE_THRESHOLD)
    );

    if (!disconnectEvents.length) return null;

    const durations = disconnectEvents.map(item => item.duration);

    return {
        count: durations.length,
        min: Math.min(...durations),
        max: Math.max(...durations),
        avg: durations.reduce((a, b) => a + b, 0) / durations.length
    };
};

// Consistent duration formatting
const formatDuration = (ms) => {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

function initializeTableSorting() {
    const headers = document.querySelectorAll('#agentsDisconnectionsTable th');
    let currentSortColumn = -1;
    let currentSortDirection = 'desc';

    headers.forEach((header, index) => {
        header.style.cursor = 'pointer';
        header.addEventListener('click', () => {
            if (currentSortColumn === index) {
                currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                currentSortColumn = index;
                currentSortDirection = 'desc';
            }

            // Remove existing arrows
            headers.forEach(h => h.textContent = h.textContent.replace(' ↑', '').replace(' ↓', ''));

            // Add arrow to current sort column
            header.textContent += currentSortDirection === 'asc' ? ' ↑' : ' ↓';

            // Sort the table
            sortAgentsTable(index, currentSortDirection);
        });
    });
}

function sortAgentsTable(columnIndex, direction) {
    const table = document.getElementById('agentsDisconnectionsTable');
    const tbody = table.querySelector('tbody');
    const rows = Array.from(tbody.querySelectorAll('tr'));

    // Sort the rows
    const sortedRows = rows.sort((rowA, rowB) => {
        const cellA = rowA.cells[columnIndex].textContent.trim();
        const cellB = rowB.cells[columnIndex].textContent.trim();

        // Handle different data types
        if (columnIndex === 0 || columnIndex === 1 || columnIndex === 2 || columnIndex === 3) {
            // Text columns: name, division, status, last login
            return direction === 'asc'
                ? cellA.localeCompare(cellB)
                : cellB.localeCompare(cellA);
        } else if (columnIndex === 7 || columnIndex === 12) {
            // Count columns: sessions, disconnects
            const numA = parseInt(cellA) || 0;
            const numB = parseInt(cellB) || 0;
            return direction === 'asc' ? numA - numB : numB - numA;
        } else {
            // Duration columns or numeric columns
            // Check if it's a duration format (HH:MM:SS)
            if (cellA.includes(':') && cellB.includes(':')) {
                const msA = convertDurationToMs(cellA);
                const msB = convertDurationToMs(cellB);
                return direction === 'asc' ? msA - msB : msB - msA;
            } else {
                // Regular numeric comparison
                const numA = parseFloat(cellA) || 0;
                const numB = parseFloat(cellB) || 0;
                return direction === 'asc' ? numA - numB : numB - numA;
            }
        }
    });

    // Re-append rows in the new order
    sortedRows.forEach(row => tbody.appendChild(row));
}

// Helper to convert HH:MM:SS to milliseconds
function convertDurationToMs(duration) {
    if (duration === 'N/A') return -1;
    const parts = duration.split(':');
    return (parseInt(parts[0]) * 3600000) +
        (parseInt(parts[1]) * 60000) +
        (parseInt(parts[2]) * 1000);
}

refreshButton.addEventListener('click', async () => {
    await initializeWithStoredToken();
    makeJourneyRequest();
});
