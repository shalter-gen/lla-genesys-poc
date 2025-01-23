let currentSortColumn = 0; // Default to first column (date)
let currentSortDirection = 'desc'; // Default to descending
let currentUserhasIssRole = false;

const MAX_PAGE_RELOADS_FOR_TOKEN = 5;
const TOKEN_RELOAD_DELAY = 2000; // 2 seconds in milliseconds
const GC_ROLES_STOP_MONITORING = ['LLA_ISS_DIGITAL', 'LLA_LEAD_ISS', 'LLA_SERVICE_LEAD'];

/**
 * Returns true if the code is running in a Chrome extension, false otherwise.
 *
 * In the Chrome extension, window.location.protocol is 'chrome-extension:'.
 * This is used to determine whether to use the local storage of the Chrome
 * extension or the local storage of the web page.
 */
function determineEnvironment() {
    return window.location.protocol === 'chrome-extension:';
}

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
 * @param {boolean} initializeFeatures - A flag indicating whether to
 * initialize table features upon successful token retrieval.
 * @returns {Promise<void>} - A promise that resolves when the token
 * check process is complete.
 */

async function handleTokenCheck(initializeFeatures = false) {
    const token = await getToken();

    console.log('Token:', token);
    if (token) {
        console.log('Valid token found');
        await setReloadAttempts(0); // Reset counter on successful token
        if (initializeFeatures) {
            initializeTableFeatures();
        }
        console.log('Reading user permissions');
        const makeRequest = () => fetch('https://api.mypurecloud.com.au/api/v2/users/me?expand=authorization', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
    
        const userData = await handleApiRequest(makeRequest);
        console.log('getToken: Token validity check successful');
        currentUserhasIssRole = userData.authorization.roles.some(role => GC_ROLES_STOP_MONITORING.includes(role.name));
    
        fetchMonitoredChats(token);
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

document.addEventListener('DOMContentLoaded', async function () {
    await handleTokenCheck(true);
    document.getElementById('refreshButton').addEventListener('click', refreshTable);
});

/**
 * Refreshes the data in the table by triggering a token check.
 * 
 * This function calls `handleTokenCheck` with the `initializeFeatures`
 * parameter set to `false`, which checks the validity of the stored token
 * without initializing table features. If the token is valid, the table
 * data is re-fetched; otherwise, it handles reload attempts.
 * The function also temporarily disables the "Refresh" button 
 * during the refresh process.
 * 
 * @returns {Promise<void>} - A promise that resolves when the refresh
 * process is complete.
 */
async function refreshTable() {
    const refreshButton = document.getElementById('refreshButton');
    refreshButton.disabled = true;

    try {
        await handleTokenCheck(false);
    } finally {
        refreshButton.disabled = false;
    }
}

//================================

let currentSearchValue = '';  // Store the current search value

/**
 * Helper function to handle API requests, including automatic retries in case of rate limiting (HTTP 429)
 * Async function that makes an API request with exponential backoff in case of rate limit (429) errors.
 * It takes two parameters: requestFunction (the function that makes the API request) and maxRetries
 * (the maximum number of retries to attempt before giving up). The function will retry the request if it encounters
 * a rate limit error (429), waiting for a specified amount of time before retrying. If the maximum retries are reached,
 * it will throw an error.
 * @param {function} requestFunction - The function that makes the API request
 * @param {number} [maxRetries=6] - The maximum number of retries to attempt
 * 
 * @returns {Promise<Object>} - A promise that resolves to the JSON response from the API
 * @throws {Error} - If the request fails after the maximum number of retries
 */
async function handleApiRequest(requestFunction, maxRetries = 6) {
    let retryCount = 0;
    
    while (retryCount <= maxRetries) {
        try {
            const response = await requestFunction();
            
            if (response.status === 429) {
                const errorData = await response.json();
                const retryAfterMatch = errorData.message.match(/\[(\d+)\]/);
                const retryAfterSeconds = retryAfterMatch ? parseInt(retryAfterMatch[1]) : 30;

                if (retryCount === maxRetries) {
                    throw new Error(`Max retries (${maxRetries}) reached after rate limit`);
                }

                console.log(`Rate limit hit. Waiting ${retryAfterSeconds} seconds before retry ${retryCount + 1}/${maxRetries}`);
                await new Promise(resolve => setTimeout(resolve, retryAfterSeconds * 1000));
                retryCount++;
                continue;
            }

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`HTTP ${response.status}: ${errorData.message || response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            if (error.message.includes('429') && retryCount < maxRetries) {
                retryCount++;
                continue;
            }
            throw error;
        }
    }
}

/**
 * Fetches a list of monitored chats from the Genesys Cloud API and processes
 * them by extracting relevant information and adding custom monitoring
 * buttons to the table.
 * It sends a POST request to the API, processes the response data, and adds
 * custom monitoring buttons to a table. If the request fails or the response
 * is invalid, it throws an error.
 * 
 * @param {string} token - The access token to use for the API request.
 * @throws {Error} - If the request fails or the response is invalid.
 */
async function fetchMonitoredChats(token) {
    try {
        const makeRequest = () => fetch('https://api.mypurecloud.com.au/api/v2/analytics/conversations/details/query?pageSize=100', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(body)
        });

        const data = await handleApiRequest(makeRequest);
        if (!data || !data.conversations) {
            throw new Error('Invalid response format from server');
        }
        await processConversations(data.conversations, token);
        console.log('Conversations fetched and processed');
        
        if (currentSearchValue) {
            const searchBox = document.getElementById('searchBox');
            searchBox.value = currentSearchValue;
            filterTable({ target: searchBox });
        } else {
            filterTable({});
        }
    } catch (error) {
        console.error('Error fetching conversations:', error);
        // if (error.message.includes('403')) {
        //     // Handle unauthorized access - might need to refresh token
        //     await handleTokenCheck(false);
        // }
    }
}


/**
 * Fetches a list of monitored chats from the Genesys Cloud API within the last 24 hours.
 * Constructs a POST request with specific filters for conversations that have not ended
 * and involve inbound messages. Processes the fetched conversations and updates the UI
 * table. Handles errors by logging them to the console.
 * 
 * @param {string} token - The access token to use for authorization in the API request.
 * @throws {Error} - If the request fails or the response is invalid.
 */

async function fetchMonitoredChats(token) {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const interval = `${yesterday.toISOString()}/${now.toISOString()}`;

    const body = {
        paging: {
            "pageSize": 100,
            "pageNumber": 1
        },
        conversationFilters: [{
            clauses: [{
                predicates: [{
                    type: "dimension",
                    operator: "notExists",
                    dimension: "conversationEnd"
                }],
                type: "and"
            }],
            type: "and"
        }],
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
        "segmentFilters": [{
            "type": "and",
            "predicates": [{
                "dimension": "mediaType",
                "value": "message"
            }, {
                "dimension": "direction",
                "value": "inbound"
            }]
        }],
        interval: interval,
        order: "desc",
        orderBy: "conversationStart"
    };

    try {
        const makeRequest = () => fetch('https://api.mypurecloud.com.au/api/v2/analytics/conversations/details/query?pageSize=100', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(body)
        });

        const data = await handleApiRequest(makeRequest);
        if (!data || !data.conversations) {
            throw new Error('Invalid response format from server');
        }
        await processConversations(data.conversations, token);
        console.log('Conversations fetched and processed');
        
        if (currentSearchValue) {
            const searchBox = document.getElementById('searchBox');
            searchBox.value = currentSearchValue;
            filterTable({ target: searchBox });
        } else {
            filterTable({});
        }
    } catch (error) {
        console.error('Error fetching conversations:', error);
    }
}


/**
 * Given a conversation, returns the name of the queue that the customer was in when
 * the conversation was initiated, or 'N/A' if the conversation was not initiated
 * from a queue.
 *
 * @param {Object} conversation - The conversation to get the queue name for
 * @returns {string} - The name of the queue, or 'N/A' if not applicable
 */
function getQueueName(conversation) {
    const acdParticipant = conversation.participants.find(p => p.purpose === 'acd');
    return acdParticipant ? acdParticipant.participantName : 'N/A';
}

/**
 * Given a conversation, returns a comma-separated string of the participant names
 * for agents that have interacted with the customer in the conversation.
 *
 * @param {Object} conversation - The conversation to get the participant names for
 * @returns {string} - The names of the agents that interacted with the customer
 */
function getParticipantNames(conversation) {
    return conversation.participants
        .filter(p => p.purpose === 'agent' && p.sessions.some(s => s.segments.some(seg => seg.segmentType === 'interact')))//|| p.purpose === 'customer')
        .map(p => p.participantName)
        .join(', ');
}


/**
 * Determines the message type of a customer session in a conversation.
 *
 * This function examines the sessions of the customer participant in the given
 * conversation to identify the message type. It checks for the presence of
 * `messageType` or `mediaType` within the customer's session and maps specific
 * types to user-friendly names. If none of the known types are found, it returns
 * 'N/A'.
 *
 * @param {Object} conversation - The conversation object containing participants.
 * @returns {string} - The user-friendly name of the message type, such as 'WebChat',
 * 'SMS', or the original type string if not a known type.
 */

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

/**
 * Creates a dropdown UI component for initiating monitoring actions on a conversation.
 *
 * This function generates a dropdown menu with options to monitor a conversation in
 * either a new tab or a popup window. It constructs the necessary HTML elements,
 * attaches event listeners for the dropdown actions, and returns the created container
 * element.
 *
 * @param {Object} conversation - The conversation object containing details such as
 * conversationId and externalTag.
 * @param {string} token - The access token used for authentication in the monitoring
 * actions.
 * @returns {HTMLDivElement} - The container element with the dropdown menu for
 * monitoring actions.
 */

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

/**
 * Process an array of conversations and populate the monitored conversations table.
 *
 * This function takes an array of conversation objects and the access token used for
 * authentication in the monitoring actions. It adds the Genesys Monitoring column to the
 * table header if the user has the ISS role, and then populates the table with the
 * conversations. For each conversation, it adds a row with the chat start date, queue
 * name, message type, conversation ID, external tag, interacting users, monitoring start
 * time, and monitoring user. It also adds a dropdown menu to the last column of the row
 * with options to monitor the conversation in either a new tab or a popup window.
 *
 * If the conversation is already being monitored, it adds a "Stop Monitoring" button to
 * the row. The button is disabled if the user does not have the ISS role.
 *
 * After populating the table, it reapplies the current sort.
 *
 * @param {Array} conversations - The array of conversation objects to process.
 * @param {string} token - The access token used for authentication in the monitoring
 * actions.
 */
function processConversations(conversations, token) {
    // Add Genesys Monitoring column to header if user has permission
    const headerRow = document.querySelector('#monitoredChatsTable thead tr');
    if (currentUserhasIssRole) {
        // Check if the 'Genesys Monitoring' column already exists
        const existingGenesysHeader = Array.from(headerRow.children).find(
            child => child.textContent === 'Genesys Monitoring'
        );
    
        if (!existingGenesysHeader) {
            const genesysMonitoringHeader = document.createElement('th');
            genesysMonitoringHeader.textContent = 'Genesys Monitoring';
            // Insert before the last column (Custom Monitoring)
            headerRow.insertBefore(genesysMonitoringHeader, headerRow.lastElementChild);
        }
    }

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
            if (currentUserhasIssRole) {
                const stopCell = row.insertCell();
                const stopButton = document.createElement('button');
                stopButton.className = 'monitor-btn';
                stopButton.textContent = 'Stop Monitoring';
    
                // Enable or disable the "Stop monitoring" button based on roles
                stopButton.disabled = currentUserhasIssRole ? false : true;
                stopButton.onclick = async () => await confirmStopMonitoring(conversation.conversationId, monitoringParticipant.participantId, token, stopButton);
                stopCell.appendChild(stopButton);
            }         
        } else {
            row.insertCell();
            row.insertCell();
            if (currentUserhasIssRole) {
                row.insertCell();
            }        
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

/**
 * Opens a popup window with the custom monitoring interface.
 * @param {string} conversationId - The conversation ID to monitor.
 * @param {string} externalTag - The external tag of the conversation.
 * @param {string} token - The access token to use for the monitoring.
 */
function customMonitorPopup(conversationId, externalTag, token) {
    const popupName = `transcript_${conversationId}`;
    const popupWindow = window.open(`CustomMonitoring.html?conversationId=${conversationId}`, popupName, 'width=800,height=500');
    if (popupWindow) {
        // Share the conversation ID, external tag, and access token with the popup window
        customMonitorShareData(popupWindow, conversationId, externalTag, token);
    } else {
        // If the popup window could not be opened, log an error
        console.error('Popup window could not be opened. Please check your popup blocker settings.');
    }
}

/**
 * Opens a new tab with the custom monitoring interface and shares data with it.
 * 
 * This function stores the conversation ID and token in local storage, opens a
 * new tab with the custom monitoring interface, and sends the conversation data
 * to the newly opened tab.
 *
 * @param {string} conversationId - The conversation ID to monitor.
 * @param {string} externalTag - The external tag of the conversation.
 * @param {string} token - The access token to use for the monitoring.
 */
function customMonitorTab(conversationId, externalTag, token) {
    const popupWindow = window.open(`CustomMonitoring.html?conversationId=${conversationId}`, '_blank');

    if (popupWindow) {
        // Share data with the newly opened tab
        customMonitorShareData(popupWindow, conversationId, externalTag, token);
    } else {
        console.error('Popup window could not be opened. Please check your popup blocker settings.');
    }
}

/**
 * Shares the conversation ID, external tag, and access token with a popup window or a newly opened tab.
 * @param {Window} handle - The window to share the data with.
 * @param {string} conversationId - The conversation ID to share.
 * @param {string} externalTag - The external tag of the conversation.
 * @param {string} token - The access token to use for the monitoring.
 */
function customMonitorShareData(handle, conversationId, externalTag, token) {
    const storageKey = `transcript_${conversationId}`;
    localStorage.setItem(storageKey, JSON.stringify({ conversationId, token }));
    // Use a timeout to ensure the window has time to load
    // setTimeout(() => {
    //     handle.postMessage({ conversationId, externalTag, token }, '*');
    // }, 4000);
}

/**
 * Opens a popup window with the custom monitoring interface and shares the
 * conversation ID and access token with it.
 *
 * @param {string} conversationId - The conversation ID to monitor.
 * @param {string} token - The access token to use for the monitoring.
 */
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

/**
 * Confirms with the user that they want to stop monitoring the conversation and then
 * calls stopMonitoring if the user confirms.
 *
 * @param {string} conversationId - The conversation ID to stop monitoring.
 * @param {string} participantId - The participant ID to stop monitoring.
 * @param {string} token - The access token to use to stop the monitoring.
 * @param {HTMLButtonElement} button - The button to re-enable after the operation is complete.
 */
async function confirmStopMonitoring(conversationId, participantId, token, button) {
    if (confirm("Please confirm you want to terminate the monitoring")) {
        await stopMonitoring(conversationId, participantId, token, button);
    }
}

/**
 * Stops monitoring the conversation with the given participant ID using the
 * given access token.
 * 
 * @param {string} conversationId - The conversation ID to stop monitoring.
 * @param {string} participantId - The participant ID to stop monitoring.
 * @param {string} token - The access token to use to stop the monitoring.
 * @param {HTMLButtonElement} button - The button to re-enable after the operation is complete.
 */
async function stopMonitoring(conversationId, participantId, token, button) {
    button.disabled = true;
    button.textContent = 'Stopping...';

    try {
        const makeRequest = () => fetch(`https://api.mypurecloud.com.au/api/v2/conversations/messages/${conversationId}/participants/${participantId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ state: "DISCONNECTED" })
        });

        const data = await handleApiRequest(makeRequest);
        console.log('Monitoring stopped:', data);
        setTimeout(() => {
            refreshTable()
        }, 3000);
        alert('Monitoring has been successfully stopped.');
    } catch (error) {
        console.error('Error stopping monitoring:', error);
        alert('Failed to stop monitoring. Please try again.');
    } finally {
        button.disabled = false;
        button.textContent = 'Stop Monitoring';
    }
}

/**
 * Returns the start time of the monitoring session for the given participant, if any.
 * If the participant is not being monitored, returns 'N/A'.
 *
 * @param {object} participant - The participant object from the Genesys Cloud API.
 * @returns {string} The start time of the monitoring session, or 'N/A'.
 */
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

/**
 * Adds a search input above the table to filter the results.
 */
function addSearchBox() {
    const searchBox = document.createElement('input');
    searchBox.type = 'text';
    searchBox.id = 'searchBox';
    searchBox.placeholder = 'Search chats...';
    document.getElementById('monitoredChatsTable').before(searchBox);
}

/**
 * Initializes sorting and searching for the table. 
 * It sets up the table to be interactive and responsive to user input.
 * 
 * Features include:
 * Adding a search input box above the table.
 * Enabling sorting on table headers by adding a click event listener that calls the sortTable function.
 * Setting the default sort to descending by date (first column).
 * Updating the search value and filtering the table when the user types in the search input box.
 * Filtering the table when the "Show only Production" checkbox is checked or unchecked.
 */
function initializeTableFeatures() {
    addSearchBox();

    // Add sorting to headers
    const headers = document.querySelectorAll('#monitoredChatsTable th');
    headers.forEach((header, index) => {
        // Sort on click
        header.addEventListener('click', () => sortTable(index, true));
        // Add sort indicator class
        header.classList.add('sortable');
    });

    // Add default sort by date (first column)
    const dateHeader = headers[0];
    // Set sort indicator to descending
    dateHeader.classList.add('sort-desc');
    // Sort by date
    sortTable(0);

    // Store the current search value
    document.getElementById('searchBox').addEventListener('input', function (e) {
        currentSearchValue = e.target.value;
        // Update the table with the new search value
        filterTable(e);
    });

    // Add event listeners for checkboxes
    document.getElementById('prodOnlyCheckbox').addEventListener('change', () => filterTable({}));
}

/**
 * Sorts the table by the given column index.
 * If invertSort is true, the sort direction is inverted.
 * @param {number} columnIndex - The index of the column to sort by.
 * @param {boolean} [invertSort=false] - Whether to invert the sort direction.
 */
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

/**
 * Filters the monitored chats table based on the given search text and whether the
 * "Show only Production" checkbox is checked.
 *
 * @param {Event} e - The event object from the input or change event.
 */
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
