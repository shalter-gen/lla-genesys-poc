const MAX_PAGE_RELOADS_FOR_TOKEN = 5;
const TOKEN_RELOAD_DELAY = 2000;

let token;
let queues = [];
let groups = [];
let selectedQueue = null;
let queueMembers = [];
let groupSelections = new Map(); // Track which groups are selected

/**
 * Retrieves the stored number of reload attempts
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
 * Sets the number of reload attempts
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
 * Handles token check and initialization
 */
async function handleTokenCheck() {
    token = await getToken();
    console.log('Token:', token);
    showLoading();
    
    if (token) {
        console.log('Valid token found');
        await setReloadAttempts(0);
        await initializeData();
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
            await setReloadAttempts(0);
        }
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await handleTokenCheck();
    
    // Add event listener for queue filter input
    document.getElementById('queueFilter').addEventListener('input', (e) => {
        filterQueues(e.target.value);
    });
    
    // Add event listener for queue selection
    document.getElementById('queueSelect').addEventListener('change', async (e) => {
        const queueId = e.target.value;
        if (queueId) {
            selectedQueue = queues.find(q => q.id === queueId);
            showLoading();
            await loadQueueData();
            hideLoading();
        } else {
            hideDataSections();
        }
    });
    
    // Add event listeners for buttons
    document.getElementById('refreshButton').addEventListener('click', async () => {
        if (!selectedQueue) return;
        showLoading();
        await loadQueueData();
        hideLoading();
    });
    
    document.getElementById('activateButton').addEventListener('click', async () => {
        await updateUsers(true);
    });
    
    document.getElementById('deactivateButton').addEventListener('click', async () => {
        await updateUsers(false);
    });
    
    // Add event listener for adhoc members checkbox
    document.getElementById('adhocMembersCheckbox').addEventListener('change', function() {
        handleAdhocSelection(this.checked);
    });
});

function showLoading() {
    document.getElementById('loadingMessage').style.display = 'flex';
    document.getElementById('content').style.display = 'none';
}

function hideLoading() {
    document.getElementById('loadingMessage').style.display = 'none';
    document.getElementById('content').style.display = 'block';
}

function hideDataSections() {
    document.getElementById('buttonContainer').style.display = 'none';
    document.getElementById('groupsSection').style.display = 'none';
    document.getElementById('usersSection').style.display = 'none';
}

function showDataSections() {
    document.getElementById('buttonContainer').style.display = 'flex';
    document.getElementById('groupsSection').style.display = 'block';
    document.getElementById('usersSection').style.display = 'block';
}

/**
 * Fetch all pages from a paginated API endpoint
 */
async function fetchAllPages(initialUrl) {
    let allData = [];
    let nextUri = initialUrl;
    const baseUrl = 'https://api.mypurecloud.com.au';

    while (nextUri) {
        const fullUrl = nextUri.startsWith('http') ? nextUri : `${baseUrl}${nextUri}`;
        
        const response = await fetch(fullUrl, {
            headers: { 
                'Authorization': `Bearer ${token}`, 
                'Content-Type': 'application/json' 
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        allData = allData.concat(data.entities || []);
        nextUri = data.nextUri;
    }

    return allData;
}

async function getAllObjects(endpoint) {
    const initialUrl = `https://api.mypurecloud.com.au${endpoint}`;
    return await fetchAllPages(initialUrl);
}

/**
 * Initialize data - fetch queues and groups
 */
async function initializeData() {
    // Fetch all queues
    queues = await getAllObjects('/api/v2/routing/queues');
    queues.sort((a, b) => a.name.localeCompare(b.name));
    
    // Fetch all groups
    groups = await getAllObjects('/api/v2/groups');
    
    // Populate queue dropdown
    populateQueueDropdown();
}

function populateQueueDropdown() {
    const queueSelect = document.getElementById('queueSelect');
    queueSelect.innerHTML = '<option value="">-- Select a Queue --</option>';
    
    queues.forEach(queue => {
        const option = document.createElement('option');
        option.value = queue.id;
        option.textContent = queue.name;
        option.dataset.queueName = queue.name.toLowerCase();
        queueSelect.appendChild(option);
    });
}

/**
 * Filter queues based on search input
 */
function filterQueues(searchText) {
    const queueSelect = document.getElementById('queueSelect');
    const options = queueSelect.querySelectorAll('option');
    const searchLower = searchText.toLowerCase();
    
    options.forEach(option => {
        if (option.value === '') {
            option.style.display = 'block';
            return;
        }
        
        const queueName = option.dataset.queueName || option.textContent.toLowerCase();
        if (queueName.includes(searchLower)) {
            option.style.display = 'block';
        } else {
            option.style.display = 'none';
        }
    });
}

/**
 * Load queue data - fetch members and display
 */
async function loadQueueData() {
    if (!selectedQueue) return;
    
    try {
        // Fetch queue details to get memberGroups
        const queueResponse = await fetch(
            `https://api.mypurecloud.com.au/api/v2/routing/queues/${selectedQueue.id}`,
            {
                headers: { 
                    'Authorization': `Bearer ${token}`, 
                    'Content-Type': 'application/json' 
                }
            }
        );
        
        if (!queueResponse.ok) {
            throw new Error(`HTTP error! status: ${queueResponse.status}`);
        }
        
        const queueDetails = await queueResponse.json();
        const queueMemberGroups = queueDetails.memberGroups || [];
        
        // Fetch queue members with group expansion (both group and adhoc members)
        queueMembers = await getAllObjects(
            `/api/v2/routing/queues/${selectedQueue.id}/members?expand=groups&pageSize=100`
        );
        
        // Build user-group mappings
        const userGroupMap = new Map();
        queueMembers.forEach(member => {
            if (!userGroupMap.has(member.id)) {
                userGroupMap.set(member.id, {
                    user: member,
                    groups: [],
                    memberBy: member.memberBy
                });
            }
            if (member.user.groups) {
                member.user.groups.forEach(group => {
                    userGroupMap.get(member.id).groups.push(group.id);
                });
            }
        });
        
        // Display groups (only queue member groups)
        displayGroups(queueMemberGroups);
        
        // Display users
        displayUsers(userGroupMap);
        
        // Show sections
        showDataSections();
        
    } catch (error) {
        console.error('Error loading queue data:', error);
        alert('Error loading queue data. Please check the console for details.');
    }
}

/**
 * Display groups with checkboxes
 */
function displayGroups(queueMemberGroups) {
    const groupsList = document.getElementById('groupsList');
    groupsList.innerHTML = '';
    
    if (queueMemberGroups.length === 0) {
        groupsList.innerHTML = '<div class="empty-state">No groups configured for this queue</div>';
    } else {
        // Sort groups alphabetically by name
        const sortedGroups = [...queueMemberGroups].sort((a, b) => a.name.localeCompare(b.name));
        
        sortedGroups.forEach(group => {
            // Count active and inactive users in this group
            const groupUsers = queueMembers.filter(member => 
                member.memberBy === 'group' && member.user.groups && member.user.groups.some(g => g.id === group.id)
            );
            const activeCount = groupUsers.filter(m => m.joined).length;
            const inactiveCount = groupUsers.filter(m => !m.joined).length;
            
            const groupItem = document.createElement('div');
            groupItem.className = 'group-item';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `group-${group.id}`;
            checkbox.dataset.groupId = group.id;
            
            const label = document.createElement('label');
            label.htmlFor = `group-${group.id}`;
            label.textContent = group.name;
            
            const count = document.createElement('span');
            count.className = 'group-count';
            count.textContent = `(${activeCount} active, ${inactiveCount} inactive)`;
            
            // Add event listener for group checkbox
            checkbox.addEventListener('change', function() {
                handleGroupSelection(group.id, this.checked);
            });
            
            groupItem.appendChild(checkbox);
            groupItem.appendChild(label);
            groupItem.appendChild(count);
            groupsList.appendChild(groupItem);
        });
    }
    
    // Update adhoc members count and reset checkbox
    const adhocMembers = queueMembers.filter(member => member.memberBy === 'user');
    const adhocActive = adhocMembers.filter(m => m.joined).length;
    const adhocInactive = adhocMembers.filter(m => !m.joined).length;
    document.getElementById('adhocCount').textContent = `(${adhocActive} active, ${adhocInactive} inactive)`;
    document.getElementById('adhocMembersCheckbox').checked = false;
}

/**
 * Handle group checkbox selection
 */
function handleGroupSelection(groupId, isChecked) {
    groupSelections.set(groupId, isChecked);
    
    // Update all user checkboxes for this group (only group members)
    const groupUsers = queueMembers.filter(member => 
        member.memberBy === 'group' && member.user.groups && member.user.groups.some(g => g.id === groupId)
    );
    
    groupUsers.forEach(member => {
        const activeCheckbox = document.querySelector(`#active-user-${member.id}`);
        const inactiveCheckbox = document.querySelector(`#inactive-user-${member.id}`);
        
        if (activeCheckbox) {
            activeCheckbox.checked = isChecked;
        }
        if (inactiveCheckbox) {
            inactiveCheckbox.checked = isChecked;
        }
    });
}

/**
 * Handle adhoc members checkbox selection
 */
function handleAdhocSelection(isChecked) {
    // Update all user checkboxes for adhoc members
    const adhocUsers = queueMembers.filter(member => member.memberBy === 'user');
    
    adhocUsers.forEach(member => {
        const activeCheckbox = document.querySelector(`#active-user-${member.id}`);
        const inactiveCheckbox = document.querySelector(`#inactive-user-${member.id}`);
        
        if (activeCheckbox) {
            activeCheckbox.checked = isChecked;
        }
        if (inactiveCheckbox) {
            inactiveCheckbox.checked = isChecked;
        }
    });
}

/**
 * Display active and inactive users
 */
function displayUsers(userGroupMap) {
    const activeTableBody = document.querySelector('#activeUsersTable tbody');
    const inactiveTableBody = document.querySelector('#inactiveUsersTable tbody');
    
    activeTableBody.innerHTML = '';
    inactiveTableBody.innerHTML = '';
    
    const activeUsers = [];
    const inactiveUsers = [];
    
    userGroupMap.forEach((userData, userId) => {
        if (userData.user.joined) {
            activeUsers.push(userData);
        } else {
            inactiveUsers.push(userData);
        }
    });
    
    // Sort by name
    activeUsers.sort((a, b) => a.user.user.name.localeCompare(b.user.user.name));
    inactiveUsers.sort((a, b) => a.user.user.name.localeCompare(b.user.user.name));
    
    // Display active users
    if (activeUsers.length === 0) {
        activeTableBody.innerHTML = '<tr><td colspan="4" class="empty-state">No active users</td></tr>';
    } else {
        activeUsers.forEach(userData => {
            const row = createUserRow(userData, true);
            activeTableBody.appendChild(row);
        });
    }
    
    // Display inactive users
    if (inactiveUsers.length === 0) {
        inactiveTableBody.innerHTML = '<tr><td colspan="4" class="empty-state">No inactive users</td></tr>';
    } else {
        inactiveUsers.forEach(userData => {
            const row = createUserRow(userData, false);
            inactiveTableBody.appendChild(row);
        });
    }
    
    // Setup select all checkboxes
    setupSelectAllCheckboxes();
}

/**
 * Create a user row for the table
 */
function createUserRow(userData, isActive) {
    const user = userData.user.user;
    const userGroups = userData.groups
        .map(gId => groups.find(g => g.id === gId)?.name)
        .filter(name => name)
        .join(', ');
    
    const row = document.createElement('tr');
    
    const checkboxId = isActive ? `active-user-${userData.user.id}` : `inactive-user-${userData.user.id}`;
    
    // Add visual indicator for adhoc members
    const memberType = userData.memberBy === 'user' ? ' 🔹' : '';
    
    row.innerHTML = `
        <td><input type="checkbox" id="${checkboxId}" class="user-checkbox" data-user-id="${userData.user.id}"></td>
        <td>${user.email}</td>
        <td>${user.name}${memberType}</td>
        <td class="user-groups">${userGroups || (userData.memberBy === 'user' ? 'Adhoc' : '')}</td>
    `;
    
    return row;
}

/**
 * Setup select all checkboxes
 */
function setupSelectAllCheckboxes() {
    const selectAllActive = document.getElementById('selectAllActive');
    const selectAllInactive = document.getElementById('selectAllInactive');
    
    const activeCheckboxes = document.querySelectorAll('#activeUsersTable .user-checkbox');
    const inactiveCheckboxes = document.querySelectorAll('#inactiveUsersTable .user-checkbox');
    
    selectAllActive.addEventListener('change', function() {
        activeCheckboxes.forEach(cb => cb.checked = this.checked);
    });
    
    selectAllInactive.addEventListener('change', function() {
        inactiveCheckboxes.forEach(cb => cb.checked = this.checked);
    });
    
    // Update select all state when individual checkboxes change
    activeCheckboxes.forEach(cb => {
        cb.addEventListener('change', function() {
            selectAllActive.checked = [...activeCheckboxes].every(checkbox => checkbox.checked);
        });
    });
    
    inactiveCheckboxes.forEach(cb => {
        cb.addEventListener('change', function() {
            selectAllInactive.checked = [...inactiveCheckboxes].every(checkbox => checkbox.checked);
        });
    });
}

/**
 * Chunk array for batch processing
 */
function chunkArray(arr, chunkSize = 50) {
    const chunks = [];
    for (let i = 0; i < arr.length; i += chunkSize) {
        chunks.push(arr.slice(i, i + chunkSize));
    }
    return chunks;
}

/**
 * Update users (activate or deactivate)
 */
async function updateUsers(activate) {
    if (!selectedQueue) {
        alert('Please select a queue.');
        return;
    }
    
    let selectedUserIds;
    
    if (activate) {
        // Get checked users from inactive table
        selectedUserIds = Array.from(document.querySelectorAll('#inactiveUsersTable .user-checkbox:checked'))
            .map(cb => cb.dataset.userId);
    } else {
        // Get checked users from active table
        selectedUserIds = Array.from(document.querySelectorAll('#activeUsersTable .user-checkbox:checked'))
            .map(cb => cb.dataset.userId);
    }
    
    if (selectedUserIds.length === 0) {
        alert(`Please select at least one ${activate ? 'inactive' : 'active'} user.`);
        return;
    }
    
    const chunkSize = 50;
    const userChunks = chunkArray(selectedUserIds, chunkSize);
    
    try {
        showLoading();
        
        for (const chunk of userChunks) {
            const body = chunk.map(userId => ({
                id: userId,
                joined: activate
            }));
            
            const response = await fetch(
                `https://api.mypurecloud.com.au/api/v2/routing/queues/${selectedQueue.id}/members`,
                {
                    method: 'PATCH',
                    headers: { 
                        'Authorization': `Bearer ${token}`, 
                        'Content-Type': 'application/json' 
                    },
                    body: JSON.stringify(body)
                }
            );
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
        }
        
        alert(`Successfully ${activate ? 'activated' : 'deactivated'} ${selectedUserIds.length} user(s). Refreshing data...`);
        
        // Wait for backend to process the changes (adjust delay as needed)
        await new Promise(resolve => setTimeout(resolve, 3000)); // 3 second delay
        
        // Refresh the data
        await loadQueueData();
        hideLoading();
        
    } catch (error) {
        console.error('Error updating users:', error);
        alert('Error updating users. Please check the console for details.');
        hideLoading();
    }
}