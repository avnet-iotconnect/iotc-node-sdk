﻿
# IOTConnect SDK: iotconnect-sdk-node-standard

This is an Nodejs SDK library to connect the device with IoTConnect cloud by MQTT protocol. This library only abstract JSON responses from both end D2C and C2D. This SDK supports SAS key based authentication, CA signed and Self signed certificate authentication to communicate with cloud.

## Features:

* The SDK supports to send telemetry data and receive commands from IoTConnect portal.
* User can update firmware Over The Air using "OTA update" Feature supported by SDK.
* SDK supports SAS authentication as well as x509 certificate authentication.  
* SDK consists of Gateway device with multiple child devices support.
* SDK supports to receive and update the Twin property. 
* SDK supports device and OTA command Acknowledgement.
* Edge device support with data aggregation.
* Provide device connection status receive by command.
* Support hard stop command to stop device client from cloud.
* It allows sending the OTA command acknowledgment for Gateway and child device.
* It manages the sensor data sending flow over the cloud by using data frequency("df") configuration.
* It allows to disconnect the device from firmware.
* SDK supports Symmetric Key Authentication   
* Implemented auto-connect of SDK after Token Expiry from Cloud
* Bifurcated the Reporting and Fault Messages as per template based data validation

# Example Usage:

- To initialize the SDK object need to import below sdk package
```javascript
var SDKClient = require('iotconnect-sdk');
```


- Prerequisite standard configuration data 
```javascript
	var uniqueId = <<uniqueId>>;
	var cpId = <<CPID>>; 
	var env = <<env>>;
```
"uniqueId" 	: Your device uniqueId
"cpId" 		: It is the company code. It gets from the IoTConnect UI portal "Settings->Key Vault"
"env" 		: It is the UI platform environment. It gets from the IoTConnect UI portal "Settings->Key Vault"

- SdkOptions is for the SDK configuration and needs to parse in SDK object initialize call. You need to manage the below configuration as per your device authentication type.
```javascript
	var sdkOptions = {
		"certificate" : {
			"SSLKeyPath"	: "<< SystemPath >>/device.key",
			"SSLCertPath"   : "<< SystemPath >>/device.pem",
			"SSLCaPath"     : "<< SystemPath >>/rootCA.pem"
		},
		"offlineStorage": { 
			"disabled": false, //default value = false, false = store data, true = not store data 
			"availSpaceInMb": 1, //size in MB, Default value = unlimited
			"fileCount": 5 // Default value = 1
		},
		"devicePrimaryKey": "" // For Symmetric Key Auth type support
	}
```
"certificate": It is indicated to define the path of the certificate file. Mandatory for X.509/SSL device CA signed or self-signed authentication type only.
	- SSLKeyPath: your device key
	- SSLCertPath: your device certificate
	- SSLCaPath : Root CA certificate
"offlineStorage" : Define the configuration related to the offline data storage 
	- disabled : false = offline data storing, true = not storing offline data 
	- availSpaceInMb : Define the file size of offline data which should be in (MB)
	- fileCount : Number of files need to create for offline data
"devicePrimaryKey" : It is optional parameter. Mandatory for the Symmetric Key Authentication support only. It gets from the IoTConnect UI portal "Device -> Select device -> info(Tab) -> Connection Info -> Device Connection".

Note: sdkOptions is optional but mandatory for SSL/x509 device authentication type only. Define proper setting or leave it NULL. If you do not provide offline storage, it will set the default settings as per defined above. It may harm your device by storing the large data. Once memory gets full may chance to stop the execution.

- To Initialize the SDK object and connect to the cloud
```javascript
	var iotConnectSDK = new SDKClient(cpId, uniqueId, deviceCallback, twinUpdateCallback, sdkOptions, env);
```

- To receive the command from Cloud to Device(C2D).	
```javascript
	var deviceCallback = function deviceCallback(data){
		console.log(data);
		if(data.cmdType == "0x01")
			// Device Command
		if(data.cmdType == "0x02")
			// Firmware Command
		if(data.cmdType == "0x16")
			// Device Connection status (command : true [connected] and command : false [disconnected])
	}
```

- To receive the twin from Cloud to Device(C2D).
```javascript
	var twinUpdateCallback = function twinUpdateCallback(data){
		console.log(data);
	}
```

- To get the list of attributes with respective device.
```javascript
	iotConnectSDK.getAttributes(function(response){
		console.log("Attribute list device wise :: ", response);
	});
```

- This is the standard data input format for Gateway and non Gateway device to send the data on IoTConnect cloud(D2C).
```javascript
	// For Non Gateway Device 
	var data = [{
		"uniqueId": "<< Device UniqueId >>",
		"time" : "<< date >>",
		"data": {}
	}];

	// For Gateway and multiple child device 
	var data = [{
		"uniqueId": "<< Gateway Device UniqueId >>", // It should be must first object of the array
		"time": "<< date >>",
		"data": {}
	},
	{
		"uniqueId":"<< Child DeviceId >>", //Child device
		"time": "<< date >>",
		"data": {}
	}]
	iotConnectSDK.sendData(data);
```
"time" : Date format should be as defined //"2021-01-24T10:06:17.857Z" 
"data" : JSON data type format // {"temperature": 15.55, "gyroscope" : { 'x' : -1.2 }}

- To send the command acknowledgment from device to cloud.
```javascript
	var obj = {
		"ackId": "",
		"st": "",
		"msg": "",
		"childId": ""
	}
	var msgType = ""; // 5 ("0x01" device command), 11 ("0x02" Firmware OTA command)
	iotConnectSDK.sendAck(obj, msgType)
```
"ackId(*)" 	: Command Acknowledgment GUID which will receive from command payload (data.ackId)
"st(*)"		: Acknowledgment status sent to cloud (4 = Fail, 6 = Device command[0x01], 7 = Firmware OTA command[0x02])
"msg" 		: It is used to send your custom message
"childId" 	: It is used for Gateway's child device OTA update only
				0x01 : null or "" for Device command
			  	0x02 : null or "" for Gateway device and mandatory for Gateway child device's OTA update.
		   		How to get the "childId" .?
		   		- You will get child uniqueId for child device OTA command from payload "data.urls[~].uniqueId"
"msgType" 	: Message type (5 = "0x01" device command, 11 = "0x02" Firmware OTA command)
Note : (*) indicates the mandatory element of the object.

- To update the Twin Property
```javascript
	var key = "<< Desired property key >>";
	var value = "<< Desired Property value >>";
	iotConnectSDK.updateTwin(key,value)
```
"key" 	:	Desired property key received from Twin callback message
"value"	:	Value of the respective desired property

- To disconnect the device from the cloud
```javascript
	iotConnectSDK.dispose()
```

- To get the all twin property Desired and Reported
```javascript
	iotConnectSDK.getAllTwins();
```

# Dependencies:

* This SDK used below packages :
	- async, bluebird, fs-extra, fs-extra-promise, json-query, memory-cache, mqtt, request, mqtt-connection

## IOT Connect SDK : Software Development Kit 3.0.1

# Integration Notes:

## Prerequisite tools

1. NodeJs: Node.js supported version v10.x and above.
2. Npm: NPM is compatible with the node version.

## Installation:

1. Extract the "iotconnect-sdk-node-v3.0.1.zip"

2. To install the required libraries Follow the command below:
	- Go to SDK directory path using terminal/Command prompt
	- cd iotconnect-sdk-node-v3.0.1
	- npm install (Install prerequisite nodejs library)
	- npm install iotconnect-sdk (Install the 'iotconnect-sdk' package in nodejs library)

3. Using terminal/command prompt goto sample folder
	- cd sample 

4. You can take the firmware file from the above location and update the following details
	- Prerequisite input data as explained in the usage section as below #?
	- Update sensor attributes according to added in IoTConnect cloud platform.
	- If your device is secure then need to configure the x.509 certificate path such as given below in SDK Options otherwise leave it as it is.

5. Ready to go:
	- node firmware.js (This script send the data on the cloud as per configured device detail)
	- node example.js *<<env>>* (Command line experience to test the SDK)
    
## Release Note :

** New Feature **
1. Manage Device Frequency Command to instant update in the data send frequency.
2 Implemented auto-connect of SDK after Token Expiry from Cloud
3 Bifurcated the Reporting and Fault Messages as per template based data validation

** Improvements **
1. Data validation issue resolved for the string data type.
2. Improvement in faulty data for mismatched attributes and wrong attribute value compare to attribute data type.