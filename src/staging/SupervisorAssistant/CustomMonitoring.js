let token;
let isTranscriptInitialized = false;

/**
 * Initializes the app with a stored token. If the token is valid, it will
 * fetch the chat transcript and hide the loading message. If the token is
 * invalid, it will log an error message. If no token is found, it will also
 * log an error message.
 * @returns {Promise<void>} - A promise that resolves when the app is initialized
 */
async function initializeWithStoredToken() {
    token = await getToken();
    if (token) {
        await initializeTranscript();
        hideLoading();
    } else {
        console.error('No valid stored token found');
        const cookieValue = getCookie('token_new');
        if (cookieValue) {
            console.log('"token_new" Cookie value:', cookieValue);
        } else {
            console.log('"token_new" Cookie not found');
        }
    }
}

initializeWithStoredToken();

/**
 * Initializes the transcript by fetching the chat transcript for the given conversation
 * and token. This function is idempotent, meaning it will only fetch the transcript once
 * and subsequent calls will do nothing.
 * @returns {Promise<void>} - A promise that resolves when the transcript is initialized
 */
async function initializeTranscript() {
    if (isTranscriptInitialized) return;
    isTranscriptInitialized = true;
    await fetchTranscript();
}

/**
 * Shows the loading message and hides the content section.
 */
function showLoading() {
    document.getElementById('loadingMessage').style.display = 'flex';
    document.getElementById('content').style.display = 'none';
}

/**
 * Hides the loading message and shows the content section.
 * This is called when the app is fully initialized with a valid token.
 */
function hideLoading() {
    document.getElementById('loadingMessage').style.display = 'none';
    document.getElementById('content').style.display = 'block';
}

/*=---------------------------------------------------------=*/

const REFRESH_INTERVAL = 10000; // 10 seconds
let isLive = false;
let previousData;
// Audio context and source setup
let audioContext;
const soundCheckbox = document.getElementById('soundEnabler');
const notificationSound = document.getElementById('chatNotification');

const urlParams = new URLSearchParams(window.location.search);
let conversationId = urlParams.get('conversationId');

// Initialize audio when checkbox is first checked
soundCheckbox.addEventListener('change', async function () {
    if (this.checked) {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (error) {
            console.error('Error initializing audio:', error);
            this.checked = false;
        }
    }
});

/**
 * Plays the notification sound if the checkbox is checked. If there is an error
 * playing the sound, it will log the error to the console.
 */
function playNotification() {
    if (soundCheckbox.checked) {
        notificationSound.play().catch(error => {
            console.error('Error playing notification:', error);
        });
    }
}

/**
 * Fetches the conversation transcript and displays it in the UI.
 * 
 * This code fetches a conversation transcript from an API,
 * filters out already displayed messages, fetches details for new messages,
 * and displays the updated transcript in the UI. It repeats this process every
 * 10 seconds (REFRESH_INTERVAL) and handles errors by logging and alerting the user.
 *
 * @throws {Error} If there is an error fetching the conversation details.
 */
async function fetchTranscript() {
    try {
        // First API call to get conversation
        const makeConversationRequest = () => fetch(`https://api.mypurecloud.com.au/api/v2/conversations/messages/${conversationId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await handleApiRequest(makeConversationRequest);

        if (JSON.stringify(data) === JSON.stringify(previousData)) {
            return;
        }

        previousData = data;

        isLive = !data.participants[0]?.endTime;
        if (!isLive) {            
            document.getElementById('soundControl').style.visibility  = 'hidden';
        }

        // Filter out messages we've already displayed
        const newMessages = data.participants.flatMap(participant =>
            participant.messages.filter(message => !displayedMessageIds.has(message.messageId))
        );

        if (newMessages.length === 0) {
            return;
        }

        // Second API call to get message details
        const messageDetailsPromises = newMessages.map(message => {
            const makeDetailsRequest = () => fetch(`https://api.mypurecloud.com.au/api/v2/conversations/messages/${message.messageId}/details`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            return handleApiRequest(makeDetailsRequest);
        });

        const messageDetails = await Promise.all(messageDetailsPromises);
        const messagesDetails = {
            participants: data.participants,
            messages: messageDetails
        };

        displayTranscript(messagesDetails);
    } catch (error) {
        console.error('Error fetching conversation details:', error);
        alert('Failed to fetch conversation details. Please try again.');
    } finally {
        if (isLive) {
            setTimeout(fetchTranscript, REFRESH_INTERVAL);
        }
    }
}


/**
 * Returns an SVG string representing the status icon for a message
 * @param {string} status - The status of the message
 * @returns {string} - The SVG string for the status icon
 */
function getStatusIcon(status) {
    const iconColor = 'rgb(42, 42, 46)';
    if (status === 'received' || status === 'delivery-success') {
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" aria-hidden="true" class="status-icon">
            <path d="M12.8243 4.48538C13.0519 4.7073 13.0519 5.06615 12.8243 5.26682L6.93407 11.4994C6.74442 11.7402 6.40529 11.7402 6.19556 11.4994L3.16183 8.28868C2.95273 8.08801 2.95273 7.72916 3.16183 7.50724C3.37091 7.28769 3.71005 7.28769 3.91911 7.50724L6.57485 10.319L12.0858 4.48538C12.2955 4.26488 12.6347 4.26488 12.8243 4.48538Z"></path>
        </svg>`;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" class="status-icon" style="fill: #ffd700;">
        <path d="M7.99942 1C8.4432 1 8.85261 1.23437 9.07762 1.61875L15.8281 13.1187C16.0562 13.5062 16.0562 13.9844 15.8344 14.3719C15.6125 14.7594 15.1968 15 14.7499 15H1.24894C0.802029 15 0.386374 14.7594 0.164483 14.3719C-0.0574075 13.9844 -0.0542823 13.5031 0.170734 13.1187L6.92122 1.61875C7.14623 1.23437 7.55564 1 7.99942 1ZM7.99942 5C7.58377 5 7.24937 5.33437 7.24937 5.75V9.25C7.24937 9.66562 7.58377 10 7.99942 10C8.41507 10 8.74947 9.66562 8.74947 9.25V5.75C8.74947 5.33437 8.41507 5 7.99942 5ZM8.99949 12C8.99949 11.7348 8.89413 11.4804 8.70658 11.2929C8.51903 11.1054 8.26466 11 7.99942 11C7.73418 11 7.47981 11.1054 7.29226 11.2929C7.10471 11.4804 6.99935 11.7348 6.99935 12C6.99935 12.2652 7.10471 12.5196 7.29226 12.7071C7.47981 12.8946 7.73418 13 7.99942 13C8.26466 13 8.51903 12.8946 8.70658 12.7071C8.89413 12.5196 8.99949 12.2652 8.99949 12Z"/>
    </svg>`;
}

/**
 * Updates the title of the popup based on the customer's name in the conversation.
 * @param {Object} messagesDetails - The conversation details object from the Genesys API.
 */
function updatePopupTitle(messagesDetails) {
    const customer = messagesDetails.participants.find(p => p.purpose === 'customer');
    const customerName = customer?.attributes?.HSName || 'Unknown Customer';

    const headerElement = document.querySelector('h1');
    if (headerElement) {
        if (isLive) {
            headerElement.textContent = `Custom Monitoring of "${customerName}"`;
        } else {
            headerElement.textContent = `Transcript of "${customerName}"`;
        }
    }
    const titleElement = document.querySelector('title');
    if (titleElement) {
        titleElement.textContent = `"${customerName}"`;
    }

}

let displayedMessageIds = new Set();

/**
 * Displays the conversation transcript in the UI.
 * 
 * This function updates the popup title and conversation attributes based on the
 * provided message details. It sorts new messages by timestamp, triggers a 
 * notification sound if new messages are present, and appends each message to the 
 * transcript section in the UI. Each message is displayed with a header containing 
 * the participant's name, timestamp, and status icon, and a content section with 
 * the message text or event details.
 * 
 * @param {Object} messagesDetails - The conversation details object containing 
 * participants and messages from the Genesys API.
 */
function displayTranscript(messagesDetails) {
    updatePopupTitle(messagesDetails);
    displayConversationAttributes(messagesDetails);

    const transcriptDiv = document.getElementById('transcript');

    // Sort new messages by timestamp
    const newMessages = messagesDetails.messages.sort((a, b) =>
        new Date(a.messageTime || a.timestamp) - new Date(b.messageTime || b.timestamp)
    );

    if (newMessages.length > 0) {
        playNotification();
    }
    newMessages.forEach(message => {
        const messageElement = document.createElement('div');
        const isInbound = message.direction === 'inbound';
        messageElement.className = `message ${isInbound ? 'inbound' : 'outbound'}`;
        //message.normalizedMessage.type==='Event'
        if (message.normalizedMessage?.type === 'Event') {
            messageElement.classList.add('event');
        }
        const time = new Date(message.messageTime || message.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });

        // Determine participant name based on message attributes
        let participantName = 'Unknown';

        if (message.createdBy?.id) {
            // Agent
            const participant = messagesDetails.participants.find(p => p.user?.id === message.createdBy.id);
            if (participant) {
                participantName = participant.name;
            }
        } else if (message.normalizedMessage?.channel?.from?.nickname) {
            // Bot
            participantName = message.normalizedMessage.channel.from.nickname;

        } else if (message.fromAddress) {
            // Customer or Flow
            const participant = messagesDetails.participants.find(p =>
                p.fromAddress?.addressNormalized === message.fromAddress
            );
            if (participant) {
                participantName = participant.attributes?.name ||   // Customer
                    participant.fromAddress?.name ||                // Flow
                    participant.name;                               // Flow
            }
        } else {
            participantName = 'Un-known';
        }

        const initials = participantName?.split(' ').map(n => n[0]).join('').toUpperCase();

        // message.normalizedMessage.type=Text or Event
        // message.normalizedMessage.events[0].presence.type=Clear/Join
        if (message.normalizedMessage.type === 'Text' || message.normalizedMessage.type === 'Structured') {
            messageElement.innerHTML = `
            <div class="message-header">
                <span>${participantName}</span>
                <span class="time">
                    ${time} ${!isInbound ? getStatusIcon(message.status) : ''}
                </span>
                ${!isInbound ? `<div class="user-initials">${initials}</div>` : ''}
            </div>
            <div class="message-content">${message.textBody || 'No message content'}</div>
        `;

        } else if (message.normalizedMessage.type === 'Event') {
            messageElement.innerHTML = `
            <div class="message-header">
                <span>${participantName}</span>
                <span class="time">
                    ${time} ${!isInbound ? getStatusIcon(message.status) : ''}
                </span>
                ${!isInbound ? `<div class="user-initials">${initials}</div>` : ''}
            </div>
            <div class="message-content">Event: ${message.normalizedMessage.events[0].presence.type}</div>
        `;
        }

        transcriptDiv.appendChild(messageElement);
        displayedMessageIds.add(message.id);
    });
    // if (newMessages.length > 0) {
    //    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    // }
}

/**
 * Displays the conversation attributes in a table below the transcript.
 * 
 * It takes an object messagesDetails as an argument. The function creates
 * a table in the HTML document with the ID attributesTable if it doesn't already exist.
 * It then populates the table with attributes related to a conversation, such as the
 * conversation ID, customer attributes, and other metadata. The function is designed
 * to display conversation attributes in a user interface, likely as part of a chat or
 * messaging application.
 * 
 * @param {Object} messagesDetails - The conversation details object from the Genesys API.
 */
function displayConversationAttributes(messagesDetails) {
    // Create table if it doesn't exist
    let attributesTable = document.getElementById('attributesTable');
    if (!attributesTable) {
        attributesTable = document.createElement('table');
        attributesTable.id = 'attributesTable';
        const transcriptDiv = document.getElementById('transcript');
        transcriptDiv.parentNode.insertBefore(attributesTable, transcriptDiv);
    }

    // Get customer participant and their attributes
    const customer = messagesDetails.participants.find(p => p.purpose === 'customer');
    const customerAttributes = customer ? customer.attributes : {};

    // Combine base attributes with customer attributes
    const allAttributes = {
        // 'Chat Start Date': new Date(messagesDetails.conversationStart).toLocaleString(),
        // 'Message Type': messagesDetails.messageType,
        // 'Conversation ID': messagesDetails.conversationId,
        // 'External Tag': messagesDetails.externalTag || 'N/A',
        'Conversation ID': conversationId,
        ...customerAttributes
    };

    // Create table content
    attributesTable.innerHTML = `
        <thead>
            <tr>
                <th>Attribute</th>
                <th>Value</th>
            </tr>
        </thead>
        <tbody>
            ${Object.entries(allAttributes)
            .filter(([key]) => !['name', 'HSName', 'messageId'].includes(key))
            .map(([key, value]) => `
                    <tr>
                        <td>${key}</td>
                        <td>${value || 'N/A'}</td>
                    </tr>
                `).join('')}

    
        </tbody>
    `;
}
