let token;

async function initializeWithStoredToken() {
    token = await getToken();
    if (token) {
        await fetchSmsChats();
    } else {
        console.error('No valid stored token found');
    }
}

function initializeDateControls() {
    const fromNowCheckbox = document.getElementById('fromNowCheckbox');
    const endDatePicker = document.getElementById('endDatePicker');

    fromNowCheckbox.addEventListener('change', function () {
        endDatePicker.disabled = this.checked;
        if (this.checked) {
            endDatePicker.value = '';
        }
    });

    endDatePicker.addEventListener('change', function () {
        fetchSmsChats();
    });

    endDatePicker.valueAsDate = new Date();
}

function getEndDate() {
    const fromNowCheckbox = document.getElementById('fromNowCheckbox');
    const endDatePicker = document.getElementById('endDatePicker');

    if (fromNowCheckbox.checked) {
        return new Date();
    } else {
        const selectedDate = new Date(endDatePicker.value);
        selectedDate.setHours(23, 59, 59, 999);
        return selectedDate;
    }
}

async function fetchSmsChats() {
    document.getElementById('loadingMessage').style.display = 'flex';
    document.getElementById('content').style.display = 'none';

    const timeframe = document.getElementById('timeframe').value;
    const endDate = getEndDate();
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

    try {
        const conversations = await fetchAllConversations(interval);
        const chatData = await processConversations(conversations);
        displaySmsSummary(chatData, startDate, endDate);
        displaySmsDetails(chatData);
    } catch (error) {
        console.error('Error fetching SMS chats:', error);
    } finally {
        document.getElementById('loadingMessage').style.display = 'none';
        document.getElementById('content').style.display = 'block';
    }
}

async function fetchAllConversations(interval) {
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
                interval: interval,
                order: "desc",
                orderBy: "conversationEnd",
                paging: {
                    pageSize: 100,
                    pageNumber: pageNumber
                },
                "segmentFilters": [
                    {
                        "type": "or",
                        "predicates": [
                            {
                                "dimension": "mediaType",
                                "value": "message"
                            }
                        ]
                    },
                    {
                        "type": "or",
                        "predicates": [
                            {
                                "type": "dimension",
                                "dimension": "messageType",
                                "value": "open"
                            }
                        ]
                    }
                ]
            })
        });

        const data = await handleApiRequest(makeRequest);
        allConversations = allConversations.concat(data.conversations);

        hasMore = data.conversations.length === 100;
        pageNumber++;
    }

    return allConversations;
}

async function throttleRequests(requests, maxRequestsPerSecond = 5) {
    const results = [];
    const batchSize = maxRequestsPerSecond;

    for (let i = 0; i < requests.length; i += batchSize) {
        const batch = requests.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map(async req => {
            try {
                return await req();
            } catch (error) {
                console.error('Error in throttled request:', error);
                return null;
            }
        }));
        results.push(...batchResults);

        if (i + batchSize < requests.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    return results.filter(result => result !== null);
}

async function processConversations(conversations) {
    window.lastFetchedChats = [];
    const requests = conversations.map(conversation => async () => {
        const makeRequest = () => fetch(`https://api.mypurecloud.com.au/api/v2/conversations/messages/${conversation.conversationId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        return handleApiRequest(makeRequest);
    });

    const chatDetails = await throttleRequests(requests);
    const processedChats = [];

    for (let i = 0; i < conversations.length; i++) {
        const conversation = conversations[i];
        const details = chatDetails[i];

        // Check if customer's senderNumber starts with '+614'
        const customerParticipant = details.participants.find(p => p.purpose === 'customer');
        if (!customerParticipant ||
            !customerParticipant.attributes ||
            !customerParticipant.attributes.senderNumber ||
            !customerParticipant.attributes.senderNumber.startsWith('+614')) {
            // Skip this conversation if it doesn't meet the criteria
            continue;
        }


        // Initialize counters for each status
        let sentCount = 0;
        let failedCount = 0;
        let deliveredCount = 0;

        // Process messages from non-customer participants
        details.participants
            .filter(p => p.purpose !== 'customer')
            .forEach(participant => {
                participant.messages.forEach(message => {
                    if (message.messageMetadata.type !== 'Event') {
                        if (message.messageStatus === 'sent') {
                            sentCount++;
                        } else if (message.messageStatus === 'delivery-failed') {
                            failedCount++;
                        } else if (message.messageStatus === 'delivery-success') {
                            deliveredCount++;
                        }
                    }
                });
            });

        const duration = new Date(conversation.conversationEnd) - new Date(conversation.conversationStart);
        const totalMessages = sentCount + failedCount + deliveredCount;

        // Calculate ratios
        const sentRatio = totalMessages > 0 ? (sentCount / totalMessages) * 100 : 0;
        const failedRatio = totalMessages > 0 ? (failedCount / totalMessages) * 100 : 0;
        const deliveredRatio = totalMessages > 0 ? (deliveredCount / totalMessages) * 100 : 0;

        processedChats.push({
            ...conversation,
            details: details,
            duration: duration,
            messagesSent: sentCount,
            messagesFailed: failedCount,
            messagesDelivered: deliveredCount,
            sentRatio: sentRatio,
            failedRatio: failedRatio,
            deliveredRatio: deliveredRatio
        });
    }

    return processedChats;
}


function displaySmsSummary(chats, startDate, endDate) {
    const tableBody = document.getElementById('smsSummaryBody');
    tableBody.innerHTML = '';

    const days = Math.ceil((endDate - startDate) / (24 * 60 * 60 * 1000));

    for (let i = 0; i <= days; i++) {
        const currentDate = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
        const nextDate = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000);

        const dayChats = chats.filter(chat =>
            new Date(chat.conversationStart) >= currentDate &&
            new Date(chat.conversationStart) < nextDate
        );

        if (dayChats.length > 0) {
            const totalSent = dayChats.reduce((sum, chat) => sum + chat.messagesSent, 0);
            const totalFailed = dayChats.reduce((sum, chat) => sum + chat.messagesFailed, 0);
            const totalDelivered = dayChats.reduce((sum, chat) => sum + chat.messagesDelivered, 0);
            const totalMessages = totalSent + totalFailed + totalDelivered;

            const totalInbound = dayChats.reduce((sum, chat) => {
                const customerParticipant = chat.details.participants.find(p => p.purpose === 'customer');
                if (!customerParticipant) return sum;
                return sum + customerParticipant.messages.filter(m => m.messageStatus === 'received').length;
            }, 0);

            // Calculate ratios
            const sentRatio = totalMessages > 0 ? (totalSent / totalMessages) * 100 : 0;
            const failedRatio = totalMessages > 0 ? (totalFailed / totalMessages) * 100 : 0;
            const deliveredRatio = totalMessages > 0 ? (totalDelivered / totalMessages) * 100 : 0;

            const row = tableBody.insertRow();
            row.insertCell().textContent = currentDate.toLocaleDateString();
            row.insertCell().textContent = dayChats.length;
            row.insertCell().textContent = totalMessages;
            row.insertCell().textContent = totalInbound;
            row.insertCell().textContent = totalSent;
            row.insertCell().textContent = totalFailed;
            row.insertCell().textContent = totalDelivered;
            row.insertCell().textContent = sentRatio.toFixed(2) + '%';
            row.insertCell().textContent = failedRatio.toFixed(2) + '%';
            row.insertCell().textContent = deliveredRatio.toFixed(2) + '%';
        }
    }
}


function displaySmsDetails(chats) {
    const tableBody = document.getElementById('smsDetailsBody');
    tableBody.innerHTML = '';

    // Store chats for sorting
    window.lastFetchedChats = chats;

    chats.forEach(chat => {
        const row = tableBody.insertRow();

        row.insertCell().textContent = new Date(chat.conversationStart).toLocaleString();
        row.insertCell().textContent = chat.conversationId;
        row.insertCell().textContent = chat.externalTag || 'N/A';
        row.insertCell().textContent = chat.participants
            .filter(p => p.purpose === 'agent' && p.sessions.some(s => s.segments.some(seg => seg.segmentType === 'interact')))
            .map(p => p.participantName)
            .join(', ');
        row.insertCell().textContent = formatDuration(chat.duration);

        const inboundCell = row.insertCell();
        const customerParticipant = chat.details.participants.find(p => p.purpose === 'customer');
        const inboundCount = customerParticipant ?
            customerParticipant.messages.filter(m => m.messageStatus === 'received').length : 0;
        inboundCell.textContent = inboundCount;

        row.insertCell().textContent = chat.messagesSent;
        row.insertCell().textContent = chat.messagesFailed;
        row.insertCell().textContent = chat.messagesDelivered;
        row.insertCell().textContent = chat.sentRatio.toFixed(2) + '%';
        row.insertCell().textContent = chat.failedRatio.toFixed(2) + '%';
        row.insertCell().textContent = chat.deliveredRatio.toFixed(2) + '%';

        const transcriptCell = row.insertCell();
        const transcriptLink = document.createElement('a');
        transcriptLink.textContent = 'Transcript';
        transcriptLink.href = `../SupervisorAssistant/CustomMonitoring.html?conversationId=${chat.conversationId}`;
        transcriptLink.target = '_blank';
        transcriptLink.rel = 'noopener noreferrer';
        transcriptCell.appendChild(transcriptLink);
    });
}



let currentSortColumn = 0; // Default to first column (date)
let currentSortDirection = 'desc'; // Default to descending

function sortChats(chats, columnIndex) {
    return [...chats].sort((a, b) => {
        let valueA, valueB;
        switch (columnIndex) {
            case 0: // chatStartDate
                valueA = new Date(a.conversationStart);
                valueB = new Date(b.conversationStart);
                break;
            case 1: // conversationId
                valueA = a.conversationId;
                valueB = b.conversationId;
                break;
            case 2: // externalTag
                valueA = a.externalTag || 'N/A';
                valueB = b.externalTag || 'N/A';
                break;
            case 3: // interactingUsers
                valueA = a.participants
                    .filter(p => p.purpose === 'agent' && p.sessions.some(s => s.segments.some(seg => seg.segmentType === 'interact')))
                    .map(p => p.participantName)
                    .join(', ');
                valueB = b.participants
                    .filter(p => p.purpose === 'agent' && p.sessions.some(s => s.segments.some(seg => seg.segmentType === 'interact')))
                    .map(p => p.participantName)
                    .join(', ');
                break;
            case 4: // duration
                valueA = a.duration;
                valueB = b.duration;
                break;
            case 5: // inbound
                const customerParticipantA = a.details.participants.find(p => p.purpose === 'customer');
                const customerParticipantB = b.details.participants.find(p => p.purpose === 'customer');
                valueA = customerParticipantA ?
                    customerParticipantA.messages.filter(m => m.messageStatus === 'received').length : 0;
                valueB = customerParticipantB ?
                    customerParticipantB.messages.filter(m => m.messageStatus === 'received').length : 0;
                break;

            case 6: // messagesSent
                valueA = a.messagesSent;
                valueB = b.messagesSent;
                break;
            case 7: // messagesFailed
                valueA = a.messagesFailed;
                valueB = b.messagesFailed;
                break;
            case 8: // messagesDelivered
                valueA = a.messagesDelivered;
                valueB = b.messagesDelivered;
                break;
            case 9: // successRate
                valueA = a.successRate;
                valueB = b.successRate;
                break;
            default:
                return 0;
        }

        if (valueA < valueB) return currentSortDirection === 'desc' ? 1 : -1;
        if (valueA > valueB) return currentSortDirection === 'desc' ? -1 : 1;
        return 0;
    });
}



function formatDuration(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    return `${hours.toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

function initializeTableHeaders() {
    // Get headers from the SMS Details table
    const headers = document.querySelectorAll('table:nth-of-type(2) th');

    headers.forEach((header, index) => {
        if (index < headers.length - 1) { // Skip the last column (transcript)
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

                // Re-display the sorted data
                if (window.lastFetchedChats) {
                    displaySmsDetails(sortChats(window.lastFetchedChats, index));
                }
            });
        }
    });
}

document.getElementById('downloadFailedIds').addEventListener('click', function () {
    const failedMessages = Array.from(document.getElementById('smsDetailsBody').getElementsByTagName('tr'))
        .filter(row => {
            const failedMessages = parseInt(row.children[5].textContent) + parseInt(row.children[6].textContent); // Updated index to match new column position
            return failedMessages > 0;
        })
        .flatMap(row => {
            const conversationId = row.children[1].textContent;
            // Get the chat from our stored data to find failed message IDs
            const chat = window.lastFetchedChats.find(c => c.conversationId === conversationId);
            if (!chat) return [];
            const chatStartDate = new Date(chat.conversationStart).toLocaleString().replace(',', '');

            const customerParticipant = chat.details.participants.find(p => p.purpose === 'customer');
            const recipient = '"' + customerParticipant?.attributes?.senderNumber + '"' || 'N/A';

            return chat.details.participants
                .filter(p => p.purpose !== 'customer')
                .flatMap(p => p.messages
                    .filter(m => m.messageStatus === 'delivery-failed' || m.messageStatus === 'sent')
                    .map(m => [
                        chatStartDate,
                        conversationId,
                        m.messageId,
                        recipient,
                        m.messageStatus,
                        m.errorInfo?.messageWithParams || 'N/A'
                    ].join(','))
                );
        });

    if (failedMessages.length === 0) {
        alert('No failed messages found in the current timeframe.');
        return;
    }

    // const csvContent = 'Chat Start Date,Conversation ID,Failed Message ID,Message Status,Error Message\n' + failedMessages.join('\n');
    const csvContent = 'Chat Start Date,Conversation ID,Failed Message ID, Recipient Number,Message Status,Error Message\n' + failedMessages.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'failed_sms_ids.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});

document.addEventListener('DOMContentLoaded', () => {
    initializeWithStoredToken();
    initializeDateControls();
    initializeTableHeaders();
    document.getElementById('timeframe').addEventListener('change', fetchSmsChats);
});