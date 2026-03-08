const MAX_PAGE_RELOADS_FOR_TOKEN = 3;
const TOKEN_RELOAD_DELAY = 750;
let token;

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
    const urlParams = new URLSearchParams(window.location.search);

    if (token) {
        console.log('Valid token found');
        await setReloadAttempts(0);
        showLoading();
        await fetchEWT();
        hideLoading();
    } else {
        const attempts = await getReloadAttempts();
        if (attempts < MAX_PAGE_RELOADS_FOR_TOKEN) {
            await setReloadAttempts(attempts + 1);
            setTimeout(() => {
                window.location.reload();
            }, TOKEN_RELOAD_DELAY);
        } else {
            console.error('Max reload attempts reached');
            await setReloadAttempts(0);
            // window.close();
            console.error('No valid token found after max reload attempts - show login link');
            document.getElementById('content').style.display = 'none';
            const loginContainer = document.getElementById('loginContainer');
            loginContainer.href = `https://login.mypurecloud.com.au/oauth/authorize?client_id=${CLIENT_ID}&response_type=token&redirect_uri=${window.location.href}`;
            loginContainer.style.display = 'block';
            document.getElementById('content').style.display = 'none';
            document.getElementById('loadingMessage').style.display = 'none';
        }
    }
}

let fetchInterval;

async function startFetching() {
    await fetchData(); // Fetch immediately
    fetchInterval = setInterval(fetchData, 30000); // Then every 30 seconds
}

function stopFetching() {
    clearInterval(fetchInterval);
}

async function fetchData() {
    // Your data fetching logic here
    console.log("Fetching data at", new Date());
    await fetchEWT();
}

document.addEventListener("visibilitychange", async function () {
    if (document.hidden) {
        console.log("Tab is hidden at:", new Date());
        stopFetching();
    } else {
        console.log("Tab is visible at:", new Date());
        await startFetching();
    }
});

// Start fetching when the page loads (if it's visible)
if (!document.hidden) {
    startFetching();
}


async function fetchEWT() {
    try {
        const [ewtResponse, dataTableResponse] = await Promise.all([
            fetch('https://api.mypurecloud.com.au/api/v2/routing/queues/cd98077a-aaaf-446e-9983-ced2bedc4aaf/mediatypes/message/estimatedwaittime', {
                headers: { 'Authorization': `Bearer ${token}` }
            }),
            fetch('https://api.mypurecloud.com.au/api/v2/flows/datatables/3bcfed9c-7c5e-45b7-9b3b-972450f5dbf5/rows/cd98077a-aaaf-446e-9983-ced2bedc4aaf?showbrief=false', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
        ]);

        const ewtData = await ewtResponse.json();
        const dataTableData = await dataTableResponse.json();

        // if (ewtData?.results?.length > 0 && ewtData?.results[0]?.estimatedWaitTimeSeconds) {
        if (ewtData?.results?.length > 0) {
                const ewtSeconds = ewtData.results[0].estimatedWaitTimeSeconds;
            const formattedEWT = formatTime(ewtSeconds);
            document.getElementById('ewt').textContent = formattedEWT;
        }

        if (!dataTableData.status) {
            const enabled = dataTableData.enabled;
            const sdbStatus = enabled ? "Service Demand Bot: ON" : "Service Demand Bot: OFF";
            document.getElementById('enabled').textContent = sdbStatus;
        }

        // Add update time
        const now = new Date();
        const updateTime = `${padZero(now.getHours())}:${padZero(now.getMinutes())}:${padZero(now.getSeconds())}`;
        document.getElementById('updateTime').textContent = `Updated at: ${updateTime}`;
    } catch (error) {
        console.error('Error fetching data:', error);
        document.getElementById('ewt').textContent = 'Error fetching data';
        document.getElementById('enabled').textContent = 'Service Demand Bot: N/A';
    }
}

function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    return `${padZero(hours)}:${padZero(minutes)}:${padZero(remainingSeconds)}`;
}

function padZero(num) {
    return num.toString().padStart(2, '0');
}

// document.addEventListener('DOMContentLoaded', handleTokenCheck);

document.addEventListener('DOMContentLoaded', async () => {
    await handleTokenCheck();

    // Add event listener for refresh button
    // document.getElementById('refreshButton').addEventListener('click', async () => {
    document.getElementById('refreshControl').addEventListener('click', async () => {
        // showLoading();
        // await fetchEWT();
        await handleTokenCheck();
        // hideLoading();
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
