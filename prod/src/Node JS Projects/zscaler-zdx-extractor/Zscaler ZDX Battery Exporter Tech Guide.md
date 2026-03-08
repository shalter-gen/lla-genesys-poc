# **Zscaler ZDX Daily Battery Exporter \- Technical Documentation**

## **1\. Overview and Purpose**

The **Zscaler ZDX Daily Battery Exporter** is a Node.js-based automation tool designed to enforce company hardware policies. Specifically, it identifies remote users who are running their work PCs on battery power for extended periods.

**Business Justification:** Running laptops on battery power forces the operating system into power-saving modes, degrading CPU and network performance. For crisis support staff relying on Genesys Cloud for voice and digital channels, this degradation leads to application latency, dropped connections, and severe impacts on critical service delivery.

By identifying these users, IT and management can proactively intervene to ensure users remain plugged into AC power.

## **2\. Environment & Deployment Architecture**

* **Server Hostname:** SydPOrion01  
* **Operating System:** Windows Server  
* **Application Path:** C:\\Tools\\zscaler-zdx-extractor  
* **Execution Runtime:** Node.js  
* **Service Manager:** Installed as a Windows Service via nssm.exe (Non-Sucking Service Manager).  
* **Service Name:** Zscaler ZDX Battery Data Exporter  
* **Startup Type:** Automatic  
* **Execution Schedule:** Internal scheduler triggers daily at **8:00 AM**, looking back over the previous 24-hour period (8:00 AM previous day to 8:00 AM current day).

## **3\. Core Logic & Alerting Criteria**

The application extracts telemetry data via the Zscaler ZDX API. It processes all devices and calculates the total duration the device was turned on, as well as the time spent plugged in versus unplugged.

To be flagged in the email alert table, a device **must meet ALL** of the following criteria:

1. **Battery Data Availability:** The device must report battery metrics to ZDX (excludes desktops or unsupported endpoints).  
2. **Total Session Duration:** The device must be active for **≥ 1 hour** within the 24-hour window.  
3. **Unplugged Duration:** The device must have operated on battery power for **≥ 0.5 hours (30 minutes)**.

*Note: The generated CSV attachment includes the complete dataset for ALL processed devices, including those that do not meet the alert criteria or lack battery data.*

## **4\. System Components**

The project is highly modular and interacts heavily with the Zscaler ZDX API. Here is a breakdown of the primary modules and their API integrations:

### **4.1. apiClient.js & auth.js (API Integration)**

* **Authentication (auth.js):** Handles secure authentication with the Zscaler ZDX API by exchanging the API Key and Secret for a Bearer token. It manages token retrieval, and token rotation/expiration.  
  * **API Endpoint:** POST /v1/oauth/token  
  * **Documentation Link:** [Zscaler API Authentication](https://help.zscaler.com/legacy-apis/api-authentication-1#/oauth/token-post)  
* **Resilience (apiClient.js):** Implements a robust waitAndRetryRequest function. It actively catches HTTP 429 (Too Many Requests) and HTTP 500 (Internal Server Error) responses.  
* **Exponential Backoff:** If rate-limited, it reads the retry-after header (or defaults to a calculated wait time) and pauses execution before retrying, preventing the script from crashing during Zscaler API throttling.

### **4.2. Zscaler Data Retrieval**

The application calls the following Zscaler endpoints to aggregate the required telemetry:

* **Retrieve Users:** Fetches the list of all active Zscaler users within the tenant to map devices back to individuals and email addresses.  
  * **API Endpoint:** GET /v1/users  
  * **Documentation Link:** [Zscaler Reports \- Users](https://help.zscaler.com/legacy-apis/reports#/users-get)  
* **Retrieve Devices & Telemetry:** Pulls the specific device data, including time-series battery state metrics, to calculate duration, plugged time, unplugged time, and unknown state time.  
  * **API Endpoint:** GET /v1/devices  
  * **Documentation Link:** [Zscaler Reports \- Devices](https://help.zscaler.com/legacy-apis/reports#/devices-get)

### **4.3. User Interface / Interactive Mode (ui.js)**

* The code includes a UserInterface class utilizing Node's readline module.  
* **Operational Benefit:** The tool is not *just* a background service. An administrator can stop the Windows Service, open a command prompt, navigate to C:\\Tools\\zscaler-zdx-extractor, and run the script manually.  
* It provides a CLI menu to extract data for:  
  1. Last 2 hours  
  2. Last 12 hours  
  3. Last 24 hours  
  4. Specific day (midnight to midnight)

### **4.4. Email & CSV Generation**

* Generates an HTML email summarizing the execution (devices processed, devices meeting criteria).  
* Constructs a table sorted descending by **Unplugged Duration**.  
* Generates a .csv file in memory and attaches it to the outbound SMTP email.

## **5\. Troubleshooting Guide**

### **Issue 1: The Daily Email is Not Arriving**

1. **Check Service Status:** Log into SydPOrion01. Open services.msc and verify Zscaler ZDX Battery Data Exporter is "Running".  
2. **Check Application Logs:** Navigate to C:\\Tools\\zscaler-zdx-extractor\\logs (or standard output if configured via NSSM). Look for SMTP connection errors or Zscaler authentication failures.  
3. **Zscaler API Key Expiry:** API credentials may have expired. Check auth.js / .env logs for HTTP 401 Unauthorized or HTTP 403 Forbidden errors.

### **Issue 2: Service Fails to Start**

1. **Check Node.js:** Open a command prompt and type node \-v to ensure Node.js is still in the system PATH.  
2. **NSSM Configuration:** Run nssm edit "Zscaler ZDX Battery Data Exporter" in an elevated command prompt.  
   * Verify *Path* points to the node.exe executable.  
   * Verify *Arguments* points to the main entry file (app.js).  
   * Verify *AppDirectory* is exactly C:\\Tools\\zscaler-zdx-extractor.

### **Issue 3: Missing Users / Incomplete Data**

* **Rate Limiting:** Check the logs for HTTP 429 warnings. While apiClient.js handles retries, an excessively large user base might cause the script to timeout or hit a hard maximum retry limit.  
* **ZDX Agent Issues:** If a specific user is missing, their local Zscaler Client Connector / ZDX module may be disabled, or WMI (Windows Management Instrumentation) on their local PC is failing to read battery stats.

## **6\. How to Run Manually (Ad-Hoc Reporting)**

If an incident occurs and management requests immediate data outside of the 8:00 AM window:

1. RDP into SydPOrion01.  
2. Open Command Prompt as Administrator.  
3. Navigate to the directory: cd C:\\Tools\\zscaler-zdx-extractor  
4. Run the application manually: node app.js.  
5. You will be presented with the CLI menu:  
   \=== Zscaler ZDX Battery Data Extractor \===  
   Select a time period for data extraction:  
   1\. Last 2 hours  
   2\. Last 12 hours  
   3\. Last 24 hours  
   4\. Specific day (midnight to midnight)  
   5\. Exit

6. Select the desired option. The tool will process the data and send the email to the configured recipients.

## **7\. Configuration Details**

Configuration values are managed through configuration files (e.g., .env or config.js) within the C:\\Tools\\zscaler-zdx-extractor folder. Key parameters include:

* **Zscaler API Credentials:**  
  * ZDX\_API\_KEY, ZDX\_API\_SECRET, ZDX\_BASE\_URL: Authentication and connection endpoints for the Zscaler tenant.  
* **Email Notification Settings:**  
  * SMTP\_HOST, SMTP\_PORT, EMAIL\_FROM: SMTP server routing configurations.  
  * EMAIL\_TO: The distribution list or recipient email addresses that will receive the daily report (e.g., it-alerts@company.com).  
* **Alerting Threshold Parameters:**  
  * MIN\_TOTAL\_DURATION\_HOURS: Defines the minimum time a device must be active during the period to be evaluated for an alert. Currently set to 1.0 (1 hour).  
  * MIN\_UNPLUGGED\_DURATION\_HOURS: Defines the minimum time a device must be running on battery power to trigger the email alert. Currently set to 0.5 (30 minutes).