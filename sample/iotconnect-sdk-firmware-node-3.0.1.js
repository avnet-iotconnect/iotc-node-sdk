'use strict';
/**
  ******************************************************************************
  * @file   : firmware.js 
  * @author : Softweb Solutions An Avnet Company
  * @modify : 20-July-2022
  * @brief  : Firmware part for NodeJS SDK v3.0.1
  			  Hope you have installed the node SDK v3.0.1 as guided on SDK documentation. 
  ******************************************************************************
*/

var SDKClient = require('iotconnect-sdk');
var async = require('async');

/*
## Prerequisite parameter to run this sample code
- cpId              :: It need to get from the IoTConnect platform "Settings->Key Vault". 
- uniqueId          :: Its device ID which register on IotConnect platform and also its status has Active and Acquired
- env               :: It need to get from the IoTConnect platform "Settings->Key Vault". 
- dataSendInterval  :: send data frequency in seconds
- disconnectDuration:: Device connection close after defined time in seconds to call dispose() method. Keep "0" if don't need disconnect the device.
- sdkOptions        :: It helps to define the path of self signed and CA signed certificate as well as define the offlinne storagr params
*/
var cpId = "<<CPID>>";
var uniqueId = "<<DeviceUniqueID>>";
var env = "<<Environment>>";
var dataSendInterval = 10; // send data frequency in seconds
var disconnectDuration = 0; //Seconds // Keep "0" If no need to disconnect
var isDeviceConnected = false;

/*
sdkOptions is optional. Mandatory for "certificate" X.509 device authentication type
"certificate" : It indicated to define the path of the certificate file. Mandatory for X.509/SSL device CA signed or self-signed authentication type only.
	- SSLKeyPath: your device key
	- SSLCertPath: your device certificate
	- SSLCaPath : Root CA certificate
"offlineStorage" : Define the configuration related to the offline data storage 
	- disabled : false = offline data storing, true = not storing offline data 
	- availSpaceInMb : Define the file size of offline data which should be in (MB)
	- fileCount : Number of files need to create for offline data
"devicePrimaryKey" : It is optional parameter. Mandatory for the Symmetric Key Authentication support only. It gets from the IoTConnect UI portal "Device -> Select device -> info(Tab) -> Connection Info -> Device Connection".
Note: sdkOptions is optional but mandatory for SSL/x509 device authentication type only. Define proper setting or leave it NULL. If you not provide the offline storage it will set the default settings as per defined above. It may harm your device by storing the large data. Once memory get full may chance to stop the execution.
*/      

var sdkOptions = {
    "certificate": { 
        "SSLKeyPath"	: "<< Certificate file path >>", //device.key
        "SSLCertPath"   : "<< Certificate file path >>", //device.pem
        "SSLCaPath"     : "<< Certificate file path >>" //rootCA.pem
    },
    "offlineStorage": {
        "disabled": false, //default value = false, false = store data, true = not store data 
		"availSpaceInMb": 1, //in MB Default value = unlimited
		"fileCount": 5 // Default value = 1
	},
    "isDebug":true,
	"devicePrimaryKey": "" // For Symmetric Key Auth type support
}

/*
Type    : Object Initialization "new SDKClient()"
Usage   : To Initialize SDK and Device connection
Input   : cpId, uniqueId, sdkOptions, env as explained above and deviceCallback and twinUpdateCallback is callback functions
Output  : Callback methods for device command and twin properties
*/
var iotConnectSDK = "";
setTimeout(() => {
    if(!isDeviceConnected) {
        iotConnectSDK = new SDKClient(cpId, uniqueId, deviceCallback, twinUpdateCallback, sdkOptions, env);
    } else {
        console.log("Device is already connected");
    }
}, 1000);

function checkInternet(cb) {
    require('dns').lookup('google.com',function(err) {
        //console.log('err',err)
        if (err && err.code == "ENOTFOUND") {
            cb(false);
        } else {
            cb(true);
        }
    })
}

/*
Type    : Callback Function "deviceCallback()"
Usage   : Firmware will receive commands from cloud. You can manage your business logic as per received command.
Input   :  
Output  : Receive device command, firmware command and other device initialize error response
*/
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
            {
                /*
                Type    : Public Method "sendAck()"
                Usage   : Send device command received acknowledgment to cloud
                - status Type
                    st = 6; // Device command Ack status 
                    st = 4; // Failed Ack
                - Message Type
                    msgType = 5; // for "0x01" device command 
                */
               if(iotConnectSDK)
               {
                   iotConnectSDK.sendAck(obj, msgType)
               } else {
                   console.log("Connection object not found")
               }
            }
        } else if(data.cmdType == '0x02') {
            console.log("\n"+"--- Firmware OTA Command Received ---");
            console.log(data);
            async.forEachSeries(data.urls, function (cmdDetail, cbota) {
                if("uniqueId" in cmdDetail) {
                    var childId = cmdDetail.uniqueId;
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
                        st = 7; // firmware OTA command Ack status 
                        st = 4; // Failed Ack
                    - Message Type
                        msgType = 11; // for "0x02" Firmware command
                    */
                   if(iotConnectSDK)
                   {
                       iotConnectSDK.sendAck(obj, msgType)
                   } else {
                       console.log("Connection object not found")
                   }
                }
                cbota();
            }, function () { });
        }  else if(data.cmdType == '0x16') {
            console.log("\n"+"--- Device connection status ---");
            console.log(data);
            try {
                if(data.command)
                {
                    isDeviceConnected = true;
                    console.log("\nDeviceId ::: [" + data.uniqueId + "] :: Device Connected :: ", new Date());
                } else {
                    isDeviceConnected = false;
                    console.log("\nDeviceId ::: [" + data.uniqueId + "] :: Device Disconnected :: ", new Date());

                    setTimeout(() => {
                        if (!isDeviceConnected) {
                            checkInternet((isConnected)=>{
                                if(isConnected){
                                    iotConnectSDK.dispose();
                                    iotConnectSDK = new SDKClient(cpId, uniqueId, deviceCallback, twinUpdateCallback, sdkOptions, env);
                                }
                            })
                            
                        } else {
                            console.log("Device is already connected");
                        }
                    }, 10000);

                }
            } catch (error) {
                console.log("Error while getting attributes :: ",error.message);
            }
        }
    }
}

/*
Type    : Public Method "getAllTwins()"
Usage   : Send request to get all the twin properties Desired and Reported
Input   : 
Output  : 
*/
// iotConnectSDK.getAllTwins();


/*
Type    : Callback Function "twinUpdateCallback()"
Usage   : Manage twin properties as per business logic to update the twin reported property
Input   : 
Output  : Receive twin properties Desired and Reported
*/
var twinUpdateCallback = function twinUpdateCallback(data){
    if(data.desired) {
        async.forEachSeries(Object.keys(data.desired) , function (key, callbackAtt) {
            if(key == "$version"){
                callbackAtt();
            } else {
                var value = data.desired[key];
                if(iotConnectSDK)
                {
                    iotConnectSDK.updateTwin(key,value)
                } else {
                    console.log("Connection object not found")
                }
                callbackAtt();
            }
        }, function () { })
    }
}

/*
Type    : Public Method "updateTwin()"
Usage   : Update the twin reported property
Input   : "key" and "value" as below
Output  : 
// var key = "<< Desired property key >>"; // Desired property key received from Twin callback message
// var value = "<< Desired Property value >>"; // Value of respective desired property
// iotConnectSDK.updateTwin(key,value)



/*
Type    : Function "getRandomValue()"
Usage   : To generate the random value for simulated data
Input   : It will gives random number between min and max range.
Output  : Random number
*/
function getRandomValue(min,max){
    return Math.floor(Math.random()*(max-min+1)+min);
}


/*
Type    : Public data Method "sendData()"
Usage   : To publish the data on cloud D2C 
Input   : Predefined data object 
Output  : 
*/
setInterval(() => {
    // Non Gateway
     var data = [{
        "uniqueId":uniqueId,
         "time":new Date(),
         "data": {
            "humidity":"helloworld",
            "Temperature": getRandomValue(0,1),
             "gyro": {
             "x": getRandomValue(1,10),
             "y": getRandomValue(0,1),
             "z": "iotconnect"
                }
          } 
    }]
    
    // Gateway Device
    // var data = [{
    //    "uniqueId":uniqueId,
    //    "time":new Date(),
    //    "data": {
    //     "humidity":"helloworld",
    //     "Temperature": getRandomValue(0,1),
    //      "gyro": {
    //      "x": getRandomValue(0,10),
    //      "y": getRandomValue(0,50),
    //      "z": "iotconnect"
    //         }
    //   } 
    // },{
    //    "uniqueId":"<<ChildDeviceUniqueID>>",
    //    "time":new Date(),
    //    "data": {
    //     "humidity":"helloworld",
    //     "Temperature": getRandomValue(0,1),
    //      "gyro": {
    //      "x": getRandomValue(0,10),
    //      "y": getRandomValue(0,50),
    //      "z": "iotconnect"
    //         }
    //   } 
    // }]
    
    // Add your device attributes and respective value here as per standard format defined in sdk documentation
    // "time" : Datetime format should be as defined //"2021-01-24T10:06:17.857Z" 
    // "data" : JSON data type format // {"temperature": 15.55, "gyroscope" : { 'x' : -1.2 }}
    
    if(iotConnectSDK)
    {
        // Device to Cloud data publish
        iotConnectSDK.sendData(data)
    } else {
        console.log("Connection object not found")
    }
}, eval(dataSendInterval * 1000));


/*
Type    : Public Method "dispose()"
Usage   : Disconnect the device from cloud
Input   : 
Output  : 
Note : It will disconnect the device after defined time 
*/
if(disconnectDuration && disconnectDuration > 0) {
    setTimeout(() => {
        if(iotConnectSDK && isDeviceConnected == true)
        {
            iotConnectSDK.dispose()
            isDeviceConnected = false;
        } else {
            console.log("Connection object not found")
        }
    }, eval(disconnectDuration * 1000));
}


