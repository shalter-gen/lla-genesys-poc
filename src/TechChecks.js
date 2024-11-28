import SpeedTest from 'https://cdn.skypack.dev/@cloudflare/speedtest';
// import Bowser from "https://cdn.jsdelivr.net/npm/bowser@2.11.0/es5.js"; // ES6 (and TypeScript with --esModuleInterop enabled)
// import Bowser from "./js/es5.js"; // ES6 (and TypeScript with --esModuleInterop enabled)

// Configuration
const config = {
    // Browser versions
    browsers: {
        chrome: ">=125",
        edge: ">=125",
        firefox: ">=127",
    },
    // Network Speed Thresholds
    networkSpeedTestThresholds: {
        fail: {
            download: 0.9 * 1000 * 1000,    // 0.9 Mbps
            upload: 0.9 * 1000 * 1000,      // 0.9 Mbps
            latency: 400,                   // 400 ms
            jitter: 100,                    // 100 ms
        },
        warning: {
            download: 2 * 1000 * 1000,      // 2 Mbps
            upload: 2 * 1000 * 1000,        // 2 Mbps
            latency: 250,                   // 250 ms
            jitter: 50,                     // 50 ms
        }
    },
    // Operating system
    operatingSystems: {
        windows: 7,
        mac: 10,
    },
    // Network Speed Test
    networkSpeedTestConfig: {
        measurements: [
            { type: 'latency', numPackets: 1 }, // initial latency estimation
            { type: 'download', bytes: 1e4, count: 1, bypassMinDuration: true }, // initial download estimation
            // { type: 'packetLoss', numPackets: 1e3, responsesWaitTime: 1000 },
            { type: 'download', bytes: 1e6, count: 2 },
            { type: 'latency', numPackets: 20 },
            { type: 'upload', bytes: 1e6, count: 2 },
        ],
    },
}

// See https://github.com/cloudflare/speedtest      
const speedConfig = {
    autoStart: false,
    turnServerUri: 'global.turn.twilio.com:3478',   // https://www.twilio.com/docs/stun-turn/api
    turnServerUser: "", // https://console.twilio.com/?frameUrl=%2Fconsole%3Fx-target-region%3Dus1
    turnServerPass: "",
    ...config.networkSpeedTestConfig
};
const speedTestEngine = new SpeedTest(speedConfig);
let startTime;
// engine.onRunningChange = running => playButton.textContent = running ? 'Running...' : 'Speed Test Finished!';
speedTestEngine.onRunningChange = (running) => {
    if (running) {
        startTime = new Date();
        speedCheckButton.textContent = 'Running...';
        setResult("");
        setDescription("");
        setDetails({});
    }
}
speedTestEngine.onResultsChange = ({ type }) => {
    console.log(type + ' finished after +' + (new Date() - startTime) / 1000 + ' seconds');
};
speedTestEngine.onFinish = results => {
    const testDuration = (new Date() - startTime) / 1000;
    speedCheckButton.textContent = 'Start Speed Test';

    const details = {
        TotalTime: testDuration,
        Summary: results.getSummary(),
        Scores: results.getScores(),
        UnloadedLatency: results.getUnloadedLatency(),
        UnloadedJitter: results.getUnloadedJitter(),
        DownLoadedLatency: results.getDownLoadedLatency(),
        DownLoadedJitter: results.getDownLoadedJitter(),
        UpLoadedLatency: results.getUpLoadedLatency(),
        UpLoadedJitter: results.getUpLoadedJitter(),
        DownloadBandwidth: results.getDownloadBandwidth(),
        UploadBandwidth: results.getUploadBandwidth(),
        PacketLoss: results.getPacketLoss(),
        PacketLossDetails: results.getPacketLossDetails(),
        ...speedTestEngine.results.raw
    };
    setDetails(details);
    console.log(details);

    let status;
    let description = '';
    if (details.Summary.download < config.networkSpeedTestThresholds.fail.download) {
        status = 'Fail';
        description += (description ? '\n' : '') + 'Download speed is too low: ' + (details.Summary.download / 1000000).toFixed(1) + ' Mbps';
    }
    if (details.Summary.download < config.networkSpeedTestThresholds.warning.download) {
        if (status !== 'Fail') {
            status = 'Warning';
            description += (description ? '\n' : '') + 'Download speed is low: ' + (details.Summary.download / 1000000).toFixed(1) + ' Mbps';
        }
    }
    if (details.Summary.upload < config.networkSpeedTestThresholds.fail.upload) {
        status = 'Fail';
        description += (description ? '\n' : '') + 'Upload speed is too low: ' + (details.Summary.upload / 1000000).toFixed(1) + ' Mbps';
    }
    if (details.Summary.upload < config.networkSpeedTestThresholds.warning.upload) {
        if (status !== 'Fail') {
            status = 'Warning';
            description += (description ? '\n' : '') + 'Upload speed is low: ' + (details.Summary.upload / 1000000).toFixed(1) + ' Mbps';
        }
    }
    if (details.Summary.latency > config.networkSpeedTestThresholds.fail.latency) {
        status = 'Fail';
        description += (description ? '\n' : '') + 'Latency is too high: ' + (details.Summary.latency).toFixed(0) + ' ms';
    }
    if (details.Summary.latency > config.networkSpeedTestThresholds.warning.latency) {
        if (status !== 'Fail') {
            status = 'Warning';
            description += (description ? '\n' : '') + 'Latency is high: ' + (details.Summary.latency).toFixed(0) + ' ms';
        }
    }
    if (details.Summary.jitter > config.networkSpeedTestThresholds.fail.jitter) {
        status = 'Fail';
        description += (description ? '\n' : '') + 'Jitter is too high: ' + (details.Summary.jitter).toFixed(0) + ' ms';
    }
    if (details.Summary.jitter > config.networkSpeedTestThresholds.warning.jitter) {
        if (status !== 'Fail') {
            status = 'Warning';
            description += (description ? '\n' : '') + 'Jitter is high: ' + (details.Summary.jitter).toFixed(0) + ' ms';
        }
    }
    if (status !== 'Fail' && status !== 'Warning') {
        status = 'OK';
        description = 'Network speed is good';
    }
    setResult(status);
    setDescription(description);
};

speedTestEngine.onError = (e) => console.error(e);


function analyzeSpeedTest(results) {

    const testDuration = (new Date() - startTime) / 1000;
    speedCheckButton.textContent = 'Start Speed Test';

    const details = {
        TotalTime: testDuration,
        Summary: results.getSummary(),
        Scores: results.getScores(),
        UnloadedLatency: results.getUnloadedLatency(),
        UnloadedJitter: results.getUnloadedJitter(),
        DownLoadedLatency: results.getDownLoadedLatency(),
        DownLoadedJitter: results.getDownLoadedJitter(),
        UpLoadedLatency: results.getUpLoadedLatency(),
        UpLoadedJitter: results.getUpLoadedJitter(),
        DownloadBandwidth: results.getDownloadBandwidth(),
        UploadBandwidth: results.getUploadBandwidth(),
        PacketLoss: results.getPacketLoss(),
        PacketLossDetails: results.getPacketLossDetails(),
        ...speedTestEngine.results.raw
    };
    console.log(details);

    let status;
    let description = '';
    if (details.Summary.download < config.networkSpeedTestThresholds.fail.download) {
        status = 'Fail';
        description += (description ? '\n' : '') + 'Download speed is too low: ' + (details.Summary.download / 1000000).toFixed(1) + ' Mbps';
    }
    if (details.Summary.download < config.networkSpeedTestThresholds.warning.download) {
        if (status !== 'Fail') {
            status = 'Warning';
            description += (description ? '\n' : '') + 'Download speed is low: ' + (details.Summary.download / 1000000).toFixed(1) + ' Mbps';
        }
    }
    if (details.Summary.upload < config.networkSpeedTestThresholds.fail.upload) {
        status = 'Fail';
        description += (description ? '\n' : '') + 'Upload speed is too low: ' + (details.Summary.upload / 1000000).toFixed(1) + ' Mbps';
    }
    if (details.Summary.upload < config.networkSpeedTestThresholds.warning.upload) {
        if (status !== 'Fail') {
            status = 'Warning';
            description += (description ? '\n' : '') + 'Upload speed is low: ' + (details.Summary.upload / 1000000).toFixed(1) + ' Mbps';
        }
    }
    if (details.Summary.latency > config.networkSpeedTestThresholds.fail.latency) {
        status = 'Fail';
        description += (description ? '\n' : '') + 'Latency is too high: ' + (details.Summary.latency).toFixed(0) + ' ms';
    }
    if (details.Summary.latency > config.networkSpeedTestThresholds.warning.latency) {
        if (status !== 'Fail') {
            status = 'Warning';
            description += (description ? '\n' : '') + 'Latency is high: ' + (details.Summary.latency).toFixed(0) + ' ms';
        }
    }
    if (details.Summary.jitter > config.networkSpeedTestThresholds.fail.jitter) {
        status = 'Fail';
        description += (description ? '\n' : '') + 'Jitter is too high: ' + (details.Summary.jitter).toFixed(0) + ' ms';
    }
    if (details.Summary.jitter > config.networkSpeedTestThresholds.warning.jitter) {
        if (status !== 'Fail') {
            status = 'Warning';
            description += (description ? '\n' : '') + 'Jitter is high: ' + (details.Summary.jitter).toFixed(0) + ' ms';
        }
    }
    if (status !== 'Fail' && status !== 'Warning') {
        status = 'OK';
        description = 'Network speed is good';
    }
    return ({ result: status, description: description, details: JSON.stringify(details) });
}

async function checkBrowser() {
    let result;
    let description;
    const browser = bowser.getParser(window.navigator.userAgent);

    const isValidBrowser = browser.satisfies(config.browsers);
    if (isValidBrowser) {
        result = 'OK';
        description = 'Browser is supported.';
    } else {
        result = 'Fail';
        description = 'Browser is not supported.';
    }

    const browserInfo = browser.getBrowser();
    const browserName = browserInfo.name;
    const browserVersion = parseInt(browserInfo.version, 10);
    let details = 'Browser: ' + browserName + ' ' + browserVersion;
    return { result: result, description: description, details: details };
}

async function checkComputer() {
    let result = "";
    let description = "";
    let details = "";
    const browser = bowser.getParser(window.navigator.userAgent);

    let extractVersion = function (str) {
        const match = str.match(/\d+/);
        return match ? parseInt(match[0]) : null;
    }
    // Get the operating system name and version
    const osName = browser.getOSName(true); // 'windows', 'macos', etc.
    const osVersion = browser.getOS().version; // e.g., '10.15.7'
    const majorVersion = extractVersion(osVersion);

    // Check if the operating system matches the configuration
    if (osName === 'windows') {
        if (majorVersion >= config.operatingSystems.windows) {
            result = "OK";
            description = "Windows version is supported.";
            details = osName + ' ' + osVersion;
        } else {
            result = "Fail";
            description = "Windows version is not supported. Minimum version is " + config.operatingSystems.windows + ".";
            details = osName + ' ' + osVersion;
        }
    } else if (osName === 'macos') {
        if (majorVersion >= config.operatingSystems.mac) {
            result = "OK";
            description = "MacOS version is supported.";
            details = osName + ' ' + osVersion;
        } else {
            result = "Fail";
            description = "MacOS version is not supported. Minimum version is " + config.operatingSystems.mac + ".";
            details = osName + ' ' + osVersion;
        }
    } else {
        result = "Fail";
        description = "Unsupported Operating System. Only Windows " + config.operatingSystems.windows + " and above or MacOS " + config.operatingSystems.mac + " or above are supported.";
        details = osName + ' ' + osVersion;
    }
    return { result: result, description: description, details: details };
}


async function detectClientNetwork() {
    try {
        const response = await fetch('https://ip.zscaler.com/?json');
        const jsonData = await response.json();
        const loggedInToZscaler = jsonData.cloud != undefined;
        const clientIP = jsonData.srcip;

        return {
            result: loggedInToZscaler ? 'OK' : 'Fail',
            description: loggedInToZscaler ? 'Logged in to Zscaler.' : 'Not logged in to Zscaler.',
            ip: clientIP
        }
    } catch (error) {
        console.error('Error fetching IP data:', error);
        return {
            result: 'Error',
            description: error.message,
            ip: ''
        }

    }
}

async function checkNetwork() {
    checkNetworkButton.textContent = 'Running...';
    setResult("");
    setDescription("");
    setDetails("");
    const network = await detectClientNetwork();
    checkNetworkButton.textContent = "Check Network";
    setResult(network.result);
    setDescription(network.description);
    setDetails(network.ip);
}

async function test1() {
    const network = await detectClientNetwork();
    return { testType: "Connected to Zscaler", result: network.result, description: network.description, details: network.ip };
}

function test2() {
    return new Promise((resolve) => {
        // Set up the callback to handle results
        speedTestEngine.onFinish = results => {
            // Resolve the promise with the results once the test is complete
            resolve({ testType: "Network Speed", ...analyzeSpeedTest(results) });
        };

        // Start the speed test
        speedTestEngine.restart();
    });
}

async function test3() {
    const browser = await checkBrowser();
    return { testType: "Browser Check", result: browser.result, description: browser.description, details: browser.details };
}

async function test4() {
    const computer = await checkComputer();
    return { testType: "Computer Check", result: computer.result, description: computer.description, details: computer.details };
}

function updateTableRow(testNumber, result) {
    const row = document.getElementById(`test${testNumber}Row`);
    row.innerHTML = `<td>${result.testType}</td><td>${result.result}</td><td>${result.description}</td><td><pre>${result.details}</pre></td>`;
}

export function runTest(testNumber) {
    let testFunction;
    switch (testNumber) {
        case 1:
            testFunction = test1;
            break;
        case 2:
            testFunction = test2;
            break;
        case 3:
            testFunction = test3;
            break;
        case 4:
            testFunction = test4;
            break;
    }
    // updateTableRow(testNumber, { testType: 'Running Test...', result: '', description: '', details: '' });
    // testFunction().then(result => updateTableRow(testNumber, result)); // testFunction().then(result => updateTableRow(testNumber, result));
}

// Run all tests automatically on page load
// window.onload = function () {
//     [1, 2, 3, 4].forEach(runTest);
// };

export async function testNetworkSpeed() {
    return test2();
}
