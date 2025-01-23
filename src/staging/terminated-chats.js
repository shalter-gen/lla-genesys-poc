let token;

async function initializeWithStoredToken() {
    token = await getToken();
    if (token) {
        await fetchTerminatedChats();
        // hideLoading();
    } else {
        console.error('No valid stored token found');
    }
}

function initializeDateControls() {
    const fromNowCheckbox = document.getElementById('fromNowCheckbox');
    const endDatePicker = document.getElementById('endDatePicker');

    fromNowCheckbox.addEventListener('change', function() {
        endDatePicker.disabled = this.checked;
        if (this.checked) {
            endDatePicker.value = '';
        }
    });

    endDatePicker.addEventListener('change', function() {
        fetchTerminatedChats();
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

async function fetchTerminatedChats() {
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
        displayTerminatedChats(chatData, startDate, endDate);
        displayUnattendedChatsSummary(chatData.unattendedChats);
    } catch (error) {
        console.error('Error fetching terminated chats:', error);
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
                          "value": "webmessaging"
                        }
                      ]
                    },
                    {
                      "type": "or",
                      "clauses": [
                        {
                          "type": "and",
                          "predicates": [
                            {
                              "dimension": "purpose",
                              "operator": "matches",
                              "value": "acd"
                            }
                          ]
                        }
                      ]
                    }
                  ],
                  "conversationFilters": [
                    {
                      "type": "and",
                      "predicates": [
                        {
                          "type": "metric",
                          "metric": "tAnswered",
                          "operator": "exists"
                        }
                      ]
                    },
                    {
                      "type": "and",
                      "predicates": [
                        {
                          "type": "dimension",
                          "dimension": "conversationEnd",
                          "operator": "exists"
                        }
                      ]
                    }
                  ],
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
                return null; // or handle the error as appropriate for your use case
            }
        }));
        results.push(...batchResults);

        if (i + batchSize < requests.length) {
            // Wait 1 second before next batch
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    return results.filter(result => result !== null);
}

async function processConversations(conversations) {
    const chatData = {
        attendedChats: [],
        unattendedChats: []
    };

    const requests = conversations.map(conversation => async () => {
        const makeRequest = () => fetch(`https://api.mypurecloud.com.au/api/v2/conversations/messages/${conversation.conversationId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        return handleApiRequest(makeRequest);
    });
    const chatDetails = await throttleRequests(requests);

    for (let i = 0; i < conversations.length; i++) {
        const conversation = conversations[i];
        const details = chatDetails[i];
        const isUnattended = details.participants.some(p => 
            p.name !== "LLA_DigitalSurvey PROD" &&
            p.name !== "LLA_DigitalSurvey DEV" &&
            p.name !== "LLA_DigitalSurvey STG" &&
            p.name !== "LLA_DigitalSurvey Training" &&
            p.purpose !== "customer" && 
            p.purpose !== "agent" && 
            // p.messages.some(m => m.messageStatus === "delivery-failed" && m.messageMetadata.type !== 'Event')
            p.messages.filter(m => m.messageStatus === "delivery-failed" && m.messageMetadata.type !== 'Event').length >= 4
        );

        if (isUnattended) {
            // chatData.unattendedChats.push(conversation);
            const duration = new Date(conversation.conversationEnd) - new Date(conversation.conversationStart);
            
            const acdParticipant = conversation.participants.find(p => p.purpose === 'acd');
            const timeInQueue = acdParticipant ? 
                new Date(acdParticipant.sessions[0].segments[0].segmentEnd) - new Date(acdParticipant.sessions[0].segments[0].segmentStart) : 
                0;

            const unattendedBotMessages = details.participants
                .filter(p => 
                    p.name !== "LLA_DigitalSurvey PROD" &&
                    p.name !== "LLA_DigitalSurvey DEV" &&
                    p.name !== "LLA_DigitalSurvey STG" &&
                    p.name !== "LLA_DigitalSurvey Training" &&
                    p.purpose !== "customer" && 
                    p.purpose !== "agent"
                )
                .flatMap(p => p.messages.filter(m => m.messageStatus === "delivery-failed" && m.messageMetadata.type !== 'Event'));
            const unattendedBotTime = unattendedBotMessages.length >= 2 ?
                new Date(Math.max(...unattendedBotMessages.map(m => new Date(m.messageTime)))) -
                new Date(Math.min(...unattendedBotMessages.map(m => new Date(m.messageTime)))) :
                0;

            const unattendedAgentMessages = details.participants
                .filter(p => 
                    p.purpose === "agent"
                )
                .flatMap(p => p.messages.filter(m => m.messageStatus === "delivery-failed"));
            const unattendedAgentTime = unattendedAgentMessages.length >= 2 ?
                new Date(Math.max(...unattendedAgentMessages.map(m => new Date(m.messageTime)))) -
                new Date(Math.min(...unattendedAgentMessages.map(m => new Date(m.messageTime)))) :
                0;

    
            chatData.unattendedChats.push({
                ...conversation,
                details: details,
                duration,
                timeInQueue,
                unattendedBotTime: unattendedBotTime,
                unattendedAgentTime: unattendedAgentTime
            });
        } else {
            chatData.attendedChats.push(conversation);
        }
    }

    return chatData;
}

function displayTerminatedChats(chatData, startDate, endDate) {
    const tableBody = document.getElementById('terminatedChatsBody');
    tableBody.innerHTML = '';

    const days = Math.ceil((endDate - startDate) / (24 * 60 * 60 * 1000));

    for (let i = 0; i < days; i++) {
        const currentDate = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
        const nextDate = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000);

        const attendedCount = chatData.attendedChats.filter(chat => 
            new Date(chat.conversationStart) >= currentDate && 
            new Date(chat.conversationStart) < nextDate
        ).length;

        const unattendedCount = chatData.unattendedChats.filter(chat => 
            new Date(chat.conversationStart) >= currentDate && 
            new Date(chat.conversationStart) < nextDate
        ).length;

        const totalChats = attendedCount + unattendedCount;
        const unattendedRatio = totalChats > 0 ? (unattendedCount / totalChats) * 100 : 0;

        const row = tableBody.insertRow();
        row.insertCell().textContent = currentDate.toLocaleDateString();
        row.insertCell().textContent = totalChats;
        row.insertCell().textContent = attendedCount;
        row.insertCell().textContent = unattendedCount;
        row.insertCell().textContent = unattendedRatio.toFixed(2) + '%';
    }
}


function displayUnattendedChatsSummary(unattendedChats) {
    const tableBody = document.getElementById('unattendedChatsBody');
    tableBody.innerHTML = '';

    unattendedChats.forEach(chat => {
        const row = tableBody.insertRow();
        row.insertCell().textContent = new Date(chat.conversationStart).toLocaleString();
        // row.insertCell().textContent = chat.queueName || 'N/A';
        const queueParticipant = chat.participants.find(p => p.purpose === "acd");
        row.insertCell().textContent = queueParticipant ? queueParticipant.participantName : 'N/A';

        row.insertCell().textContent = 'WebChat';

        const customer = chat.details.participants.find(p => p.purpose === 'customer');    
        row.insertCell().textContent =  customer?.attributes?.deviceCategory || 'N/A';

        row.insertCell().textContent = chat.conversationId;
        row.insertCell().textContent = chat.externalTag || 'N/A';
        // row.insertCell().textContent = chat.participants
        //     .filter(p => p.purpose === 'agent')
        //     .map(p => p.name)
        //     .join(', ');

        row.insertCell().textContent =  chat.participants
            .filter(p => p.purpose === 'agent' && p.sessions.some(s => s.segments.some(seg => seg.segmentType === 'interact')))//|| p.purpose === 'customer')
            .map(p => p.participantName)
            .join(', ');

        row.insertCell().textContent = formatDuration(chat.duration);
        row.insertCell().textContent = formatDuration(chat.timeInQueue);
        row.insertCell().textContent = formatDuration(chat.unattendedBotTime);
        row.insertCell().textContent = formatDuration(chat.unattendedAgentTime);

        const monitorCell = row.insertCell();
        const transcriptLink = document.createElement('a');
        transcriptLink.textContent = 'Transcript';
        transcriptLink.href = `CustomMonitoring.html?conversationId=${chat.conversationId}`;
        transcriptLink.target = '_blank';
        transcriptLink.rel = 'noopener noreferrer';
        monitorCell.appendChild(transcriptLink);
        
    });
}

function formatDuration(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    return `${hours.toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

document.addEventListener('DOMContentLoaded', () => {
    initializeWithStoredToken();
    initializeDateControls();
    document.getElementById('timeframe').addEventListener('change', fetchTerminatedChats);
});
