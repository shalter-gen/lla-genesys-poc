document.addEventListener('DOMContentLoaded', function () {
    const token = getToken();
    if (token) {
        initializeTableFeatures();
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
        // segmentFilters: [
        //     {
        //         "type": "or",
        //         "clauses": [
        //             {
        //                 "type": "and",
        //                 "predicates": [
        //                     {
        //                         "type": "dimension",
        //                         "dimension": "monitoredParticipantId",
        //                         "operator": "exists"
        //                     }
        //                 ]
        //             }
        //         ]
        //     }
        // ],
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
        .filter(p => p.purpose === 'agent' && p.sessions.some(s => s.segments.some(seg => seg.segmentType === 'interact') ))//|| p.purpose === 'customer')
        .map(p => p.participantName)
        .join(', ');
}
//conversation.participants[5].sessions[0].segments[1].segmentType
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

        // if (monitoringParticipant) {
        const row = tableBody.insertRow();
        // Add cells
        row.insertCell().textContent = new Date(conversation.conversationStart).toLocaleString();
        row.insertCell().textContent = getQueueName(conversation);
        row.insertCell().textContent = getMessageType(conversation);
        row.insertCell().textContent = conversation.conversationId;
        row.insertCell().textContent = conversation.externalTag || 'N/A';
        row.insertCell().textContent = getParticipantNames(conversation);


        if (monitoringParticipant) {
            row.insertCell().textContent = getMonitoringStartTime(monitoringParticipant);
            row.insertCell().textContent = monitoringParticipant.participantName;

            // Add Stop Monitoring button
            const stopCell = row.insertCell();
            const stopButton = document.createElement('button');
            stopButton.textContent = 'Stop Monitoring';
            stopButton.onclick = () => confirmStopMonitoring(conversation.conversationId, monitoringParticipant.participantId, token, stopButton);
            stopCell.appendChild(stopButton);
        } else {
            row.insertCell();
            row.insertCell();
            row.insertCell();
        }

        const actionCell = row.insertCell();
        const dropdownDiv = document.createElement('div');
        dropdownDiv.className = 'dropdown';
        
        const mainButton = document.createElement('button');
        mainButton.className = 'dropbtn';
        mainButton.textContent = 'Monitor';
        
        const dropdownContent = document.createElement('div');
        dropdownContent.className = 'dropdown-content';
        
        const tabLink = document.createElement('a');
        tabLink.textContent = 'New tab';
        tabLink.addEventListener('click', () => customMonitorTab(conversation.conversationId, token));
        
        const popupLink = document.createElement('a');
        popupLink.textContent = 'Popup';
        popupLink.addEventListener('click', () => customMonitorPopup(conversation.conversationId, token));
        
        dropdownContent.appendChild(tabLink);
        dropdownContent.appendChild(popupLink);
        dropdownDiv.appendChild(mainButton);
        dropdownDiv.appendChild(dropdownContent);
        actionCell.appendChild(dropdownDiv);


        // }
    });
}

// Split the customMonitor function into two separate functions
function customMonitorPopup(conversationId, token) {
    const popupName = `transcript_${conversationId}`;
    const popupWindow = window.open(`CustomMonitoring.html?conversationId=${conversationId}`, popupName, 'width=800,height=500');
    if (popupWindow) {
        customMonitorShareData(popupWindow, conversationId, token);
        // // Use a timeout to ensure the window has time to load
        // setTimeout(() => {
        //     popupWindow.postMessage({ conversationId, token }, '*');
        // }, 800);
    } else {
        console.error('Popup window could not be opened. Please check your popup blocker settings.');
    }
}

function customMonitorTab(conversationId, token) {
    const storageKey = `transcript_${conversationId}`;
    localStorage.setItem(storageKey, JSON.stringify({ conversationId, token }));
    const popupWindow = window.open(`CustomMonitoring.html?conversationId=${conversationId}`, '_blank');
    if (popupWindow) {
        customMonitorShareData(popupWindow, conversationId, token);
    } else {
        console.error('Popup window could not be opened. Please check your popup blocker settings.');
    }
}

function customMonitorShareData(handle, conversationId, token) {
    // Use a timeout to ensure the window has time to load
    setTimeout(() => {
        handle.postMessage({ conversationId, token }, '*');
    }, 4000);
}

function customMonitor(conversationId, token) {
    const popupName = `transcript_${conversationId}`;
    const popupWindow = window.open(`CustomMonitoring.html?conversationId=${conversationId}`, popupName, 'width=800,height=500');

    if (popupWindow) {
        // Use a timeout to ensure the window has time to load
        setTimeout(() => {
            popupWindow.postMessage({ conversationId, token }, '*');
        }, 800);
    } else {
        console.error('Popup window could not be opened. Please check your popup blocker settings.');
    }
    // if (popupWindow) {
    //     const storageKey = `transcript_${conversationId}`;
    //     localStorage.setItem(storageKey, JSON.stringify({ conversationId, token }));
    //   } else {
    //     console.error('Popup window could not be opened. Please check your popup blocker settings.');
    //   }    
}

//   function customMonitor(conversationId, token) {
//     const popupName = `transcript_${conversationId}`;
//     const popupWindow = window.open('CustomMonitoring.html', popupName, 'width=600,height=400');
//     popupWindow.onload = function() {
//       popupWindow.postMessage({ conversationId, token }, '*');
//     };
//   }


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

// Add search input above the table
function addSearchBox() {
    const searchBox = document.createElement('input');
    searchBox.type = 'text';
    searchBox.id = 'searchBox';
    searchBox.placeholder = 'Search chats...';
    document.getElementById('monitoredChatsTable').before(searchBox);
}

// Initialize sorting and searching
function initializeTableFeatures() {
    addSearchBox();
    
    // Add sorting to headers
    const headers = document.querySelectorAll('#monitoredChatsTable th');
    headers.forEach((header, index) => {
        header.addEventListener('click', () => sortTable(index));
        header.classList.add('sortable');
    });

    // Add search functionality
    document.getElementById('searchBox').addEventListener('input', filterTable);
}

function sortTable(columnIndex) {
    const table = document.getElementById('monitoredChatsTable');
    const tbody = table.querySelector('tbody');
    const rows = Array.from(tbody.querySelectorAll('tr'));
    const header = table.querySelectorAll('th')[columnIndex];
    const isAscending = !header.classList.contains('sort-asc');

    // Update sort indicators
    table.querySelectorAll('th').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
    });
    header.classList.add(isAscending ? 'sort-asc' : 'sort-desc');

    // Sort rows
    rows.sort((a, b) => {
        const aValue = a.cells[columnIndex].textContent;
        const bValue = b.cells[columnIndex].textContent;
        return isAscending ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
    });

    tbody.append(...rows);
}

function filterTable(e) {
    const searchText = e.target.value.toLowerCase();
    const rows = document.querySelectorAll('#monitoredChatsTable tbody tr');

    rows.forEach(row => {
        const text = Array.from(row.cells)
            .map(cell => cell.textContent.toLowerCase())
            .join(' ');
        row.style.display = text.includes(searchText) ? '' : 'none';
    });
}

