const BASE_URL = 'https://api.mypurecloud.com.au';
const MAX_RETRIES = 8;
const RETRY_DELAY = 5000;
const RATE_LIMIT_DELAY = 1000;
const MAX_PAGE_RELOADS_FOR_TOKEN = 5;
const TOKEN_RELOAD_DELAY = 2000;
// const TOKEN_KEY_NAME = 'access_token';

let token;
let extractedData = {};
let isExtracting = false;

// Initialize page
document.addEventListener('DOMContentLoaded', async function() {
    await handleTokenCheck();
    setupEventListeners();
});

function setupEventListeners() {
    document.getElementById('extractButton').addEventListener('click', startExtraction);
    document.getElementById('downloadButton').addEventListener('click', downloadData);
    
    // Show/hide user options when users checkbox is toggled
    document.getElementById('users').addEventListener('change', function() {
        const userOptions = document.getElementById('userOptions');
        userOptions.style.display = this.checked ? 'block' : 'none';
    });
}

/**
 * Handles the process of checking the validity of a stored token
 * and manages features initialization and reload attempts.
 */
async function handleTokenCheck() {
    token = await getToken();
    console.log('Token:', token);
    
    if (token) {
        console.log('Valid token found');
        await setReloadAttempts(0); // Reset counter on successful token
        logStatus('Token validated successfully', 'success');
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
            await setReloadAttempts(0); // Reset counter
            logStatus('ERROR: No valid token found after maximum reload attempts. Please ensure you are logged into Genesys Cloud.', 'error');
        }
    }
}

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
 * Sets the number of reload attempts to the given value
 */
async function setReloadAttempts(count) {
    const isExtension = determineEnvironment();
    if (isExtension) {
        await chrome.storage.local.set({ reloadAttempts: count });
    } else {
        localStorage.setItem('reloadAttempts', count.toString());
    }
}

async function startExtraction() {
    if (isExtracting) return;
    
    // Re-check token before starting extraction
    if (!token) {
        token = await getToken();
        if (!token) {
            logStatus('ERROR: No valid token found. Please ensure you are logged into Genesys Cloud.', 'error');
            return;
        }
    }
    
    const selectedObjects = getSelectedObjects();
    if (selectedObjects.length === 0) {
        alert('Please select at least one object type to extract.');
        return;
    }
    
    isExtracting = true;
    extractedData = {};
    
    document.getElementById('extractButton').disabled = true;
    document.getElementById('downloadButton').disabled = true;
    document.getElementById('progressContainer').style.display = 'block';
    document.getElementById('resultsContainer').style.display = 'none';
    
    try {
        await extractSelectedData(selectedObjects);
        showResults();
        document.getElementById('downloadButton').disabled = false;
    } catch (error) {
        logStatus(`Extraction failed: ${error.message}`, 'error');
    } finally {
        isExtracting = false;
        document.getElementById('extractButton').disabled = false;
        updateProgress(100, 'Extraction completed');
    }
}

function getSelectedObjects() {
    const checkboxes = document.querySelectorAll('input[type="checkbox"]:checked');
    return Array.from(checkboxes).map(cb => cb.value);
}

async function extractSelectedData(selectedObjects) {
    const totalSteps = selectedObjects.length;
    let currentStep = 0;
    
    for (const objectType of selectedObjects) {
        currentStep++;
        const progress = (currentStep / totalSteps) * 100;
        updateProgress(progress, `Extracting ${objectType}...`);
        
        try {
            switch (objectType) {
                case 'users':
                    extractedData.users = await extractUsers();
                    break;
                case 'groups':
                    extractedData.groups = await extractGroups();
                    break;
                case 'queues':
                    extractedData.queues = await extractQueues();
                    break;
                case 'workteams':
                    extractedData.workteams = await extractWorkTeams();
                    break;
                case 'divisions':
                    extractedData.divisions = await extractDivisions();
                    break;
                case 'roles':
                    extractedData.roles = await extractRoles();
                    break;
            }
            logStatus(`✓ ${objectType} extracted successfully`, 'success');
        } catch (error) {
            logStatus(`✗ Failed to extract ${objectType}: ${error.message}`, 'error');
            throw error;
        }
        
        // Rate limiting delay
        if (currentStep < totalSteps) {
            await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
        }
    }
}

async function extractUsers() {
    const userState = document.querySelector('input[name="userState"]:checked')?.value || 'active';
    
    // First, fetch all groups to create a mapping of group ID to group name
    logStatus('Fetching all groups for user mapping...');
    const groupsMap = await fetchAllGroupsMap();
    
    const users = [];
    let nextUri = `/api/v2/users?expand=dateLastLogin,team,groups,authorization&state=${userState}&pageSize=100`;
    
    while (nextUri) {
        const makeRequest = () => fetch(`${BASE_URL}${nextUri}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        const response = await handleApiRequest(makeRequest);
        users.push(...response.entities);
        nextUri = response.nextUri;
        
        logStatus(`Fetched ${users.length} users so far...`);
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    return users.map(user => flattenUser(user, groupsMap));
}

async function fetchAllGroupsMap() {
    const groupsMap = new Map();
    let nextUri = '/api/v2/groups?pageSize=100';
    
    while (nextUri) {
        const makeRequest = () => fetch(`${BASE_URL}${nextUri}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        const response = await handleApiRequest(makeRequest);
        
        // Build the groups map
        response.entities.forEach(group => {
            groupsMap.set(group.id, group.name);
        });
        
        nextUri = response.nextUri;
        logStatus(`Fetched ${groupsMap.size} groups for mapping...`);
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    return groupsMap;
}

function flattenUser(user, groupsMap) {
    const flattened = {
        id: user.id,
        name: user.name,
        'division.id': user.division?.id,
        'division.name': user.division?.name,
        'chat.jabberId': user.chat?.jabberId,
        department: user.department,
        email: user.email,
        state: user.state,
        title: user.title,
        username: user.username,
        version: user.version,
        acdAutoAnswer: user.acdAutoAnswer,
        dateLastLogin: user.dateLastLogin,
        team: user.team?.name, 
    };
    
    // Handle groups - create comma-separated lists of both IDs and names
    if (user.groups && user.groups.length > 0) {
        flattened.groups = user.groups.map(g => g.id).join(',');
        
        // Map group IDs to group names using the groupsMap
        const groupNames = user.groups
            .map(g => groupsMap.get(g.id) || g.name || 'Unknown Group')
            .filter(name => name !== 'Unknown Group'); // Filter out any unmapped groups
        
        flattened.groupNames = groupNames.join(',');
    } else {
        flattened.groups = '';
        flattened.groupNames = '';
    }
    
    // Handle roles
    if (user.authorization?.roles && user.authorization.roles.length > 0) {
        flattened.roles = user.authorization.roles.map(r => r.name).join(',');
    } else {
        flattened.roles = '';
    }
    
    // Extract Centre from addresses (WORK4 type display value) and remove parentheses
    flattened.Centre = '';
    if (user.addresses && user.addresses.length > 0) {
        const work4Address = user.addresses.find(addr => addr.type === 'WORK4');
        if (work4Address && work4Address.display) {
            // Remove parentheses from the display value
            flattened.Centre = work4Address.display.replace(/\(|\)/g, '');
        }
    }
    
    // Handle contact info
    if (user.primaryContactInfo) {
        user.primaryContactInfo.forEach((contact, i) => {
            flattened[`primaryContactInfo.${i}.address`] = contact.address;
            flattened[`primaryContactInfo.${i}.mediaType`] = contact.mediaType;
            flattened[`primaryContactInfo.${i}.type`] = contact.type;
        });
    }
    
    // Handle addresses (keep the existing detailed address handling)
    if (user.addresses) {
        user.addresses.forEach((address, i) => {
            flattened[`addresses.${i}.address`] = address.address;
            flattened[`addresses.${i}.mediaType`] = address.mediaType;
            flattened[`addresses.${i}.type`] = address.type;
            if (address.display) {
                flattened[`addresses.${i}.display`] = address.display;
            }
            if (address.countryCode) {
                flattened[`addresses.${i}.countryCode`] = address.countryCode;
            }
        });
    }
    
    return flattened;
}

async function extractGroups() {
    const groups = [];
    let nextUri = '/api/v2/groups?pageSize=100';
    
    while (nextUri) {
        const makeRequest = () => fetch(`${BASE_URL}${nextUri}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        const response = await handleApiRequest(makeRequest);
        groups.push(...response.entities);
        nextUri = response.nextUri;
        
        logStatus(`Fetched ${groups.length} groups so far...`);
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    return groups;
}

async function extractQueues() {
    const queues = [];
    let nextUri = '/api/v2/routing/queues?pageSize=100';
    
    while (nextUri) {
        const makeRequest = () => fetch(`${BASE_URL}${nextUri}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        const response = await handleApiRequest(makeRequest);
        
        // Flatten the division object for each queue
        const flattenedQueues = response.entities.map(queue => flattenQueue(queue));
        queues.push(...flattenedQueues);
        
        nextUri = response.nextUri;
        
        logStatus(`Fetched ${queues.length} queues so far...`);
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    return queues;
}

function flattenQueue(queue) {
    const flattened = {
        id: queue.id,
        name: queue.name,
        description: queue.description,
        version: queue.version,
        dateCreated: queue.dateCreated,
        dateModified: queue.dateModified,
        modifiedBy: queue.modifiedBy,
        createdBy: queue.createdBy,
        memberCount: queue.memberCount,
        mediaSettings: queue.mediaSettings ? JSON.stringify(queue.mediaSettings) : '',
        routingRules: queue.routingRules ? JSON.stringify(queue.routingRules) : '',
        bullseye: queue.bullseye ? JSON.stringify(queue.bullseye) : '',
        acwSettings: queue.acwSettings ? JSON.stringify(queue.acwSettings) : '',
        skillEvaluationMethod: queue.skillEvaluationMethod,
        queueFlow: queue.queueFlow ? queue.queueFlow.name : '',
        whisperPrompt: queue.whisperPrompt ? queue.whisperPrompt.name : '',
        autoAnswerOnly: queue.autoAnswerOnly,
        enableTranscription: queue.enableTranscription,
        enableManualAssignment: queue.enableManualAssignment,
        callingPartyName: queue.callingPartyName,
        callingPartyNumber: queue.callingPartyNumber,
        defaultScripts: queue.defaultScripts ? JSON.stringify(queue.defaultScripts) : '',
        outboundMessagingAddresses: queue.outboundMessagingAddresses ? JSON.stringify(queue.outboundMessagingAddresses) : '',
        outboundEmailAddress: queue.outboundEmailAddress ? JSON.stringify(queue.outboundEmailAddress) : ''
    };
    
    // Flatten division object
    if (queue.division) {
        flattened['division.id'] = queue.division.id;
        flattened['division.name'] = queue.division.name;
    } else {
        flattened['division.id'] = '';
        flattened['division.name'] = '';
    }
    
    return flattened;
}

async function extractWorkTeams() {
    // First, fetch all divisions to create a mapping of division ID to division name
    logStatus('Fetching all divisions for work team mapping...');
    const divisionsMap = await fetchAllDivisionsMap();
    
    const teams = [];
    let nextUri = '/api/v2/teams?pageSize=100';
    
    while (nextUri) {
        const makeRequest = () => fetch(`${BASE_URL}${nextUri}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        const response = await handleApiRequest(makeRequest);
        
        // Flatten the division object for each work team
        const flattenedTeams = response.entities.map(team => flattenWorkTeam(team, divisionsMap));
        teams.push(...flattenedTeams);
        
        nextUri = response.nextUri;
        
        logStatus(`Fetched ${teams.length} work teams so far...`);
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    return teams;
}

async function fetchAllDivisionsMap() {
    const divisionsMap = new Map();
    let nextUri = '/api/v2/authorization/divisions?pageSize=100';
    
    while (nextUri) {
        const makeRequest = () => fetch(`${BASE_URL}${nextUri}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        const response = await handleApiRequest(makeRequest);
        
        // Build the divisions map
        response.entities.forEach(division => {
            divisionsMap.set(division.id, division.name);
        });
        
        nextUri = response.nextUri;
        logStatus(`Fetched ${divisionsMap.size} divisions for mapping...`);
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    return divisionsMap;
}

function flattenWorkTeam(team, divisionsMap) {
    const flattened = {
        id: team.id,
        name: team.name,
        description: team.description,
        dateCreated: team.dateCreated,
        dateModified: team.dateModified,
        memberCount: team.memberCount
    };
    
    // Flatten division object using the divisionsMap
    if (team.division) {
        flattened['division.id'] = team.division.id;
        flattened['division.name'] = divisionsMap.get(team.division.id) || 'Unknown Division';
    } else {
        flattened['division.id'] = '';
        flattened['division.name'] = '';
    }
    
    return flattened;
}



async function extractDivisions() {
    const divisions = [];
    let nextUri = '/api/v2/authorization/divisions?pageSize=100';
    
    while (nextUri) {
        const makeRequest = () => fetch(`${BASE_URL}${nextUri}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        const response = await handleApiRequest(makeRequest);
        divisions.push(...response.entities);
        nextUri = response.nextUri;
        
        logStatus(`Fetched ${divisions.length} divisions so far...`);
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    return divisions;
}

async function extractRoles() {
    const roles = [];
    let nextUri = '/api/v2/authorization/roles?pageSize=100';
    
    while (nextUri) {
        const makeRequest = () => fetch(`${BASE_URL}${nextUri}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        const response = await handleApiRequest(makeRequest);
        const rolesWithExpandedPermissions = response.entities.map(role => {
            const permissionPolicies = role.permissionPolicies.map(policy => {
                return policy.actionSet.map(action => `${policy.domain}.${policy.entityName}.${action}`).join(', ');
            }).join(', ');
            return { ...role, permissionPolicies };
        });
        roles.push(...rolesWithExpandedPermissions);
        nextUri = response.nextUri;
        
        logStatus(`Fetched ${roles.length} roles so far...`);
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    return roles;
}

function updateProgress(percentage, text) {
    document.getElementById('progressBar').style.width = `${percentage}%`;
    document.getElementById('progressText').textContent = text;
}

function logStatus(message, type = 'info') {
    const statusLog = document.getElementById('statusLog');
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry log-${type}`;
    logEntry.textContent = `[${timestamp}] ${message}`;
    statusLog.appendChild(logEntry);
    statusLog.scrollTop = statusLog.scrollHeight;
}

function showResults() {
    const resultsContainer = document.getElementById('resultsContainer');
    const resultsSummary = document.getElementById('resultsSummary');
    
    resultsSummary.innerHTML = '';
    
    Object.entries(extractedData).forEach(([type, data]) => {
        const resultItem = document.createElement('div');
        resultItem.className = 'result-item';
        resultItem.innerHTML = `
            <h4>${type.charAt(0).toUpperCase() + type.slice(1)}</h4>
            <div class="count">${data.length}</div>
            <div>records extracted</div>
        `;
        resultsSummary.appendChild(resultItem);
    });
    
    resultsContainer.style.display = 'block';
}

async function downloadData1() {
    if (Object.keys(extractedData).length === 0) {
        alert('No data to download. Please extract data first.');
        return;
    }
    
    if (Object.keys(extractedData).length === 1) {
        // Single file download
        const [type, data] = Object.entries(extractedData)[0];
        const csv = convertToCSV(data);
        downloadCSV(csv, `genesys_${type}.csv`);
    } else {
        // Multiple files - create zip
        await downloadAsZip();
    }
}

async function downloadData() {
    if (Object.keys(extractedData).length === 0) {
        alert('No data to download. Please extract data first.');
        return;
    }
    
    if (Object.keys(extractedData).length === 1) {
        // Single file download
        const [type, data] = Object.entries(extractedData)[0];
        const csv = convertToCSV(data);
        downloadCSV(csv, `genesys_${type}.csv`);
    } else {
        // Multiple files - download each separately
        Object.entries(extractedData).forEach(([type, data]) => {
            const csv = convertToCSV(data);
            downloadCSV(csv, `genesys_${type}.csv`);
        });
        
        alert(`Downloaded ${Object.keys(extractedData).length} CSV files separately.`);
    }
}


function convertToCSV(data) {
    if (!data || data.length === 0) return '';
    
    const headers = Object.keys(data[0]);
    const csvContent = [
        headers.join(','),
        ...data.map(row => 
            headers.map(header => {
                const value = row[header] || '';
                return `"${String(value).replace(/"/g, '""')}"`;
            }).join(',')
        )
    ].join('\n');
    
    return csvContent;
}

function downloadCSV(csvContent, filename) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
}

async function downloadAsZip() {
    // Import JSZip library dynamically
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    document.head.appendChild(script);
    
    await new Promise(resolve => {
        script.onload = resolve;
    });
    
    const zip = new JSZip();
    
    Object.entries(extractedData).forEach(([type, data]) => {
        const csv = convertToCSV(data);
        zip.file(`genesys_${type}.csv`, csv);
    });
    
    const content = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = `genesys_data_export_${new Date().toISOString().split('T')[0]}.zip`;
    link.click();
    URL.revokeObjectURL(link.href);
}
