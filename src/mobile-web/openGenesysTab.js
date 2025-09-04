// Source: https://lla-test.crm6.dynamics.com/%7b000000006233275%7d/webresources/lla_crisisInterationForm

function openGenesysTab(formContext) { // Get the URL from your form field
    var urlAttr = formContext.getAttribute("lla_genesysurl");
    if (!urlAttr) { 
        console.log("URL field not found.");
        return;
    }
    var url = urlAttr.getValue();
    if (!url) {
        console.log("No URL value set.");
        return;
    }
    // Send message to the persistent iframe
    try {
        // Find the hidden iframe in the parent window
        var frames = parent.frames;
        for (var i = 0; i < frames.length; i++) {
            try {
                if (frames[i].GenesysTabManager) {
                    frames[i].postMessage({ action: 'openGenesysUrl', url: url }, '*');
                    console.log('Sent message to Genesys Tab Manager'); 
                    return;
                }
             } catch (e) { 
                // Cross-origin iframe, skip continue;
            }
        }
        // Fallback if manager not found
        console.warn('Genesys Tab Manager not found, using fallback');
        window.open(url, 'GenesysCloudTab').focus();
    } catch (e) { 
        console.error('Error communicating with tab manager:', e);
        window.open(url, 'GenesysCloudTab').focus(); 
    }
}
