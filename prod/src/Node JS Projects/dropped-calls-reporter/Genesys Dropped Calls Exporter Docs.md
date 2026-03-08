# **Genesys Dropped Calls Exporter \- Technical Documentation**

## **1\. Overview and Purpose**

The **Genesys Dropped Calls Exporter** is a Node.js-based automation reporting tool designed to monitor and diagnose network or endpoint issues affecting voice quality and connection stability. It extracts dropped call data from Genesys Cloud and heavily enriches this telemetry using Microsoft Entra ID (Azure AD) sign-in logs, local inventory mapping files, and Zscaler IP ranges.

**Business Justification:** For crisis support services (e.g., 13YARN), dropped calls present a severe risk to service delivery and caller safety. By pinpointing exactly which calls dropped and correlating them with the agent's specific device, network location (Centre), and security routing (Zscaler), the IT and Network teams can proactively identify and resolve underlying infrastructure or endpoint hardware issues.

## **2\. Environment & Deployment Architecture**

* **Server Hostname:** SydPOrion01  
* **Operating System:** Windows Server  
* **Application Path:** C:\\Tools\\dropped-calls-reporter  
* **Execution Runtime:** Node.js  
* **Application Entry Point:** app.js  
* **Service Manager:** Installed as a Windows Service via nssm.exe (Non-Sucking Service Manager).  
* **Service Name:** LLA Dropped Calls Reporter  
* **Startup Type:** Automatic (Auto Started)  
* **Execution Schedule:** Internal scheduler triggers daily at **8:00 AM**.  
* **Data Lookback Windows:**  
  * **Genesys Dropped Calls:** Previous 24 hours (8:00 AM previous day to 8:00 AM current day).  
  * **Azure AD Sign-in Logs:** Previous 48 hours (to ensure an overlapping session IP/Device ID can be mapped to the Genesys user).

## **3\. Core Logic & Data Enrichment Pipeline**

The application builds its report through a multi-stage data enrichment pipeline:

1. **Genesys Telemetry Extraction:** Queries the Genesys Cloud Analytics API to retrieve all voice interactions for the last 24 hours, filtering for disconnected/dropped sessions (e.g., "Failed Media Recovery" errors).  
2. **Azure AD IP/Device Correlation:** Queries Microsoft Graph API for Entra ID sign-in logs over the last 48 hours. It matches the Genesys user's email/UPN to their Azure AD sign-in to extract their **IP Address** and **Device ID** at the time of the shift.  
3. **Intune Device Mapping (managed-pcs.csv):** The extracted Azure AD Device ID is cross-referenced against a locally stored Intune export (managed-pcs.csv) to determine the Device Name, Model, OS, and whether it is a Managed or Unmanaged device.  
4. **Network Location Mapping (centre-pcs.csv):** The user's correlated IP Address is checked against the local Meraki/Network inventory export (centre-pcs.csv) to map the connection to a specific physical site (e.g., VIC \- Morwell). If not found, it is labeled "Not Mapped".  
5. **Zscaler Routing Check:** The IP Address is evaluated against known Zscaler IP ranges. A boolean flag (Zscaler: true/false) is appended to indicate if the user's traffic was routed through the Zscaler proxy.

### **Alerting & Reporting Criteria**

* **Email Summary:** The email report table **only** displays dropped **External Calls** where the agent was actively participating (excludes internal transfers and monitoring sessions).  
* **CSV Attachment:** The attached CSV contains the complete, unfiltered dataset of **all** dropped calls (External, Internal, and Monitoring) for deeper engineering analysis.

## **4\. System Components and API Integrations**

### **4.1. Genesys Cloud API Integration**

Handles authentication via Client Credentials and retrieves analytics data.

* **API Endpoint (Auth):** POST https://login.mypurecloud.com.au/oauth/token  
* **API Endpoint (Analytics):** POST /api/v2/analytics/conversations/details/query  
* **Documentation Link:** [Genesys Cloud Conversation Detail Query](https://developer.genesys.cloud/analyticsdatamanagement/analytics/detail/conversation-query)

### **4.2. Microsoft Graph API (Azure AD) Integration**

Retrieves sign-in logs to establish the user's IP and Device context.

* **API Endpoint (Auth):** POST https://login.microsoftonline.com/{tenant\_id}/oauth2/v2.0/token  
* **API Endpoint (Sign-ins):** GET https://graph.microsoft.com/v1.0/auditLogs/signIns  
* **Documentation Link:** [Microsoft Graph API \- List signIns](https://learn.microsoft.com/en-us/graph/api/signin-list)

### **4.3. Local Data Sources**

The application relies on static files located in the project directory for mapping:

* centre-pcs.csv: Contains Network IP mappings (Model, Name, MAC address, Public IP, Tags, Network).  
* managed-pcs.csv: Contains Intune device mappings (Device ID, Device name, OS version, Manufacturer, Model).  
* **Zscaler IP Ranges (config.js / zscalerRanges \[\]):** Contains the CIDR blocks representing the company's dedicated Zscaler proxy nodes. This is used to determine if a call dropped while the user was routed securely via Zscaler.  
* *Note: These files must be kept up-to-date (via separate automated exports or manual updates) for accurate device, centre, and proxy mapping.*

## **5\. Troubleshooting Guide**

### **Issue 1: Device Names or Centres appear as "Unknown" or "Not Mapped"**

* **Cause:** The local mapping files are stale or missing recent data.  
* **Resolution:** Ensure that managed-pcs.csv (Intune export) and centre-pcs.csv (Meraki export) in the application directory (C:\\Tools\\dropped-calls-reporter) are updated with the latest network and MDM data.

### **Issue 2: The Daily Email is Not Arriving**

* **Check Service Status:** Log into SydPOrion01. Open services.msc and verify LLA Dropped Calls Reporter is "Running".  
* **Check Application Logs:** Look for SMTP connection errors, Genesys API authentication failures, or Azure AD graph permission issues. If Graph API permissions expire, the script cannot map IP addresses.  
* **Review Environment Variables:** Ensure SMTP\_HOST, SMTP\_USER, and SMTP\_PASS are correct.  
* **Error Notifications:** Check the inbox of the configured ERROR\_EMAIL\_TO address, as the script is designed to send execution failures there.

### **Issue 3: Missing Sign-in Logs (Rate Limiting)**

* If the Azure AD tenant has heavy traffic, the Graph API might throttle requests. Ensure the MAX\_RETRIES and BASE\_WAIT\_MS in the .env file are configured to handle HTTP 429 (Too Many Requests) gracefully.

### **Issue 4: Zscaler Flag is Incorrect (Updating Zscaler IP Ranges)**

* **Cause:** Zscaler periodically provisions new cloud gateways or IP subnets. If an agent is routed through a newly added Zscaler node that isn't in the tool's local database, the Zscaler flag in the report will incorrectly show as false.  
* **Resolution:**  
  1. Check the official Zscaler Configuration portal (e.g., [config.zscaler.com](https://config.zscaler.com/)) for the latest IP ranges corresponding to your Zscaler cloud instance.  
  2. Log into the host server (SydPOrion01) and navigate to C:\\Tools\\dropped-calls-reporter.  
  3. Open the file containing the Zscaler IP configurations (typically zscaler-ips.json, a constants file like config.js, or an array in .env).  
  4. Append the missing CIDR subnet (e.g., "165.225.114.0/23").  
  5. Restart the service to load the new IP configurations: Run nssm restart "LLA Dropped Calls Reporter" from an elevated command prompt.

## **6\. How to Run Manually**

The application can be run manually or as a daemon using the scripts defined in package.json.

1. RDP into the hosting server (SydPOrion01).  
2. Open Command Prompt or PowerShell as Administrator.  
3. Navigate to the application directory: cd C:\\Tools\\dropped-calls-reporter  
4. Use one of the following commands based on your need:  
   * **Run immediately (Standard execution):** npm run start or node app.js  
   * **Run as a background daemon (Scheduled mode):** npm run daemon  
   * **Run as daemon but execute immediately once:** npm run daemon-test

## **7\. Configuration Details**

Configuration values are managed through the .env file. Key parameters include:

### **API Credentials**

* **Genesys:** GENESYS\_REGION (e.g., mypurecloud.com.au), GENESYS\_CLIENT\_ID, GENESYS\_CLIENT\_SECRET  
* **Azure AD:** AZURE\_TENANT\_ID, AZURE\_CLIENT\_ID, AZURE\_CLIENT\_SECRET

### **Schedule and Timers**

* **Service Trigger:** Controlled by NSSM keeping the script running continuously while the internal node scheduler listens for the set time.  
* REPORT\_SCHEDULE\_HOUR: The hour the daily report runs (e.g., 8 for 8:00 AM).  
* DROPPED\_CALLS\_LOOKBACK\_HOURS: Defaults to 24\.  
* SIGNIN\_LOGS\_LOOKBACK\_HOURS: Defaults to 48 (requires a wider net to catch sign-ins that occurred before the 24-hour shift started).

### **Output and Notifications**

* OUTPUT\_FOLDER: Directory where the generated CSVs are stored (e.g., ./output).  
* SMTP\_HOST, SMTP\_PORT, SMTP\_SECURE, SMTP\_USER, SMTP\_PASS: Mail server routing.  
* EMAIL\_FROM: The sender address.  
* EMAIL\_TO: The distribution list receiving the daily report.  
* ERROR\_EMAIL\_TO: The administrator address designated to receive execution crash logs.  
* EMAIL\_SUBJECT: Subject line of the report (e.g., Genesys Cloud Dropped Calls Report).