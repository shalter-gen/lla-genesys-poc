let currentSortColumn = 0; // Default to first column (date)
let currentSortDirection = 'desc'; // Default to descending
let currentUserhasIssRole = false;

const MAX_RELOADS = 5;
const RELOAD_DELAY = 2000; // 2 seconds in milliseconds

function determineEnvironment() {
    return window.location.protocol === 'chrome-extension:';
}

async function getToken() {
    const isExtension = determineEnvironment();
    let token;

    if (isExtension) {
        token = await new Promise(resolve => {
            chrome.storage.local.get(['access_token'], function (result) {
                resolve(result.access_token);
            });
        });
    } else {
        token = localStorage.getItem('access_token');   // Backward compatibility!
        if (!token) {
            let monitored_chats_auth_data = localStorage.getItem('monitored_chats_auth_data');
            if (monitored_chats_auth_data)
                token = JSON.parse(monitored_chats_auth_data)?.accessToken;
        }
    }

    if (!token) {
        return null;
    }

    try {
        const response = await fetch('https://api.mypurecloud.com.au/api/v2/users/me?expand=authorization', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            const userData = await response.json();
            currentUserhasIssRole = userData.authorization.roles.some(role => ['LLA_ISS_DIGITAL', 'LLA_LEAD_ISS'].includes(role.name));
            return token;
        } else {
            console.error('Token is invalid or expired');
            if (isExtension) {
                chrome.storage.local.remove('access_token');
            } else {
                localStorage.removeItem('access_token');
            }
            return null;
        }
    } catch (error) {
        console.error('Error checking token validity:', error);
        return null;
    }
}

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

async function setReloadAttempts(count) {
    const isExtension = determineEnvironment();
    if (isExtension) {
        await chrome.storage.local.set({ reloadAttempts: count });
    } else {
        localStorage.setItem('reloadAttempts', count.toString());
    }
}

async function handleTokenCheck(initializeFeatures = false) {
    const token = await getToken();
    if (token) {
        await setReloadAttempts(0); // Reset counter on successful token
        if (initializeFeatures) {
            initializeTableFeatures();
        }
        fetchMonitoredChats(token);
    } else {
        console.error('No valid token found');
        const attempts = await getReloadAttempts();
        if (attempts < MAX_RELOADS) {
            await setReloadAttempts(attempts + 1);
            console.log(`Reload attempt ${attempts + 1} of ${MAX_RELOADS}`);
            setTimeout(() => {
                window.location.reload();
            }, RELOAD_DELAY);
        } else {
            console.error('Max reload attempts reached');
            await setReloadAttempts(0); // Reset counter on successful token
        }
    }
}

document.addEventListener('DOMContentLoaded', async function () {
    await handleTokenCheck(true);
    document.getElementById('refreshButton').addEventListener('click', refreshTable);
});

async function refreshTable() {
    await handleTokenCheck(false);
}

//================================

let currentSearchValue = '';  // Store the current search value

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

        "segmentFilters": [
            {
                "type": "and",
                "predicates": [
                    {
                        "dimension": "mediaType",
                        "value": "message"
                    },
                    {
                        "dimension": "direction",
                        "value": "inbound"
                    },
                ]
            },
        ],
        interval: interval,
        order: "desc",
        orderBy: "conversationStart"
    };

    fetch('https://api.mypurecloud.com.au/api/v2/analytics/conversations/details/query?pageSize=100', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
    })
        .then(response => response.json())
        .then(data => processConversations(data.conversations, token))
        .then(() => {
            console.log('Conversations fetched and processed');
            if (currentSearchValue) {
                const searchBox = document.getElementById('searchBox');
                searchBox.value = currentSearchValue;
                filterTable({ target: searchBox });
            } else {
                filterTable({})
            }
        })
        .catch(error => console.error('Error:', error));
}

function getQueueName(conversation) {
    const acdParticipant = conversation.participants.find(p => p.purpose === 'acd');
    return acdParticipant ? acdParticipant.participantName : 'N/A';
}

function getParticipantNames(conversation) {
    return conversation.participants
        .filter(p => p.purpose === 'agent' && p.sessions.some(s => s.segments.some(seg => seg.segmentType === 'interact')))//|| p.purpose === 'customer')
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

const createMonitorDropdown = (conversation, token) => {
    const container = document.createElement('div');
    container.className = 'monitor-dropdown';

    const mainButton = document.createElement('button');
    mainButton.className = 'monitor-btn';
    mainButton.textContent = 'Monitor';

    const dropdownContent = document.createElement('div');
    dropdownContent.className = 'dropdown-content';

    const tabLink = document.createElement('div');
    tabLink.textContent = 'New tab';
    tabLink.addEventListener('click', () => customMonitorTab(conversation.conversationId, conversation.externalTag, token));

    const popupLink = document.createElement('div');
    popupLink.textContent = 'Popup';
    popupLink.addEventListener('click', () => customMonitorPopup(conversation.conversationId, conversation.externalTag, token));

    dropdownContent.appendChild(tabLink);
    dropdownContent.appendChild(popupLink);
    container.appendChild(mainButton);
    container.appendChild(dropdownContent);

    return container;
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

        const row = tableBody.insertRow();
        row.insertCell().textContent = new Date(conversation.conversationStart).toLocaleString('en-AU', {
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
        row.insertCell().textContent = getQueueName(conversation);
        row.insertCell().textContent = getMessageType(conversation);
        row.insertCell().textContent = conversation.conversationId;
        row.insertCell().textContent = conversation.externalTag || 'N/A';
        row.insertCell().textContent = getParticipantNames(conversation);   // CSes (Agents)


        if (monitoringParticipant) {
            row.insertCell().textContent = getMonitoringStartTime(monitoringParticipant);
            row.insertCell().textContent = monitoringParticipant.participantName;

            // Add Stop Monitoring button
            const stopCell = row.insertCell();
            const stopButton = document.createElement('button');
            stopButton.className = 'monitor-btn';
            stopButton.textContent = 'Stop Monitoring';

            // Enable or disable the "Stop monitoring" button based on roles
            stopButton.disabled = currentUserhasIssRole ? false : true;

            stopButton.onclick = () => confirmStopMonitoring(conversation.conversationId, monitoringParticipant.participantId, token, stopButton);
            stopCell.appendChild(stopButton);
        } else {
            row.insertCell();
            row.insertCell();
            row.insertCell();
        }

        const actionCell = row.insertCell();
        const dropdownDiv = createMonitorDropdown(conversation, token);
        actionCell.appendChild(dropdownDiv);

    });

    // After populating the table, reapply the current sort
    const headers = document.querySelectorAll('#monitoredChatsTable th');
    headers[currentSortColumn].classList.add(`sort-${currentSortDirection}`);
    sortTable(currentSortColumn);
}

// Split the customMonitor function into two separate functions
function customMonitorPopup(conversationId, externalTag, token) {
    const popupName = `transcript_${conversationId}`;
    const popupWindow = window.open(`CustomMonitoring.html?conversationId=${conversationId}`, popupName, 'width=800,height=500');
    if (popupWindow) {
        customMonitorShareData(popupWindow, conversationId, externalTag, token);
    } else {
        console.error('Popup window could not be opened. Please check your popup blocker settings.');
    }
}

function customMonitorTab(conversationId, externalTag, token) {
    const storageKey = `transcript_${conversationId}`;
    localStorage.setItem(storageKey, JSON.stringify({ conversationId, token }));
    const popupWindow = window.open(`CustomMonitoring.html?conversationId=${conversationId}`, '_blank');
    if (popupWindow) {
        customMonitorShareData(popupWindow, conversationId, externalTag, token);
    } else {
        console.error('Popup window could not be opened. Please check your popup blocker settings.');
    }
}

function customMonitorShareData(handle, conversationId, externalTag, token) {
    // Use a timeout to ensure the window has time to load
    setTimeout(() => {
        handle.postMessage({ conversationId, externalTag, token }, '*');
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
            alert('Monitoring has been successfully stopped.');
            setTimeout(() => {
                refreshTable()
            }, 4000);
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
        // return new Date(monitoringSegment.segmentStart).toLocaleString();
        return new Date(monitoringSegment.segmentStart).toLocaleString('en-AU', {
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
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
        header.addEventListener('click', () => sortTable(index, true));
        header.classList.add('sortable');
    });

    // Add default sort by date (first column)
    const dateHeader = headers[0];
    dateHeader.classList.add('sort-desc');
    sortTable(0);

    // Modify the search input event listener to store the value
    document.getElementById('searchBox').addEventListener('input', function (e) {
        currentSearchValue = e.target.value;
        filterTable(e);
    });
    // Add event listeners for checkboxes
    document.getElementById('prodOnlyCheckbox').addEventListener('change', () => filterTable({}));
}

function sortTable(columnIndex, invertSort = false) {
    const table = document.getElementById('monitoredChatsTable');
    const tbody = table.querySelector('tbody');
    const rows = Array.from(tbody.querySelectorAll('tr'));
    const header = table.querySelectorAll('th')[columnIndex];
    let isAscending = header.classList.contains('sort-asc');

    // Update sort indicators
    table.querySelectorAll('th').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
    });
    if (invertSort) {
        isAscending = !isAscending;
    }
    header.classList.add(isAscending ? 'sort-asc' : 'sort-desc');

    // Remember sort direction
    currentSortColumn = columnIndex;
    currentSortDirection = isAscending ? 'asc' : 'desc';

    // Sort rows
    rows.sort((a, b) => {
        const aValue = a.cells[columnIndex].textContent;
        const bValue = b.cells[columnIndex].textContent;
        return isAscending ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
    });

    tbody.append(...rows);
}

function filterTable_old(e) {
    const searchText = e.target.value.toLowerCase();
    const rows = document.querySelectorAll('#monitoredChatsTable tbody tr');


    rows.forEach(row => {
        const text = Array.from(row.cells)
            .map(cell => cell.textContent.toLowerCase())
            .join(' ');
        row.style.display = text.includes(searchText) ? '' : 'none';
    });
}

function filterTable(e) {
    const searchText = e.target ? e.target.value.toLowerCase() : '';
    const prodOnly = document.getElementById('prodOnlyCheckbox').checked;
    const rows = document.querySelectorAll('#monitoredChatsTable tbody tr');

    rows.forEach(row => {
        const text = Array.from(row.cells)
            .map(cell => cell.textContent.toLowerCase())
            .join(' ');
        const queueCell = row.cells[1].textContent; // Queue is in second column

        let showRow = text.includes(searchText);

        // Apply Prod only filter
        if (prodOnly) {
            showRow = showRow && queueCell.includes('LLA_Digital PROD');
        }

        row.style.display = showRow ? '' : 'none';
    });
}

