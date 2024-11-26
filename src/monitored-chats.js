document.addEventListener('DOMContentLoaded', function () {
    const token = getToken();
    if (token) {
        fetchMonitoredChats(token);
    } else {
        console.error('No token found');
    }
    document.getElementById('refreshButton').addEventListener('click', refreshTable);
});

function getToken() {
    return localStorage.getItem('access_token');
}

function refreshTable() {
    const token = getToken();
    if (token) {
        fetchMonitoredChats(token);
    } else {
        console.error('No token found');
    }
}

function fetchMonitoredChats(token) {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const interval = `${yesterday.toISOString()}/${now.toISOString()}`;

    const body = {
        conversationFilters: [
            {
                clauses: [
                    {
                        predicates: [
                            {
                                type: "dimension",
                                operator: "notExists",
                                dimension: "conversationEnd"
                            },
                        ],
                        type: "and"
                    }
                ],
                type: "and"
            }
        ],
        segmentFilters: [
            {
                "type": "or",
                "clauses": [
                    {
                        "type": "and",
                        "predicates": [
                            {
                                "type": "dimension",
                                "dimension": "monitoredParticipantId",
                                "operator": "exists"
                            }
                        ]
                    }
                ]
            }
        ],
        interval: interval,
        order: "desc",
        orderBy: "conversationStart"
    };

    fetch('https://api.mypurecloud.com.au/api/v2/analytics/conversations/details/query', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
    })
        .then(response => response.json())
        .then(data => processConversations(data.conversations, token))
        .catch(error => console.error('Error:', error));
}

// function processConversations(conversations) {
//     const tableBody = document.getElementById('monitoredChatsBody');
//     tableBody.innerHTML = '';

//     conversations.forEach(conversation => {
//         const monitoringParticipant = conversation.participants.find(p =>
//             p.purpose === 'user' &&
//             p.sessions.some(s =>
//                 s.segments.some(seg =>
//                     seg.segmentType === 'monitoring' && !seg.disconnectType
//                 )
//             )
//         );

//         if (monitoringParticipant) {
//             const row = tableBody.insertRow();
//             row.insertCell().textContent = conversation.conversationId;
//             row.insertCell().textContent = conversation.externalTag || 'N/A';
//             row.insertCell().textContent = getQueueName(conversation);
//             row.insertCell().textContent = new Date(conversation.conversationStart).toLocaleString();
//             row.insertCell().textContent = getParticipantNames(conversation);
//             row.insertCell().textContent = monitoringParticipant.participantName;
//             row.insertCell().textContent = getMessageType(conversation);
//         }
//     });
// }

// function processConversations(conversations) {
//     const tableBody = document.getElementById('monitoredChatsBody');
//     tableBody.innerHTML = '';

//     conversations.forEach(conversation => {
//         const monitoringParticipant = conversation.participants.find(p => 
//             p.purpose === 'user' && 
//             p.sessions.some(s => 
//                 s.segments.some(seg => 
//                     seg.segmentType === 'monitoring' && !seg.disconnectType
//                 )
//             )
//         );

//         if (monitoringParticipant) {
//             const monitoringSession = monitoringParticipant.sessions.find(s =>
//                 s.segments.some(seg =>
//                     seg.segmentType === 'monitoring' && !seg.disconnectType
//                 )
//             );

//             const monitoringSegment = monitoringSession.segments.find(seg =>
//                 seg.segmentType === 'monitoring' && !seg.disconnectType
//             );

//             const row = tableBody.insertRow();
//             row.insertCell().textContent = new Date(conversation.conversationStart).toLocaleString();
//             row.insertCell().textContent = getQueueName(conversation);
//             row.insertCell().textContent = getMessageType(conversation);
//             row.insertCell().textContent = conversation.conversationId;
//             row.insertCell().textContent = conversation.externalTag || 'N/A';
//             row.insertCell().textContent = getParticipantNames(conversation);
//             row.insertCell().textContent = monitoringParticipant.participantName;
//             row.insertCell().textContent = new Date(monitoringSegment.segmentStart).toLocaleString(); // Monitoring Start
//         }
//     });
// }

function getQueueName(conversation) {
    const acdParticipant = conversation.participants.find(p => p.purpose === 'acd');
    // return acdParticipant ? acdParticipant.sessions[0].flow.flowName : 'N/A';
    return acdParticipant ? acdParticipant.participantName : 'N/A';
}

function getParticipantNames(conversation) {
    return conversation.participants
        .filter(p => p.purpose === 'agent' || p.purpose === 'customer')
        .map(p => p.participantName)
        .join(', ');
}

function getMessageType(conversation) {
    const customerSession = conversation.participants.find(p => p.purpose === 'customer').sessions[0];
    const type = customerSession.messageType || customerSession.mediaType || 'N/A';

    if (type === 'webmessaging') {
        return 'WebChat';
    } else if (type === 'open') {
        return 'SMS';
    } else {
        return type;
    }
}

function processConversations(conversations, token) {
    const tableBody = document.getElementById('monitoredChatsBody');
    tableBody.innerHTML = '';

    conversations.forEach(conversation => {
        const monitoringParticipant = conversation.participants.find(p =>
            p.purpose === 'user' &&
            p.sessions.some(s =>
                s.segments.some(seg =>
                    seg.segmentType === 'monitoring' && !seg.disconnectType
                )
            )
        );

        if (monitoringParticipant) {
            const row = tableBody.insertRow();
            // Add cells
            row.insertCell().textContent = new Date(conversation.conversationStart).toLocaleString();
            row.insertCell().textContent = getQueueName(conversation);
            row.insertCell().textContent = getMessageType(conversation);
            row.insertCell().textContent = conversation.conversationId;
            row.insertCell().textContent = conversation.externalTag || 'N/A';
            row.insertCell().textContent = getParticipantNames(conversation);
            row.insertCell().textContent = getMonitoringStartTime(monitoringParticipant);
            row.insertCell().textContent = monitoringParticipant.participantName;

            // Add Stop Monitoring button
            const stopCell = row.insertCell();
            const stopButton = document.createElement('button');
            stopButton.textContent = 'Stop Monitoring';
            stopButton.onclick = () => confirmStopMonitoring(conversation.conversationId, monitoringParticipant.participantId, token, stopButton);
            stopCell.appendChild(stopButton);
        }
    });
}


function confirmStopMonitoring(conversationId, participantId, token, button) {
    if (confirm("Please confirm you want to terminate the monitoring")) {
      stopMonitoring(conversationId, participantId, token, button);
    }
  }

function stopMonitoring(conversationId, participantId, token, button) {
    // Disable the button
    button.disabled = true;
    button.textContent = 'Stopping...';

    fetch(`https://api.mypurecloud.com.au/api/v2/conversations/messages/${conversationId}/participants/${participantId}`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ state: "DISCONNECTED" })
    })
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            console.log('Monitoring stopped:', data);
            // Refresh the table or remove the row
            refreshTable();
            alert('Monitoring has been successfully stopped.');

        })
        .catch(error => {
            console.error('Error stopping monitoring:', error);
            alert('Failed to stop monitoring. Please try again.');
          })
          .finally(() => {
            // Re-enable the button
            button.disabled = false;
            button.textContent = 'Stop Monitoring';
          });
}

function getMonitoringStartTime(participant) {
    const monitoringSession = participant.sessions.find(s =>
        s.segments.some(seg => seg.segmentType === 'monitoring' && !seg.disconnectType)
    );
    if (monitoringSession) {
        const monitoringSegment = monitoringSession.segments.find(seg =>
            seg.segmentType === 'monitoring' && !seg.disconnectType
        );
        return new Date(monitoringSegment.segmentStart).toLocaleString();
    }
    return 'N/A';
}