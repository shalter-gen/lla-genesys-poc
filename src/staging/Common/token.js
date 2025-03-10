function determineEnvironment() {
    return window.location.protocol === 'chrome-extension:';
}

function getCookie(storageKey) {
    const cookies = document.cookie.split('; ');
    for (const cookie of cookies) {
        const [key, value] = cookie.split('=');
        if (key === storageKey) {
            return decodeURIComponent(value);
        }
    }
    return null;
}

async function getToken() {
    console.log('getToken: Checking for stored access token');
    const isExtension = determineEnvironment();
    let token;

    if (isExtension) {
        console.log(`getToken: Getting stored token from Chrome extension storage`);
        token = await new Promise(resolve => {
            chrome.storage.local.get(['access_token'], function (result) {
                resolve(result.access_token);
            });
        });
    } else {
        console.log(`getToken: Getting stored token (${TOKEN_KEY_NAME}) from Cookies`);
        const cookieValue = getCookie(TOKEN_KEY_NAME);
        if (cookieValue) {
            token = cookieValue;
            console.log(`"${TOKEN_KEY_NAME}" Cookie value: ${cookieValue}`);
        } else {
            console.log(`"${TOKEN_KEY_NAME}" Cookie not found.`);
        }
    }

    if (!token) {
        console.log('getToken: No stored token found');
        return null;
    }

    console.log('getToken: Checking token validity');
    try {
        const makeRequest = () => fetch('https://api.mypurecloud.com.au/api/v2/users/me', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const userData = await handleApiRequest(makeRequest);
        console.log('getToken: Token validity check successful');
        return token;
    } catch (error) {
        console.error('getToken: Error checking token validity:', error);
        if (isExtension) {
            console.log('getToken: Removing stored token from Chrome extension storage');
            chrome.storage.local.remove('access_token');
        } else {
            console.log(`getToken: Removing stored token (${TOKEN_KEY_NAME}) from cookie`);
            document.cookie = `${TOKEN_KEY_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=None; Secure`;
        }
        return null;
    }
}

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
