'use strict';

/*
Hope you have installed the node SDK as guided on SDK documentation. 
*/

var SDKClient = require('iotconnect-sdk-tpm');

/*
## Prerequisite parameter to run this sampel code
- cpId              :: It need to get from the IoTConnect platform "Settings->Key Vault". 
- uniqueId          :: Its device ID which register on IotConnect platform and also its status has Active and Acquired
- scopeId           :: It need to get from the IoTConnect platform "Settings->Key Vault". 
- env               :: It need to get from the IoTConnect platform "Settings->Key Vault". 
- dataSendInterval  :: send data frequency in seconds
- disconnectDuration:: Device connection close after defined time in seconds to call dispose() method
- sdkOptions        :: It helps to define the path of self signed and CA signed certificate as well as define the offlinne storagr params
*/
var cpId = "<<Your CPID>>";
var uniqueId = "<<Your UniqueID>>";
var scopeId = "<Your ScopeID>>";
var env = "";  
var dataSendInterval = 10; // send data frequency in seconds
var disconnectDuration = 0; //Seconds If set 0 then it never disconnect
var isDeviceConnected = false;

/*
Note: sdkOptions is optional. Define setting or leave it blank. 
    "offlineStorage": It helps, store the data in log file which will be created beside the firmware sample file. So, make sure your root directory has proper permission to create the log files and folder. It will store offline data once device lost the network connection.
        - disabled : false = offline data storing, true = not storing offline data (Default = false)
        - availSpaceInMb : Define the file size of offline data which should be in (MB) (Default = unlimited)
        - fileCount : Number of file need to create for offline data (Default = 1)
    Note :  It will create 5 files of 2 MB. 
    - If you do not define the details then it may harm your device by storing the large data. Once memory get full may chance to your device code crash and stop the execution
*/    

var sdkOptions = {
    "offlineStorage": {
        "disabled": false, //default value = false, "false" = store data, "true" = not store data 
		"availSpaceInMb": 1, //in MB Default value = unlimted
		"fileCount": 5 // Default value = 1
    }
}
/* Note: sdkOptions is optional. Define setting or leave it blank. It will set the default setting for offline storage configuration as per defined above. It may harm your device by storing the large data. Once memory get full may chance to your device script crash and stop the execution */

/*
Type    : Object Initialization "new SDKClient()"
Usage   : To Initialize SDK and Device cinnection
Output  : Callback methods for command and twin properties
Input   : cpId, uniqueId, sdkOptions, env as explained above and deviceCallback and twinUpdateCallback is callback functions
*/
var iotConnectSDK = "";
setTimeout(() => {
    if(!isDeviceConnected) {
        iotConnectSDK = new SDKClient(cpId, uniqueId, scopeId, deviceCallback, twinUpdateCallback, sdkOptions, env);
    } else {
        console.log("Device is already connected");
    }
}, 1000);


/*
Type    : Callback Function "deviceCallback()"
Usage   : Firmware will receive commands from cloud. You can manage your business logic as per received command.
Output  : Receive device command, firmware command and other device initialize error response
Input   :  
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
                    st = 6; // Device command Ack status OR 
                    st = 4; // Failed Ack
                - Message Type
                    msgType = 5; // for "0x01" device command 
                */
               if(iotConnectSDK)
               {
                   iotConnectSDK.sendAck(obj, msgType)
               } else {
                   console.log("Connection object not founud")
               }
            }
        } else if(data.cmdType == '0x02') {
            console.log("\n"+"--- Firmware OTA Command Received ---");
            console.log(data);
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
                        st = 7; // firmware OTA command Ack status OR 
                        st = 4; // Failed Ack
                    - Message Type
                        msgType = 11; // for "0x02" Firmware command
                    */
                   if(iotConnectSDK)
                   {
                       iotConnectSDK.sendAck(obj, msgType)
                   } else {
                       console.log("Connection object not founud")
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
                }
            } catch (error) {
                console.log("Error while getting attributes :: ",error.message);
            }
        }
    }
}

/*
Type    : Public Method "getAllTwins()"
Usage   : To get all the twin properies Desired and Reported
Output  : All twin property will receive in above callback function "twinUpdateCallback()"
*/
// iotConnectSDK.getAllTwins();


/*
Type    : Callback Function "twinUpdateCallback()"
Usage   : Manage twin properties as per business logic to update the twin reported property
Output  : Receive twin properties Desired, Reported
Input   : 
*/
var twinUpdateCallback = function twinUpdateCallback(data){
    console.log("\n--- Twin desired message received ---");
    console.log(data);
    if(data.desired) {
        async.forEachSeries(Object.keys(data.desired) , function (key, callbackatt) {
            if(key == "$version"){
                callbackatt();
            } else {
                var value = data.desired[key];
                if(iotConnectSDK)
                {
                    iotConnectSDK.updateTwin(key,value)
                } else {
                    console.log("Connection object not founud")
                }
                callbackatt();
            }
        }, function () { })
    }
}

/*
Type    : Public Method "updateTwin()"
Usage   : Upate the twin reported property
Output  : 
Input   : "key" and "value" as below
          // var key = "<< Desired property key >>"; // Desired proeprty key received from Twin callback message
          // var value = "<< Desired Property value >>"; // Value of respective desired property
*/
//iotConnectSDK.updateTwin(key,value)


/*
Type    : Public Method "sendData()"
Usage   : To publish the D2C data 
Output  : 
Input   : Predefined data object 
*/
setInterval(() => {
    // Non Gateway
    var data = [{
        "uniqueId":uniqueId,
        "time":new Date(),
        "data": {} // Add your device attributes and respective value here as per standard format defined in sdk documentation
    }]

    // Gateway Device
    // var data = [{
    //     "uniqueId":uniqueId,
    //     "time":new Date(),
    //     "data": {} // Add your device attributes and respective value here as per standard format defined in sdk documentation
    // },{
    //     "uniqueId":uniqueId,
    //     "time":new Date(),
    //     "data": {} // Add your device attributes and respective value here as per standard format defined in sdk documentation
    // },]

    if(iotConnectSDK)
    {
        // Device to Cloud data publish
        iotConnectSDK.sendData(data)
    } else {
        console.log("Connection object not founud")
    }
}, eval(dataSendInterval * 1000));


/*
Type    : Public Method "dispose()"
Usage   : Disconnect the device from cloud
Output  : 
Input   : 
Note : It will disconnect the device after defined time 
*/
if(disconnectDuration && disconnectDuration > 0) {
    setTimeout(() => {
        if(iotConnectSDK && isDeviceConnected == true)
        {
            iotConnectSDK.dispose()
            isDeviceConnected = false;
        } else {
            console.log("Connection object not founud")
        }
    }, eval(disconnectDuration * 1000));
}

function getRandomValue(min, max) {
    return (Math.random() * (max - min) + min).toFixed(0);
}