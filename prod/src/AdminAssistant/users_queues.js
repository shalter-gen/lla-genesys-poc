const MAX_PAGE_RELOADS_FOR_TOKEN = 5;
const TOKEN_RELOAD_DELAY = 2000; // 2 seconds in milliseconds

let token;
let queues = [];
let selectedQueue1 = null;
let selectedQueue2 = null;

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
    showLoading();
    if (token) {
        console.log('Valid token found');
        await setReloadAttempts(0); // Reset counter on successful token
    
        await initializeQueues();
        hideLoading();

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

document.addEventListener('DOMContentLoaded', async () => {    
    await handleTokenCheck();
    
    // Add event listeners for buttons
    document.getElementById('refreshButton').addEventListener('click', async () => {
        if (!validateQueueSelection()) return;
        showLoading();
        await fetchData();
        hideLoading();
    });
    
    document.getElementById('activateProdButton').addEventListener('click', async () => {
        if (!validateQueueSelection()) return;
        await updateQueueMembers('prod');
    });
    
    document.getElementById('activateTrainingButton').addEventListener('click', async () => {
        if (!validateQueueSelection()) return;
        await updateQueueMembers('training');
    });
    
    document.getElementById('deactivateBothButton').addEventListener('click', async () => {
        if (!validateQueueSelection()) return;
        await updateQueueMembers('deactivateBoth');
    });
    
    // Add event listeners for queue dropdowns
    document.getElementById('queue1Select').addEventListener('change', (e) => {
        selectedQueue1 = queues.find(q => q.id === e.target.value);
        updateButtonLabels();
    });
    
    document.getElementById('queue2Select').addEventListener('change', (e) => {
        selectedQueue2 = queues.find(q => q.id === e.target.value);
        updateButtonLabels();
    });
});

function validateQueueSelection() {
    if (!selectedQueue1 || !selectedQueue2) {
        alert('Please select both Queue 1 and Queue 2 before proceeding.');
        return false;
    }
    if (selectedQueue1.id === selectedQueue2.id) {
        alert('Queue 1 and Queue 2 must be different queues.');
        return false;
    }
    return true;
}

function updateButtonLabels() {
    const activateProdButton = document.getElementById('activateProdButton');
    const activateTrainingButton = document.getElementById('activateTrainingButton');
    const deactivateBothButton = document.getElementById('deactivateBothButton');
    
    if (selectedQueue1 && selectedQueue2) {
        activateProdButton.textContent = `Activate ${selectedQueue1.name} / Deactivate ${selectedQueue2.name}`;
        activateTrainingButton.textContent = `Deactivate ${selectedQueue1.name} / Activate ${selectedQueue2.name}`;
        deactivateBothButton.textContent = `Deactivate ${selectedQueue1.name} / Deactivate ${selectedQueue2.name}`;
    } else {
        activateProdButton.textContent = 'Activate Queue 1 / Deactivate Queue 2';
        activateTrainingButton.textContent = 'Deactivate Queue 1 / Activate Queue 2';
        deactivateBothButton.textContent = 'Deactivate Both Queues';
    }
}

function showLoading() {
    document.getElementById('loadingMessage').style.display = 'flex';
    document.getElementById('content').style.display = 'none';
}

function hideLoading() {
    document.getElementById('loadingMessage').style.display = 'none';
    document.getElementById('content').style.display = 'block';
}

/*=---------------------------------------------------------=*/

const now = new Date();
const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

const intervalEnd = now.toISOString();
const intervalStart = threeMonthsAgo.toISOString();

async function initializeQueues() {
    // Fetch all queues
    queues = await getAllObjects('/api/v2/routing/queues');
    
    // Sort queues alphabetically by name
    queues.sort((a, b) => a.name.localeCompare(b.name));
    
    // Populate dropdowns
    populateQueueDropdowns();
}

function populateQueueDropdowns() {
    const queue1Select = document.getElementById('queue1Select');
    const queue2Select = document.getElementById('queue2Select');
    
    // Clear existing options
    queue1Select.innerHTML = '<option value="">-- Select Queue 1 --</option>';
    queue2Select.innerHTML = '<option value="">-- Select Queue 2 --</option>';
    
    // Add queue options
    queues.forEach(queue => {
        const option1 = document.createElement('option');
        option1.value = queue.id;
        option1.textContent = queue.name;
        queue1Select.appendChild(option1);
        
        const option2 = document.createElement('option');
        option2.value = queue.id;
        option2.textContent = queue.name;
        queue2Select.appendChild(option2);
    });
    
    // Try to select default queues if they exist
    const defaultQueue1 = queues.find(q => q.name === 'LLA_CS_DIGITAL PROD');
    const defaultQueue2 = queues.find(q => q.name === 'LLA_CS_DIGITAL Training');
    // const defaultQueue2 = queues.find(q => q.name === 'LLA_CS_Voice Training');
    
    if (defaultQueue1) {
        queue1Select.value = defaultQueue1.id;
        selectedQueue1 = defaultQueue1;
    }
    if (defaultQueue2) {
        queue2Select.value = defaultQueue2.id;
        selectedQueue2 = defaultQueue2;
    }
    
    // Update button labels with default queue names if set
    updateButtonLabels();
}

function initializeTableFeatures() {
    // Add sorting to headers
    const tableHeaders = document.querySelectorAll('#usersQueuesTable th');
    tableHeaders.forEach((header, index) => {
        header.addEventListener('click', () => sortTable(index));
        header.classList.add('sortable');
    });

    // Add select all functionality
    const selectAllCheckbox = document.querySelector('#usersQueuesTable thead input[type="checkbox"]');
    const rowCheckboxes = document.querySelectorAll('#usersQueuesTable tbody input[type="checkbox"]');

    selectAllCheckbox.addEventListener('change', function() {
        rowCheckboxes.forEach(checkbox => {
            checkbox.checked = this.checked;
        });
    });

    // Add individual checkbox listeners
    rowCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            const allChecked = [...rowCheckboxes].every(cb => cb.checked);
            selectAllCheckbox.checked = allChecked;
        });
    });
}

async function fetchAllPages(initialUrl) {
    let allData = [];
    let nextUri = initialUrl;
    const baseUrl = 'https://api.mypurecloud.com.au'; // Adjust this if your region is different

    while (nextUri) {
        const fullUrl = nextUri.startsWith('http') ? nextUri : `${baseUrl}${nextUri}`;

        const response = await fetch(fullUrl, {
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        allData = allData.concat(data.entities);

        nextUri = data.nextUri;
    }

    return allData;
}

async function getAllObjects(endpoint) {
    const initialUrl = `https://api.mypurecloud.com.au${endpoint}`;
    return await fetchAllPages(initialUrl);
}

async function fetchUserAggregates(userIds, queueIds) {
    const body = {
        interval: `${intervalStart}/${intervalEnd}`,
        groupBy: ['userId', 'queueId'],
        metrics: ['tAnswered'],
        filter: {
            type: 'and',
            clauses: [
                {
                    type: 'or',
                    predicates: userIds.map(id => ({ dimension: 'userId', value: id }))
                },
                {
                    type: 'or',
                    predicates: queueIds.map(id => ({ dimension: 'queueId', value: id }))
                }/*,
                {
                    type: 'or',
                    predicates: [{ dimension: 'mediaType', value: 'message' }]
                }*/
            ]
        }
    };

    const aggregatesResponse = await fetch('https://api.mypurecloud.com.au/api/v2/analytics/conversations/aggregates/query', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    return await aggregatesResponse.json();
}

async function fetchData() {
    if (!selectedQueue1 || !selectedQueue2) {
        alert('Please select both queues.');
        return;
    }

    // Fetch queue members
    const queue1Members = await getAllObjects(`/api/v2/routing/queues/${selectedQueue1.id}/members?pageSize=500&joined=true`);
    const queue2Members = await getAllObjects(`/api/v2/routing/queues/${selectedQueue2.id}/members?pageSize=500&joined=true`);

    // Filter members who are in both queues and joined
    const relevantMembers = queue1Members.filter(member =>
        member.joined &&
        queue2Members.some(tm => tm.id === member.id && tm.joined)
    );

    // Fetch user aggregates
    const userIds = relevantMembers.map(member => member.id);
    const aggregatesData = await fetchUserAggregates(userIds, [selectedQueue1.id, selectedQueue2.id], token);

    const tableData = relevantMembers.map(member => {
        let queue1Interactions = 0, queue2Interactions = 0;
        if (aggregatesData.results) {
            const userAggregates = aggregatesData.results.filter(result => result.group.userId === member.id);
            queue1Interactions = userAggregates.find(a => a.group.queueId === selectedQueue1.id)?.data[0]?.metrics[0]?.stats?.count || 0;
            queue2Interactions = userAggregates.find(a => a.group.queueId === selectedQueue2.id)?.data[0]?.metrics[0]?.stats?.count || 0;
        }

        return {
            id: member.id,
            email: member.user.username,
            queue1Interactions,
            queue2Interactions
        };
    });

    displayTable(tableData);
}

function displayTable(data) {
    const tableBody = document.querySelector('#usersQueuesTable tbody');
    tableBody.innerHTML = ''; // Clear existing rows

    data.forEach(user => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="checkbox" class="rowSelect" data-id="${user.id}"></td>
            <td>${user.email}</td>
            <td>${user.queue1Interactions}</td>
            <td>${user.queue2Interactions}</td>
        `;
        tableBody.appendChild(row);
    });

    // Update table headers with queue names
    document.querySelector('#usersQueuesTable thead tr').innerHTML = `
        <th><input type="checkbox" id="selectAll">Select All</th>
        <th>Email</th>
        <th>${selectedQueue1.name} Interactions</th>
        <th>${selectedQueue2.name} Interactions</th>
    `;

    initializeTableFeatures();
}

function chunkArray(arr, chunkSize = 50) {
    const chunks = [];
    for (let i = 0; i < arr.length; i += chunkSize) {
        chunks.push(arr.slice(i, i + chunkSize));
    }
    return chunks;
}

async function updateQueueMembers(queueType) {
    if (!selectedQueue1 || !selectedQueue2) {
        alert('Please select both queues.');
        return;
    }

    const selectedUsers = Array.from(document.querySelectorAll('.rowSelect:checked'))
        .map(checkbox => checkbox.dataset.id);

    if (selectedUsers.length === 0) {
        alert('Please select at least one user.');
        return;
    }

    const chunkSize = 50;
    const userChunks = chunkArray(selectedUsers, chunkSize);

    try {
        for (const chunk of userChunks) {
            let queue1Body, queue2Body;
            
            if (queueType === 'deactivateBoth') {
                // Deactivate both queues
                queue1Body = chunk.map(userId => ({
                    id: userId,
                    joined: false
                }));
                queue2Body = chunk.map(userId => ({
                    id: userId,
                    joined: false
                }));
            } else {
                // Original logic for prod/training
                queue1Body = chunk.map(userId => ({
                    id: userId,
                    joined: queueType === 'prod'
                }));
                queue2Body = chunk.map(userId => ({
                    id: userId,
                    joined: queueType === 'training'
                }));
            }

            const queue1Response = await fetch(`https://api.mypurecloud.com.au/api/v2/routing/queues/${selectedQueue1.id}/members`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(queue1Body)
            });

            const queue2Response = await fetch(`https://api.mypurecloud.com.au/api/v2/routing/queues/${selectedQueue2.id}/members`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(queue2Body)
            });

            if (!queue1Response.ok || !queue2Response.ok) {
                throw new Error(`HTTP error! status: ${queue1Response.status} or ${queue2Response.status}`);
            }
        }

        const actionMessage = queueType === 'deactivateBoth' 
            ? `Successfully deactivated users from both ${selectedQueue1.name} and ${selectedQueue2.name}.`
            : `Successfully updated both ${selectedQueue1.name} and ${selectedQueue2.name} queue members.`;
        
        alert(actionMessage);
        // Refresh the data after updating
        fetchData();
    } catch (error) {
        console.error(`Error updating queue members:`, error);
        alert(`Error updating queue members. Please check the console for details.`);
    }
}

function filterTableData() {
    const queue1Handled = document.getElementById('queue1HandledCheckbox').checked;
    const queue2Handled = document.getElementById('queue2HandledCheckbox').checked;

    const rows = document.querySelectorAll('#usersQueuesTable tr:not(:first-child)');

    rows.forEach(row => {
        const queue1Interactions = parseInt(row.cells[2].textContent, 10);
        const queue2Interactions = parseInt(row.cells[3].textContent, 10);

        const showRow = (!queue1Handled || queue1Interactions > 0) && (!queue2Handled || queue2Interactions > 0);
        row.style.display = showRow ? '' : 'none';
    });
}