# **Supervisor Assistant App Technical Documentation**

## **1\. Overview**

The Supervisor Assistant application is a supervisor-focused web tool designed to provide real-time visibility into digital conversations (SMS and WebChat) handled via the **Genesys Cloud** platform. It consists of a high-level monitoring dashboard and a detailed, real-time message transcript viewer.

## **2\. Technical Architecture**

The application is built using a decoupled frontend architecture:

* **Platform**: Genesys Cloud (PureCloud).  
* **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3.  
* **Integration**: Genesys Cloud Platform Client SDK and direct REST API interaction.  
* **Environments**: Detects and supports both standard Web Browsers and Chrome Extension contexts.

## **3\. Genesys Cloud API Endpoints**

The application interacts with the following specific API endpoints:

### **A. Authentication & Permissions**

* **Endpoint**: GET /api/v2/users/me?expand=authorization  
* **Usage**: Used in monitored-chats.js to determine the supervisor's roles.  
* **Logic**: Enables the "Stop Monitoring" feature only if the user possesses roles like LLA\_ISS\_DIGITAL, LLA\_LEAD\_ISS, or LLA\_SERVICE\_LEAD.  
* **Reference**: [https://developer.genesys.cloud/devapps/api-explorer\#get-api-v2-users-me](https://developer.genesys.cloud/devapps/api-explorer#get-api-v2-users-me) 

### **B. Analytics Query (Dashboard)**

* **Endpoint**: POST /api/v2/analytics/conversations/details/query  
* **Usage**: Fetches all active inbound message conversations.  
* **Reference**: https://developer.genesys.cloud/devapps/api-explorer\#post-api-v2-analytics-conversations-details-query  
* **Payload Extract**:  
  const body \= {  
      conversationFilters: \[{  
          "type": "and",  
          "predicates": \[{  
              "type": "dimension",   
              "dimension": "conversationEnd",   
              "operator": "notExists" // Only active chats  
          }\]  
      }\],  
      segmentFilters: \[{  
          "type": "and",  
          "predicates": \[  
              { "dimension": "mediaType", "value": "message" },  
              { "dimension": "direction", "value": "inbound" }  
          \]  
      }\],  
      interval: "2023-10-27T00:00:00/2023-10-28T00:00:00" // Dynamic 24h window  
  };

### **C. Conversation Metadata**

* **Endpoint**: GET /api/v2/conversations/messages/{conversationId}  
* **Usage**: Used in CustomMonitoring.js to get the list of participants and their associated messageIds for the transcript.  
* **Reference**: [https://developer.genesys.cloud/devapps/api-explorerget-api-v2-conversations-messages-conversationId](https://developer.genesys.cloud/devapps/api-explorerget-api-v2-conversations-messages-conversationId) 

### **D. Message Details**

* **Endpoint**: GET /api/v2/conversations/messages/{messageId}/details  
* **Usage**: Retrieves the actual content, timestamp, and direction of a specific message ID found in the metadata call.  
* **Reference**: [https://developer.genesys.cloud/devapps/api-explorerget-api-v2-conversations-messages-messageId-details](https://developer.genesys.cloud/devapps/api-explorerget-api-v2-conversations-messages-messageId-details) 

### **E. Monitoring Control**

* **Endpoint**: PATCH /api/v2/conversations/messages/{conversationId}/participants/{participantId}  
* **Usage**: Disconnects a supervisor's monitoring session by setting their state to DISCONNECTED.  
* **Reference**: [https://developer.genesys.cloud/devapps/api-explorer\#patch-api-v2-conversations-messages-conversationId-participants-participantId](https://developer.genesys.cloud/devapps/api-explorer#patch-api-v2-conversations-messages-conversationId-participants-participantId) 

## **4\. Key Logic & Implementation**

### **A. OAuth & Authentication Flow (authentication.js & token.js)**

Authentication leverages the **Genesys Cloud Token Implicit Grant (Browser)** flow via the Platform API Javascript SDK (purecloud-platform-client-v2.min.js).

**1\. SDK Initialization (authentication.js)**

The application initializes the Genesys SDK pointing to the Asia Pacific region (ap\_southeast\_2). It enforces persistence of the session data by calling client.setPersistSettings(true, TOKEN\_KEY\_NAME). This instructs the SDK to cache the auth payload in the browser's localStorage to survive page reloads.

**2\. Token Grant & Cookie Management**

The application invokes client.loginImplicitGrant(CLIENT\_ID, REDIRECT\_URI). Upon successful authentication and redirection back to the app, the token is explicitly written to an HTTP cookie using strictly scoped security parameters:

document.cookie \= ${TOKEN\_KEY\_NAME}=${data.accessToken}; path=/; secure; samesite=strict; max-age=86400; (Expires in 24 hours).

**3\. Token Resolution Hierarchy (token.js)**

Before triggering a new login flow or failing, getToken() attempts to locate an existing valid token using a three-tier fallback mechanism:

1. **Chrome Extension Storage**: If determineEnvironment() detects the chrome-extension: protocol, it bypasses DOM storage and queries chrome.storage.local.  
2. **HTTP Cookies**: In standard browsers, it looks for the strictly-scoped cookie matching the dynamic TOKEN\_KEY\_NAME.  
3. **Local Storage Verification (SDK Cache Fallback)**: If the cookie is missing, it inspects localStorage for ${TOKEN\_KEY\_NAME}\_auth\_data (created by the SDK's persist setting). The code parses this JSON object and strictly validates that the tokenExpiryTime is in the future before accepting it.

### **B. Resilience: Rate Limit Handling**

The application implements an exponential backoff wrapper (handleApiRequest in token.js) to combat Genesys API rate limits (HTTP 429). It supports up to **6 retries**.

// Abridged from token.js  
async function handleApiRequest(requestFunction, maxRetries \= 6\) {  
    let retryCount \= 0;  
    while (retryCount \<= maxRetries) {  
        try {  
            const response \= await requestFunction();  
            if (response.status \=== 429\) {  
                const errorData \= await response.json();  
                // Genesys provides the exact required wait time in the message e.g. "... \[30\] seconds"  
                const retryAfterMatch \= errorData.message.match(/\\\[(\\d+)\\\]/);  
                const retryAfterSeconds \= retryAfterMatch ? parseInt(retryAfterMatch\[1\]) : 30;  
                  
                await new Promise(resolve \=\> setTimeout(resolve, retryAfterSeconds \* 1000));  
                retryCount++;  
                continue;  
            }  
            return await response.json();  
        } catch (error) { ... }  
    }  
}

### **C. Efficient Polling (CustomMonitoring.js)**

To avoid UI flickering and redundant API calls, the detail view maintains a Set of IDs for messages already rendered.

const displayedMessageIds \= new Set();

async function fetchTranscript() {  
    // 1\. Fetch conversation metadata  
    // 2\. Filter for ONLY new messages  
    const newMessages \= data.participants.flatMap(p \=\>   
        p.messages.filter(m \=\> \!displayedMessageIds.has(m.messageId))  
    );

    if (newMessages.length \> 0\) {  
        // 3\. Batch fetch details for new messages only  
        const details \= await Promise.all(newMessages.map(m \=\> fetchMessageDetails(m.messageId)));  
        render(details);  
        playNotification(); // Only trigger sound on new messages  
    }  
}

### **D. Dynamic Attribute Mapping**

The application scrapes the customer participant attributes to display context (e.g., location, contact info) while filtering out internal technical keys.

// From CustomMonitoring.js  
const filteredAttributes \= Object.entries(allAttributes)  
    .filter((\[key\]) \=\> \!\['name', 'HSName', 'messageId'\].includes(key))  
    .map((\[key, value\]) \=\> \`\<tr\>\<td\>${key}\</td\>\<td\>${value}\</td\>\</tr\>\`)  
    .join('');

## **5\. UI and Maintenance Features**

* **Production Filtering**: monitored-chats.js contains a filterTable function that enforces a hardcoded filter for queues containing LLA\_SMS PROD or LLA\_WebChat PROD when the "Show only Production" checkbox is checked.  
* **Table Sorting**: Column sorting is implemented using a custom sortTable function that utilizes localeCompare for string values and basic date comparisons.  
* **Audio Feedback**: The detail view utilizes an \<audio\> element with an ID chatNotification. The logic ensures the user must interact with the page (via checkbox) before the Web Audio API is allowed to play.

## **6\. Maintenance Guidelines**

1. **Queue Updates**: If new production queues are added to Genesys, update the filterTable function logic in monitored-chats.js.  
2. **Role Changes**: If supervisor permissions change, update the GC\_ROLES\_STOP\_MONITORING constant.  
3. **Polling Frequency**: The detail view polls every 10 seconds. This can be adjusted via the REFRESH\_INTERVAL constant in CustomMonitoring.js depending on API usage limits.

## **7\. Deployment & Hosting**

The application is deployed as a cloud-hosted static website and integrated into Genesys Cloud as a native application:

* **Genesys Client Application**: The application runs as an Embedded "Client Application" within Genesys Cloud. Admins can manage this integration and its properties via the Genesys Cloud Admin UI:  
  https://apps.mypurecloud.com.au/directory/\#/admin/integrations/apps/embedded-client-app/0c7807ee-51df-4757-9a35-e0ac59c8ac1c/details  
* **Application URL**: The live application endpoint is accessed at:  
  https://genesys-addon.lifeline.org.au/SupervisorAssistant/monitored-chats.html  
* **Hosting Details**: It is hosted as an **Azure Static Website**. The custom domain genesys-addon.lifeline.org.au is registered by LLA (Lifeline Australia) and routes traffic to the underlying Azure endpoint: waws-prod-hk1-eb81d4fc.sip.p.azurewebsites.windows.net.  
* **Source Code Repository**: The static website source code is maintained on GitHub:  
  https://github.com/lifeline-servicedesk/lifeline-repo

## **8\. Access Control & Authorisation**

To ensure secure monitoring, this app is highly restricted within Genesys Cloud. The integration is only accessible and visible to users who are active members of the following Genesys Cloud groups:

* GC\_HARBOUR-TO-HAWKESBURY\_COACH\_DIGITAL  
* GC\_HARBOUR-TO-HAWKESBURY\_CS\_STUDENT\_MENTOR\_DIGITAL  
* GC\_HARBOUR-TO-HAWKESBURY\_MEM\_WFM  
* GC\_HARBOUR-TO-HAWKESBURY\_OPPS\_DIGITAL  
* GC\_HARBOUR-TO-HAWKESBURY\_TL\_DIGITAL  
* GC\_LLA\_ADMIN  
* GC\_LLA\_CISS\_DIGITAL  
* GC\_LLA\_CISS\_TRAINING\_DIGITAL  
* GC\_LLA\_COACH\_DIGITAL  
* GC\_LLA\_NAT\_OPPS\_DIGITAL  
* GC\_LLA\_NAT\_WFM  
* GC\_LLA\_OPPS\_DIGITAL  
* GC\_LLA\_PARTNER\_ADMIN  
* GC\_LLA\_SERVICE\_LEAD\_DIGITAL  
* GC\_LLA\_STL\_DIGITAL  
* GC\_LLD\_COACH\_DIGITAL  
* GC\_LLD\_CS\_STUDENT\_MENTOR\_DIGITAL  
* GC\_LLD\_MEM\_WFM  
* GC\_LLD\_OPPS\_DIGITAL  
* GC\_LLD\_TL\_DIGITAL  
* GC\_UNITING-CARE-QUEENSLAND\_COACH\_DIGITAL  
* GC\_UNITING-CARE-QUEENSLAND\_MEM\_WFM  
* GC\_UNITING-CARE-QUEENSLAND\_OPPS\_DIGITAL  
* GC\_UNITING-CARE-QUEENSLAND\_TL\_DIGITAL  
* GC\_WESTERN-AUSTRALIA\_CS\_STUDENT\_MENTOR\_DIGITAL  
* GC\_WESTERN-AUSTRALIA\_MEM\_WFM  
* GC\_WESTERN-AUSTRALIA\_OPPS\_DIGITAL  
* GC\_WESTERN-AUSTRALIA\_TL\_DIGITAL