const MAX_PAGE_RELOADS_FOR_TOKEN = 5;
const TOKEN_RELOAD_DELAY = 2000; // 2 seconds in milliseconds

let token;



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

async function handleTokenCheck() {
    const token = await getToken();

    console.log('Token:', token);
    showLoading();
    if (token) {
        console.log('Valid token found');
        await setReloadAttempts(0); // Reset counter on successful token
    
        await fetchData();
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

// document.addEventListener('DOMContentLoaded', async function () {
//     await handleTokenCheck();
//     document.getElementById('refreshButton').addEventListener('click', refreshTable);
// });


document.addEventListener('DOMContentLoaded', async () => {    
    await handleTokenCheck();
    // Add event listeners for buttons
    document.getElementById('refreshButton').addEventListener('click', async () => {
        showLoading();
        await fetchData();
        hideLoading();
    } );
    document.getElementById('activateProdButton').addEventListener('click', async () => updateQueueMembers('prod'));
    document.getElementById('activateTrainingButton').addEventListener('click', async () => updateQueueMembers('training'));
    
});



// async function initializeWithStoredToken() {
//     token = await getToken();
//     if (token) {
//         await fetchData();
//         hideLoading();
//     } else {
//         console.error('No valid stored token found');
//     }
// }

function showLoading() {
    document.getElementById('loadingMessage').style.display = 'flex';
    document.getElementById('content').style.display = 'none';
}

function hideLoading() {
    document.getElementById('loadingMessage').style.display = 'none';
    document.getElementById('content').style.display = 'block';
}

// initializeWithStoredToken();

/*=---------------------------------------------------------=*/

let queues;

const now = new Date();
const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

const intervalEnd = now.toISOString();
const intervalStart = threeMonthsAgo.toISOString();

function initializeTableFeatures() {
    // addSearchBox();

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
                },
                {
                    type: 'or',
                    predicates: [{ dimension: 'mediaType', value: 'message' }]
                }
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
    // Fetch queues
    queues = await getAllObjects('/api/v2/routing/queues');

    // Find the required queue IDs
    const prodQueue = queues.find(q => q.name === 'LLA_Digital PROD');
    const trainingQueue = queues.find(q => q.name === 'LLA_Digital Training');

    // Fetch queue members
    const prodMembers = await getAllObjects(`/api/v2/routing/queues/${prodQueue.id}/members?pageSize=500&joined=true`);
    const trainingMembers = await getAllObjects(`/api/v2/routing/queues/${trainingQueue.id}/members?pageSize=500&joined=true`);


    // Filter members who are in both queues and joined
    const relevantMembers = prodMembers.filter(member =>
        member.joined &&
        trainingMembers.some(tm => tm.id === member.id && tm.joined)
    );

    // Fetch user aggregates
    const userIds = relevantMembers.map(member => member.id);
    const aggregatesData = await fetchUserAggregates(userIds, [prodQueue.id, trainingQueue.id], token);

    const tableData = relevantMembers.map(member => {
        let prodInteractions = 0, trainingInteractions = 0
        if (aggregatesData.results) {
            const userAggregates = aggregatesData.results.filter(result => result.group.userId === member.id);
            prodInteractions = userAggregates.find(a => a.group.queueId === prodQueue.id)?.data[0]?.metrics[0]?.stats?.count || 0;
            trainingInteractions = userAggregates.find(a => a.group.queueId === trainingQueue.id)?.data[0]?.metrics[0]?.stats?.count || 0;
        }

        return {
            id: member.id,
            email: member.user.username,
            prodInteractions,
            trainingInteractions
        };
        //   }).filter(user => user.prodInteractions > 0 && user.trainingInteractions === 0);
    })//.filter(user => user.prodInteractions > 0);


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
            <td>${user.prodInteractions}</td>
            <td>${user.trainingInteractions}</td>
        `;
        tableBody.appendChild(row);
    });

    initializeTableFeatures();
}

async function updateQueueMembers(queueType) {
    const prodQueue = queues.find(q => q.name === 'LLA_Digital PROD');
    const trainingQueue = queues.find(q => q.name === 'LLA_Digital Training');

    const selectedUsers = Array.from(document.querySelectorAll('.rowSelect:checked'))
        .map(checkbox => checkbox.dataset.id);

    if (selectedUsers.length === 0) {
        alert('Please select at least one user.');
        return;
    }

    const prodBody = selectedUsers.map(userId => ({
        id: userId,
        joined: queueType === 'prod'
    }));

    const trainingBody = selectedUsers.map(userId => ({
        id: userId,
        joined: queueType === 'training'
    }));

    try {
        const prodResponse = await fetch(`https://api.mypurecloud.com.au/api/v2/routing/queues/${prodQueue.id}/members`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(prodBody)
        });

        const trainingResponse = await fetch(`https://api.mypurecloud.com.au/api/v2/routing/queues/${trainingQueue.id}/members`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(trainingBody)
        });

        if (!prodResponse.ok || !trainingResponse.ok) {
            throw new Error(`HTTP error! status: ${prodResponse.status} or ${trainingResponse.status}`);
        }

        alert(`Successfully updated both PROD and Training queue members.`);
        // Refresh the data after updating
        fetchData();
    } catch (error) {
        console.error(`Error updating queue members:`, error);
        alert(`Error updating queue members. Please check the console for details.`);
    }
}

function filterTableData() {
    const prodHandled = document.getElementById('prodHandledCheckbox').checked;
    const trainingHandled = document.getElementById('trainingHandledCheckbox').checked;

    const rows = document.querySelectorAll('#usersQueuesTable tr:not(:first-child)');

    rows.forEach(row => {
        const prodInteractions = parseInt(row.cells[2].textContent, 10);
        const trainingInteractions = parseInt(row.cells[3].textContent, 10);

        const showRow = (!prodHandled || prodInteractions > 0) && (!trainingHandled || trainingInteractions > 0);
        row.style.display = showRow ? '' : 'none';
    });
}
