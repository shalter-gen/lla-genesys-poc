const MAX_PAGE_RELOADS_FOR_TOKEN = 5;
const TOKEN_RELOAD_DELAY = 2000;
const SITE_ID = '35eab81f-e99e-47a8-b550-ae15c317f5df';
const MAX_REQUESTS_PER_SECOND = 10;
const MAX_RETRY_ATTEMPTS = 3;

let token;
let groups = [];
let selectedGroup = null;
let groupUsers = [];
let lineBaseSettingId = null;
let phoneBaseSettingId = null;

/**
 * Throttle API requests to avoid rate limiting
 */
async function throttleRequests(requests, maxRequestsPerSecond = MAX_REQUESTS_PER_SECOND) {
    const results = [];
    const batchSize = maxRequestsPerSecond;

    for (let i = 0; i < requests.length; i += batchSize) {
        const batch = requests.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map(req => req()));
        results.push(...batchResults);

        if (i + batchSize < requests.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    return results;
}

/**
 * Fetch with retry logic for 429 errors
 */
async function fetchWithRetry(url, options = {}, retryCount = 0) {
    try {
        const response = await fetch(url, options);
        
        // Handle 429 Too Many Requests
        if (response.status === 429) {
            if (retryCount >= MAX_RETRY_ATTEMPTS) {
                throw new Error(`Max retry attempts (${MAX_RETRY_ATTEMPTS}) reached for 429 error`);
            }
            
            // Get retry-after header (in seconds) or default to exponential backoff
            const retryAfter = response.headers.get('Retry-After');
            const waitTime = retryAfter 
                ? parseInt(retryAfter) * 1000 
                : Math.pow(2, retryCount) * 1000; // Exponential backoff: 1s, 2s, 4s
            
            console.log(`Rate limited (429). Waiting ${waitTime}ms before retry ${retryCount + 1}/${MAX_RETRY_ATTEMPTS}...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            
            // Retry the request
            return fetchWithRetry(url, options, retryCount + 1);
        }
        
        return response;
    } catch (error) {
        // Network errors or other fetch failures
        if (retryCount >= MAX_RETRY_ATTEMPTS) {
            throw error;
        }
        
        console.log(`Request failed. Retrying ${retryCount + 1}/${MAX_RETRY_ATTEMPTS}...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return fetchWithRetry(url, options, retryCount + 1);
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
    
    // Event listener for group filter input
    document.getElementById('groupFilter').addEventListener('input', (e) => {
        filterGroups(e.target.value);
    });
    
    // Event listener for group selection
    document.getElementById('groupSelect').addEventListener('change', async (e) => {
        const groupId = e.target.value;
        if (groupId) {
            selectedGroup = groups.find(g => g.id === groupId);
            showLoading();
            await loadGroupUsers();
            hideLoading();
        } else {
            hideUsersSection();
            document.getElementById('createPhonesButton').disabled = true;
        }
    });
    
    // Event listener for select all checkbox
    document.getElementById('selectAllUsers').addEventListener('change', function() {
        const userCheckboxes = document.querySelectorAll('.user-checkbox');
        userCheckboxes.forEach(checkbox => {
            checkbox.checked = this.checked;
        });
        updateCreateButtonState();
    });
    
    // Event listener for create phones button
    document.getElementById('createPhonesButton').addEventListener('click', async () => {
        await createPhones();
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

function hideUsersSection() {
    document.getElementById('usersSection').style.display = 'none';
}

function showUsersSection() {
    document.getElementById('usersSection').style.display = 'block';
}

async function fetchAllPages(initialUrl) {
    let allData = [];
    let nextUri = initialUrl;
    const baseUrl = 'https://api.mypurecloud.com.au';

    while (nextUri) {
        const fullUrl = nextUri.startsWith('http') ? nextUri : `${baseUrl}${nextUri}`;
        
        const response = await fetchWithRetry(fullUrl, {
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
        
        // Small delay between pagination requests
        if (nextUri) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    return allData;
}

async function getAllObjects(endpoint) {
    const initialUrl = `https://api.mypurecloud.com.au${endpoint}`;
    return await fetchAllPages(initialUrl);
}

async function initializeData() {
    try {
        // Fetch all groups
        groups = await getAllObjects('/api/v2/groups');
        groups.sort((a, b) => a.name.localeCompare(b.name));
        
        // Populate group dropdown
        populateGroupDropdown();
        
        // Fetch line base settings - find "Genesys Cloud - WebRTC_1"
        const lineBaseSettings = await getAllObjects('/api/v2/telephony/providers/edges/linebasesettings');
        const webrtcLineSetting = lineBaseSettings.find(s => s.name === 'Genesys Cloud - WebRTC_1');
        if (webrtcLineSetting) {
            lineBaseSettingId = webrtcLineSetting.id;
            console.log('Line Base Setting ID:', lineBaseSettingId);
        } else {
            console.warn('WebRTC Line Base Setting not found');
        }
        
        // Fetch phone base settings - find "Genesys Cloud - WebRTC"
        const phoneBaseSettings = await getAllObjects('/api/v2/telephony/providers/edges/phonebasesettings');
        const webrtcPhoneSetting = phoneBaseSettings.find(s => s.name === 'Genesys Cloud - WebRTC');
        if (webrtcPhoneSetting) {
            phoneBaseSettingId = webrtcPhoneSetting.id;
            console.log('Phone Base Setting ID:', phoneBaseSettingId);
        } else {
            console.warn('WebRTC Phone Base Setting not found');
        }
        
    } catch (error) {
        console.error('Error initializing data:', error);
        alert('Error loading initial data. Please check the console for details.');
    }
}

function populateGroupDropdown() {
    const groupSelect = document.getElementById('groupSelect');
    groupSelect.innerHTML = '<option value="">-- Select a Group --</option>';
    
    groups.forEach(group => {
        const option = document.createElement('option');
        option.value = group.id;
        option.textContent = group.name;
        option.dataset.groupName = group.name.toLowerCase();
        groupSelect.appendChild(option);
    });
}

/**
 * Filter groups based on search input
 */
function filterGroups(searchText) {
    const groupSelect = document.getElementById('groupSelect');
    const options = groupSelect.querySelectorAll('option');
    const searchLower = searchText.toLowerCase();
    
    options.forEach(option => {
        if (option.value === '') {
            option.style.display = 'block';
            return;
        }
        
        const groupName = option.dataset.groupName || option.textContent.toLowerCase();
        if (groupName.includes(searchLower)) {
            option.style.display = 'block';
        } else {
            option.style.display = 'none';
        }
    });
}

async function loadGroupUsers() {
    if (!selectedGroup) return;
    
    try {
        // Fetch group members
        const groupMembers = await getAllObjects(`/api/v2/groups/${selectedGroup.id}/members?pageSize=100`);
        
        // Create throttled requests for user details
        const userRequests = groupMembers.map(member => 
            () => fetchWithRetry(
                `https://api.mypurecloud.com.au/api/v2/users/${member.id}?expand=station`,
                {
                    headers: { 
                        'Authorization': `Bearer ${token}`, 
                        'Content-Type': 'application/json' 
                    }
                }
            ).then(async response => {
                if (response.ok) {
                    return await response.json();
                }
                return null;
            })
        );
        
        // Fetch user details with throttling
        const users = await throttleRequests(userRequests);
        
        // Filter users without phones - store lastAssociatedStation info
        const usersWithoutPhone = users
            .filter(user => user !== null)
            .filter(user => !user.station || !user.station.defaultStation)
            .map(user => ({
                id: user.id,
                email: user.email,
                name: user.name,
                username: user.username,
                currentPhone: 'None',
                lastAssociatedStation: user.station?.lastAssociatedStation || null
            }));
        
        groupUsers = usersWithoutPhone;
        displayUsers(usersWithoutPhone);
        showUsersSection();
        
    } catch (error) {
        console.error('Error loading group users:', error);
        alert('Error loading group users. Please check the console for details.');
    }
}

function displayUsers(users) {
    const tableBody = document.querySelector('#usersTable tbody');
    tableBody.innerHTML = '';
    
    if (users.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" class="empty-state">All users in this group have WebRTC phones</td></tr>';
        document.getElementById('createPhonesButton').disabled = true;
        return;
    }
    
    users.sort((a, b) => a.name.localeCompare(b.name));
    
    users.forEach(user => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="checkbox" class="user-checkbox" data-user-id="${user.id}" data-user-name="${user.name}" data-username="${user.username}"></td>
            <td>${user.email}</td>
            <td>${user.name}</td>
            <td class="phone-info">${user.currentPhone}</td>
        `;
        
        const checkbox = row.querySelector('.user-checkbox');
        checkbox.addEventListener('change', updateCreateButtonState);
        
        tableBody.appendChild(row);
    });
    
    updateCreateButtonState();
}

function updateCreateButtonState() {
    const checkedBoxes = document.querySelectorAll('.user-checkbox:checked');
    document.getElementById('createPhonesButton').disabled = checkedBoxes.length === 0;
}

async function createPhones() {
    const selectedCheckboxes = document.querySelectorAll('.user-checkbox:checked');
    
    if (selectedCheckboxes.length === 0) {
        alert('Please select at least one user.');
        return;
    }
    
    if (!lineBaseSettingId || !phoneBaseSettingId) {
        alert('WebRTC settings not found. Cannot create phones.');
        return;
    }
    
    const usersToProcess = Array.from(selectedCheckboxes).map(cb => {
        const user = groupUsers.find(u => u.id === cb.dataset.userId);
        return {
            id: cb.dataset.userId,
            name: cb.dataset.userName,
            username: cb.dataset.username,
            lastAssociatedStation: user?.lastAssociatedStation || null
        };
    });
    
    const confirmMsg = `Create WebRTC phones for ${usersToProcess.length} user(s)?`;
    if (!confirm(confirmMsg)) {
        return;
    }
    
    showLoading();
    let successCount = 0;
    let failCount = 0;
    const errors = [];
    
    // Process users with throttling to avoid rate limits
    const phoneCreationRequests = usersToProcess.map(user => 
        async () => {
            try {
                let lineId = null;
                let phoneAlreadyExists = false;
                
                // Create phone name: "username - userID - WebRTC"
                const phoneName = `${user.username} - ${user.id} - WebRTC`;
                
                // Create phone
                const phoneBody = {
                    name: phoneName,
                    phoneBaseSettings: {
                        id: phoneBaseSettingId
                    },
                    webRtcUser: {
                        id: user.id
                    },
                    site: {
                        id: SITE_ID
                    },
                    lines: [
                        {
                            template: {
                                id: lineBaseSettingId
                            },
                            lineBaseSettings: {
                                id: lineBaseSettingId
                            }
                        }
                    ]
                };
                
                const createPhoneResponse = await fetchWithRetry(
                    'https://api.mypurecloud.com.au/api/v2/telephony/providers/edges/phones',
                    {
                        method: 'POST',
                        headers: { 
                            'Authorization': `Bearer ${token}`, 
                            'Content-Type': 'application/json' 
                        },
                        body: JSON.stringify(phoneBody)
                    }
                );
                
                if (!createPhoneResponse.ok) {
                    const errorData = await createPhoneResponse.json();
                    
                    // Check if error is because user already has a WebRTC phone
                    if (errorData.status === 400 && 
                        errorData.details?.some(d => d.errorCode === 'ONLY_ONE_WEB_RTC_ASSIGNMENT_ALLOWED')) {
                        
                        console.log(`User ${user.name} already has a WebRTC phone. Using existing phone.`);
                        phoneAlreadyExists = true;
                        
                        // Use the last associated station if available
                        if (user.lastAssociatedStation?.id) {
                            lineId = user.lastAssociatedStation.id;
                            console.log(`Using last associated station ID for ${user.name}:`, lineId);
                        } else {
                            // Try to fetch the user's WebRTC phone
                            const phonesResponse = await fetchWithRetry(
                                `https://api.mypurecloud.com.au/api/v2/telephony/providers/edges/phones?webRtcUserId=${user.id}`,
                                {
                                    headers: { 
                                        'Authorization': `Bearer ${token}`, 
                                        'Content-Type': 'application/json' 
                                    }
                                }
                            );
                            
                            if (phonesResponse.ok) {
                                const phonesData = await phonesResponse.json();
                                if (phonesData.entities && phonesData.entities.length > 0) {
                                    const phone = phonesData.entities[0];
                                    if (phone.lines && phone.lines.length > 0) {
                                        lineId = phone.lines[0].id;
                                        console.log(`Found WebRTC phone line ID for ${user.name}:`, lineId);
                                    }
                                }
                            }
                            
                            if (!lineId) {
                                throw new Error('User has WebRTC phone but could not find line ID');
                            }
                        }
                    } else {
                        throw new Error(`Failed to create phone: ${errorData.message || createPhoneResponse.status}`);
                    }
                } else {
                    // Phone created successfully
                    const createdPhone = await createPhoneResponse.json();
                    console.log(`Phone created for ${user.name}:`, createdPhone.id);
                    
                    // Get the line ID from the first line
                    if (!createdPhone.lines || createdPhone.lines.length === 0) {
                        throw new Error('No lines returned in phone creation response');
                    }
                    lineId = createdPhone.lines[0].id;
                    console.log(`Line ID for ${user.name}:`, lineId);
                    
                    // Wait for backend to process the phone creation
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
                
                // Assign phone to user using the line ID
                const assignPhoneResponse = await fetchWithRetry(
                    `https://api.mypurecloud.com.au/api/v2/users/${user.id}/station/defaultstation/${lineId}`,
                    {
                        method: 'PUT',
                        headers: { 
                            'Authorization': `Bearer ${token}`, 
                            'Content-Type': 'application/json' 
                        }
                    }
                );
                
                if (!assignPhoneResponse.ok) {
                    throw new Error(`Failed to assign phone: ${assignPhoneResponse.status}`);
                }
                
                const action = phoneAlreadyExists ? 'assigned existing phone to' : 'created and assigned phone to';
                console.log(`Successfully ${action} ${user.name}`);
                successCount++;
                return { success: true, user };
                
            } catch (error) {
                console.error(`Error creating phone for ${user.name}:`, error);
                errors.push(`${user.name}: ${error.message}`);
                failCount++;
                return { success: false, user, error };
            }
        }
    );
    
    // Execute phone creation with throttling (reduce to 5 per second for create operations)
    await throttleRequests(phoneCreationRequests, 5);
    
    hideLoading();
    
    let resultMsg = `Successfully created ${successCount} phone(s).`;
    if (failCount > 0) {
        resultMsg += `\n${failCount} failed:\n${errors.join('\n')}`;
    }
    alert(resultMsg);
    
    // Refresh the user list
    if (successCount > 0) {
        showLoading();
        await loadGroupUsers();
        hideLoading();
    }
}