// https://mypurecloud.github.io/platform-client-sdk-javascript/
// https://github.com/MyPureCloud/platform-client-sdk-javascript?tab=readme-ov-file

// Configuration
const CLIENT_ID = '90a3b83c-a180-4667-abc3-bedf68ba86ae';
const REDIRECT_URI = window.location.origin + window.location.pathname;

const platformClient = require('platformClient');
console.log('SDK loaded: ',platformClient);

// Initialize the client
const client = platformClient.ApiClient.instance;
client.config.logger.log_level = client.config.logger.logLevelEnum.level.LTrace;
client.config.logger.log_format = client.config.logger.logFormatEnum.formats.JSON;
client.config.logger.log_request_body = true;
client.config.logger.log_response_body = true;
client.config.logger.log_to_console = true;
// client.config.logger.log_file_path = "/var/log/javascriptsdk.log";

client.config.logger.setLogger(); // To apply above changes

client.setEnvironment(platformClient.PureCloudRegionHosts.ap_southeast_2);
client.setPersistSettings(true, 'monitored_chats');

client.loginImplicitGrant(CLIENT_ID, REDIRECT_URI, { state: "INITIAL" })
    .then((data) => {
        console.log('Authenticated:', data);
        // localStorage.setItem('access_token', data.accessToken);

        // load the monitored-chats.js js script here
        // const script = document.createElement('script');
        // script.src = 'monitored-chats.js';
        // document.body.appendChild(script);
    })
    .catch((err) => {
        // Handle failure response
        console.error('Error during authentication:', err);
    });
