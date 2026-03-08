let token;
let allDroppedCalls = [];
let queueMap = {};
let userMap = {};
let centreMap = {};
let managedDevicesMap = {};
let signInData = [];
let deviceDataEnriched = false;

// Zscaler IP ranges
const zscalerRanges = [
    { cidr: '147.161.212.0/23', start: ipToInt('147.161.212.0'), end: ipToInt('147.161.213.255') },
    { cidr: '147.161.214.0/23', start: ipToInt('147.161.214.0'), end: ipToInt('147.161.215.255') },
    { cidr: '147.161.218.0/23', start: ipToInt('147.161.218.0'), end: ipToInt('147.161.219.255') },
    { cidr: '165.225.114.0/23', start: ipToInt('165.225.114.0'), end: ipToInt('165.225.115.255') },
    { cidr: '165.225.226.0/23', start: ipToInt('165.225.226.0'), end: ipToInt('165.225.227.255') },
    { cidr: '165.225.232.0/23', start: ipToInt('165.225.232.0'), end: ipToInt('165.225.233.255') },
    { cidr: '167.103.100.0/23', start: ipToInt('167.103.100.0'), end: ipToInt('167.103.101.255') },
    { cidr: '167.103.102.0/23', start: ipToInt('167.103.102.0'), end: ipToInt('167.103.103.255') },
    { cidr: '167.103.104.0/23', start: ipToInt('167.103.104.0'), end: ipToInt('167.103.105.255') },
    { cidr: '167.103.106.0/23', start: ipToInt('167.103.106.0'), end: ipToInt('167.103.107.255') },
    { cidr: '167.103.130.0/23', start: ipToInt('167.103.130.0'), end: ipToInt('167.103.131.255') },
    { cidr: '167.103.214.0/23', start: ipToInt('167.103.214.0'), end: ipToInt('167.103.215.255') },
    { cidr: '167.103.248.0/23', start: ipToInt('167.103.248.0'), end: ipToInt('167.103.249.255') },
    { cidr: '167.103.250.0/23', start: ipToInt('167.103.250.0'), end: ipToInt('167.103.251.255') },
    { cidr: '167.103.252.0/23', start: ipToInt('167.103.252.0'), end: ipToInt('167.103.253.255') },
    { cidr: '167.103.254.0/23', start: ipToInt('167.103.254.0'), end: ipToInt('167.103.255.255') },
    { cidr: '167.103.80.0/23', start: ipToInt('167.103.80.0'), end: ipToInt('167.103.81.255') },
    { cidr: '167.103.82.0/23', start: ipToInt('167.103.82.0'), end: ipToInt('167.103.83.255') },
    { cidr: '167.103.98.0/23', start: ipToInt('167.103.98.0'), end: ipToInt('167.103.99.255') },
    { cidr: '101.2.212.0/23', start: ipToInt('101.2.212.0'), end: ipToInt('101.2.213.255') }
];

function ipToInt(ip) {
    return ip.split('.').reduce((int, oct) => (int << 8) + parseInt(oct, 10), 0) >>> 0;
}

function isZscalerIP(ip) {
    if (ip.includes(':')) return false;
    const ipInt = ipToInt(ip);
    return zscalerRanges.some(range => ipInt >= range.start && ipInt <= range.end);
}

function formatDateTimeAU(dateString) {
    if (!dateString || dateString === 'N/A') return 'N/A';

    const date = new Date(dateString);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');

    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

async function initializeWithStoredToken() {
    token = await getToken();
    if (token) {
        await loadQueues();
        await loadStaticData();
        initializeDateControls();
        await fetchDroppedCalls();
    } else {
        console.error('No valid stored token found');
    }
}

function initializeDateControls() {
    const fromTodayCheckbox = document.getElementById('fromTodayCheckbox');
    const endDatePicker = document.getElementById('endDatePicker');

    fromTodayCheckbox.addEventListener('change', function () {
        endDatePicker.disabled = this.checked;
        if (this.checked) {
            endDatePicker.value = '';
        }
    });

    endDatePicker.addEventListener('change', function () {
        fetchDroppedCalls();
    });

    endDatePicker.valueAsDate = new Date();
}

async function handleApiRequest(makeRequest) {
    let retries = 3;
    while (retries > 0) {
        try {
            const response = await makeRequest();
            if (response.status === 429) {
                const retryAfter = response.headers.get('Retry-After') || 1;
                await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                retries--;
                continue;
            }
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            retries--;
            if (retries === 0) throw error;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

async function loadQueues() {
    let pageNumber = 1;
    let hasMore = true;

    while (hasMore) {
        const makeRequest = () => fetch(`https://api.mypurecloud.com.au/api/v2/routing/queues?pageSize=100&pageNumber=${pageNumber}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await handleApiRequest(makeRequest);

        data.entities.forEach(queue => {
            queueMap[queue.id] = queue.name;
        });

        hasMore = data.entities.length === 100;
        pageNumber++;
    }
}

async function loadStaticData() {
    try {
        const centreResponse = await fetch('centre-pcs.csv');
        const centreText = await centreResponse.text();
        parseCentreCSV(centreText);

        const devicesResponse = await fetch('managed-pcs.csv');
        const devicesText = await devicesResponse.text();
        parseManagedDevicesCSV(devicesText);

        console.log('Static data loaded successfully');
    } catch (error) {
        console.error('Error loading static data:', error);
    }
}

function parseCentreCSV(csvText) {
    const lines = csvText.split('\n');
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const values = parseCSVLine(line);
        if (values.length >= 4) {
            const publicIP = values[3];
            const centre = values[7];
            if (publicIP && centre) {
                centreMap[publicIP] = centre;
            }
        }
    }
}

function parseManagedDevicesCSV(csvText) {
    const lines = csvText.split('\n');
    const headers = parseCSVLine(lines[0]);

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const values = parseCSVLine(line);
        if (values.length >= headers.length) {
            const deviceId = values[4];
            const deviceName = values[1];
            const os = values[10] + " [" + values[38] + " " + values[5] + "]";
            const ipAddress = values[29];

            if (deviceId) {
                managedDevicesMap[deviceId] = {
                    deviceName: deviceName || 'Unknown',
                    os: os || 'Unknown',
                    ipAddress: ipAddress || 'Unknown',
                    managed: true
                };
            }
        }
    }
}

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());

    return result;
}

async function getUserDetails(userId) {
    if (userMap[userId]) {
        return userMap[userId];
    }

    const makeRequest = () => fetch(`https://api.mypurecloud.com.au/api/v2/users/${userId}`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    try {
        const data = await handleApiRequest(makeRequest);
        userMap[userId] = data.email || 'Unknown';
        return userMap[userId];
    } catch (error) {
        console.error(`Error fetching user ${userId}:`, error);
        userMap[userId] = 'Unknown';
        return 'Unknown';
    }
}

function getTimeRange() {
    const timeframe = document.getElementById('timeframe').value;
    const fromTodayCheckbox = document.getElementById('fromTodayCheckbox');
    const endDatePicker = document.getElementById('endDatePicker');

    let endDate;
    if (fromTodayCheckbox.checked) {
        endDate = new Date();
    } else {
        endDate = new Date(endDatePicker.value);
        endDate.setHours(23, 59, 59, 999);
    }

    let startDate;

    switch (timeframe) {
        case 'current-day':
            startDate = new Date(endDate);
            startDate.setHours(0, 0, 0, 0);
            break;
        case '24hours':
            startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
            break;
        case '72hours':
            startDate = new Date(endDate.getTime() - 72 * 60 * 60 * 1000);
            break;
        case '7days':
            startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
        default:
            startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
    }

    return `${startDate.toISOString()}/${endDate.toISOString()}`;
}

async function fetchDroppedCalls() {
    document.getElementById('loadingMessage').style.display = 'flex';
    document.getElementById('content').style.display = 'none';
    try {
        const interval = getTimeRange();
        const [events, conversations] = await Promise.all([
            fetchAllDroppedCallEvents(interval),
            fetchAllDroppedCallConversations(interval)
        ]);
        console.log(`Fetched ${events.length} events and ${conversations.length} conversations`);
        const droppedCallsFromEvents = await processDroppedCallEvents(events);
        const droppedCallsFromConversations = await processDroppedCallConversations(conversations);
        console.log(`Processed ${droppedCallsFromEvents.length} calls from events and ${droppedCallsFromConversations.length} from conversations`);
        const combinedCalls = combineDroppedCalls(droppedCallsFromEvents, droppedCallsFromConversations);
        console.log(`Total unique dropped calls: ${combinedCalls.length}`);
        allDroppedCalls = combinedCalls;
        await generateSummaryStats(interval, combinedCalls);
        if (signInData.length > 0) enrichCallsWithDeviceData();
        else displayDroppedCalls(combinedCalls);
    } catch (error) {
        console.error('Error fetching dropped calls:', error);
        alert('Error fetching dropped calls. Please check console for details.');
    } finally {
        document.getElementById('loadingMessage').style.display = 'none';
        document.getElementById('content').style.display = 'block';
    }
}

function combineDroppedCalls(callsFromEvents, callsFromConversations) {
    const callsMap = new Map();
    callsFromEvents.forEach(call => callsMap.set(call.conversationId, call));
    callsFromConversations.forEach(call => {
        if (!callsMap.has(call.conversationId)) callsMap.set(call.conversationId, call);
    });
    
    const callsArray = Array.from(callsMap.values());
    callsArray.sort((a, b) => new Date(b.disconnectTime).getTime() - new Date(a.disconnectTime).getTime());
    return callsArray;
}

async function fetchAllDroppedCallEvents(interval) {
    let allEvents = [];
    let currentInterval = interval;
    let hasMore = true;

    while (hasMore) {
        const makeRequest = () => fetch('https://api.mypurecloud.com.au/api/v2/usage/events/query?pageSize=200', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                interval: currentInterval,
                eventDefinitionIds: [
                    "TELEPHONY-0010",
                    "TELEPHONY-0012"
                ],
                sortOrder: "DESC"
            })
        });

        const data = await handleApiRequest(makeRequest);
        allEvents = allEvents.concat(data.entities);

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

    return allEvents;
}

async function fetchAllDroppedCallConversations(interval) {
    let allConversations = [];
    let pageNumber = 1;
    let hasMore = true;

    while (hasMore) {
        const makeRequest = () => fetch('https://api.mypurecloud.com.au/api/v2/analytics/conversations/details/query', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
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
            })
        });

        const data = await handleApiRequest(makeRequest);
        allConversations = (data.totalHits === 0) ? [] : allConversations.concat(data.conversations);

        // Check if there are more pages
        hasMore = data?.conversations?.length === 50;
        pageNumber++;

        // Add delay to avoid rate limiting
        if (hasMore) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    return allConversations;
}

async function fetchAnsweredCallsCount(interval, purpose = 'all') {
    const segmentFilters = [
        {
            type: "or",
            predicates: [
                { dimension: "mediaType", value: "voice" }
            ]
        },
        {
            type: "or",
            predicates: [
                { dimension: "direction", value: "inbound" },
                { dimension: "direction", value: "outbound" }
            ]
        }
    ];

    // Add purpose filter based on parameter
    if (purpose === 'external') {
        segmentFilters.push({
            type: "or",
            clauses: [
                {
                    type: "and",
                    predicates: [
                        {
                            dimension: "purpose",
                            operator: "matches",
                            value: "acd"
                        }
                    ]
                }
            ]
        });
    }
    if (purpose === 'monitored') {
        segmentFilters.push({
            type: "or",
            clauses: [
                {
                    type: "and",
                    predicates: [
                        {
                            type: "dimension",
                            dimension: "monitoredParticipantId",
                            operator: "exists"
                        }
                    ]
                }
            ]
        });
    }

    const makeRequest = () => fetch('https://api.mypurecloud.com.au/api/v2/analytics/conversations/details/query', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            order: "desc",
            orderBy: "conversationStart",
            paging: {
                pageSize: 1,
                pageNumber: 1
            },
            interval: interval,
            segmentFilters: segmentFilters,
            conversationFilters: [
                {
                    type: "or",
                    predicates: [
                        {
                            metric: "tTalk",
                            range: {
                                gt: 0,
                                lte: 84600000
                            }
                        }
                    ]
                }
            ],
            evaluationFilters: [],
            surveyFilters: []
        })
    });

    const data = await handleApiRequest(makeRequest);
    return data.totalHits || 0;
}

async function generateSummaryStats(interval, droppedCallsData) {
    const summaryBody = document.getElementById('summaryBody');
    summaryBody.innerHTML = '';

    const externalCalls = droppedCallsData.filter(call =>
        call.actorType === 'Active in Call' && call.queueName !== 'No Queue'
    );
    const internalCalls = droppedCallsData.filter(call =>
        call.actorType === 'Active in Call' && call.queueName === 'No Queue'
    );
    const monitoringCalls = droppedCallsData.filter(call =>
        call.actorType === 'Monitoring Call'
    );

    // Fetch answered calls counts
    const totalAnswered = await fetchAnsweredCallsCount(interval, 'all');
    const totalMonitored = await fetchAnsweredCallsCount(interval, 'monitored');
    const externalAnswered = await fetchAnsweredCallsCount(interval, 'external');
    const internalAnswered = totalAnswered - externalAnswered;

    // Calculate percentages
    const externalPercent = externalAnswered > 0 ? ((externalCalls.length / externalAnswered) * 100).toFixed(2) : '0.00';
    const internalPercent = internalAnswered > 0 ? ((internalCalls.length / internalAnswered) * 100).toFixed(2) : '0.00';
    const monitoringPercent = totalAnswered > 0 ? ((monitoringCalls.length / totalMonitored) * 100).toFixed(2) : '0.00';

    const totalDropped = externalCalls.length + internalCalls.length + monitoringCalls.length;
    const dropsPer1000 = totalAnswered > 0 ? ((totalDropped / totalAnswered) * 1000).toFixed(2) : '0.00';

    // Add rows
    addSummaryRow(summaryBody, 'Total Answered Calls', totalAnswered.toLocaleString(), '');
    addSummaryRow(summaryBody, 'Dropped External Calls', `${externalCalls.length} out of ${externalAnswered.toLocaleString()}`, `${externalPercent}%`);
    addSummaryRow(summaryBody, 'Dropped Internal Calls', `${internalCalls.length} out of ${internalAnswered.toLocaleString()}`, `${internalPercent}%`);
    addSummaryRow(summaryBody, 'Monitoring Dropped Calls', `${monitoringCalls.length} out of ${totalMonitored.toLocaleString()}`, `${monitoringPercent}%`);
    addSummaryRow(summaryBody, 'Total Dropped Calls', totalDropped.toString(), '');
    addSummaryRow(summaryBody, 'Drops per 1000 Calls', dropsPer1000, '');
}

function addSummaryRow(tbody, metric, count, percentage) {
    const row = tbody.insertRow();
    row.insertCell().textContent = metric;
    row.insertCell().textContent = count;
    row.insertCell().textContent = percentage;
}

async function processDroppedCallEvents(events) {
    const droppedCalls = [];

    for (let i = 0; i < events.length; i += 5) {
        const batch = events.slice(i, i + 5);
        const batchPromises = batch.map(event => processDroppedCallEvent(event));
        const batchResults = await Promise.all(batchPromises);
        droppedCalls.push(...batchResults.filter(result => result !== null));

        if (i + 5 < events.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    return droppedCalls;
}

async function processDroppedCallConversations(conversations) {
    const droppedCalls = [];
    
    // Process in batches of 5 to avoid rate limiting
    for (let i = 0; i < conversations.length; i += 5) {
        const batch = conversations.slice(i, i + 5);
        const batchPromises = conversations.length > 0 ? batch.map(conversation => processDroppedCallEvent({ conversation: { id: conversation.conversationId } })) : [];
        const batchResults = await Promise.all(batchPromises);
        droppedCalls.push(...batchResults.filter(result => result !== null));
        
        // Add delay between batches
        if (i + 5 < conversations.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    return droppedCalls;
}

async function processDroppedCallEvent(event) {
    try {
        const conversationId = event.conversation.id;

        const makeRequest = () => fetch(`https://api.mypurecloud.com.au/api/v2/conversations/calls/${conversationId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const conversationData = await handleApiRequest(makeRequest);

        const customerParticipant = conversationData.participants.find(p => p.purpose === 'customer');
        const queueId = customerParticipant?.queue?.id;
        const queueName = queueId ? queueMap[queueId] || 'Unknown Queue' : 'No Queue';

        let hasRecording = false;
        if (queueId && customerParticipant?.direction === 'inbound') {
            const recordingStatus = customerParticipant.attributes?.['Recording Status'];
            hasRecording = recordingStatus !== 'Opt Out';
        }

        const errorParticipant = conversationData.participants.find(p => p.disconnectType === 'error');

        if (!errorParticipant) {
            return null;
        }

        const userId = errorParticipant.user?.id;
        const userName = userId ? await getUserDetails(userId) : 'Unknown User';

        const actorType = errorParticipant.mediaRoles?.includes('full') ? 'Active in Call' :
            errorParticipant.mediaRoles?.includes('monitor') ? 'Monitoring Call' :
                'Unknown';

        const errorInfo = errorParticipant.errorInfo?.message || 'No error message';

        // Determine call type
        const callType = queueName === 'No Queue' ? 'Internal' : 'External';

        return {
            conversationId,
            queueName,
            callType,
            recording: hasRecording ? 'true' : 'false',
            link: `https://apps.mypurecloud.com.au/directory/#/analytics/interactions/${conversationId}/admin/timeline?tabId=a0dc12af-86ea-4390-a564-e2bfbd7afdea`,
            userName,
            answerTime: errorParticipant.connectedTime || null,
            disconnectTime: errorParticipant.endTime || null,
            answerTimeDisplay: errorParticipant.connectedTime ? formatDateTimeAU(errorParticipant.connectedTime) : 'N/A',
            disconnectTimeDisplay: errorParticipant.endTime ? formatDateTimeAU(errorParticipant.endTime) : 'N/A',
            actorType,
            errorInfo,
            userEmail: userName,
            deviceName: null,
            managedStatus: null,
            ipAddress: null,
            os: null,
            centre: null,
            zscaler: null
        };
    } catch (error) {
        console.error(`Error processing event for conversation ${event.conversation.id}:`, error);
        return null;
    }
}

function displayDroppedCalls(calls) {
    const tableBody = document.getElementById('droppedCallsBody');
    tableBody.innerHTML = '';

    calls.forEach(call => {
        const row = tableBody.insertRow();

        row.insertCell().textContent = call.conversationId;
        row.insertCell().textContent = call.queueName;
        row.insertCell().textContent = call.callType;
        row.insertCell().textContent = call.recording;

        const linkCell = row.insertCell();
        const link = document.createElement('a');
        link.textContent = 'View';
        link.href = call.link;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        linkCell.appendChild(link);

        const userNameCell = row.insertCell();
        const displayName = call.userName.includes('@')
            ? call.userName.split('@')[0]
            : call.userName;
        userNameCell.textContent = displayName;

        row.insertCell().textContent = call.answerTimeDisplay;
        row.insertCell().textContent = call.disconnectTimeDisplay;
        row.insertCell().textContent = call.actorType;
        row.insertCell().textContent = call.errorInfo;

        const deviceNameCell = row.insertCell();
        deviceNameCell.className = 'device-column';
        deviceNameCell.textContent = call.deviceName || '';
        if (!deviceDataEnriched) deviceNameCell.classList.add('hidden');

        const managedCell = row.insertCell();
        managedCell.className = 'device-column';
        managedCell.textContent = call.managedStatus || '';
        if (!deviceDataEnriched) managedCell.classList.add('hidden');

        const ipCell = row.insertCell();
        ipCell.className = 'device-column';
        ipCell.textContent = call.ipAddress || '';
        if (!deviceDataEnriched) ipCell.classList.add('hidden');

        const osCell = row.insertCell();
        osCell.className = 'device-column';
        osCell.textContent = call.os || '';
        if (!deviceDataEnriched) osCell.classList.add('hidden');

        const centreCell = row.insertCell();
        centreCell.className = 'device-column';
        centreCell.textContent = call.centre || '';
        if (!deviceDataEnriched) centreCell.classList.add('hidden');

        const zscalerCell = row.insertCell();
        zscalerCell.className = 'device-column';
        zscalerCell.textContent = call.zscaler !== null ? (call.zscaler ? 'true' : 'false') : '';
        if (!deviceDataEnriched) zscalerCell.classList.add('hidden');
    });
}

function filterTable() {
    const searchValue = document.getElementById('searchBox').value.toLowerCase();
    const filteredCalls = allDroppedCalls.filter(call => {
        return Object.values(call).some(value =>
            String(value).toLowerCase().includes(searchValue)
        );
    });
    displayDroppedCalls(filteredCalls);
}

function enrichCallsWithDeviceData() {
    if (!allDroppedCalls || allDroppedCalls.length === 0) {
        console.warn('No dropped calls data to enrich');
        return;
    }

    allDroppedCalls.forEach(call => {
        const disconnectTime = new Date(call.disconnectTime);

        const matchingSignIn = signInData.find(signIn =>
            signIn.username.toLowerCase() === call.userEmail.toLowerCase() &&
            signIn.date <= disconnectTime
        );

        if (matchingSignIn) {
            let deviceInfo = null;
            if (matchingSignIn.deviceId && managedDevicesMap[matchingSignIn.deviceId]) {
                deviceInfo = managedDevicesMap[matchingSignIn.deviceId];
            }

            call.deviceName = deviceInfo?.deviceName || 'Unknown';
            call.managedStatus = deviceInfo?.managed ? 'Managed' : (matchingSignIn.managed === 'true' ? 'Managed' : 'Unmanaged');
            call.ipAddress = matchingSignIn.ipAddress || 'Unknown';
            call.os = deviceInfo?.os || matchingSignIn.os || 'Unknown';
            call.centre = centreMap[matchingSignIn.ipAddress] || 'Not Mapped';
            call.zscaler = isZscalerIP(matchingSignIn.ipAddress);
        } else {
            call.deviceName = 'No Sign-In Found';
            call.managedStatus = 'Unknown';
            call.ipAddress = 'Unknown';
            call.os = 'Unknown';
            call.centre = 'Unknown';
            call.zscaler = false;
        }
    });

    deviceDataEnriched = true;

    document.querySelectorAll('.device-column').forEach(col => {
        col.classList.remove('hidden');
    });

    displayDroppedCalls(allDroppedCalls);
}

function handleSignInUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        const csvText = e.target.result;
        parseSignInCSV(csvText);
        enrichCallsWithDeviceData();

        document.getElementById('uploadStatus').textContent = `? Loaded ${signInData.length} sign-in records`;
    };
    reader.readAsText(file);
}

function parseSignInCSV(csvText) {
    signInData = [];
    const lines = csvText.split('\n');
    const headers = parseCSVLine(lines[0]);

    // Find column indices
    const dateIndex = headers.findIndex(h => h.includes('Date'));
    const usernameIndex = headers.findIndex(h => h.includes('Username'));
    const ipIndex = headers.findIndex(h => h.includes('IP address') && !h.includes('seen by'));
    const deviceIdIndex = headers.findIndex(h => h.includes('Device ID'));
    const osIndex = headers.findIndex(h => h.includes('Operating System'));
    const managedIndex = headers.findIndex(h => h.includes('Managed'));

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const values = parseCSVLine(line);
        if (values.length > Math.max(dateIndex, usernameIndex, ipIndex, deviceIdIndex, osIndex, managedIndex)) {
            signInData.push({
                date: new Date(values[dateIndex]),
                username: values[usernameIndex],
                ipAddress: values[ipIndex],
                deviceId: values[deviceIdIndex],
                os: values[osIndex],
                managed: values[managedIndex]
            });
        }
    }

    // Sort by date descending for faster lookup
    signInData.sort((a, b) => b.date - a.date);
}

function downloadCSV() {
    if (!allDroppedCalls || allDroppedCalls.length === 0) {
        alert('No data to download');
        return;
    }

    const headers = [
        'Conversation ID',
        'Queue Name',
        'Call Type',
        'Recording',
        'Link',
        'User Name',
        'Answer Time',
        'Disconnect Time',
        'Actor Type',
        'Error Info'
    ];

    if (deviceDataEnriched) {
        headers.push('Device Name', 'Managed/Unmanaged', 'IP Address', 'Model [OS]', 'Centre', 'Zscaler');
    }

    const rows = allDroppedCalls.map(call => {
        const displayName = call.userName.includes('@')
            ? call.userName.split('@')[0]
            : call.userName;

        const row = [
            call.conversationId,
            call.queueName,
            call.callType,
            call.recording,
            call.link,
            displayName,
            call.answerTimeDisplay,
            call.disconnectTimeDisplay,
            call.actorType,
            `"${call.errorInfo.replace(/"/g, '""')}"`
        ];

        if (deviceDataEnriched) {
            row.push(
                call.deviceName || '',
                call.managedStatus || '',
                call.ipAddress || '',
                call.os || '',
                call.centre || '',
                call.zscaler !== null ? (call.zscaler ? 'true' : 'false') : ''
            );
        }

        return row.join(',');
    });

    // Combine headers and rows
    const csvContent = [headers.join(','), ...rows].join('\n');

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `dropped_calls_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

document.addEventListener('DOMContentLoaded', () => {
    initializeWithStoredToken();

    document.getElementById('refreshButton').addEventListener('click', fetchDroppedCalls);
    document.getElementById('timeframe').addEventListener('change', fetchDroppedCalls);
    document.getElementById('searchBox').addEventListener('input', filterTable);
    document.getElementById('signInUpload').addEventListener('change', handleSignInUpload);
    document.getElementById('downloadCSV').addEventListener('click', downloadCSV);
});