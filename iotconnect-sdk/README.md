﻿# Softweb Solutions Inc

## IOT Connect SDK : Software Development Kit 1.0

**Prerequisite tools:**

1. NodeJs : Node.js supported version v8.x and above
2. Npm : NPM compatible with the node version

**Installation :**

1. Clone this repository
2. Navigate to this directory using terminal or command prompt
3. To install the required libraries use the below command:

   ```
   cd iotc-node-sdk
   npm install
   ```
4. Open firmware.js or example.js file from folder named sample and update the following details

   - Prerequisite input data as explained in the usage section as below
   - Update sensor attributes according to added in iotconnect cloud platform
   - If your device is secure then need to configure the x.509 certificate path as like sdkOptions given below otherwise leave as it is.
5. Using terminal/command prompt goto sample folder

   ```cmd
   cd sample
   ```
6. Ready to go:

   ```cmd
   node firmware.js // This script send the data on the cloud as per configured device detail
   node example.js <<env>> // Command line experience to test the sdk
   ```

**Usage :**

- To initialize the SDK object need to import below sdk package

```node
var SDKClient = require('iotconnect-sdk');
```

- Prerequisite standard input data

```node
//"Get your ENV and CPID from the portal key vaults module or visit https://help.iotconnect.io SDK section."
var uniqueId = "<<Your UniqueID>>"; 
var sId ="<<Your SID>>";
var cpId ="<<Your cpId>>";
var env ="<<Your Environment>>";
var pf ="<<Your Platform>>";
```

- SdkOptions is for the SDK configuration and need to parse in SDK object initialize call. You need to manage the below onfiguration as per your device authentications.

```json
{
    "certificate" : {
        "SSLKeyPath"	: "<< SystemPath >>/device.key",
        "SSLCertPath"   : "<< SystemPath >>/device.pem",
        "SSLCaPath"     : "<< SystemPath >>/rootCA.pem" 
    },
    "offlineStorage": { 
        "disabled": false,
        "availSpaceInMb": 1,
        "fileCount": 5
    },
    "discoveryUrl" : "",
    "debug" : false,
    "skipValidation": false,
    "cpId" : "",
    "env" : "",
    "pf": ""
}
```

Note: sdkOptions is a mandatory parameter for sdk object initialize call.

**certificate :**
It indicated to define the path of the certificate file. Mandatory for X.509 device CA signed and self-signed authentication type only.
- SSLKeyPath: your device key
- SSLCertPath: your device certificate
- SSLCaPath : Root CA certificate
- Windows + Linux OS: Use “/” forward slash (Example: Windows: “E:/folder1/folder2/certificate”,
Linux: “/home/folder1/folder2/certificate)

**offlineStorage :** Define the configuration related to the offline data storage
- disabled : false = offline data storing, true = not storing offline data
- availSpaceInMb : Define the file size of offline data which should be in (MB)
- fileCount : Number of files need to create for offline data

**discoveryURL (*):** Discovery URL is mandatory parameter to get device details.

**debug :** Private setting, false(default) = Don't show log, true = Show log

**skipValidation :** false(default) = Do validation, true = skip validation

- To Initialize the SDK object and connect to the cloud

```js
let iotConnectSDK = new SDKClient(uniqueId, sId, sdkOptions, function(response){
	if(response.status){
		iotConnectSDK.connect(successCallback, failedCallback, connectionStatusCallback)
	} else {
		// Handle SDK initialization failed here
	}
});
// Set all callbacks after IoTConnectSDK had initialized
initCallbacks();

```

- To receive the command from Cloud to Device(C2D)

```js
var deviceCallback = function deviceCallback(data){ 
    if(data && data.ct == 0 && data.ack) {
        // Send Acknowledgement
        var ackGuid = data.ack;
        var status = 7; // Failed = 4, Executed = 5, Success = 7
        var msg = "Success";
        var childId = data.id ? data.id : null;
        iotConnectSDK.sendAckCmd(ackGuid, status, msg, childId);
    } else {
        // Don't Send Acknowledgement  
    }
}
```

- To receive the OTA command from Cloud to Device(C2D)

```js
// Callback function to receive OTA command
var receiveOTA = function receiveOTA(data){
    if(data && data.ct == 1 && data.ack) {
		// Send Acknowledgement
        var ackGuid = data.ack;
        var status = 0;
        var msg = "Success";
        childGlobal.forEach(c => {
            iotConnectSDK.sendAckOTA(ackGuid, status, msg, c);
        })
    } else {
		// Don't Send Acknowledgement
    }
}
```

- To receive the twin from Cloud to Device(C2D)

```js
var twinUpdateCallback = function twinUpdateCallback(data){
	if(data.desired) {
		//call updateTwin for every attribute that needs to be updated in cloud.
		iotConnectSDK.updateTwin(<<propertyName>>, <<updatedValue>>,(response)=>{
			// Handle success or failure of update twin
		})
    }
}
```

- To update the Twin Property Device to Cloud(D2C)

```js
var key = "<< Desired property key >>"; // Desired proeprty key received from Twin callback message
var value = "<< Desired Property value >>"; // Value of respective desired property
iotConnectSDK.updateTwin(key,value)
```

- To request the list of attributes with the respective device type

```js
iotConnectSDK.getAttributes(function(response){
	console.log("Attributed :: "+ response);
});
```

- This is the standard data input format for Gateway and non Gateway device.

1. For Non Gateway Device

```js
var data = [{
    "uniqueId": "<< Device UniqueId >>",
    "time" : "<< date >>", // "2019-12-24T10:06:17.857Z" Date format should be as defined
    "data": {} // example : {"temperature": 15.55, "gyroscope" : { 'x' : -1.2 }}
}];
```

2. For Gateway and multiple child device

```js
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
```

- To send the data from Device To Cloud(D2C)

```node
iotConnectSDK.sendData(data);
```

- To disconnect the device from the cloud

```node
iotConnectSDK.dispose()
```

- To get the all twin property Desired and Reported

```node
iotConnectSDK.getAllTwins();
```
