'use strict';

const discoveryUrl = "/api/sdk/cpid/<<CPIDNAME>>/lang/node/ver/2.0/env/<<ENVNAME>>";
const discoveryUrlHost = "https://discovery.iotconnect.io/";
const dpsHostUrl = "global.azure-devices-provisioning.net";
const defaultParams = {
	"attribute": true,
    "setting": true,
    "protocol": true,
    "device": true,
    "rule": true,
    "sdkConfig": true
};

const attributeParams = {
    "attribute": true
};
const settingeParams = {
    "setting": true
};
const protocolParams = {
    "protocol": true
};
const deviceParams = {
    "device": true
};
const ruleParams = {
    "rule": true
};
const hbStatusFlag = 0;

const messageType = {
	"rpt" : 0,
	"flt" : 1,
	"rptEdge" : 2,
	"ruleMatchedEdge" : 3,	
	"log" : 4,
	"ack" : 5,
	"ota" : 6,
	"custom" : 7,
	"ping" : 8,
	"deviceCreated" : 9,
	"deviceStatus" : 10
}

const commandType = {
	"CORE_COMMAND" : "0x01",
	"FIRMWARE_UPDATE" : "0x02",
	"ATTRIBUTE_INFO_UPDATE" : "0x10",
	"SETTING_INFO_UPDATE" : "0x11",	
	"PASSWORD_INFO_UPDATE" : "0x12", 	
	"DEVICE_INFO_UPDATE" : "0x13",
	"RULE_INFO_UPDATE" : "0x15",
	"DEVICE_CONNECTION_STATUS" : "0x16",	
	"STOP_SDK_CONNECTION" : "0x99"	
}

const responseCode = {
	"OK" : 0,
	"DEVICE_NOT_REGISTERED" : 1,
	"AUTO_REGISTER" : 2,	
	"DEVICE_NOT_FOUND" : 3, 	
	"DEVICE_INACTIVE" : 4,
	"OBJECT_MOVED" : 5,	
	"CPID_NOT_FOUND" : 6	
}

const aggrigateType = {
	"min" 	: 1,
	"max" 	: 2,	
	"sum" 	: 4, 	
	"avg" 	: 8, 	
	"count" : 16,
	"lv"	: 32
}

const aggrigateTypeLablel = {
	"min" 	: "min",
	"max" 	: "max",	
	"sum" 	: "sum", 	
	"avg" 	: "avg", 	
	"count" : "count",
	"lv" 	: "lv",
	"agt" 	: "agt"
}

const dataType = {
	"number" : 0,
	"string" : 1,	
	"object" : 2,
	"float"  : 3
}

const edgeEnableStatus = {
	"enabled"  : true,
	"disabled" : false
}

const authType = {
	"KEY"  : 1,
	"CA_SIGNED" : 2,
	"CA_SELF_SIGNED" : 3,
	"TPM" : 4
}

const errorLog = {
    "ERR_IN01": "<<Exception error message>>",
    "ERR_IN02": "Discovery URL can not be blank",
    "ERR_IN03": "Missing required parameter 'discoveryUrl' in sdkOptions",
    "ERR_IN04": "cpId can not be blank",
    "ERR_IN05": "uniqueId can not be blank",
	"ERR_IN06": "SDK options : set proper certificate file path and try again",
    "ERR_IN07": "Log directory should be with proper permission to read and write",
    "ERR_IN08": "Network connection error or invalid url",
    "ERR_IN09": "Unable to get baseUrl",
    "ERR_IN10": "Device information not found",
    "ERR_IN11": "Device broker information not found",
    "ERR_IN12": "CPID not found",
    "ERR_IN13": "Client connection failed.",
	"ERR_IN14": "Client connection closed",
	"ERR_IN15": "Missing required parameter 'cpId' or 'uniqueId' or 'env' to initialize the device connection", // new 
	"ERR_IN16": "scopeId can not be blank",

    "ERR_SD01": "<<Exception error message>>",
    "ERR_SD02": "It does not matched with payload's 'uniqueId'",
    "ERR_SD03": "It does not matched with predefined standard date time format for payload's 'time'",
    "ERR_SD04": "Device is barred SendData() method is not permitted",
    "ERR_SD05": "Invalid data type to send the data. It should be in array of object type",
    "ERR_SD06": "Missing required parameter 'data'",
    "ERR_SD07": "Missing required parameter 'time'",
    "ERR_SD08": "Missing required parameter 'uniqueId'",
    "ERR_SD09": "Device information not found in local memory.",
	"ERR_SD10": "Publish data failed : MQTT connection not found", // new
	"ERR_SD11": "Unknown broker protocol", // new
	"ERR_SD12": "Publish data failed : sensor data object not found", // new --

	"ERR_TP01": "<<Exception error message>>",
    "ERR_TP02": "Device is barred updateTwin() method is not permitted",
	"ERR_TP03": "Missing required parameter 'key' or 'value' to update twin property",
	"ERR_TP04": "Device is barred getAllTwins() method is not permitted", //new
	"ERR_TP05": "Failed to sent the getAllTwins() request.", //new --

	"ERR_CM01": "<<Exception error message>>",
    "ERR_CM02": "Missing required parameter 'obj' or 'msgType' to send acknowledgement",
    "ERR_CM03": "Invalid data type to send the acknowledgment. It should be in 'object' type",
    "ERR_CM04": "Device is barred SendAck() method is not permitted",

	"ERR_OS01": " <<Exception error message>>",
    "ERR_OS02": "Error while creating log directory",
    "ERR_OS03": "Unable to read or write file",
    "ERR_OS04": "Unable to scan directory",

	"ERR_DC01": "<<Exception error message>>",
	"ERR_DC02": "Connection not available",
	
	"ERR_GA01": "<<Exception error message>>", // new
	"ERR_GA02": "Attributes data not found", // new
	
	"ERR_EE01": "<<Exception error message>>", // new
}

const infoLog = {
	"INFO_IN01" : "Device information received successfully",
    "INFO_IN02" : "Device connected",
    "INFO_IN03" : "Device disconnected",
    "INFO_IN04" : "Initializing...",
    "INFO_IN05" : "Connecting...",
	"INFO_IN06" : "Rechecking...",
	"INFO_IN07" : "BaseUrl received to sync the device information", // new
	"INFO_IN08" : "Response Code : 0 'OK'", // new
	"INFO_IN09" : "Response Code : 1 'DEVICE_NOT_REGISTERED'", // new
	"INFO_IN10" : "Response Code : 2 'AUTO_REGISTER'", // new
	"INFO_IN11" : "Response Code : 3 'DEVICE_NOT_FOUND'", // new
	"INFO_IN12" : "Response Code : 4 'DEVICE_INACTIVE'", // new
	"INFO_IN13" : "Response Code : 5 'OBJECT_MOVED'", // new
	"INFO_IN14" : "Response Code : 6 'CPID_NOT_FOUND'", // new
	"INFO_IN15" : "Response Code : 'NO_RESPONSE_CODE_MATCHED'", // new
	"INFO_IN16" : "TPM device enrolled successfully", // new --

    "INFO_SD01" : "Publish data",
	
	"INFO_TP01" : "Twin property updated successfully",
	"INFO_TP02" : "Request sent successfully to get the all twin properties.", //new
	
	"INFO_CM01" : "Command : 0x01 : STANDARD_COMMAND", // new
    "INFO_CM02" : "Command : 0x02 : FIRMWARE_UPDATE", // new
    "INFO_CM03" : "Command : 0x10 : ATTRIBUTE_UPDATE", // new
    "INFO_CM04" : "Command : 0x11 : SETTING_UPDATE", // new
    "INFO_CM05" : "Command : 0x12 : PASSWORD_UPDATE", // new
    "INFO_CM06" : "Command : 0x13 : DEVICE_UPDATE", // new
    "INFO_CM07" : "Command : 0x15 : RULE_UPDATE", // new
    "INFO_CM08" : "Command : 0x99 : STOP_SDK_CONNECTION", // new
    "INFO_CM09" : "Command : 0x16 : SDK_CONNECTION_STATUS", // new
    "INFO_CM10" : "Command acknowledgement success",
	
	"INFO_OS01" : "Publish offline data",
    "INFO_OS02" : "Offline data saved",
    "INFO_OS03" : "File has been created to store offline data",
    "INFO_OS04" : "Offline log file deleted",
	"INFO_OS05" : "No offline data found",
	"INFO_OS06" : "Offline data publish :: Send/Total :: ", // new 
	
	"INFO_DC01" : "Device already disconnected",

	"INFO_GA01" : "Get attributes successfully", // new

	"INFO_EE01" : "Edge Device :: Rule 'MATCHED'", // new
	"INFO_EE02" : "Edge Device :: Rule 'NOT MATCHED'" // new
}

module.exports = {
	discoveryBaseUrl: discoveryUrl,
	discoveryUrlHost: discoveryUrlHost,
    commandType: commandType,
    hbStatusFlag: hbStatusFlag,
	responseCode: responseCode,
	defaultParams: defaultParams,
	attributeParams: attributeParams,
	settingeParams: settingeParams,
	protocolParams: protocolParams,
	deviceParams: deviceParams,
	ruleParams: ruleParams,
	aggrigateType: aggrigateType,
	aggrigateTypeLablel: aggrigateTypeLablel,
	dataType: dataType,
	edgeEnableStatus: edgeEnableStatus,
	messageType: messageType,
	authType: authType,
	httpAPIVersion: "2016-02-03",
	sdkVersion: "2.0",
	sdkLanguage: "M_Node",
	twinPropertyPubTopic: "$iothub/twin/PATCH/properties/reported/?$rid=1",
	twinPropertySubTopic: "$iothub/twin/PATCH/properties/desired/#",
	twinResponsePubTopic: "$iothub/twin/GET/?$rid=0",
	twinResponseSubTopic: "$iothub/twin/res/#",
	errorLog: errorLog,
	infoLog: infoLog,
	dpsHostUrl: dpsHostUrl
}