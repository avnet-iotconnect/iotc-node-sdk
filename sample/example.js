"use strict";

var SDKClient = require("iotconnect-sdk");
var iotConnectSDK = "";
var readline = require("readline");
var async = require("async");
var fs = require("fs-extra");
var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

var cpId = "<<Your cpId>>";
var env = "<<Your Environment>>";
var pf = "<<Your Platform>>";

var sdkOptions = {
    certificate: {
        // Self signed or CA signed device only
        SSLCertPath: "", //"<<path>>/device.pem",
        SSLKeyPath: "", //"<<path>>/device.key",
        SSLCaPath: "", //"<<path>>/rootCa.pem"
    },
    offlineStorage: {
        disabled: false, //default value = false, false = store data, true = not store data
        availSpaceInMb: 1, //in MB Default value = unlimited
        fileCount: 5, // Default value = 1
    },
    debug: false, // Private setting, false(default) = Don't show log, true = Show log
    //"discoveryUrl": "", // Private setting, Default = "https://discovery.iotconnect.io"
    skipValidation: false, // false(default) = Do validation, true = skip validation
    keepalive: "", // Integer value only
    cpId: cpId,
    env: env,
    pf: pf,
};
var isDeviceConnected = false;

var deviceId = "";

async.series(
    [
        function (cb_series) {
            rl.question("Enter device serial number : ", function (uniqueId) {
                deviceId = uniqueId;
                rl.question("Enter SID : ", function (sId) {
                    if (sdkOptions.certificate) {
                        try {
                            var CERT_PATH_FLAG = true;
                            async.forEachSeries(
                                Object.values(sdkOptions.certificate),
                                function (filePath, cb_inner) {
                                    if (!fs.existsSync(filePath)) {
                                        CERT_PATH_FLAG = false;
                                    }
                                    cb_inner();
                                },
                                function () {
                                    if (CERT_PATH_FLAG == true) {
                                        if (!isDeviceConnected) {
                                            iotConnectSDK = new SDKClient(uniqueId, sId, sdkOptions, initCallback);
                                        } else {
                                            console.log("DeviceId ::: [" + uniqueId + "] :: Init :: Device is already connected :: ", new Date());
                                        }
                                        cb_series();
                                    } else {
                                        console.log("DeviceId ::: [" + uniqueId + "] :: Init :: Set proper certificate file path and try again :: ", new Date());
                                        process.exit();
                                    }
                                }
                            );
                        } catch (error) {
                            console.log("DeviceId ::: [" + uniqueId + "] :: Init :: error :: ", error.message, " :: ", new Date());
                        }
                    } else {
                        if (!isDeviceConnected) {
                            iotConnectSDK = new SDKClient(uniqueId, sId, sdkOptions, initCallback);
                        } else {
                            console.log("DeviceId ::: [" + uniqueId + "] :: Init :: Device is already connected :: ", new Date());
                        }
                        cb_series();
                    }
                });
            });
        },
    ],
    function (err, response) {}
);

var initCallback = function initCallback(response) {
    if (response.status) {
        startConnection();
        initCallbacks();
        console.log("DeviceId ::: [" + deviceId + "] :: SDK initialization Success :: ", new Date());
    } else {
        console.log("DeviceId ::: [" + deviceId + "] :: SDK initialization failed ::", response.message, " :: ", new Date());
    }
};

var startConnection = function startConnection() {
    iotConnectSDK.connect(successCallback, failedCallback, connectionStatusCallback);
};

// success callback
var successCallback = function successCallback(responseMessage) {
    isDeviceConnected = true;
    console.log("\nDeviceId ::: [" + deviceId + "] :: Connection success :: " + responseMessage + " :: ", new Date());
};

// Failed callback
var failedCallback = function failedCallback(responseMessage) {
    isDeviceConnected = false;
    console.log("\nDeviceId ::: [" + deviceId + "] :: Connection failed :: " + responseMessage + " :: ", new Date());
};

// Callback function for the connection status
var connectionStatusCallback = function connectionStatusCallback(response) {
    if (response.command) {
        isDeviceConnected = true;
        setTimeout(() => {
            getAttributes();
            // getChildDevices();
            // createChildDevice();
            // deleteChildDevice();
            // getTwins();
        }, 10000);
        console.log("\nDeviceId ::: [" + response.uniqueId + "] :: Device Connected :: ", new Date());
    } else {
        isDeviceConnected = false;
        console.log("\nDeviceId ::: [" + response.uniqueId + "] :: Device Disconnected :: ", new Date());
    }
};

var childGlobal = [];
var getAttributes = function getAttributes() {
    iotConnectSDK.getAttributes(function (response) {
        try {
            console.log("\nDeviceId ::: [" + deviceId + "] :: Get Attributes :: ", new Date());
            console.log("\nDeviceId ::: [" + deviceId + "] :: Attributes received :: ", JSON.stringify(response));

            if (response.data && response.data instanceof Array && response.data.length) {
                childGlobal = response.data.map((e) => e.device.id);
            }
            SendData(response.data);
        } catch (error) {
            console.log("Error while getting attributes :: ", error);
        }
    });
};

var getChildDevices = function getChildDevices() {
    iotConnectSDK.getChildDevices(function (response) {
        try {
            if (response.status) {
                console.log("\nDeviceId ::: [" + deviceId + "] :: Child devices received :: ", new Date());
                console.log("\nDeviceId ::: [" + deviceId + "] :: Child devices :: ", JSON.stringify(response));
            } else {
                console.log("\nDeviceId ::: [" + deviceId + "] :: Child devices receive request failed :: ", response.message, " :: ", new Date());
            }
        } catch (error) {
            console.log("\nDeviceId ::: [" + deviceId + "] :: Child devices receive request failed :: ", error.message, " :: ", new Date());
        }
    });
};

var deviceCommandCBFunc = function deviceCommandCBFunc(data) {
    console.log("\nDeviceId ::: [" + deviceId + "] :: Device Command :: ", new Date());
    console.log("\nDeviceId ::: [" + deviceId + "] :: Device command :: ", JSON.stringify(data));
    if (data && data.ct == 0 && data.ack) {
        var ackGuid = data.ack;
        var status = 7; // Failed = 4, Executed = 5, Success = 7
        var msg = "Success";
        var childId = data.id ? data.id : null;
        iotConnectSDK.sendAckCmd(ackGuid, status, msg, childId);
    } else {
        console.log("\nDeviceId ::: [" + deviceId + "] :: Device Command :: No ack :: ", JSON.stringify(data));
    }
};

var twinChangeCommandCBFunc = function twinChangeCommandCBFunc(data) {
    console.log("\nDeviceId ::: [" + deviceId + "] :: Twin message received :: ", new Date());
    console.log("\nDeviceId ::: [" + deviceId + "] :: Twin message :: ", JSON.stringify(data));
    if (data.desired) {
        async.forEachSeries(
            Object.keys(data.desired),
            function (property, callbackAtt) {
                if (property == "$version") {
                    callbackAtt();
                } else {
                    var value = data.desired[property];
                    iotConnectSDK.updateTwin(property, value, function (response) {
                        console.log("\nDeviceId ::: [" + deviceId + "] :: Twin updated :: ", new Date());
                        console.log("\nDeviceId ::: [" + deviceId + "] :: Twin updated :: ", JSON.stringify(response));
                    });
                    callbackAtt();
                }
            },
            function () {}
        );
    }
};

var setReadline = function setReadline(attr, type, callback) {
    if (type == 1) var space = "  ";
    else var space = "";
    rl.question(space + "Enter " + attr + " : ", function (value) {
        var obj = {};
        obj[attr] = value;
        callback(obj);
    });
};

var callAgain = function callAgain() {
    rl.question("\nDeviceId ::: [" + deviceId + "] :: Would you like to send data again ? (Y/N) : ", function (status) {
        if (status == "Y" || status == "y") {
            try {
                getAttributes();
            } catch (error) {
                console.log("\nDeviceId ::: [" + deviceId + "] :: Get attribute error :: ", error.message, " :: ", new Date());
            }
        } else process.exit();
    });
};

var SendData = function SendData(sensorData) {
    var sendTeleData = [];
    var cnt = 0;
    var text = "";
    var tagArray = [];
    if (sensorData.length > 0) {
        try {
            async.forEachSeries(
                sensorData,
                function (inputData, data_cb) {
                    if (cnt == 0 && inputData.device.tg) {
                        console.log("Note :: It includes the single device from each tag.");
                        text = "(Gateway Device) ";
                    } else {
                        text = "";
                    }
                    if (inputData["attributes"].length > 0) {
                        if (tagArray.indexOf(inputData.device.tg) == -1) {
                            tagArray.push(inputData.device.tg);
                            if (inputData.device.tg) console.log("\n## TAG :: " + inputData.device.tg + " [Device " + text + ":: " + inputData.device.id + "]");
                            else console.log("\n## Device " + text + ":: " + inputData.device.id);
                            var senderDataObj = {
                                childId: cnt != 0 ? inputData.device.id : undefined,
                                data: {},
                            };
                            async.forEachSeries(
                                inputData.attributes,
                                function (attr, attrData_cb) {
                                    if (attr.d) {
                                        console.log("Enter " + attr.ln + " : ");
                                        senderDataObj.data[attr.ln] = {};
                                        async.forEachSeries(
                                            attr.d,
                                            function (attrChild, attrDataChild_cb) {
                                                setReadline(attr.ln + "." + attrChild.ln, 1, function (resultData) {
                                                    senderDataObj.data[attr.ln][attrChild.ln] = resultData[attr.ln + "." + attrChild.ln];
                                                    attrDataChild_cb();
                                                });
                                            },
                                            function () {
                                                attrData_cb();
                                            }
                                        );
                                    } else {
                                        setReadline(attr.ln, 0, function (resultData) {
                                            senderDataObj.data[attr.ln] = resultData[attr.ln];
                                            attrData_cb();
                                        });
                                    }
                                },
                                function () {
                                    sendTeleData.push(senderDataObj);
                                    cnt++;
                                    data_cb();
                                }
                            );
                        } else {
                            data_cb();
                        }
                    }
                },
                function () {
                    // sendTeleData["time"] = new Date();
                    var data = sendTeleData;
                    // console.log("SendData -> data example :: ", data)
                    iotConnectSDK.sendData(data);
                    setTimeout(function () {
                        callAgain();
                    }, 500);
                }
            );
        } catch (error) {
            console.log("\nDeviceId ::: [" + deviceId + "] :: Send data error :: ", error.message, " :: ", new Date());
        }
    } else {
        console.log("\nDeviceId ::: [" + deviceId + "] :: Send data fail :: No Attribute data found :: ", new Date());
    }
};

var attributeUpdatedCBFunc = function attributeUpdatedCBFunc(data) {
    console.log("\nDeviceId ::: [" + deviceId + "] :: Attribute Updated :: ", new Date());
    // console.log("\nDeviceId ::: [" + deviceId + "] :: Attribute Updated :: ", JSON.stringify(data));
    if (data) getAttributes();
};

// Callback function for the device updated
var deviceUpdatedCBFunc = function deviceUpdatedCBFunc(data) {
    console.log("\nDeviceId ::: [" + deviceId + "] :: Device Updated :: ", new Date());
    //console.log("\nDeviceId ::: [" + deviceId + "] :: Devices updated :: ", JSON.stringify(data));
};

// Callback function for the device updated
var ruleUpdatedCBFunc = function ruleUpdatedCBFunc(data) {
    console.log("\nDeviceId ::: [" + deviceId + "] :: Rule Updated :: ", new Date());
    //console.log(""\nDeviceId ::: [" + deviceId + "] :: Rule updated :: ", JSON.stringify(data));
};

// Callback function to receive OTA command
var OTACommandCBFunc = function OTACommandCBFunc(data) {
    console.log("\nDeviceId ::: [" + deviceId + "] :: Receive OTA command :: ", new Date());
    if (data && data.ct == 1 && data.ack) {
        console.log("\nDeviceId ::: [" + deviceId + "] :: Received OTA command :: ", JSON.stringify(data));
        // console.log("\n"+"--- Device Command Received ---");
        var ackGuid = data.ack;
        var status = 0;
        var msg = "Success";
        //console.log("\nAttributes received :: ", childGlobal);
        //var childId = childGlobal ? childGlobal : null;
        childGlobal.forEach((c) => {
            iotConnectSDK.sendAckOTA(ackGuid, status, msg, c);
        });
    } else {
        console.log("\nDeviceId ::: [" + deviceId + "] :: Received OTA Command :: No ack :: ", JSON.stringify(data));
    }
};

// Callback function to receive the module information
var moduleCommandCBFunc = function moduleCommandCBFunc(data) {
    console.log("\nDeviceId ::: [" + deviceId + "] :: Module Command :: ", new Date());
    console.log("\nDeviceId ::: [" + deviceId + "] :: Module command :: ", JSON.stringify(data));
    if (data && data.ct == 2 && data.ack) {
        var ackGuid = data.ack;
        var status = 0;
        var msg = "Success";
        iotConnectSDK.sendAckModule(ackGuid, status, msg);
    } else {
        console.log("\nDeviceId ::: [" + deviceId + "] :: Module Command ::  No ack  :: ", JSON.stringify(data));
    }
};

var initCallbacks = function initCallbacks() {
    iotConnectSDK.onTwinChangeCommand(twinChangeCommandCBFunc);
    iotConnectSDK.onDeviceCommand(deviceCommandCBFunc);
    iotConnectSDK.onOTACommand(OTACommandCBFunc);
    iotConnectSDK.onAttrChangeCommand(attributeUpdatedCBFunc);
    iotConnectSDK.onDeviceChangeCommand(deviceUpdatedCBFunc);
    iotConnectSDK.onModuleCommand(moduleCommandCBFunc);
    iotConnectSDK.onRuleChangeCommand(ruleUpdatedCBFunc);

    // For 2.1
    // iotConnectSDK.getCreateChildDeviceCallback(createDeviceCallback);
    // iotConnectSDK.getDeleteChildDeviceCallback(deleteDeviceCallback);
};

// New Methods
var createChildDevice = function createChildDevice() {
    var deviceId = "fn02";
    var deviceTag = "fan";
    var displayName = "Kitchen fan";
    iotConnectSDK.createChildDevice(deviceId, deviceTag, displayName, function (response) {
        try {
            console.log("\nDeviceId ::: [" + deviceId + "] :: Create child device status :: ", response.status, " :: ", new Date());
        } catch (error) {
            console.log("\nDeviceId ::: [" + deviceId + "] :: Create child device :: Error :: ", error.message, " :: ", new Date());
        }
    });
};

var deleteChildDevice = function deleteChildDevice() {
    var deviceId = "fn02";
    iotConnectSDK.deleteChildDevice(deviceId, function (response) {
        try {
            console.log("\nDeviceId ::: [" + deviceId + "] :: Delete child device status :: ", response.status, " :: ", new Date());
        } catch (error) {
            console.log("\nDeviceId ::: [" + deviceId + "] :: Delete child device :: Error :: ", error.message, " :: ", new Date());
        }
    });
};

var disconnectDevice = function disconnectDevice() {
    if (isDeviceConnected) {
        iotConnectSDK.disconnect();
        console.log("\nDeviceId ::: [" + deviceId + "] :: Device disconnected :: ", new Date());
    } else {
        console.log("\nDeviceId ::: [" + deviceId + "] :: Device is already disconnected :: ", new Date());
    }
};

var dispose = function dispose() {
    iotConnectSDK = undefined;
    console.log("\nDeviceId ::: [" + deviceId + "] :: SDK object destroy :: ", new Date());
};

var getTwins = function getTwins() {
    if (isDeviceConnected) {
        iotConnectSDK.getTwins(function (response) {
            console.log("\nDeviceId ::: [" + deviceId + "] :: Get twin request sent status :: ", response.status, " :: ", new Date());
        });
    } else {
        console.log("\nDeviceId ::: [" + deviceId + "] :: Get twin request :: Device is already disconnected :: ", new Date());
    }
};
