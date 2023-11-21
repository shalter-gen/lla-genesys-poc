(function() {
    'use strict';

    if (document.location.pathname.endsWith('crisis-text/')) {
        // WebMessaging script
        //document.querySelector("#init_widget").hidden=true;
        (function (g, e, n, es, ys) {
            g['_genesysJs'] = e;
            g[e] = g[e] || function () {
                (g[e].q = g[e].q || []).push(arguments)
            };
            g[e].t = 1 * new Date();
            g[e].c = es;
            ys = document.createElement('script'); ys.async = 1; ys.src = n; ys.charset = 'utf-8'; document.head.appendChild(ys);
        })(window, 'Genesys', 'https://apps.mypurecloud.com.au/genesys-bootstrap/genesys.min.js', {
            environment: 'prod-apse2',
            deploymentId: 'd99ec32b-4e2b-41e1-b63b-8fdf34145041'
        });
    } else if (document.location.pathname.endsWith('131114/')) {
        // WebChat script

        window._genesys = {
            widgets: {
                main: {
                    preload: ['webchat'],
                    theme: 'light',
                },
                webchat: {
                    emojis: true,
                    uploadsEnabled: true,
                    confirmFormCloseEnabled: true,
                    actionsMenu: true,
                    //maxMessageLength: 140,

                    chatButton: {
                        enabled: true, // (boolean) Enable/disable chat button on screen.
                        //template: '<div>Live Chat</div>', // (string) Custom HTML string template for chat button.
                        effect: 'fade',         // (string) Type of animation effect when revealing chat button. 'slide' or 'fade'.
                        openDelay: 1000,        // (number) Number of milliseconds before displaying chat button on screen.
                        effectDuration: 300,    // (number) Length of animation effect in milliseconds.
                        hideDuringInvite: true  // (boolean) When auto-invite feature is activated, hide the chat button. When invite is dismissed, reveal the chat button again.
                    },

                    transport: {
                        type: 'purecloud-v2-sockets',
                        dataURL: 'https://api.mypurecloud.com.au',     // replace with API URL matching your region
                        deploymentKey : '0018d8b8-0b7f-4635-8950-afe32ab6c8c7',  // replace with your Deployment ID
                        orgGuid : '184c8674-75b5-4113-9189-f9c54d6b7fe8',              // replace with your Organization ID
                        interactionData: {
                            routing: {
                                targetType: 'QUEUE',
                                targetAddress: 'LLA Main Queue',
                                priority: 2
                            }
                        }
                    },
                    userData: {

                        //addressStreet: '.',
                        //addressCity: '.',
                        //addressPostalCode: '.',
                        //addressState: 'FL',
                        //phoneNumber: '1-916-892-2045 x293',
                        //phoneType: 'Cell',
                        //customerId: '59606',
                        // These fields should be provided via advanced configuration
                        // firstName: 'Praenomen',
                        //lastName: 'Gens',
                        //email: 'praenomen.gens@calidumlitterae.com',
                        //subject: 'Chat from '+document.title,
                        customField1Label: 'Distress Level',
                        customField2Label: 'State',
                        customField3Label: 'Age',

                    },
                    form: {
                        "wrapper":"<table></table>",
                        "inputs":[
                            {
                                "id":"cx_webchat_form_firstname",
                                "name":"firstname",
                                "type":"text",
                                "maxlength":"100",
                                "placeholder":"@i18n:webchat.ChatFormPlaceholderFirstName",
                                //"label":"@i18n:webchat.ChatFormFirstName",
                                "label":"Name",
                                "value":"",
                                "validate": function(event, form, input, label, $, CXBus, Common){
                                    //console.log('validate: ',input);
                                    return (input? !! input[0].value : false);
                                },
                            },/*
                        {
                            "id":"cx_webchat_form_lastname",
                            "name":"lastname",
                            "type":"text",
                            "maxlength":"100",
                            "placeholder":"@i18n:webchat.ChatFormPlaceholderLastName",
                            "label":"@i18n:webchat.ChatFormLastName",
                            "value":"Smith"
                        },
                        {
                            "id":"cx_webchat_form_email",
                            "name":"email",
                            "type":"text",
                            "maxlength":"100",
                            "placeholder":"@i18n:webchat.ChatFormPlaceholderEmail",
                            "label":"Email",
                            "value":"john.smith@company.com"
                        },
                        {
                            "id":"cx_webchat_form_phonenumber",
                            "name":"phonenumber",
                            "type":"text",
                            "maxlength":"100",
                            "placeholder":"Phone Number",
                            "label":"Phone Number",
                            "value":"9256328346"
                        },*/
                            {
                                "id":"cx_webchat_form_state",
                                //"name":"addressState",
                                "name":"customField2",
                                "type":"select",
                                "label":"State",
                                "placeholder": 'Required',
                                "options":[
                                    {
                                        "text":"",
                                        "value":"",
                                    },
                                    {
                                        "text":"Australian Capital Territory",
                                        "value":"ACT",
                                        //"selected":true
                                    },
                                    {
                                        "text":"New South Wales",
                                        "value":"NSW"
                                    },
                                    {
                                        "text":"Northern Territory",
                                        "value":"NT"
                                    },
                                    {
                                        "text":"Queensland",
                                        "value":"QLD"
                                    },
                                    {
                                        "text":"South Australia",
                                        "value":"SA"
                                    },
                                    {
                                        "text":"Tasmania",
                                        "value":"TAS"
                                    },
                                    {
                                        "text":"Victoria",
                                        "value":"VIC"
                                    },
                                    {
                                        "text":"Western Australia",
                                        "value":"WA"
                                    },
                                    {
                                        "text":"Prefer Not To Say",
                                        "value":"Prefer Not To Say"
                                    }
                                ]
                            },
                            {
                                "id":"cx_webchat_form_gender",
                                "name":"gender",
                                "type":"select",
                                "label":"Gender",
                                "options":[
                                    {
                                        "text":"",
                                        "value":"",
                                    },
                                    {
                                        "text":"Female",
                                        "value":"FEMALE",
                                    },
                                    {
                                        "text":"Male",
                                        "value":"MALE"
                                    },
                                    {
                                        "text":"Non-binary",
                                        "value":"Non-binary"
                                    },
                                    {
                                        "text":"Other",
                                        "value":"Other"
                                    }
                                ]
                            },
                            {
                                "id":"cx_webchat_form_age",
                                //"name":"age",
                                "name":"customField3",
                                "type":"text",
                                "maxlength":"3",
                                //"placeholder":"Age",
                                "label":"Age",
                            },
                            {
                                name: 'customField1',

                                "id":"cx_webchat_form_distress",
                                //"name":"distress",
                                "name":"customField1",
                                "type":"select",
                                "label":"Distress Level",
                                "wrapper": "<tr><th>{label}</th><td>{input}</td></tr>",
                                "options":[
                                    {
                                        "text":"0 (not at all)",
                                        "value":"0",
                                    },
                                    {
                                        "text":"1",
                                        "value":"1"
                                    },
                                    {
                                        "text":"2",
                                        "value":"2"
                                    },
                                    {
                                        "text":"3",
                                        "value":"3"
                                    },
                                    {
                                        "text":"4",
                                        "value":"4"
                                    },
                                    {
                                        "text":"5",
                                        "value":"5"
                                    },
                                    {
                                        "text":"6",
                                        "value":"6"
                                    },
                                    {
                                        "text":"7",
                                        "value":"7"
                                    },
                                    {
                                        "text":"8",
                                        "value":"8"
                                    },
                                    {
                                        "text":"9",
                                        "value":"9"
                                    },
                                    {
                                        "text":"10 (extremely)",
                                        "value":"10"
                                    }
                                ]
                            },
                        ]
                    }
                }
            }
        };

        // Create a new script element
        var scriptElement = document.createElement('script');

        // Set the source URL of the script
        scriptElement.src = 'https://apps.mypurecloud.com.au/widgets/9.0/cxbus.min.js'; // Change this URL to the script you want to include
        scriptElement.onload = function() {
            console.log('Genesys WebChat script loaded successfully!');
            CXBus.configure({debug:true,pluginsPath:'https://apps.mypurecloud.com.au/widgets/9.0/plugins/'});
            CXBus.loadPlugin('widgets-core')
        };

        // Append the script element to the document body
        document.body.appendChild(scriptElement);
    }
})();