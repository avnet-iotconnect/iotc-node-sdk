'use strict';

var SDKClient = require('iotconnect-sdk');
// var tpmSecurity = require('azure-iot-security-tpm');
// var tssJs = require("tss.js");

var iotConnectSDK = "";

// console.log(SDKClient);
// return false;
var readline = require('readline');
var async = require('async');
var fs = require('fs-extra');
// const { try } = require('bluebird');
var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
var env = process.argv[2];
var sdkOptions = {
    "debug" : true,
    "offlineStorage": {
        "disabled": false, //default value = false, false = store data, true = not store data 
		"availSpaceInMb": 1, //in MB Default value = unlimted
		"fileCount": 5 // Default value = 1
    },
	"isSimulatedTPMDevice": true,
	"devicePrefix": false,
	"azureIotEdgeDevice": false
}
var isDeviceConnected = false;

const dpsConnectionString = "<<Your Connection String>>";

const endorcementKey = "<<Your endorcementkey>>";

var deviceId = "AAA27";
var sId = "ZjlkYTY5MWU3NDc5NGRiNWE2NmZkYTVmNzAxOTIzNjI=UTE6MDQ6MDMuMDA=";
var deviceScopeId = "0ne000F7F02";

async.series([
    function(cb_series) {
        rl.question('Enter device serial number : ', function (uniqueId) {
            uniqueId = deviceId;
            rl.question('Enter SID : ', function (id) {
                sId = id ? id : sId;
                rl.question('Enter scopeId : ', function (scopeId) {
                    scopeId = deviceScopeId;
                    if(!isDeviceConnected) {
                        // iotConnectSDK = new SDKClient(cpId, uniqueId, deviceCallback, twinUpdateCallback, sdkOptions, env);
                        iotConnectSDK = new SDKClient(uniqueId, sId, scopeId, sdkOptions, getSecretCallback, function(response){
                            if(response.status){
                                // iotConnectSDK.connect();
                                setTimeout(() => {
                                    // console.log("==================================== connect ")
                                    initCallbacks();
									
									setTimeout(() => {
										iotConnectSDK.connect();
									}, 1000);
									
                                }, 5000);
                            } else {
                                console.log("DeviceId :: SDK initialization failed :: ", new Date());            
                            }
                        });
                    } else {
                        console.log("Device is already connected");
                    }
                });
            });
        });
    }
], function(err, response) { })

var getSecretCallback = function getSecretCallback(key) {
	switch (key) {
		case "DPSCS": //DPS connection string
			return dpsConnectionString;
		break;

		case "EKEY": //DPS connection string
			return endorcementKey;
		break;

		case "IOTHUB": //IoTHub Host name
			return "iothub";
		break;
		
		default:
			break;
	}
}

var getAttributest = function getAttributest(){
    iotConnectSDK.getAttributes(function(response){
        try {
            console.log("response.data ==>", JSON.stringify(response.data));
            SendData(response.data);
        } catch (error) {
            console.log("Error while getting attributes :: ",error);            
        }
    })
}

var deviceCallback = function deviceCallback(data){
        
    if(data != null && data != undefined && data.ack != undefined && data.cmdType != null)
    {
        if(data.cmdType == '0x01') {
            console.log("\n"+"--- Device Command Received ---");
            console.log(data);
            var obj = {
                "ackId": data.ackId,
                "st": 6,
                "msg": "",
                "childId": ""
            }
            var msgType = 5;
            if(data.ackId != null)
                iotConnectSDK.sendAck(obj, msgType)
        } else if(data.cmdType == '0x02') {
            console.log("\n"+"--- OTA Command Received ---");
            console.log(data);
            if(data.urls) {
                async.forEachSeries(data.urls, function (cmddetail, cbota) {
                    if("uniqueId" in cmddetail) {
                        var childId = cmddetail.uniqueId;
                    } else {
                        var childId = null;
                    }
                    var obj = {
                        "ackId": data.ackId,
                        "st": 7,
                        "msg": "",
                        "childId": childId
                    }
                    var msgType = 11;
                    if(data.ackId != null)
                    {
                        /*
                        Type    : Public Method "sendAck()"
                        Usage   : Send firmware command received acknowledgement to cloud
                        - status Type
                            st = 7; // firmware
                        - Message Type
                            msgType = 11; // for "0x02" Firmware command
                        */
                       console.log("obj => ", obj);
                        iotConnectSDK.sendAck(obj, msgType)
                    }
                    cbota();
                }, function () { });
            }
        } else if(data.cmdType == '0x16') {
            // console.log("\n"+"--- Device connection status ---");
            // console.log(data);
            // try{

            //     iotConnectSDK.getAllTwins();
            // } catch(e) {
            //     console.log(e)
            // }
            // setTimeout(() => {
            //     // getAttributest();
            //     console.log("hello get all twins");
            // }, 10000);
            try {
                if(data.command)
                {
                    isDeviceConnected = true;
                    getAttributest();
                    console.log("\nDeviceId ::: [" + data.uniqueId + "] :: Device Connected :: ", new Date());
                } else {
                    isDeviceConnected = false;
                    console.log("\nDeviceId ::: [" + data.uniqueId + "] :: Device Disconnected :: ", new Date());
                }
            } catch (error) {
                console.log("Error while getting attributes :: ",error.message);
            }
        }
    }
}

var twinUpdateCallback = function twinUpdateCallback(data){
    console.log("\n"+"--- Twin desired message received ---");
    console.log(data);
    if(data.desired) {
        async.forEachSeries(Object.keys(data.desired) , function (key, callbackatt) {
            if(key == "$version"){
                callbackatt();
            } else {
                var value = data.desired[key];
                iotConnectSDK.updateTwin(key, value)
                callbackatt();
            }
        }, function () { })
    }
}

var setReadline = function setReadline (attr, type, callback){
    if(type == 1)
        var space = "  ";
    else
        var space = "";
    rl.question(space+'Enter '+attr+' : ', function (value) {
        var obj = {};
        obj[attr] = value;
        callback(obj);
    });
} 

var callAgain = function callAgain (){
    rl.question('\nWould you like to send data again ? (Y/N) : ', function (status) {
        if(status == "Y" || status == "y")
        {
            try {
                getAttributest();
            } catch (error) {
                console.log("Error while getting attributes :: ",error.message);
            }
        }
        else
            process.exit();
    });
}

var SendData = function SendData(sensordata){
    var sendTeledataData = [];
    var cnt = 0;
    var text = "";
    var tagArray = [];
    if(sensordata.length > 0) {
        async.forEachSeries(sensordata, function(inputdata, data_cb) {
            if(cnt == 0 && inputdata.device.tg) {
                console.log("Note :: It includes the single device from each tag.");
                text = "(Gateway Device) ";
            } else {
                text = "";
            }
            if(inputdata['attributes'].length > 0)
            {
                cnt++;
                if (tagArray.indexOf(inputdata.device.tg) == -1) {
                    // tagArray.push(inputdata.device.tg);
                    if(inputdata.device.tg)
                        console.log("\n## TAG :: "+inputdata.device.tg+" [Device "+text+":: "+inputdata.device.id+"]");
                    else
                        console.log("\n## Device "+text+":: "+inputdata.device.id);
                    var sendordataObj = {
                        "uniqueId": inputdata.device.id,
                        "time" : new Date(),
                        "data": {}
                    }
                    async.forEachSeries(inputdata.attributes, function(attr, attrdata_cb) {
                        if(attr.d)
                        {
                            console.log("Enter "+attr.ln+" : ");
                            sendordataObj.data[attr.ln] = {};
                            async.forEachSeries(attr.d, function(attrChild, attrdataChild_cb) {
                                setReadline(attr.ln+'.'+attrChild.ln, 1, function(resultdata){
                                    sendordataObj.data[attr.ln][attrChild.ln] = resultdata[attr.ln+'.'+attrChild.ln];
                                    attrdataChild_cb()
                                });
                            },function(){
                                attrdata_cb()    
                            });
                        }
                        else
                        {
                            setReadline(attr.ln, 0, function(resultdata){
                                sendordataObj.data[attr.ln] = resultdata[attr.ln];
                                attrdata_cb();
                            });
                        }
                    },function(){
                        sendTeledataData.push(sendordataObj);
                        data_cb();
                    }); 
                } else {
                    data_cb();
                }
            }
        },function(){
            var data = sendTeledataData;
            iotConnectSDK.sendData(data);
            setTimeout(function() {
                callAgain();
            }, 500);
        });
    } else {
        console.log("No Attribute data found.");
    }
}

function disconnectDevice(){
    if(isDeviceConnected) {
        iotConnectSDK.disconnect();
    } else {
        console.log("Device is already disconnected");
    }
}


// Callback function for the connection status
var connectionStatusChanged = function connectionStatusChanged(data){
    // console.log("connection status => ", data);    
    if(data.cmdType == '0x16') {
        console.log("\n"+"--- Device connection status ---");
        console.log(data);
        try {
            if(data.command)
            {
                isDeviceConnected = true;
                setTimeout(() => {
                    // getAttributest();
                    iotConnectSDK.getAllTwins();
                }, 10000);
                console.log("\nDeviceId ::: [" + data.uniqueId + "] :: Device Connected :: ", new Date());
            } else {
                isDeviceConnected = false;
                console.log("\nDeviceId ::: [" + data.uniqueId + "] :: Device Disconnected :: ", new Date());
            }
        } catch (error) {
            console.log("Error while getting attributes :: ",error.message);
        }
    } else {
        console.log("\nDeviceId ::: [" + data.uniqueId + "] :: Wrong command :: ", new Date());
    }
}

// Callback function for the Attribute updated
var attributeUpdated = function attributeUpdated(data){
    // console.log("--- Attribute information updated ---", data);
    if(data)
        getAttributest();
}

// Callback function for the device updated
var deviceUpdated = function deviceUpdated(data){
    console.log("Device Updated => ", data);
}

// Callback function to receive OTA command
var receiveOTA = function receiveOTA(data){
    // console.log("Receive OTA => ", data);
    if(data.cmdType == '0x02') {
        console.log("\n"+"--- OTA Command Received ---");
        console.log(data);
        if(data.urls) {
            async.forEachSeries(data.urls, function (cmddetail, cbota) {
                if("uniqueId" in cmddetail) {
                    var childId = cmddetail.uniqueId;
                } else {
                    var childId = null;
                }
                var obj = {
                    "ackId": data.ackId,
                    "st": 7,
                    "msg": "",
                    "childId": childId
                }
                var msgType = 11;
                if(data.ackId != null)
                {
                    /*
                    Type    : Public Method "sendAck()"
                    Usage   : Send firmware command received acknowledgement to cloud
                    - status Type
                        st = 7; // firmware
                    - Message Type
                        msgType = 11; // for "0x02" Firmware command
                    */
                    iotConnectSDK.sendAck(obj, msgType)
                }
                cbota();
            }, function () { });
        }
    }
}

// Callback function to receive the module information
var moduleRecieved = function moduleRecieved(data){
	console.log("module received => ", data);
}

// Callback function to request for the secret configurations
// var requestForSecet = function requestForSecet(key, callback){
// 	switch (key) {
// 		case "DPSCS": //DPS connection string
// 			callback(true, dpsConnectionString)
// 		break;

// 		case "EKEY": //Endorcement key
// 			try {
// 				callback(true, endorcementKey);
// 			} catch (error) {
// 				callback(false, null);
// 				console.log("error => ", error);
// 			}
// 		break;

// 		case "IOTHUB": //IoTHub host name
// 			return "<iothub host name>"
// 		break;

// 		default:
// 			break;
// 	}
// }

var initCallbacks = function initCallbacks(){
    // console.log("iotConnectSDK => ", iotConnectSDK);
    iotConnectSDK.setConnectionStatusChangedCallback(connectionStatusChanged)
    iotConnectSDK.setTwinChangedCallback(twinUpdateCallback)
    iotConnectSDK.setDeviceCommandCallback(deviceCallback)
    iotConnectSDK.setOTAReceivedCallback(receiveOTA)
    iotConnectSDK.setAttributeChangedCallback(attributeUpdated)
    iotConnectSDK.setDeviceChangedCallback(deviceUpdated)
    iotConnectSDK.setModuleRecievedCallback(moduleRecieved)
	// iotConnectSDK.getSecrets(requestForSecet)
}

// setTimeout(() => {
//     disconnectDevice();
// }, 30000);