# **Lifeline Australia**

## **Genesys Admin Assistant**

## **Contents**

1. Purpose  
2. Document Control  
3. Document Approval  
4. Accessing the Admin Assistant  
5. Using the Admin Assistant (Features)  
   5.1 Navigation  
   5.2 Data & Reporting Modules  
   5.3 User & Queue Management Modules  
6. Additional Information / FAQs

## **1\. Purpose**

The purpose of this document is to provide system administrators with a comprehensive guide on how to access and utilise the Genesys **Admin Assistant** application. This custom application extends standard Genesys functionality to provide tailored reporting, data extraction, and bulk queue management tools designed specifically for Lifeline Australia's operational needs.

## **2\. Accessing the Admin Assistant**

The Admin Assistant is fully integrated into the Genesys Cloud platform.

**To access the application:**

1. Log into **Genesys Cloud**.  
2. On the main left-hand navigation menu, locate and click on **Apps**.  
3. Select **Admin Assistant** from the list of available applications.

*Note: The Admin Assistant tool is highly restricted. It will only appear in your "Apps" menu if your Genesys user profile is a member of either the GC\_LLA\_ADMIN or GC\_LLA\_PARTNER\_ADMIN groups.*

## **2\. Using the Admin Assistant**

### **2.1 Navigation**

When you open the Admin Assistant, you will land on the default dashboard (*Frequent Chat Users \- Answered*).

To navigate between different tools and pages, click the **Burger Menu** (three horizontal lines) in the top-left corner of the application. This will slide out the main navigation menu, displaying all 10 available modules.

### **2.2 Data & Reporting Modules**

**Frequent Chat Users \- Answered (Default Page)**

* **What it does:** Displays a list of help seekers/contacts who frequently initiate digital chats that were successfully answered by a Crisis Supporter.  
* **How to use:** View the table to identify high-volume users who are actively consuming support time.

**Frequent Chat Users \- All**

* **What it does:** Similar to the above, but provides a holistic view of all frequent chatters, regardless of whether the chat was answered, abandoned, or disconnected.  
* **How to use:** Use this to gauge overall system demand from specific recurring users.

**Data Extractor**

* **What it does:** Allows you to download bulk data directly from Genesys into a CSV file.  
* **How to use:** Select the data entity you wish to export by ticking the object type (Users, Groups, Queues, Work Teams, Divisions, or Roles). The tool will compile the data and automatically download a CSV file to your computer.

**Ghost Chats**

* **What it does:** Identifies "ghost chats"—interactions where a web visitor (help seeker) initiated a chat but left the chat unattended in their browser, the chat still being routed to an agent (Crisis Supporter).  
* **How to use:** Use this report to understand the volume of non-responsive chatters that may be causing an extra routing burden on Crisis Supporters.

**Dropped Calls**

* **What it does:** Reports on voice interactions that experienced a premature drop or system disconnection from the Crisis Supporter side.  
* **How to use:** Monitor this page to help identify telecommunication, carrier, or network issues that are causing micro-calls or immediate disconnects.

**SMS Outbound Status**

* **What it does:** Tracks the delivery success and failure rates of outbound SMS messages.  
* **How to use:** Check this page to verify if outbound SMS messages sent to help seekers are successfully reaching their destination handsets or if they are bouncing.

### **2.3 User & Queue Management Modules**

**Check Users Queues**

* **What it does:** Allows you to quickly look up specific agents or users to verify if they are active on multiple Genesys Cloud routing queues. This is to identify and rectify cases where an agent is active in a Training and a Prod queue at the same time..  
* **How to use:** Select Queue 1 and Queue 2\. The tool will display all users who are active in both selected queues. *Use this to easily check if an agent has accidentally left themselves active in conflicting queues, such as Training and Production.*

**Queue Group Members**

* **What it does:** Provides detailed visibility into the membership of specific queue groups and allows for bulk status updates.  
* **How to use:**  
  * 1\. Select a queue to view its roster.  
  * 2\. The page will display who is active and inactive.  
  * 3\. Use the checkboxes to select groups or specific users (or select all).  
  * 4\. Click **Join** to activate the selected users in the queue, or **Unjoin** to deactivate them.

**Users Disconnections**

* **What it does:** Lists agents who are experiencing frequent platform disconnections, WebSocket drops, or unexpected "Offline" statuses.  
* **How to use:** Use this to identify specific users who may be struggling with local hardware, browser, or home network stability issues.

**Create WebRTC Phones**

* **What it does:** A streamlined tool to provision a new WebRTC web phone for a user.  
* **How to use:**  
  * 1\. Select a group from the dropdown.  
  * 2\. The list of users without a WebRTC phone will be displayed.  
  * 3\. Select specific users or all users.  
  * 3\. Click on “Create Phones” button.  
  * 4\. WebRTC phones will be created and a popup will show the operation result.

## **4\. Additional Information / FAQs**

**1\. I got a sad face or a blank screen when I tried to open the Admin Assistant.**

Log out of Genesys entirely, clear your browser cache if necessary, and log back in before selecting the Admin Assistant tool from the Apps menu again.

**2\. Can I use the Admin Assistant while handling interactions?** Yes. Because it is a native Genesys App, you can open it in your main Genesys window while remaining on queue.

**3\. Why can't I see the Admin Assistant in my Apps menu?**

Access is strictly controlled by Genesys User Groups. You must be added to either GC\_LLA\_ADMIN or GC\_LLA\_PARTNER\_ADMIN by a system administrator to view and access the application.

**4\. The Data Extractor CSV download is taking a long time, is it broken?**

No. If your Genesys environment has thousands of users or queues, the application has to request this data in "pages" to avoid overloading the system (Rate Limiting). Please be patient and leave the tab open until the CSV download prompts.