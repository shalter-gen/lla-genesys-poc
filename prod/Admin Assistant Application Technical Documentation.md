# **Admin Assistant Application Technical Documentation**

## **1\. Overview**

The **Admin Assistant** application is a dedicated, administrator-focused web tool integrated into the Genesys Cloud platform. Designed for system administrators, it exposes a suite of custom administrative features, advanced data extraction tools, and specialised operational reporting. The application is accessed via a central navigation menu (burger menu) that links to 10 distinct functional modules.

## **2\. Technical Architecture**

The application mirrors the decoupled frontend architecture of similar internal tools:

* **Platform:** Genesys Cloud (PureCloud).  
* **Frontend:** Vanilla JavaScript (ES6+), HTML5, CSS3.  
* **Integration:** Genesys Cloud Platform Client SDK (JavaScript) and direct REST API interaction.  
* **Navigation:** Single-page application feel driven by an HTML \<nav\> sidebar containing distinct functional endpoints.

## **3\. Common Technical Implementations**

Before delving into page-specific logic, the application relies on several core mechanisms for stable communication with Genesys Cloud.

### **A. Authentication & Permissions**

* **Mechanism:** Implicit Grant flow via the Genesys Cloud Platform SDK.  
* **Logic:** The application initialises platformClient.ApiClient.instance and authenticates using loginImplicitGrant. Upon successful token retrieval, the app verifies the current user's profile (GET /api/v2/users/me?expand=authorization) to ensure they possess the necessary administrative roles/groups before rendering the UI.

### **B. Handling Rate Limiting (HTTP 429 \- Too Many Requests)**

Because this application performs bulk data operations (extraction, bulk updates), it frequently encounters Genesys Cloud rate limits.

* **Logic:** All API fetch loops are wrapped in a retry mechanism. When a 429 Too Many Requests response is caught, the application reads the retry-after header provided by Genesys. The script pauses execution (using setTimeout wrapped in a Promise) for the exact duration specified by the header (plus a small buffer) before automatically retrying the failed request.

### **C. Pagination Handling**

* **Logic:** Endpoints returning lists of entities (Users, Queues, Interactions) are paginated. The application utilises pageNumber increments or standard nextUri tracking in a while or recursive loop to aggregate full datasets before rendering them to the DOM or exporting to CSV.

## **4\. Application Features, Logic & API Endpoints**

### **A. Data & Reporting Modules**

#### **1\. Data Extractor (data-extractor.html)**

Provides administrators with a tool to extract users (active, inactive, or deleted), groups, queues, work teams, divisions, and roles from Genesys Cloud for external reporting and auditing.

* **Endpoints Used:**  
  * GET /api/v2/users  
  * GET /api/v2/groups  
  * GET /api/v2/routing/queues  
  * GET /api/v2/authorization/divisions  
  * GET /api/v2/authorization/roles  
  * GET /api/v2/workforcemanagement/workteams  
* **Logic:** Based on the user's dropdown selection, the application loops through the respective paginated endpoint, compiling an array of JSON objects. Once the nextUri is null (or page limit is reached), the app parses the JSON into a CSV format and triggers a browser download.  
* **Reference:** [Users API](https://developer.genesys.cloud/devapps/api-explorer#get-api-v2-users) | [Routing API](https://developer.genesys.cloud/devapps/api-explorer#get-api-v2-routing-queues)

#### **2\. Frequent Chat Users \- All (frequent-chat-users.html)**

Aggregates data to identify customers/contacts who frequently initiate digital chat sessions, providing a holistic view of high-volume users regardless of the interaction outcome.

* **Endpoint:** POST /api/v2/analytics/conversations/details/query  
* **Logic:** Submits an analytics query filtered by mediaType: message/chat over a specific date interval. The results are grouped/mapped locally by the participant's remoteName, address, or custom participant data to count frequencies. Displays a sorted table of high-frequency contacts.  
* **Reference:** [Conversations Details Query](https://developer.genesys.cloud/devapps/api-explorer#post-api-v2-analytics-conversations-details-query)

#### **3\. Frequent Chat Users \- Answered (frequent-answered-chat-users.html) *(Default Landing Page)***

A refined view of frequent chat users, specifically filtering for interactions that were successfully routed to and answered by an agent.

* **Endpoint:** POST /api/v2/analytics/conversations/details/query  
* **Logic:** Similar to "All", but applies an additional segment filter to require a connected segment with a purpose: agent or purpose: user. This ensures only chats that actively consumed crisis supporter time are counted.  
* **Reference:** [Conversations Details Query](https://developer.genesys.cloud/devapps/api-explorer#post-api-v2-analytics-conversations-details-query)

#### **4\. Ghost Chats (terminated-chats.html)**

Monitors and reports on "ghost chats"—chat interactions that were left unattended by the web visitor before routing. This causes extra burden on agents who are dealing with non-responsive chatters.

* **Endpoint:** POST /api/v2/analytics/conversations/details/query  
* **Logic:** Queries for chat conversations where the customer disconnected before reaching an agent. The payload specifically filters for segments with a disconnectType of peer or client on the customer segment, without an accompanying agent connection segment.  
* **Reference:** [Conversations Details Query](https://developer.genesys.cloud/devapps/api-explorer#post-api-v2-analytics-conversations-details-query)

#### **5\. Dropped Calls (dropped-calls.html)**

Provides analytical reporting on voice interactions that experienced premature disconnection or drop-offs, aiding in telecommunications and network troubleshooting.

* **Endpoint:** POST /api/v2/analytics/conversations/details/query  
* **Logic:** Queries voice interactions filtering for specific disconnectType values (e.g., error, system, or network). It may also calculate the duration of the call to highlight micro-calls (under a few seconds) that indicate an immediate drop upon connection.  
* **Reference:** [Conversations Details Query](https://developer.genesys.cloud/devapps/api-explorer#post-api-v2-analytics-conversations-details-query)

#### **6\. SMS Outbound Status (sms-outbound-status.html)**

Tracks the delivery status, success rates, and potential failures of outbound SMS messages sent through the platform.

* **Endpoint:** POST /api/v2/analytics/conversations/details/query  
* **Logic:** Queries for conversations with mediaType: message and direction: outbound. Extracts the delivery receipt status from the participant data or message segments to tally successful deliveries vs. failures/bounces.  
* **Reference:** [Conversations Details Query](https://developer.genesys.cloud/devapps/api-explorer#post-api-v2-analytics-conversations-details-query)

### **B. User & Queue Management Modules**

#### **7\. Check Users Queues (users\_queues.html)**

Allows admins to quickly look up specific agents or users to verify if they are active on multiple Genesys Cloud routing queues. This is to identify and rectify cases where an agent is active in a Training and a Prod queue at the same time.

* **Endpoints:** \* GET /api/v2/users/search (or /api/v2/users)  
  * GET /api/v2/users/{userId}/routingqueues  
* **Logic:** Provides a search bar to find a user. Upon selection, the app fetches all queues the user is a member of and maps their joined (active) status. If a user is joined: true in conflicting queues (e.g., Prod and Training), the UI highlights this discrepancy.  
* **Reference:** [User Routing Queues API](https://developer.genesys.cloud/devapps/api-explorer#get-api-v2-users--userId--routingqueues)

#### **8\. Queue Group Members (queue\_groups.html)**

Provides visibility into queue group membership, allowing administrators to see in detail who is active and inactive in a queue. It allows admins to bulk activate or deactivate selected users (or all users).

* **Endpoints:**  
  * GET /api/v2/routing/queues  
  * GET /api/v2/routing/queues/{queueId}/users  
  * PATCH /api/v2/routing/queues/{queueId}/users (Bulk Update)  
* **Logic:** Admins select a queue to view its roster. The app retrieves the member list and their active status. The UI provides checkboxes to select users and buttons to "Join" (Activate) or "Unjoin" (Deactivate). When clicked, the app sends a bulk PATCH payload with the selected user IDs and their new joined boolean state.  
* **Reference:** [Queue Users API](https://developer.genesys.cloud/devapps/api-explorer#get-api-v2-routing-queues--queueId--users) | [Bulk Update Queue Users](https://developer.genesys.cloud/devapps/api-explorer#patch-api-v2-routing-queues--queueId--users)

#### **9\. Users Disconnections (agents-disconnections.html)**

Tracks and lists agents/users who experience frequent platform disconnections or status drops.

* **Endpoint:** POST /api/v2/analytics/users/details/query  
* **Logic:** Queries the user presence history, looking specifically for transitions to system presences like Offline or standard errors that indicate the browser lost WebSocket connectivity, rather than a deliberate "Log Off" action. Aggregates these counts per agent to flag hardware/network issues.  
* **Reference:** [User Details Query](https://developer.genesys.cloud/devapps/api-explorer#post-api-v2-analytics-users-details-query)

#### **10\. Create WebRTC Phones (user\_phone.html)**

An administrative provisioning tool designed to streamline the creation and assignment of WebRTC phone stations for new or existing users.

* **Endpoints:**  
  * GET /api/v2/telephony/providers/edges/sites (To fetch available sites)  
  * GET /api/v2/telephony/providers/edges/phonebasesettings (To fetch base WebRTC profiles)  
  * POST /api/v2/telephony/providers/edges/phones (To create the phone)  
* **Logic:** Populates dropdowns for Sites and Base Settings. The admin inputs a phone name and assigns a user. The app builds the required payload (linking the user's ID, the Site ID, and the WebRTC Base Settings ID) and posts it to the phones endpoint to provision the station instantly.  
* **Reference:** [Telephony Providers Edge API](https://developer.genesys.cloud/devapps/api-explorer#post-api-v2-telephony-providers-edges-phones)

## **5\. Deployment & Hosting**

The application is deployed as a cloud-hosted static website and integrated into Genesys Cloud as a native application:

* **Genesys Client Application:** The application runs as an Embedded "Client Application" within Genesys Cloud. Admins can manage this integration and its properties via the Genesys Cloud Admin UI:  
  [Manage Integration in Genesys](https://apps.mypurecloud.com.au/directory/#/admin/integrations/apps/embedded-client-app/59b35bff-ed7e-4451-ace3-481124e6a8b3)  
* **Application URL:** The live application endpoint is accessed at:  
  [https://genesys-addon.lifeline.org.au/AdminAssistant/frequent-answered-chat-users.html](https://genesys-addon.lifeline.org.au/AdminAssistant/frequent-answered-chat-users.html)  
* **Hosting Details:** It is hosted as an **Azure Static Website**. The custom domain genesys-addon.lifeline.org.au is registered by LLA (Lifeline Australia) and routes traffic to the underlying Azure endpoint: waws-prod-hk1-eb81d4fc.sip.p.azurewebsites.windows.net.  
* **Source Code Repository:** The static website source code is maintained on GitHub:  
  [https://github.com/lifeline-servicedesk/lifeline-repo](https://github.com/lifeline-servicedesk/lifeline-repo)

## **6\. Access Control & Authorisation**

To ensure secure access to sensitive administrative functions and data, this application is highly restricted within Genesys Cloud. The integration is strictly accessible and visible **only** to users who are active members of the following Genesys Cloud groups:

* GC\_LLA\_ADMIN  
* GC\_LLA\_PARTNER\_ADMIN