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

//================================

function fetchMonitoredChats(token) {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const interval = `${yesterday.toISOString()}/${now.toISOString()}`;

    const body = {
        paging: {
            "pageSize": 100,
            "pageNumber": 1
        },
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

            // Add Peak button
            const peakCell = row.insertCell();
            const peakButton = document.createElement('button');
            peakButton.textContent = 'Peak';
            peakButton.onclick = () => peakChat(conversation.conversationId, token, peakButton);
            peakCell.appendChild(peakButton);
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

function confirmPeakChat(conversationId, participantId, token, button) {
    if (confirm("Are you sure you want to transfer this chat to yourself?")) {
        peakChat(conversationId, participantId, token, button);
    }
}

// function peakChat(conversationId, token, button) {
//     button.disabled = true;
//     button.textContent = 'Loading...';
  
//     fetch(`https://api.mypurecloud.com.au/api/v2/conversations/messages/${conversationId}`, {
//       method: 'GET',
//       headers: {
//         'Authorization': `Bearer ${token}`
//       }
//     })
//     .then(response => response.json())
//     .then(data => {
//         const participants = data.participants;
//         return Promise.all(participants.map(participant => 
//           Promise.all(participant.messages.map(message => 
//             fetch(`https://api.mypurecloud.com.au/api/v2/conversations/messages/${message.messageId}/details`, {
//               method: 'GET',
//               headers: {
//                 'Authorization': `Bearer ${token}`
//               }
//             }).then(response => response.json())
//           ))
//         )).then(participantMessages => ({
//           participants: participants,
//           messages: participantMessages.flat()
//         }));
//       })
//     .then(messagesDetails => {
//       displayTranscript(messagesDetails);
//     })
//     .catch(error => {
//       console.error('Error fetching conversation details:', error);
//       alert('Failed to fetch conversation details. Please try again.');
//     })
//     .finally(() => {
//       button.disabled = false;
//       button.textContent = 'Peak';
//     });
//   }
  
//   function displayTranscript(messagesDetails) {
//     const transcriptDiv = document.getElementById('transcriptDiv') || createTranscriptDiv();
//     transcriptDiv.innerHTML = ''; // Clear previous content
  
//     const transcript = messagesDetails.flatMap(messageDetail => 
//       messageDetail.participants.flatMap(participant => 
//         participant.messages.map(message => ({
//           timestamp: new Date(message.timestamp).toLocaleString(),
//           participantName: participant.purpose === 'customer' ? 'Customer' : participant.name,
//           text: message.normalizedMessage.text
//         }))
//       )
//     ).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  
//     transcript.forEach(message => {
//       const messageElement = document.createElement('p');
//       messageElement.innerHTML = `<strong>${message.timestamp} - ${message.participantName}:</strong> ${message.text}`;
//       transcriptDiv.appendChild(messageElement);
//     });
//   }

// function peakChat(conversationId, token, button) {
//     button.disabled = true;
//     button.textContent = 'Loading...';
  
//     fetch(`https://api.mypurecloud.com.au/api/v2/conversations/messages/${conversationId}`, {
//       method: 'GET',
//       headers: {
//         'Authorization': `Bearer ${token}`
//       }
//     })
//     .then(response => response.json())
//     .then(data => {
//       displayTranscript(data);
//     })
//     .catch(error => {
//       console.error('Error fetching conversation details:', error);
//       alert('Failed to fetch conversation details. Please try again.');
//     })
//     .finally(() => {
//       button.disabled = false;
//       button.textContent = 'Peak';
//     });
//   }
  
function peakChat(conversationId, token, button) {
    button.disabled = true;
    button.textContent = 'Loading...';
  
    fetch(`https://api.mypurecloud.com.au/api/v2/conversations/messages/${conversationId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
    .then(response => response.json())
    .then(data => {
      const participants = data.participants;
      return Promise.all(participants.map(participant => 
        Promise.all(participant.messages.map(message => 
          fetch(`https://api.mypurecloud.com.au/api/v2/conversations/messages/${message.messageId}/details`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`
            }
          }).then(response => response.json())
        ))
      )).then(participantMessages => ({
        participants: participants,
        messages: participantMessages.flat()
      }));
    })
    .then(messagesDetails => {
      displayTranscript(messagesDetails);
    })
    .catch(error => {
      console.error('Error fetching conversation details:', error);
      alert('Failed to fetch conversation details. Please try again.');
    })
    .finally(() => {
      button.disabled = false;
      button.textContent = 'Peak';
    });
  }

  function displayTranscript_sorted(conversationData) {
    const transcriptDiv = document.getElementById('transcriptDiv') || createTranscriptDiv();
    transcriptDiv.innerHTML = ''; // Clear previous content
  
    const participantMap = new Map();
    conversationData.participants.forEach(participant => {
      const address = participant.fromAddress?.addressNormalized || participant.toAddress?.addressNormalized;
      if (address) {
        participantMap.set(address, {
          name: participant.purpose === 'customer' ? participant.attributes?.HSName : participant.name,
          purpose: participant.purpose
        });
      }
    });
  
    // Sort messages by timestamp
    const sortedMessages = conversationData.messages.sort((a, b) => 
      new Date(a.messageTime) - new Date(b.messageTime)
    );
  
    sortedMessages.forEach(message => {
      const messageElement = document.createElement('div');
      messageElement.className = 'message';
      
      const participant = participantMap.get(message.fromAddress) || { name: 'Unknown', purpose: 'unknown' };
      const isInbound = message.direction === 'inbound';
  
      messageElement.innerHTML = `
        <p><strong>${participant.name} - ${new Date(message.messageTime).toLocaleString()} - ${message.messageStatus}</strong></p>
        <p>${message.textBody || 'No message content'}</p>
      `;
      
      messageElement.style.textAlign = isInbound ? 'left' : 'right';
      messageElement.style.backgroundColor = isInbound ? '#f0f0f0' : '#e6f3ff';
      
      transcriptDiv.appendChild(messageElement);
    });
  }

  function displayTranscript(conversationData) {
    const transcriptDiv = document.getElementById('transcriptDiv') || createTranscriptDiv();
    transcriptDiv.innerHTML = ''; // Clear previous content
  
    const participantMap = new Map();
    conversationData.participants.forEach(participant => {
      const address = participant.fromAddress?.addressNormalized || participant.toAddress?.addressNormalized;
      if (address) {
        participantMap.set(address, {
          name: participant.purpose === 'customer' ? participant.attributes?.HSName : participant.name,
          purpose: participant.purpose
        });
      }
    });
  
    conversationData.messages.forEach(message => {
      const messageElement = document.createElement('div');
      messageElement.className = 'message';
      
      const participant = participantMap.get(message.fromAddress) || { name: 'Unknown', purpose: 'unknown' };
      const isInbound = message.direction === 'inbound';

      messageElement.innerHTML = `
      <p><strong>${participant.name} - ${new Date(message.timestamp).toLocaleString()} - ${message.status}</strong></p>
      <p>${message.textBody || 'No message content'}</p>
    `;
      
      messageElement.style.textAlign = isInbound ? 'left' : 'right';
      messageElement.style.backgroundColor = isInbound ? '#f0f0f0' : '#e6f3ff';
      
      transcriptDiv.appendChild(messageElement);
    });
  }
  

  function displayTranscript_old2(conversationData) {
    const transcriptDiv = document.getElementById('transcriptDiv') || createTranscriptDiv();
    transcriptDiv.innerHTML = ''; // Clear previous content
  
    const transcript = conversationData.participants
      .flatMap(participant => participant.messages.map(message => ({
        timestamp: new Date(message.messageTime).toLocaleString(),
        participantName: participant.purpose === 'customer' ? 'Customer' : participant.name,
        text: message.messageStatus === 'received' ? 
          (message.textBody || 'Message received') : 
          (message.messageMetadata?.content?.[0]?.text || 'No message content')
      })))
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  
    transcript.forEach(message => {
      const messageElement = document.createElement('p');
      messageElement.innerHTML = `<strong>${message.timestamp} - ${message.participantName}:</strong> ${message.text}`;
      transcriptDiv.appendChild(messageElement);
    });
  }

  function displayTranscript_old(conversationData) {
    const transcriptDiv = document.getElementById('transcriptDiv') || createTranscriptDiv();
    transcriptDiv.innerHTML = ''; // Clear previous content
  
    const transcript = conversationData.participants
      .flatMap(participant => participant.messages.map(message => ({
        timestamp: new Date(message.messageTime).toLocaleString(),
        participantName: participant.purpose === 'customer' ? 'Customer' : participant.name,
        text: message.messageStatus === 'received' ? 'Message received' : (message.messageMetadata?.content?.[0]?.text || 'No message content')
      })))
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  
    transcript.forEach(message => {
      const messageElement = document.createElement('p');
      messageElement.innerHTML = `<strong>${message.timestamp} - ${message.participantName}:</strong> ${message.text}`;
      transcriptDiv.appendChild(messageElement);
    });
  }
  
  function createTranscriptDiv() {
    const transcriptDiv = document.createElement('div');
    transcriptDiv.id = 'transcriptDiv';
    transcriptDiv.style.marginTop = '20px';
    transcriptDiv.style.border = '1px solid #ccc';
    transcriptDiv.style.padding = '10px';
    document.body.appendChild(transcriptDiv);
    return transcriptDiv;
  }