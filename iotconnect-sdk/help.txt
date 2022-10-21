﻿# Softweb Solutions Inc
## IOT Connect SDK : Software Development Kit 1.0 Mesage type 2.1

**Prerequisite tools:**

1. NodeJs : Node.js supported version v8.x and above
2. Npm : NPM is compatible with the node version

**Installation :** 

1. Extract the "iotconnect-sdk-node-v1.0.zip"

2. To install the required libraries use the below command:
	- Goto SDK directory path using terminal/Command prompt
	- cd iotconnect-sdk-node-v1.0
	- npm install (Install prerequisite nodejs library)
	- npm install iotconnect-sdk (Install the 'iotconnect-sdk' package in nodejs library)

3. Using terminal/command prompt goto sample folder
	- cd sample 

4. You can take the firmware file from the above location and update the following details
	- Prerequisite input data as explained in the usage section as below
	- Update sensor attributes according to added in iotconnect cloud platform
	- If your device is secure then need to configure the x.509 certificate path as like sdkOptions given below otherwise leave as it is.

5. Ready to go:
	- node firmware.js (This script send the data on the cloud as per configured device detail)
	- node example.js *<<env>>* (Command line experience to test the sdk)
	
**Usage :**

- To initialize the SDK object need to import below sdk package
var SDKClient = require('iotconnect-sdk');

- Prerequisite standard input data 
- Prerequisite standard configuration data 
```
UniqueId = "<<Device UniqueID>>"
SId = "<<Your SID>>"

- SdkOptions is for the SDK configuration and need to parse in SDK object initialize call. You need to manage the below onfiguration as per your device authentications.
var sdkOptions = {
    "certificate" : { //For SSL CA signed and SelfSigned authorized device only
        "SSLKeyPath"	: "<< SystemPath >>/device.key",
		"SSLCertPath"   : "<< SystemPath >>/device.pem",
		"SSLCaPath"     : "<< SystemPath >>/rootCA.pem"
	},
    "offlineStorage": { 
		"disabled": false, //default value = false, false = store data, true = not store data 
		"availSpaceInMb": 1, //size in MB, Default value = unlimted
		"fileCount": 5 // Default value = 1
	},
    "discoveryUrl" : "https://discovery.iotconnect.io" // Mandatory parameter to get device details
}
Note: sdkOptions is a mandatory parameter for sdk object initialize call. 
	"certificate" : It indicated to define the path of the certificate file. Mandatory for X.509 device CA signed and self-signed authentication type only.
		- SSLKeyPath: your device key
        - SSLCertPath: your device certificate
        - SSLCaPath : Root CA certificate
	"offlineStorage" : Define the configuration related to the offline data storage 
		- disabled : false = offline data storing, true = not storing offline data 
		- availSpaceInMb : Define the file size of offline data which should be in (MB)
		- fileCount : Number of files need to create for offline data
    "discoveryUrl" : (*) Discovery URL is mandatory parameter to get device details

- To Initialize the SDK object and connect to the cloud
var iotConnectSDK = new SDKClient(cpid, uniqueId, deviceCallback, twinUpdateCallback, sdkOptions, env);

- Note : sdkOptions is an optional parameter

- To receive the command from Cloud to Device(C2D)	
var deviceCallback = function deviceCallback(data){
	console.log(data);
	if(data.cmdType == "0x01")
		// Device Command
	if(data.cmdType == "0x02")
		// Firmware Command
}

- To receive the twin from Cloud to Device(C2D)
var twinUpdateCallback = function twinUpdateCallback(data){
    console.log(data);
}

- To get the list of attributes
iotConnectSDK.getAttributes(function(response){
	console.log("Attributed :: "+ response);
});

- This is the standard data input format for Gateway and non Gateway device.
1. For Non Gateway Device 
var data = [{
    "uniqueId": "<< Device UniqueId >>",
    "time" : "<< date >>", //Date format should be as defined
    "data": {} // example : {"temperature": 15.55, "gyroscope" : { 'x' : -1.2 }}
}];

2. For Gateway and multiple child device 
var data = [{
	"uniqueId": "<< Gateway Device UniqueId >>", // It should be first element
	"time": "<< date >>", // "2019-12-24T10:06:17.857Z" Date format should be as defined
	"data": {} // example : {"temperature": 15.55, "gyroscope" : { 'x' : -1.2 }}
},
{
	"uniqueId":"<< Child DeviceId >>", //Child device
	"time": "<< date >>", // "2019-12-24T10:06:17.857Z" Date format should be as defined
	"data": {} // example : {"temperature": 15.55, "gyroscope" : { 'x' : -1.2 }}
}]

- To send the data from Device To Cloud(D2C)
iotConnectSDK.sendData(data);

- To send the command acknowledgment
var obj = {
	"ackId": data.ackId,
	"st": Acknowledgment status sent to cloud
	"msg": "", it is used to send your custom message
	"childId": "" it is use for gateway's child device OTA update
}
- ackId(*) : Command ack guid which is receive from command payload
- st(*) : Acknowledgment status sent to cloud (4 = Fail, 6 = Device command[0x01], 7 = Firmware OTA command[0x02])
- msg : Message 
- childId : 
	0x01 : null or "" for Device command  
	0x02 : null or "" for Gateway device and mandatory for Gateway child device's OTA udoate.
		   How to get the "childId" .?
		   - You will get child uniqueId for child device OTA command from payload "data.urls[~].uniqueId"
Note : (*) indicates the mandatory element of the object.

- Message Type
var msgType = 5; // for "0x01" device command 
var msgType = 11; // for "0x02" Firmware OTA command 

iotConnectSDK.sendAck(obj, msgType)

- To update the Twin Property
var key = "<< Desired property key >>"; // Desired proeprty key received from Twin callback message
var value = "<< Desired Property value >>"; // Value of respective desired property
Example : 
var key = "firmware_version";
var value = "4.0";
iotConnectSDK.updateTwin(key,value)

- To disconnect the device from the cloud
iotConnectSDK.dispose()

- To get the all twin property Desired and Reported
iotConnectSDK.getAllTwins();

## Release Note :

** New Feature **
1. Offline data storage functionality with specific settings
2. Edge enable device support Gateway device too
3. Device and OTA command acknowledgment
4. It allows to disconnecting the device client 
5. Introduce new methods:
	sendAck() : to send the command acknowledgement to cloud
	dispose() : to disconnect the device
	getAllTwins : To receive all the twin properties
6. Support hard stop command from cloud
7. Support OTA command with Gateway and child device
8. It allows sending the OTA command acknowledgment for Gateway and child device

** Improvements **
1. We have updated below methods name:
   To Initialize the SDK object:
	- new SDKClient(uniqueId, sId, sdkOptions, function(response)