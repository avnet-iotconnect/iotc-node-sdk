'use strict';

/*
Hope you have installed the node SDK as guided on SDK documentation. 
*/
var SDKClient = require('iotconnect-sdk');
var async = require('async');

/*
## Prerequisite parameter to run this sampel code
- cpId              :: It need to get from the IoTConnect platform "Settings->Key Vault". 
- uniqueId          :: Its device ID which register on IotConnect platform and also its status has Active and Acquired
- env               :: It need to get from the IoTConnect platform "Settings->Key Vault". 
- dataSendInterval  :: send data frequency in seconds
- disconnectDuration:: Device connection close after defined time in seconds to call dispose() method. Keep "0" if don't need disconnect the device.
- sdkOptions        :: It helps to define the path of self signed and CA signed certificate as well as define the offlinne storagr params
*/

var uniqueId = "<<Your UniqueID>>"; 
var sId ="<<Your SID>>";

var dataSendInterval = 60; // send data frequency in seconds
var disconnectDuration = 0; //Seconds // Keep "0" If no need to disconnect
var isDeviceConnected = false;

/*
Note: sdkOptions is optional. Mandatory for "certificate" X.509 device authentication type and discoveryUrl. 
    "certificate": //For SSL CA signed and SelfSigned authorized device only otherwise skip this property
        - SSLKeyPath: your device key
        - SSLCertPath: your device certificate
        - SSLCaPath : Root CA certificate
    "offlineStorage": It helps, store the data in log file which will be created beside the firmware sample file. So, make sure your root directory has proper permission to create the log files and folder. It will store offline data once device lost the network connection.
        - disabled : false = offline data storing, true = not storing offline data (Default = false)
        - availSpaceInMb : Define the file size of offline data which should be in (MB) (Default = unlimited)
        - fileCount : Number of file need to create for offline data (Default = 1)

    Note :  It will create 5 files of 2 MB. 
          Define setting or leave it blank. It will set the default setting for offline storage configuration as per defined below. It may harm your device by storing the large data. Once memory get full may chance to your device script crash and stop the execution.
*/      

var sdkOptions = {
    "certificate" : { 
        "SSLCertPath" : "<<Your certificate Path>>",  //"<<path>>/device.pem",
		"SSLKeyPath"  : "<<Your certificate Path>>",  //"<<path>>/device.key",  
		"SSLCaPath"   : "<<Your certificate Path>>"  //"<<path>>/ms.pem"
	},
    "offlineStorage": {
        "disabled": false, //default value = false, false = store data, true = not store data 
		"availSpaceInMb": 1, //in MB Default value = unlimited
		"fileCount": 5 // Default value = 1
    },
    "debug" : true, // Private setting, false(default) = Don't show log, true = Show log
    "discoveryURL": "https://discovery.iotconnect.io", // Private setting, Default = "https://discovery.iotconnect.io" 
    // "devicePK": "cGFyYXNwYXJhc3BhcmFzcGFyYXNwYXJhc3BhcmFzcGFyYQ==", // For Symmetric Key Auth type support
    "skipValidation": false, // false(default) = Do validation, true = skip validation 
    "keepalive": "", // Integer value only
    "dpsInfo": { // For TPM device only
        "scopeId": "",
        "globalEndpoint": ""
    } 
}
var isDeviceConnected = false;

/*
Type    : Object Initialization "new SDKClient()"
Usage   : To Initialize SDK and Device cinnection
Output  : Callback methods for command and twin properties
Input   : cpId, uniqueId, sdkOptions, env as explained above and deviceCallback and twinUpdateCallback is callback functions
*/
var iotConnectSDK = "";
setTimeout(() => {
    debugger;
    if(!isDeviceConnected) {
        async.series([
            function(cb1) {    
                iotConnectSDK = new SDKClient(uniqueId, sId, sdkOptions, function(response){
                    cb1(null, 'one');
                    if(response.status){
                        iotConnectSDK.connect(successCallback, failedCallback, connectionStatusCallback)
                    } else {
                        console.log("DeviceId ::: [" + uniqueId + "] :: SDK initialization failed :: ", new Date());            
                    }
                });
            },
            function(cb2) {
                initCallbacks();
                cb2(null, 'two');
            }
        ], () => {

        });
    } else {
        console.log("Device is already connected");
    }
}, 1000);


// success callback
var successCallback = function successCallback(responseMessage){
    isDeviceConnected = true;
    console.log("\nDeviceId ::: [" + uniqueId + "] :: Connection success :: "+responseMessage+" :: ", new Date());
}

// Failed callback
var failedCallback = function failedCallback(responseMessage){
    isDeviceConnected = false;
    console.log("\nDeviceId ::: [" + uniqueId + "] :: Connection failed :: "+responseMessage+" :: ", new Date());
}

// Callback function for the connection status
var connectionStatusCallback = (response) => {
    if(response.command) {
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
}

/*
Type    : Callback Function "deviceCallback()"
Usage   : Firmware will receive commands from cloud. You can manage your business logic as per received command.
Output  : Receive device command, firmware command and other device initialize error response
Input   :  
*/
var deviceCallback = function deviceCallback(data){
    console.log("deviceCallback -> data", data)
        
    if(data)
    {
        if(data.ct == 0) {
            // console.log("\n"+"--- Device Command Received ---");
            var obj = {
                "ack": data.ack,
                "type": 0,
                "msg": "Success",
                "cid": data.id ? data.id : null
            }
            if(data.ack != null)
                var bool = 1; // 0
            iotConnectSDK.sendAckCmd(bool, obj)
        }
    }
}

/*
Type    : Public Method "getAllTwins()"
Usage   : To get all the twin properies Desired and Reported
Output  : All twin property will receive in above callback function "twinUpdateCallback()"
*/
// setTimeout(() => {
//     iotConnectSDK.getTwins(function (response) {
//         console.log("get Twins ==> response ", );
//     });
// }, 15000);


/*
Type    : Callback Function "twinUpdateCallback()"
Usage   : Manage twin properties as per business logic to update the twin reported property
Output  : Receive twin properties Desired, Reported
Input   : 
*/
var twinUpdateCallback = function twinUpdateCallback(data){
    // console.log("\n--- Twin desired message received ---");
    // console.log(data);
    if(data.desired) {
        async.forEachSeries(Object.keys(data.desired) , function (key, callbackatt) {
            if(key == "$version"){
                callbackatt();
            } else {
                var value = data.desired[key];
                if(iotConnectSDK)
                {
                    iotConnectSDK.updateTwin(key,value,(obj)=>{
                            console.log(obj);
                    })
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

// Callback function for the connection status
var connectionStatusChanged = function connectionStatusChanged(data){
    // console.log("connection status => ", data);    
    if(data.ct == 3) {
        console.log("\n"+"--- Device connection status --- ", data.command);
        // console.log(data);
        try {
            if(data.command)
            {
                isDeviceConnected = true;
                setTimeout(() => {
                    getAttributes();
                    getDevices();
                    // iotConnectSDK.getAllTwins();
                    // createChildDevice();
                    // deleteChildDevice();
                }, 10000);
                // console.log("\nDeviceId ::: [" + data.uniqueId + "] :: Device Connected :: ", new Date());
            } else {
                isDeviceConnected = false;
                // console.log("\nDeviceId ::: [" + data.uniqueId + "] :: Device Disconnected :: ", new Date());
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
    // console.log("--- Attribute information updated ---", JSON.stringify(data) );
    if(data)
        getAttributes();
}

var childGlobal = [];
var getAttributes = function getAttributes(){
    console.log('getAttributes')
    iotConnectSDK.getAttributes(function(response){
        try {
            if(response.data && response.data instanceof Array && response.data.length){
                childGlobal = response.data.map(e => e.device.id);
            }
            setInterval(() => {
                // Non Gateway
                var data = [{
                   "uniqueId":uniqueId,
                   "time":new Date(),
                   "data": {
                       //"temperature": getRandomValue(1, 50), "latlong1":"["+getRandomValue(-90, 90)+","+getRandomValue(-180, 180)+"]"} // Add your device attributes and respective value here as per standard format defined in sdk documentation
                       
                        "temperature":10,
                        // "long1":31,
                        // "integer1":55,
                        // "decimal1":0.555,
                        
                        // "time1":"11:55:22",
                        // "bit1":2,
                        
                        // "string1":"red",
                        
                        // "gyro": {
                        //     'bit1':0.1,
                                                       
                        //     "decimal1":2.555,
                        //     "integer1":884,
                        //     "latlong1":78945,
                        //     "long1":999,
                        //     "string1":"green",
                        //     "time1":"11:44:22",
                        //     "temperature":200
                        //     }
                        }
                }]
            
                // Gateway Device
                // var data = [{
                //     "uniqueId":uniqueId,
                //     "time":new Date(),
                //     "data": {"bit1":1,"Temperature": getRandomValue(1, 50),"gyro":{"x":getRandomValue(1, 50),"y":getRandomValue(1, 50),"z":getRandomValue(1, 50)}} // Add your device attributes and respective value here as per standard format defined in sdk documentation
                // },{
                //     "uniqueId":"v21tg201c1", //v21tg201c1 , parasewv21c
                //     "time":new Date(),
                //     "data": {"bit1":1,"Temperature": getRandomValue(1, 50)} // Add your device attributes and respective value here as per standard format defined in sdk documentation
                // }]
                // ,{
                //     "uniqueId":"parasewv21c1",
                //     "time":new Date(),
                //     "data": {"Temperature": getRandomValue(1, 50)} // Add your device attributes and respective value here as per standard format defined in sdk documentation
                // }]



            
                if(iotConnectSDK)
                {
                    console.log('Sensor Data Received ===>>>', JSON.stringify(data,null,2))
                    // Device to Cloud data publish
                    iotConnectSDK.sendData(data)
                } else {
                    console.log("Connection object not founud")
                }
            }, eval(dataSendInterval * 1000));
        } catch (error) {
            console.log("Error while getting attributes :: ",error);            
        }
    })
}

console.log("🚀 Nodejs Message format 2.1 SDK")

var getDevices = function getDevices(){
    iotConnectSDK.getDevices(function(response){
        try {
            console.log("response.data Devices ", JSON.stringify(response));
            // SendData(response.data);
        } catch (error) {
            console.log("Error while getting attributes :: ",error);            
        }
    })
}

// Callback function for the device updated
var deviceUpdated = function deviceUpdated(data){
    console.log("Device Updated => ", data);
}

// Callback function to receive OTA command
var receiveOTA = function receiveOTA(data){
    // console.log("Receive OTA => ", JSON.stringify(data));
    if(data && data.ct == 1) {
        var obj = {
            "ack": data.ack,
            "type": data.ct,
            // "st": 7,
            "msg": "Success",
            "cid": "" // For gatewat device only for child device
        }
        // var msgType = 6;
        if(data.ack != null)
        {
            var bool = 2; 
            iotConnectSDK.sendAckOTA(bool, obj)
        }
    } else {
        console.log("Wrong command ")
    }
}

// Callback function to receive the module information
var moduleReceived = function moduleReceived(data){
    console.log("module received => ", data);
    if(data && data.ct == 1) {
        var obj = {
            "ack": data.ack,
            "type": data.ct,
            "msg": "Success",
            "cid": "" // For gatewat device only for child device
        }
        // var msgType = 6;
        if(data.ack != null)
        {
            var bool = 1; 
            iotConnectSDK.sendAckModule(bool, obj)
        }
    } else {
        console.log("Wrong command ")
    }
}

var initCallbacks = function initCallbacks(){
    if(iotConnectSDK){
        iotConnectSDK.setConnectionStatusChangedCallback(connectionStatusChanged);
        iotConnectSDK.setTwinChangedCallback(twinUpdateCallback);
        iotConnectSDK.setDeviceCommandCallback(deviceCallback);
        iotConnectSDK.setOTAReceivedCallback(receiveOTA);
        // iotConnectSDK.setAttributeChangedCallback(attributeUpdated);
        iotConnectSDK.setDeviceChangedCallback(deviceUpdated);
        iotConnectSDK.setModuleReceivedCallback(moduleReceived);
    }
    // For 2.1
    // iotConnectSDK.getCreateChildDeviceCallback(createDeviceCallback);
    // iotConnectSDK.getDeleteChildDeviceCallback(deleteDeviceCallback);
}

// New Methods 
var createChildDevice = function createChildDevice(){
    var deviceId = "ac001";
    var deviceTag = "child12";
    var displayName = "AC badroom";
    iotConnectSDK.createChildDevice(deviceId, deviceTag, displayName,  function(response){
        try {
            console.log("Create child device request :: ", response);            
        } catch (error) {
            console.log("Error while create child device :: ",error.message);            
        }
    })
}

var deleteChildDevice = function deleteChildDevice(){
    var deviceId = "ac00111";
    iotConnectSDK.deleteChildDevice(deviceId, function(response){
        try {
            console.log("Delete child device request :: ", response);            
        } catch (error) {
            console.log("Error while delete child device :: ",error.message);            
        }
    })
}

/*
Type    : Function "getRandomValue()"
Usage   : To generate the random value for simulated data
Input   : It will gives random number between min and max range.
Output  : Random number
x`*/
function getRandomValue(min, max) {
    return (Math.random() * (max - min) + min).toFixed(0);
}