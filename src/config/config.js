'use strict';

// const discoveryUrl = "/api/sdk/sid/<<SID>>/uid/<<UID>>";
const msgFormatVersion = "2.1";
const discoveryUrl = "/api/v"+msgFormatVersion+"/dsdk/sid/<<SID>>";
const discoveryUrlwithCpid = `/api/v${msgFormatVersion}/dsdk/cpid/<<CPID>>/env/<<ENV>>?pf=<<PF>>`
const discoveryUrlHost = "https://discovery.iotconnect.io/";
const sasTokenExpiryTime = 365 * 24 * 60; // (expiresInMins) Expiry time 365 days
const resyncFrequency = 10; // Recheck after 10 seconds 

const holdOfflineDataTime = 10; // In seconds
const allStatusParams = 200;
const attributeParams = 201;
const settingsParams = 202;
const ruleParams = 203;
const deviceParams = 204;
const otaParams = 205;
const protocolParams = 201;
const allParams = 210;
const edgeFaultDataFrequency = 60000; // In 60 sec For Edge device only

const hbStatusFlag = 0;
const messageType = {
	"rpt" : 0,
	"flt" : 1,
	"rptEdge" : 2,
	"ruleMatchedEdge" : 3,	
	"heartBeats"  : 4,
	"deviceCommandAck"  : 7,
	"otaCommandAck"  : 6,
	"moduleCommandAck"  : 6,
	"getIdentity"  : 200,
	"getAttribute"  : 201,
	"getDevices"  : 202,
	"getRules"  : 203,
	"getChildDevices"  : 204,
	"getOTAUpdate"  : 205,
	"getAllInfo"  : 210,
	"createChildDevice" : 221,
	"deleteChildDevice" : 222
}

// =================== NEW ============================
const commandTypeFlag = {
	DEVICE_COMMAND : 0,
	OTA_COMMAND : 1,
	MODULE_COMMAND : 2,
} 

const discoveryErrorCode = {
	SUCCESS : 0,
	IN_VALID_SID : 1,
	COMPANY_NOT_FOUND : 2,
	SUBSCRIPTION_EXPIRED : 3
}

const requestDataErrorCode = {
	OK : 0, // OK - No Error. 
	DEVICE_NOT_FOUND : 1, // Device not found. Device is not whitelisted to platform 
	DEVICE_INACTIVE : 2, // Device is not active 
	UN_ASSOCIATED_DEVICE : 3, // Un-Associated. Device has not any template associated with it 
	DEVICE_NOT_ACQUIRED : 4, // Device is not acquired. Device is created but it is in release state 
	DEVICE_DISABLED : 5, // Device is disabled. Its disabled from IoTHub by Platform Admin 
	COMPANY_NOT_FOUND : 6, // Company not found as SID is not valid 
	SUBSCRIPTION_HAS_EXPIRED : 7, // Subscription is expired 
	CONNECTION_NOT_ALLOWED : 8 // Connection Not Allowed
}

const commandType = {
	REFRESH_ATTRIBUTE : 101, // Device must send message of type 201 to get updated attributes 
	REFRESH_SETTING_TWIN : 102, // Device must send message of type 202 to get updated settings or twin 
	REFRESH_EDGE_RULE : 103, // Device must send message of type 203 to get updated Edge rules 
	REFRESH_CHILD_DEVICE : 104, // Device must send message of type 204 to get updated child devices 
	DATA_FREQUENCY_CHANGE : 105, // Device needs to update frequency received in this message 
	DEVICE_DELETED : 106, // must stop all communication and release the mqtt 
	DEVICE_DISABLED : 107, // -DO- 
	DEVICE_RELEASED : 108, //-DO- 
	STOP_OPERATION : 109, //-DO- 
	START_HEARTBEAT_DEVICE : 110, // must start sending heartbeat 
	STOP_HEARTBEAT_DEVICE : 111, // must stop sending heartbeat
	SDK_LOG_FLAG : 112, // Update flag SDK log display in cmd prompt
	SKIP_ATTRIBUTE_VALIDATION : 113, // Skip Attribute validation during data send 
	SEND_SDK_LOG_FILE : 114, // Request command for SDK Log file upload
	DEVICE_DELETE_REQUEST : 115, // Delete device request command
	CORE_COMMAND : 0, // Firmware Device command 
	FIRMWARE_UPDATE : 1,  // Firmware OTA command 
	MODULE_COMMAND : 2, // Firmware Module command
	STOP_SDK_CONNECTION : "0x99",
	DEVICE_CONNECTION_STATUS : 3	
}

const createChildDeviceErrorCode = {
	OK : 0, // OK - No Error. Child Device created successfully 
	MISSING_CHILD_TAG : 1, // Message missing child tag 
	MISSING_CHILD_DEVICE_UNIQUEID : 2, // Message missing child device uniqueid 
	MISSING_CHILD_DEVICE_DISPLAY_NAME : 3, // Message missing child device display name 
	GATEWAY_DEVICE_NOT_FOUND : 4, // Gateway device not found 
	SOMETHING_WENT_WRONG : 5, // Could not create device, something went wrong 
	INVALID_DEVICE_TAG : 6, // Child device tag is not valid 
	TAG_NAME_DIFFER_THAN_GATEWAY_DEVICE_TAG : 7, // Child device tag name cannot be same as Gateway device
	CHILD_DEVICE_UNIQUEID_ALREADY_EXIST : 8 // Child uniqueid is already exists.
}

const deleteChildDeviceErrorCode = {
	OK : 0, // OK - No Error. Child Device deleted successfully
	CHILD_DEVICE_NOT_FOUND : 1 // Child device not found
}

const attributeDataType = {
	INTEGER : 0,
	LONG : 1,
	DECIMAL : 2,
	STRING : 3,
	TIME : 4,
	DATE : 5,
	DATETIME : 6,
	LATLONG : 7, // [ Decimal Array, Decimal (10,8), Decimal (11,8) ] 
	BIT : 8, // [ 0 / 1] 
	BOOLEAN : 9, // [ true / false | True/False] 
	OBJECT : 10
}

const dataType = {
	NON_OBJ: 0,
	INTEGER : 1,
	LONG : 2,
	DECIMAL : 3,
	STRING : 4,
	TIME : 5,
	DATE : 6,
	DATETIME : 7,
	BIT : 8, // [ 0 / 1] 
	BOOLEAN : 9, // [ true / false | True/False] 
	LATLONG: 10,
	OBJECT: 11
}


// =================== NEW ============================

const responseCode = {
	OK : 0, // OK - No Error. 
	//"OK" : 0,
	DEVICE_NOT_FOUND : 1, // Device not found. Device is not whitelisted to platform 
	// "DEVICE_NOT_REGISTERED" : 1,
	DEVICE_INACTIVE : 2, // Device is not active 
	// "AUTO_REGISTER" : 2,	
	UN_ASSOCIATED_DEVICE : 3, // Un-Associated. Device has not any template associated with it 
	//"DEVICE_NOT_FOUND" : 3, 	
	DEVICE_NOT_ACQUIRED : 4, // Device is not acquired. Device is created but it is in release state 
	//"DEVICE_INACTIVE" : 4,
	DEVICE_DISABLED : 5, // Device is disabled. Its disabled from IoTHub by Platform Admin 
	//"OBJECT_MOVED" : 5,	
	COMPANY_NOT_FOUND : 6, // Company not found as SID is not valid 
	//"CPID_NOT_FOUND" : 6,
	SUBSCRIPTION_HAS_EXPIRED : 7, // Subscription is expired 
	//"COMPANY_NOT_FOUND" : 7,
	CONNECTION_NOT_ALLOWED : 8 // Connection Not Allowed
    // "QUOTA_EXHAUSTED" : 8,
}

const aggregateType = {
	"min" 	: 1,
	"max" 	: 2,	
	"sum" 	: 4, 	
	"avg" 	: 8, 	
	"count" : 16,
	"lv"	: 32
}
const aggregateValue = 63;

const aggregateTypeLabel = {
	"min" 	: "min",
	"max" 	: "max",	
	"sum" 	: "sum", 	
	"avg" 	: "avg", 	
	"count" : "count",
	"lv" 	: "lv",
	"agt" 	: "agt"
}

const edgeEnableStatus = {
	"enabled"  : 1,
	"disabled" : 0
}

const authType = {
	"KEY"  : 1,
	"CA_SIGNED" : 2,
	"CA_SELF_SIGNED" : 3,
	"TPM": 4,
	"SYMMETRIC_KEY" : 5,
	"CA_INDIVIDUAL" : 7
}

const msgType = {
    "allStatus" : 200,
    "attribute" : 201,
    "setting" : 202,
    "rule" : 203,
    "childDevice" : 204,
    "ota" : 205, // NOt for now
	"all" : 210,
	"createChildDevice": 221, // v2.1
	"deleteChildDevice": 222  // v2.1
}

const errorLog = {
    "ERR_IN01": "<<Exception error message>>",
    "ERR_IN02": "Discovery URL can not be blank",
    "ERR_IN03": "Missing required parameter 'discoveryUrl' in sdkOptions",
    "ERR_IN04": "cpId can not be blank",
    "ERR_IN05": "uniqueId can not be blank",
	"ERR_IN06": "SDK options : set proper certificate file path and try again",
    "ERR_IN07": "Log directory should be with proper permission to read and write file",
    "ERR_IN08": "Network connection error or invalid url",
    "ERR_IN09": "Unable to get baseUrl",
    "ERR_IN10": "Device information not found",
    "ERR_IN11": "Device broker information not found",
    "ERR_IN12": "CPID not found",
    "ERR_IN13": "Client connection failed.",
	"ERR_IN14": "Client connection closed",
	"ERR_IN15": "Missing required parameter 'cpId' or 'uniqueId' to initialize the device connection", // new 
	"ERR_IN16": "ScopeId can not be blank",
	"ERR_IN17": "Client subscription failed",
	"ERR_IN18": "DPS connection string can not be blank",
	"ERR_IN19": "Endorcement key can not be blank",
	"ERR_IN20": "IotHub host name can not be blank",
	"ERR_IN21": "Discovery API error : Invalid value of SID",
	"ERR_IN22": "Discovery API error : Company not found",
	"ERR_IN23": "Discovery API error : Subscription Expired",
	"ERR_IN24": "Discovery API error : Unknown error code",
	"ERR_IN25": "Device identity message version does not matched.",

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
	"ERR_TP06": "Device is already connected.", //new --

	"ERR_CM01": "<<Exception error message>>",
    "ERR_CM02": "Missing required arguments",
    "ERR_CM03": "Invalid data type to send the acknowledgment. It should be in 'object' type",
    "ERR_CM04": "Device is barred SendAck() method is not permitted",
	"ERR_CM05": "setConnectionStatusChangedCallback() : data type should be function.",
	"ERR_CM06": "onTwinChangeCommand() : data type should be function.",
	"ERR_CM07": "onDeviceCommand() : data type should be function.",
	"ERR_CM08": "onOTACommand() : data type should be function.",
	"ERR_CM09": "onAttrChangeCommand() : data type should be function.",
	"ERR_CM10": "onDeviceChangeCommand() : data type should be function.",
	"ERR_CM11": "onModuleCommand() : data type should be function.",
	"ERR_CM12": "ACK(Acknowledgement) guid is missing.",
	"ERR_CM13": "onRuleChangeCommand() : data type should be function.",

	"ERR_OS01": " <<Exception error message>>",
    "ERR_OS02": "Error while creating log directory",
    "ERR_OS03": "Unable to read or write file",
    "ERR_OS04": "Unable to scan directory",

	"ERR_DC01": "<<Exception error message>>",
	"ERR_DC02": "Connection not available",
	
	"ERR_GA01": "<<Exception error message>>", // new
	"ERR_GA02": "Attributes data not found", // new

	"ERR_DL01": "<<Exception error message>>", // new
	"ERR_DL02": "Child devices not found", // new
	"ERR_DL03": "This device is not a gateway type device", // new
	
	"ERR_EE01": "<<Exception error message>>", // new

	"ERR_GD01": "<<Exception error message>>", // 2.1
	"ERR_GD02": "Request failed to create the child device", // 2.1
	"ERR_GD03": "Request failed to delete the child device", // 2.1
	"ERR_GD04": "Child device create : It is not a Gateway device", // 2.1
	"ERR_GD05": "Child device create : Input validation error", // 2.1

	"ERR_HB01": "<<Exception error message>>", // 2.1
	"ERR_HB02": "Heart beat frequency value missing", // 2.1

	"ERR_GM01": "Something went wrong."
	
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
	"INFO_IN09" : "Response Code : 1 'DEVICE_NOT_FOUND'", // new
	"INFO_IN10" : "Response Code : 2 'DEVICE_INACTIVE'", // new
	"INFO_IN11" : "Response Code : 3 'UN_ASSOCIATED_DEVICE'", // new
	"INFO_IN12" : "Response Code : 4 'DEVICE_NOT_ACQUIRED'", // new
	"INFO_IN13" : "Response Code : 5 'DEVICE_DISABLED'", // new
	"INFO_IN14" : "Response Code : 6 'COMPANY_NOT_FOUND'", // new
	"INFO_IN15" : "Response Code : 'NO_RESPONSE_CODE_MATCHED'", // new
	"INFO_IN16" : "TPM device enrolled successfully", // new --
	"INFO_IN17" : "TPM device provisioning successfully", // new --
	"INFO_IN18" : "TPM device has already enrolled", // new --
	"INFO_IN19" : "Device subscription completed",
	"INFO_IN20" : "Sync data request send successfully",
	"INFO_IN21" : "Response Code : 7 'SUBSCRIPTION_HAS_EXPIRED'", // new
	"INFO_IN22" : "Response Code : 8 'CONNECTION_NOT_ALLOWED'", // new

	"INFO_SD01" : "Publish data",
	
	"INFO_TP01" : "Twin property updated successfully",
	"INFO_TP02" : "Request sent successfully to get the all twin properties.", //new
	"INFO_TP03" : "Twin message received.", //new
	"INFO_TP04" : "Twin reported property message published.", //new
	
	"INFO_CM01" : "Command : DEVICE COMMAND", // 0
    "INFO_CM02" : "Command : FIRMWARE OTA UPDATE", // 1
    "INFO_CM03" : "Command : ATTRIBUTE CHANGED", // 101
    "INFO_CM04" : "Command : TWIN SETTING CHANGED", // 102
    "INFO_CM05" : "Command : MODULE COMMAND", // scrapped
    "INFO_CM07" : "Command : RULE CHANGED", // 103
    "INFO_CM06" : "Command : DEVICE CHANGED", // 104
    "INFO_CM08" : "Command : STOP SDK OPERATION", // 109
    "INFO_CM09" : "Command : DEVICE CONNECTION STATUS", //0x16
    "INFO_CM10" : "Command acknowledgement success",
	"INFO_CM11" : "Command Type : 200 : Device sync success with basic information received.",
	"INFO_CM12" : "Command Type : 201 : Attribute information received.",
	"INFO_CM13" : "Command Type : 202 : Setting information received.",
	"INFO_CM14" : "Command Type : 203 : Rule information received.",
	"INFO_CM15" : "Command Type : 204 : Device information received.",
	"INFO_CM16" : "Command Type : 205 : OTA information received.",
	"INFO_CM17" : "Command Type : 210 : All information received.",
	"INFO_CM18" : "Command : DATA FREQUENCY CHANGED", // 105
	"INFO_CM19" : "Command Type : 221 : Child device created successfully", // new
	"INFO_CM20" : "Command Type : 222 : Child device deleted successfully", // new
	"INFO_CM21" : "Command : DEVICE DELETED", //106
	"INFO_CM22" : "Command : DEVICE DISABLED", //107
	"INFO_CM23" : "Command : DEVICE RELEASED", //108
	"INFO_CM24" : "Command : START HEARTBEAT DEVICE", //110
	"INFO_CM25" : "Command : STOP HEARTBEAT DEVICE", //111
	"INFO_CM26" : "Command : SDK DEBUG LOG FLAG", //112
	"INFO_CM27" : "Command : SKIP ATTRIBUTE VALIDATION", //113
	"INFO_CM28" : "Command : SEND SDK LOG FILE", //114
	"INFO_CM29" : "Command : DELETE DEVICE", //115 // may be child device

	"INFO_OS01" : "Publish offline data",
    "INFO_OS02" : "Offline data saved",
    "INFO_OS03" : "File has been created to store offline data",
    "INFO_OS04" : "Offline log file deleted",
	"INFO_OS05" : "No offline data found",
	"INFO_OS06" : "Offline data publish :: Send/Total :: ", // new 
	
	"INFO_DC01" : "Device already disconnected",

	"INFO_GA01" : "Get attributes successfully", // new

	"INFO_DL01" : "Get devices successfully", // new

	"INFO_EE01" : "Edge Device :: Rule 'MATCHED'", // new
	"INFO_EE02" : "Edge Device :: Rule 'NOT MATCHED'", // new
	"INFO_EE03" : "Edge Device :: Rule ", // new

	"INFO_GD01" : "Request sent to create the child device", // 2.1
	"INFO_GD02" : "Child device created successfully", // 2.1
	"INFO_GD03" : "Request sent to delete the child device", // 2.1
	"INFO_GD04" : "Child device deleted successfully", // 2.1

	"INFO_HB01": "Heart beat process started now", // 2.1
	"INFO_HB02": "Heart beat process stopped now", // 2.1
	"INFO_HB03": "Heart beat process already running", // 2.1
	"INFO_HB04": "Heart beat process already stopped", // 2.1
	"INFO_HB05": "Heart beat data sent", // 2.1
}

module.exports = {
	discoveryBaseUrl: discoveryUrl,
	discoveryUrlHost: discoveryUrlHost,
    commandType: commandType,
    hbStatusFlag: hbStatusFlag,
	responseCode: responseCode,
	// defaultParams: defaultParams,
	allStatusParams: allStatusParams,
	attributeParams: attributeParams,
	settingsParams: settingsParams,
	protocolParams: protocolParams,
	deviceParams: deviceParams,
	ruleParams: ruleParams,
	otaParams: otaParams,
	allParams: allParams,
	aggregateType: aggregateType,
	aggregateTypeLabel: aggregateTypeLabel,
	dataType: dataType,
	edgeEnableStatus: edgeEnableStatus,
	messageType: messageType,
	authType: authType,
	httpAPIVersion: "2016-02-03",
	sdkVersion: "2.1",
	msgFormatVersion: msgFormatVersion,
	sdkLanguage: "M_Node",
	az : {
		twinPropertyPubTopic: "$iothub/twin/PATCH/properties/reported/?$rid=1",
		twinPropertySubTopic: "$iothub/twin/PATCH/properties/desired/#",
		twinResponsePubTopic: "$iothub/twin/GET/?$rid=0",
		twinResponseSubTopic: "$iothub/twin/res/#",	
	},
	aws: {
		twinPropertyPubTopic: "$aws/things/{Cpid_DeviceID}/shadow/name/{Cpid_DeviceID}_twin_shadow/report",
		twinPropertySubTopic: "$aws/things/{Cpid_DeviceID}/shadow/name/{Cpid_DeviceID}_twin_shadow/property-shadow",
		twinResponseSubTopic: "$aws/things/{Cpid_DeviceID}/shadow/name/{Cpid_DeviceID}_twin_shadow/get/all",
		twinResponsePubTopic: "$aws/things/{Cpid_DeviceID}/shadow/name/{Cpid_DeviceID}_twin_shadow/get",
	},
	directMethodForSelectedMethodSubTopic_SW: "$iothub/methods/POST/{method_name}/?$rid={request_id}",
	directMethodForAllSubTopic_SW: "$iothub/methods/POST/#",
	errorLog: errorLog,
	infoLog: infoLog,
	holdOfflineDataTime: holdOfflineDataTime,
	msgType: msgType,
	discoveryErrorCode: discoveryErrorCode,
	sasTokenExpiryTime: sasTokenExpiryTime,
	aggregateValue: aggregateValue,
	createChildDeviceErrorCode: createChildDeviceErrorCode,
	deleteChildDeviceErrorCode: deleteChildDeviceErrorCode,
	commandTypeFlag: commandTypeFlag,
	resyncFrequency: resyncFrequency,
	discoveryUrlwithCpid,
	edgeFaultDataFrequency
}