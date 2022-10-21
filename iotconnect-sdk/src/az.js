var cache = require('memory-cache');
var config = require('./../config/config');
var fs = require('fs-extra');
var async = require('async');
var _ = require('lodash');
var CommonFunctions = require("./../common/common");

class Az {

	constructor(connectionString, sId, sdkOptions = "", callback) {
        this.commonLib = "";
        if (connectionString) {
			this.CONNECTION_STRING = connectionString;
			this.UNIQUE_ID = connectionString.split(";")[1].split("=")[1].split("-")[1];
        } else {
			this.CONNECTION_STRING = "";
			this.UNIQUE_ID = "";
		}

		this.SID = sId;
        this.LOG_PATH = "./logs/offline/" + sId + "_" + this.UNIQUE_ID + "/";
        this.CERT_PATH_FLAG = true;
        this.DEVICE_CONNECTED = false;
        this.STOP_SDK_CONNECTION = false;
        this.HAS_ACTIVE_COUNT = 0;
        this.HAS_ACTIVE_COUNT_ATTRIBUTE_CHANGES = 0;
        //set callback options
        this.CONNECTION_STATUS_CALLBACK = "";
        this.TWIN_CHANGED_CALLBACK = "";
        this.DEVICE_CMD_CALLBACK = "";
        this.OTA_CMD_RECEIVED_CALLBACK = "";
        this.ATTRIBUTE_CHANGED_CALLBACK = "";
        this.DEVICE_CHANGED_CALLBACK = "";
        this.MODULE_RECEIVED_CALLBACK = "";
        let sdkOpt = {};
        sdkOpt['SDK_TYPE'] = "AZURE";
        sdkOpt['CONNECTION_STRING'] = this.CONNECTION_STRING;

        if (sdkOptions && 'debug' in sdkOptions) {
            this.IS_DEBUG = sdkOptions.debug;
        } else {
            this.IS_DEBUG = false; // for Local testing true else false
        }
        sdkOpt['isDebug'] = this.IS_DEBUG;
        sdkOpt['logPath'] = this.LOG_PATH;

        if (sdkOptions && 'certificate' in sdkOptions) {
            let cert = {
                "SSLKeyPath": (sdkOptions.certificate.SSLKeyPath && fs.existsSync(sdkOptions.certificate.SSLKeyPath)) ? sdkOptions.certificate.SSLKeyPath : this.CERT_PATH_FLAG = false, //<< SystemPath >>/key.pem",
                "SSLCertPath": (sdkOptions.certificate.SSLCertPath && fs.existsSync(sdkOptions.certificate.SSLCertPath)) ? sdkOptions.certificate.SSLCertPath : this.CERT_PATH_FLAG = false, //"<< SystemPath >>/cert.pem",
                "SSLCaPath": (sdkOptions.certificate.SSLCaPath && fs.existsSync(sdkOptions.certificate.SSLCaPath)) ? sdkOptions.certificate.SSLCaPath : this.CERT_PATH_FLAG = false //"<< SystemPath >>/ms.pem"
            }
            sdkOpt['certificate'] = cert;
        } else {
            this.CERT_PATH_FLAG = false;
        }

        if (sdkOptions && 'offlineStorage' in sdkOptions) {
            let offline = {
                "disabled": (!sdkOptions.offlineStorage.disabled) ? false : sdkOptions.offlineStorage.disabled, //in MB default is FALSE 
                "availSpaceInMb": (!sdkOptions.offlineStorage.availSpaceInMb) ? 0 : sdkOptions.offlineStorage.availSpaceInMb, //in MB default is unlimited MB
                "fileCount": (!sdkOptions.offlineStorage.fileCount || !sdkOptions.offlineStorage.availSpaceInMb) ? 1 : sdkOptions.offlineStorage.fileCount //Default fileCount is 1
            }
            sdkOpt['offlineStorage'] = offline;
        } else {
            let offline = {
                "disabled": false, //in MB default is FALSE 
                "availSpaceInMb": 0, //in MB default is unlimited MB
                "fileCount": 1 //Default fileCount is 1
            }
            sdkOpt['offlineStorage'] = offline;
        }
        let offlinePerFileDataLimit = eval(eval(sdkOpt.offlineStorage.availSpaceInMb * 1024) / sdkOpt.offlineStorage.fileCount); //Convert In KB
        let offlineFileCount = sdkOpt.offlineStorage.fileCount;
        let offlineProcessDisabled = sdkOpt.offlineStorage.disabled;
        this.offlineFileConfig = {
            "offlineProcessDisabled": offlineProcessDisabled,
            "offlinePerFileDataLimit": offlinePerFileDataLimit,
            "offlineFileCount": offlineFileCount
        }
        sdkOpt['offlineStorage'] = this.offlineFileConfig;
        sdkOpt['isGatewayDevice'] = false;
        sdkOpt['isEdgeDevice'] = false;
        
		this.commonLib = new CommonFunctions(sId, this.UNIQUE_ID, sdkOpt);
        if (!connectionString) {
            this.commonLib.manageDebugLog("ERR_IN05", this.UNIQUE_ID, this.SID, "", 0, this.IS_DEBUG);
        }
		if (!sId) {
            this.commonLib.manageDebugLog("ERR_IN04", this.UNIQUE_ID, this.SID, "", 0, this.IS_DEBUG);
        }
        if (!this.UNIQUE_ID) {
            this.commonLib.manageDebugLog("ERR_IN05", this.UNIQUE_ID, this.SID, "", 0, this.IS_DEBUG);
        }
        
        this.SDK_OPTIONS = sdkOpt;

        if (sId && this.UNIQUE_ID) {
            this.createPredefinedLogDirectories();
            this.init(function (response) {
                callback(response)
            })
        }
    }

    async createPredefinedLogDirectories() {
        var self = this;
        var logPathBasUrlLogs = "./logs";
        var logPathBasUrlLogsOffline = "./logs/offline/";
        var debugPathBasUrl = "./logs/debug/";
        if (!fs.existsSync(logPathBasUrlLogs)) {
            try {
                fs.mkdirSync(logPathBasUrlLogs);
                !fs.existsSync(logPathBasUrlLogsOffline) ? fs.mkdirSync(logPathBasUrlLogsOffline) : "";
                !fs.existsSync(debugPathBasUrl) ? fs.mkdirSync(debugPathBasUrl) : "";
            } catch (error) {
                let logText = "\n[ERR_IN01] " + new Date().toUTCString() + " [" + self.SID + "_" + self.UNIQUE_ID + "] : " + error.message;
                console.log(logText);
            }
        }
    }

    /* 
    Module : Init Call
    Author : Mayank [SOFTWEB]
    Inputs : sId, uniqueId, sdkOption params
    Output : Connected brokr client object 
    Date   : 2018-01-24
     */
    async init(callback) {
        var self = this;
        var sId = self.SID;
        var uniqueId = self.UNIQUE_ID;
        var sdkOptions = self.SDK_OPTIONS;
        if (sId && uniqueId) {
            var sId = sId;
            var uniqueId = uniqueId;
            var LOG_PATH = self.LOG_PATH;
            var newDevice = {};
            try {
                var initData = {
                    "id" : self.UNIQUE_ID,
                    "sid" : self.SID,
                    "sdkOptions" : self.SDK_OPTIONS
                } 
                if (!self.offlineFileConfig.offlineProcessDisabled) {
                    try {
                        if (!fs.existsSync(LOG_PATH)) {
                            fs.mkdirSync(LOG_PATH);
                        }
                    } catch (error) {
                        self.commonLib.manageDebugLog("ERR_IN07", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
                        self.commonLib.manageDebugLog("ERR_IN01", self.UNIQUE_ID, self.SID, error.message+555, 0, self.IS_DEBUG);
                    }
                }
                cache.put(self.SID + "_" + self.UNIQUE_ID, initData);
                callback({
                    status: true,
                    data: null,
                    message: "Init success"
                })
            } catch (err) {
                self.commonLib.manageDebugLog("ERR_IN01", self.UNIQUE_ID, self.SID, err.message+666, 0, self.IS_DEBUG);
                callback({
                    status: false,
                    data: err.message,
                    message: "Something  went wrong."
                })
            }
        } else {
            self.commonLib.manageDebugLog("ERR_IN15", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
            callback({
                status: false,
                data: [],
                message: config.errorLog.ERR_IN15
            })
        }
    }

    /* 
    Module : Get the device information
    Author : Mayank [SOFTWEB]
    Inputs : msgType
    Output : Devie info 
    Date   : 2020-01-06
    */
    getSyncDataByCommandType(msgType, callback) {
        var self = this;
        try {
            // console.log("Az -> getSyncDataByCommandType -> msgType -> ", msgType)
            
            self.commonLib.getSyncData(msgType, function (response) {
                if(response.status) {
                    callback({
                        status: true,
                        data: null,
                        message: response.message
                    })
                } else {
                    callback({
                        status: false,
                        data: null,
                        message: response.message
                    })
                }
            })
        } catch (error) {
            callback({
                status: false,
                data: null,
                message: error.message
            })
        }
    }

    /* 
    Module : Get Device Information
    Author : Mayank [SOFTWEB]
    Inputs : 
    Output : Devie info 
    Date   : 2018-01-24
     */
    syncDevice(callback) {
        var self = this;
        try {
			console.log("1.0.0 => ");
            var initialParams = config.defaultParams;
            self.getSyncDataByCommandType(config.msgType.allStatus, function(response){
                console.log(" response ==> ", response);
                callback({
                    status: response.status,
                    data: response.data,
                    message: response.message
                })
            });
        } catch (error) {
            callback({
                status: false,
                data: error,
                message: error.message
            })
        }
    }

/*
      Module : Device 
      Author : Mayank [SOFTWEB]
      Inputs : 
      Output : Device connection
      Date   : 2020-12-31
    */
    connect() {
        var self = this;
        try {
            self.deviceConnectionProcess();
        } catch (err) {
            self.commonLib.manageDebugLog("ERR_IN01", self.UNIQUE_ID, self.SID, err.message, 0, self.IS_DEBUG);
        }
    }
    

    /* 
    Module : Get Device Information
    Author : Mayank [SOFTWEB]
    Inputs : msgType
    Output : Devie info 
    Date   : 2018-01-24
    */
    // getSyncData(messageType) {
    //     try {
    //     this.commonLib.getSyncData(this.CLIENT_CONNECTION, this.UNIQUE_ID, this.CPID, this.offlineFileConfig, messageType, function (response) {
    //         console.log("Requested for device details.");
    //     })
    //     } catch (error) {
    //     console.log("Get device detail error :: ", error.message)
    //     // callback({
    //     //   status: false,
    //     //   data: error,
    //     //   message: error.message
    //     // })
    //     }
    // }

    /* 
    Module : Device Connection process
    Author : Mayank [SOFTWEB]
    Inputs : 
    Output : Request for the value which have data
    Date   : 2021-02-02
     */
    reqDataForActiveProperty(resData) {
        var self = this;
        
        try {
            async.series([
                function(pcb){
                    if(resData['d'] == 1){
                        self.getSyncDataByCommandType(config.msgType.childDevice, function(res){
                            pcb();
                        });
                    } else {
                        pcb();
                    }
                },
                function(pcb){
                    if(resData['attr'] == 1){
                        self.getSyncDataByCommandType(config.msgType.attribute, function(res){
                            pcb();
                        });
                    } else {
                        pcb();
                    }
                },
                function(pcb){
                    if(resData['set'] == 1){
                        self.getSyncDataByCommandType(config.msgType.setting, function(res){
                            pcb();
                        });
                    } else {
                        pcb();
                    }
                },
                function(pcb){
                    if(resData['r'] == 1){
                        self.getSyncDataByCommandType(config.msgType.rule, function(res){
                            pcb();
                        });
                    } else {
                        pcb();
                    }
                },
                function(pcb){
                    if(resData['ota'] == 1){
                        self.getSyncDataByCommandType(config.msgType.ota, function(res){
                            pcb();
                        });
                    } else {
                        pcb();
                    }
                }
            ],
            function(err, results){ });
        } catch (error) {
            self.commonLib.manageDebugLog("ERR_IN01", self.UNIQUE_ID, self.SID, error.message, 0, self.IS_DEBUG);
        }
    }

    /* 
    Module : Device Connection process
    Author : Mayank [SOFTWEB]
    Inputs : 
    Output : Global callback for command and other data 
    Date   : 2020-04-13
     */
    deviceConnectionProcess() {
        var self = this;
        try {
            self.clientConnection(function (clientResponse) {
                if (clientResponse.status) {
                    self.DEVICE_CONNECTED = true;
                    self.STOP_SDK_CONNECTION = true;
                    self.startCommandSubscriber(function(response){
                        if(response.status) {
                            var responseData = cache.get(self.SID + "_" + self.UNIQUE_ID);
                            if(responseData && "has" in responseData) { 
                                self.reqDataForActiveProperty(responseData.has);
                            } else { // For Azure 
                                setTimeout(() => {
                                    self.getSyncDataByCommandType(config.msgType.allStatus, function(res){
                                        // console.log("all 200 request send => ",res);
                                    });
                                }, 3000);
                            }
                        } else {
                            self.commonLib.manageDebugLog("ERR_IN17", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
                        }
                    });
                } else {
                    self.commonLib.manageDebugLog("ERR_IN13", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
                }
            })
        } catch (error) {
            self.commonLib.manageDebugLog("ERR_IN01", self.UNIQUE_ID, self.SID, error.message, 0, self.IS_DEBUG);
        }
    }

    /* 
    Module : Client Connection
    Author : Mayank [SOFTWEB]
    Inputs : uniqueId, sdk Option params
    Output : Connected brokr client object 
    Date   : 2020-04-13
     */
    clientConnection(callback) {
        var self = this;
        try {
            self.commonLib.clientConnection(function (response) {
                callback({
                    status: response.status,
                    data: response,
                    message: response.message
                })
            })
        } catch (error) {
            callback({
                status: false,
                data: error,
                message: error.message
            })
        }
    }

    /* 
      Module : Start Command subscriber
      Author : Mayank [SOFTWEB]
      Inputs : device client connection
      Output : start listner 
      Date   : 2018-01-24
      */
    startCommandSubscriber(callback) {
        var self = this;
        try {
            self.commonLib.subscriberProcess(function (response) {
                if (response.status) {
                    if(response.data.cmdReceiveType == "cmd"){
                        if(!response.data.data.d) {
                            self.manageCommand(response.data);
                        } else {
                            self.manageDeviceInfo(response.data.data);
                        }
                    }

                    if(response.data.cmdReceiveType == "twin"){
                        if(self.TWIN_CHANGED_CALLBACK)
                            self.TWIN_CHANGED_CALLBACK(response.data.data);
                    }
                }
            });
            callback({
                status: true,
                data: null,
                message: "Devie subscription started."
            })
        } catch (error) {
            self.commonLib.manageDebugLog("ERR_IN01", self.UNIQUE_ID, self.SID, error.message, 0, self.IS_DEBUG);
            callback({
                status: false,
                data: error,
                message: error.message
            })
        }
    }

    /* 
    Module : Device 
    Author : Mayank [SOFTWEB]
    Inputs : uniqueId, message from subscribed listener
    Output : Manage Command
    Date   : 2020-04-13   
    */
    manageCommand(response) {
        var self = this;
        var cmdType = response.data.ct;
        var commandData = response.data;

        switch (response.data.ct) {
            case config.commandType.CORE_COMMAND: //0 - Ok device
                self.commonLib.manageDebugLog("INFO_CM01", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                var requestedParams = undefined;
                if(self.DEVICE_CMD_CALLBACK)
                    self.DEVICE_CMD_CALLBACK(commandData);
                break;
            
            case config.commandType.FIRMWARE_UPDATE: //1 - OTA Firmware update
                self.commonLib.manageDebugLog("INFO_CM02", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                var requestedParams = undefined;
                if(self.OTA_CMD_RECEIVED_CALLBACK)
                    self.OTA_CMD_RECEIVED_CALLBACK(commandData);
                break;
            
            case config.commandType.MODULE_COMMAND: //2 - Module command 
                self.commonLib.manageDebugLog("INFO_CM06", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                var requestedParams = undefined;
                if(self.MODULE_RECEIVED_CALLBACK)
                    self.MODULE_RECEIVED_CALLBACK(commandData);
                break;

            case config.commandType.DEVICE_CONNECTION_STATUS: // 3 - Connection status true/false
                
                // console.log("Mqtt -> manageCommand -> data", commandData)
                if(commandData.command) {
                    self.DEVICE_CONNECTED = true;
                } else {
                    self.DEVICE_CONNECTED = false;
                }
                var requestedParams = undefined;
                self.commonLib.manageDebugLog("INFO_CM09", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                if(self.CONNECTION_STATUS_CALLBACK)
                    self.CONNECTION_STATUS_CALLBACK(commandData);
                break;
    
            case config.commandType.REFRESH_ATTRIBUTE: //101 - Attribute Changed
                self.commonLib.manageDebugLog("INFO_CM03", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                var requestedParams = config.attributeParams;
                break;

            case config.commandType.REFRESH_SETTING_TWIN: //102 - Setting Changed
                self.commonLib.manageDebugLog("INFO_CM04", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                var requestedParams = config.settingsParams;
                break;

            case config.commandType.REFRESH_EDGE_RULE: //103 - Rule Changed
                self.commonLib.manageDebugLog("INFO_CM07", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                var requestedParams = config.ruleParams;
                break;
                
            case config.commandType.REFRESH_CHILD_DEVICE: //104 - Device Changed
                self.commonLib.manageDebugLog("INFO_CM06", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                var requestedParams = config.deviceParams;
                break;
                
            case config.commandType.DATA_FREQUENCY_CHANGE: //105 - Data Frequency Updated
                self.commonLib.manageDebugLog("INFO_CM18", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                var deviceSyncResDf = cache.get(self.SID+"_"+self.UNIQUE_ID);
                deviceSyncResDf.meta.df = commandData.df;
                cache.put(self.SID+"_"+self.UNIQUE_ID, deviceSyncResDf);
                var requestedParams = undefined;
                break;
            
            case config.commandType.DEVICE_DELETED: //106 - Device Deleted
                self.commonLib.manageDebugLog("INFO_CM21", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                // var requestedParams = config.deviceParams;
                break;
            
            case config.commandType.DEVICE_DISABLED: //107 - Device Disabled
                self.commonLib.manageDebugLog("INFO_CM22", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                var requestedParams = config.deviceParams;
                break;
            
            case config.commandType.DEVICE_RELEASED: //108 - Device Released
                self.commonLib.manageDebugLog("INFO_CM23", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                // var requestedParams = config.deviceParams;
                break;
                
            case config.commandType.STOP_OPERATION: //109 - STOP SDK CONNECTION
                self.commonLib.manageDebugLog("INFO_CM08", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                self.disconnect(config.commandType.STOP_OPERATION);
                var requestedParams = undefined;
                break;
        
            case config.commandType.START_HEARTBEAT_DEVICE: //110 - Heartbeat Start
                self.commonLib.manageDebugLog("INFO_CM24", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                // var requestedParams = undefined;
                var deviceSyncResDf = cache.get(self.SID+"_"+self.UNIQUE_ID);
                deviceSyncResDf.meta["hbf"] = commandData.f;
                self.commonLib.heartBeatProcess(deviceSyncResDf.meta["hbf"], "START");
                cache.put(self.SID+"_"+self.UNIQUE_ID, deviceSyncResDf);
                break;

            case config.commandType.STOP_HEARTBEAT_DEVICE: //111 - Heartbeat Stop
                self.commonLib.manageDebugLog("INFO_CM25", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                var deviceSyncResDf = cache.get(self.SID+"_"+self.UNIQUE_ID);
                deviceSyncResDf.meta["hbf"] = null;
                self.commonLib.heartBeatProcess(deviceSyncResDf.meta["hbf"], "STOP");
                cache.put(self.SID+"_"+self.UNIQUE_ID, deviceSyncResDf);
                var requestedParams = undefined;
                break;
                
            default:
                break;
        }

        if (requestedParams != "" && requestedParams != undefined) {
            self.commonLib.syncDeviceOnDemand(requestedParams, cmdType, function (response) {
                if (cmdType == config.commandType.PASSWORD_INFO_UPDATE) {
                    setTimeout(() => {
                        self.deviceConnectionProcess()
                    }, 3000);
                } else {
                    self.startEdgeDeviceProcess(requestedParams);
                }
            });
        }
    }

    /* 
    Module : Device 
    Author : Mayank [SOFTWEB]
    Inputs : uniqueId, device data
    Output : Manage Device information
    Date   : 2020-05-04  
    */
   manageDeviceInfo(response) {
        // console.log("Mqtt -> ********************** -> response", JSON.stringify(response))
        var self = this;
        var ctStatus = response.d.ct;
        var cacheId = self.SID+"_"+self.UNIQUE_ID;

        switch (ctStatus) {
            case config.msgType.allStatus: //200 - All data
                if (response.d.ec == 0 && response.d.ct == config.msgType.allStatus) {  
                    response.d["id"] = self.UNIQUE_ID;
                    response.d["sid"] = self.SID;
                    if(response.d.meta && response.d.meta.edge == true) {
                        self.SDK_OPTIONS.isEdgeDevice = true;
                    }
                    if(response.d.meta && response.d.meta.gtw != null){
                        response.d["d"] = [ { "tg": response.d.meta.gtw.tg, "id": self.UNIQUE_ID, "s": 0 } ]
                        // console.log(" In => ", response);
                        self.SDK_OPTIONS.isGatewayDevice = true;
                    } else {
                        response.d["d"] = [ { "id": self.UNIQUE_ID, "s": 0 } ]
                        self.SDK_OPTIONS.isGatewayDevice = false;
                        // console.log(" Out => ", response);
                    }
                    // if(deviceSyncRes.p && self.SDK_OPTIONS.SDK_TYPE == "MQTT")
                    //     pubTopic = deviceSyncRes.p.topics.di;
                    var cacheData = cache.get(cacheId); 
                    if(cacheData) {
                        cacheData.meta = response.d.meta;
                        cacheData['d'] = response.d["d"];
                        if(self.SDK_OPTIONS.SDK_TYPE == "MQTT") {
                            var authType = cacheData.meta.at;
                            cacheData.meta['at'] = authType;
                        }
                        cacheData.has = response.d.has;
                        cache.put(cacheId, cacheData);
                    } else {
                        cache.put(cacheId, response.d);
                    }

                    self.reqDataForActiveProperty(response.d.has);
                    self.attributeChangedCallbackProcess("d");
                    self.commonLib.manageDebugLog("INFO_CM11", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                }
            break;
        
            case config.msgType.attribute: //201 - attribute
            if (response.d.ec == 0  && response.d.ct == config.msgType.attribute) {  
                    var deviceData = cache.get(cacheId);
                    // console.log("Mqtt -> manageDeviceInfo -> deviceData", JSON.stringify(response.d['att']) )
                    // console.log("Mqtt -> manageDeviceInfo -> self.SDK_OPTIONS.isEdgeDevice ", self.SDK_OPTIONS.isEdgeDevice)
                    deviceData["att"] = response.d['att'];
                    cache.put(cacheId, deviceData);
                    self.commonLib.manageDebugLog("INFO_CM12", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                    if(self.SDK_OPTIONS.isEdgeDevice)
                        self.checkForEdgeDeviceConfigurationProcess("attr");
                    self.attributeChangedCallbackProcess("attr");
                }
                break;

            case config.msgType.setting: //202 - setting
                if (response.d.ec == 0  && response.d.ct == config.msgType.setting) {  
                    var deviceData = cache.get(cacheId);
                    deviceData["set"] = response.d['set'];
                    cache.put(cacheId, deviceData);
                    self.commonLib.manageDebugLog("INFO_CM13", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                }
                break;
        
            case config.msgType.rule: //203 - rule
                if (response.d.ec == 0  && response.d.ct == config.msgType.rule) {  
                    var deviceData = cache.get(cacheId);
                    // console.log("Mqtt -> manageDeviceInfo -> response.d['r']", JSON.stringify(response.d['r']) )
                    deviceData["r"] = response.d['r'];
                    cache.put(cacheId, deviceData);
                    self.commonLib.manageDebugLog("INFO_CM14", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                    // console.log("Mqtt -> manageDeviceInfo -> response.d['r']", response.d['r'])
                    if(self.SDK_OPTIONS.isEdgeDevice)
                        self.checkForEdgeDeviceConfigurationProcess("r");
                }
                break;
        
            case config.msgType.childDevice: //204 - childDevice
                if (response.d.ec == 0 && response.d.ct == config.msgType.childDevice) {  
                    var deviceData = cache.get(cacheId);
                    var devices = response.d['d'];
                    if(self.SDK_OPTIONS.isGatewayDevice){
                        var gatewayDevice = [ { "tg": deviceData.meta.gtw.tg, "id": self.UNIQUE_ID } ];
                        var result = _.unionWith(gatewayDevice, devices,  _.isEqual);
                        deviceData["d"] = result;
                        if(self.SDK_OPTIONS.isEdgeDevice)
                            self.checkForEdgeDeviceConfigurationProcess("d"); 
                        self.attributeChangedCallbackProcess("d");
                    } else {
                        deviceData["d"] = response.d['d'];
                    }
                    cache.put(cacheId, deviceData);
                    self.commonLib.manageDebugLog("INFO_CM15", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                }
                break;
            
            case config.msgType.ota: //205 - ota
                if (response.d.ec == 0 && response.d.ct == config.msgType.ota) {  
                    var deviceData = cache.get(cacheId);
                    deviceData["ota"] = response.d['ota'];
                    cache.put(cacheId, deviceData);
                }
            break;

            case config.msgType.all: //210 - All data
                if (response.d.ec == 0 && response.d.ct == config.msgType.all) {  
                    response.d["id"] = uniqueId;
                    response.d["cpId"] = self.SID;
                    // self.startEdgeDeviceProcess();
                    self.commonLib.manageDebugLog("INFO_CM11", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                    if(response.d.meta && response.d.meta.edge == true) {
                        self.SDK_OPTIONS.isEdgeDevice = true;
                    }
                    if(response.d.meta && response.d.meta.gtw){
                        response.d["d"] = [ { "tg": response.d.meta.gtw.tg, "id": self.UNIQUE_ID, "s": 0 } ]
                        self.SDK_OPTIONS.isGatewayDevice = true;
                    } else {
                        response.d["d"] = [ { "id": self.UNIQUE_ID, "s": 0 } ]
                        self.SDK_OPTIONS.isGatewayDevice = false;
                    }
                    cache.put(cacheId, response.d);
                    // console.log("======= > ", cache.get(cacheId));
                    // this.reqDataForActiveProperty(response.d.has);
                    // self.startEdgeDeviceProcess();
                    self.attributeChangedCallbackProcess("d");
                    self.attributeChangedCallbackProcess("r");
                    self.attributeChangedCallbackProcess("att");
                    if(self.SDK_OPTIONS.isEdgeDevice) {
                        self.checkForEdgeDeviceConfigurationProcess("d"); 
                        self.checkForEdgeDeviceConfigurationProcess("att"); 
                        self.checkForEdgeDeviceConfigurationProcess("r"); 
                    }
                }
            break;

            case config.msgType.createChildDevice : //221 - Create child device response
                if (response.d.ec == 0 && response.d.ct == config.msgType.createChildDevice) {  
                    // response.d["id"] = uniqueId;
                    // response.d["cpId"] = self.SID;
                    // cache.put(cacheId, response.d);
                    // self.startEdgeDeviceProcess();
                    self.commonLib.manageDebugLog("INFO_CM19", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                }
            break;

            case config.msgType.deleteChildDevice : //222 - Create child device response
                if (response.d.ec == 0 && response.d.ct == config.msgType.deleteChildDevice) {  
                    // response.d["id"] = uniqueId;
                    // response.d["cpId"] = self.SID;
                    // cache.put(cacheId, response.d);
                    // self.startEdgeDeviceProcess();
                    self.commonLib.manageDebugLog("INFO_CM20", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                }
            break;

            default: // unknown command
                break;
        }
    }


    /* 
    Module : Device 
    Author : Mayank [SOFTWEB]
    Inputs : 
    Output : Edge devie processing
    Date   : 2020-04-14
     */
    startEdgeDeviceProcess(requestedParams = "") {
        var self = this;
        var responseData = cache.get(self.SID + "_" + self.UNIQUE_ID);
        if (responseData.meta.edge == config.edgeEnableStatus.enabled) {
            async.series([
                function (cb_series) {
                    try {
                        self.commonLib.setEdgeConfiguration(responseData.att, responseData.d, function (res) {
                            if (res.status) {
                                responseData.edgeData = res.data.mainObj;
                                if ((requestedParams && requestedParams.attribute) || requestedParams == "") {
                                    async.forEachSeries(res.data.intObj, function (data, cb_inner) {
                                        self.commonLib.setIntervalForEdgeDevice(data.tumblingWindowTime, data.lastChar, data.edgeAttributeKey, data.uniqueId, data.attrTag, data.devices);
                                        cb_inner();
                                    }, function () {});
                                }
                            } 
                            cb_series();
                        });
                    } catch (err) {
                        cb_series();
                    }
                },
                function (cb_series) {
                    try {
                        // console.log("responseData.r ==> ", responseData.r);
                        setTimeout(() => {
                            self.commonLib.setRuleaConfiguration(responseData.r, self.UNIQUE_ID, function (res) {
                                if (res.status) {
                                    responseData.rulesData = res.data;
                                } else {
                                    self.commonLib.manageDebugLog("ERR_IN01", self.UNIQUE_ID, self.SID, res.message, 0, self.IS_DEBUG);
                                }
                                cb_series();
                            });
                        }, 500);
                    } catch (err) {
                        cb_series();
                    }
                }
            ], function (err, response) { })
        }
    }

    /*
      Module : Device 
      Author : Mayank [SOFTWEB]
      Inputs : uniqueId (Device serial number)
      Output : Device detail with all attributes
      Date   : 2018-01-24
    */
    sendData(data) {
        var self = this;
        if (data != "" && data.length > 0 && typeof data == 'object') {
            try {
                // var dateTimeArray = data.filter(date => {
                //     if (self.checkDateObjFormat(date.time)) {
                //         return true;
                //     } else {
                //         return true;
                //     }
                // });
                //dateTimeArray.length == data.length
                    if (self.STOP_SDK_CONNECTION && self.UNIQUE_ID == data[0].uniqueId) {
                    self.commonLib.SendDataToHub(data, function (response) {
                        if (response.status) {}
                    })
                } else {
                    if (self.UNIQUE_ID != data[0].uniqueId) {
                        self.commonLib.manageDebugLog("ERR_SD02", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
                    }
                    // if (dateTimeArray.length != data.length) {
                    //     self.commonLib.manageDebugLog("ERR_SD03", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
                    // }
                    if (self.STOP_SDK_CONNECTION == false) {
                        self.commonLib.manageDebugLog("ERR_SD04", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
                    }
                }
            } catch (err) {
                console.log(" err => ", err);
                self.commonLib.manageDebugLog("ERR_SD01", self.UNIQUE_ID, self.SID, err.message, 0, self.IS_DEBUG);
            }
        } else {
            if (!data) {
                self.commonLib.manageDebugLog("ERR_SD06", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
            }
            if (typeof data != 'object') {
                self.commonLib.manageDebugLog("ERR_SD05", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
            }
        }
    }

    /*
      Module : Device 
      Author : Mayank [SOFTWEB]
      Inputs : 
      Output : Device detail with all atrributes
      Date   : 2018-04-06
    */
    getAttributes(callback) {
        var self = this;
        try {
            self.commonLib.getAttributes(function (response) {
                
                // console.log("Az -> getAttributes -> response.status", JSON.stringify(response) )
                if (response.status) {
                    var sdkDataArray = [];
                    async.forEachSeries(response.data.device, function (device, callbackdev) {
                        var attArray = {
                            "device": {
                                "id": device.id,
                                "tg": device.tg == "" ? undefined : device.tg
                            },
                            "attributes": []
                        }
                        var attributeData = response.data.attribute;
                        async.forEachSeries(attributeData, function (attrib, callbackatt) {
                            if (attrib.p == "") // Parent
                            {
                                async.forEachSeries(attrib.d, function (att, cb_attr) {
                                    if(self.SDK_OPTIONS.isGatewayDevice) {
                                        if (att.tg == device.tg)
                                        {
                                            delete att.tg;
                                            delete att.agt;
                                            att.dt = dataTypeToString(att.dt)
                                            attArray['attributes'].push(att);
                                        }
                                    } else {
                                        if(att.agt)
                                            delete att.agt
                                        att.dt = dataTypeToString(att.dt)
                                        attArray['attributes'].push(att);
                                    }
                                    cb_attr();
                                }, function () {
                                    callbackatt();
                                })
                            } else { // Parent-child
                                if(self.SDK_OPTIONS.isGatewayDevice) {
                                    if (attrib.tg == device.tg)
                                    {
                                        if (attrib.p != "") {
                                            delete attrib.agt;
                                            var pcAttributes = {
                                                "ln": attrib.p,
                                                "dt": dataTypeToString(attrib.dt),
                                                "tg": attrib.tg == "" ? undefined : attrib.tg,
                                                "tw": attrib.tw == "" ? undefined : attrib.tw,
                                                "d": []
                                            };
                                        }
                                        async.forEachSeries(attrib.d, function (att, cb_attr) {
                                            if (att.tg == device.tg) // Parent
                                            {
                                                var cAttribute = {
                                                    "ln": att.ln,
                                                    "dt": dataTypeToString(att.dt),
                                                    "dv": att.dv,
                                                    "tg": att.tg == "" ? undefined : att.tg,
                                                    "tw": att.tw == "" ? undefined : att.tw
                                                }
                                                pcAttributes.d.push(cAttribute)
                                            }
                                            cb_attr();
                                        }, function () {
                                            attArray['attributes'].push(pcAttributes)
                                            callbackatt();
                                        })
                                    } else {
                                        callbackatt();
                                    }
                                } else {
                                    if (attrib.p != "") {
                                        delete attrib.agt;
                                        var pcAttributes = {
                                            "ln": attrib.p,
                                            "dt": dataTypeToString(attrib.dt),
                                            "tw": attrib.tw == "" ? undefined : attrib.tw,
                                            "d": []
                                        };
                                    }
                                    async.forEachSeries(attrib.d, function (att, cb_attr) {
                                        var cAttribute = {
                                            "ln": att.ln,
                                            "dt": dataTypeToString(att.dt),
                                            "dv": att.dv,
                                            "tw": att.tw == "" ? undefined : att.tw
                                        }
                                        pcAttributes.d.push(cAttribute)
                                        cb_attr();
                                    }, function () {
                                        attArray['attributes'].push(pcAttributes)
                                        callbackatt();
                                    })
                                }
                            }
                        }, function () {
                            sdkDataArray.push(attArray);
                            callbackdev();
                        })
                    }, function () {
                        self.commonLib.manageDebugLog("INFO_GA01", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                        callback({
                            status: true,
                            data: sdkDataArray,
                            message: "Attribute get successfully."
                        });
                    })
                } else {
                    self.commonLib.manageDebugLog("ERR_GA02", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
                    callback({
                        status: false,
                        data: null,
                        message: "Attributes data not found"
                    });
                }
            })
        } catch (err) {
            console.log(err)
            self.commonLib.manageDebugLog("ERR_GA01", self.UNIQUE_ID, self.SID, err.message, 0, self.IS_DEBUG);
            callback({
                status: false,
                data: err,
                message: err.message
            });
        }
    }

    /*
      Module : Device 
      Author : Mayank [SOFTWEB]
      Inputs : Key, Value
      Output : Device list
      Date   : 2019-06-11
    */
    updateTwin(key, value) {
        var self = this;
        try {
            if (self.STOP_SDK_CONNECTION == true && key && (value || value === null)) {
                var obj = {};
                obj[key] = value;
                obj['sid'] = self.SID;
                self.commonLib.UpdateTwin(obj, function (response) {
                    if (response.status) {
                        self.commonLib.manageDebugLog("INFO_TP01", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                    } else {
                        self.commonLib.manageDebugLog("ERR_TP01", self.UNIQUE_ID, self.SID, response.message, 0, self.IS_DEBUG);
                    }
                })
            } else {
                if (self.STOP_SDK_CONNECTION == false) {
                    self.commonLib.manageDebugLog("ERR_TP02", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
                }
                if (!key || !value) {
                    self.commonLib.manageDebugLog("ERR_TP03", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
                }
            }
        } catch (err) {
            self.commonLib.manageDebugLog("ERR_TP01", self.UNIQUE_ID, self.SID, err.message, 0, self.IS_DEBUG);
        }
    }


    /* 
    Module : Device disconnect 
    Author : Mayank [SOFTWEB]
    Inputs : uniqueID, client connection
    Output : device disconnected message
    Date   : 2019-06-11
    */
    disconnect(hardStopCmd = "") {
        var self = this;
        try {
            console.log("self.DEVICE_CONNECTED => ", self.DEVICE_CONNECTED);
            if (self.DEVICE_CONNECTED) {
                self.commonLib.disconnectDevice(function (response) {
                    if(response.status){
                        self.DEVICE_CONNECTED = false;
                        if(hardStopCmd){
                            self.STOP_SDK_CONNECTION = false;
                            self.commonLib.deleteAllLogFile(self.LOG_PATH);
                        } 
                    }
                })
            } else {
                if (self.DEVICE_CONNECTED == false) {
                    self.commonLib.manageDebugLog("INFO_DC01", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                } else {
                    self.commonLib.manageDebugLog("ERR_DC02", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
                }
            }
        } catch (error) {
            self.commonLib.manageDebugLog("ERR_DC01", self.UNIQUE_ID, self.SID, error.message, 0, self.IS_DEBUG);
        }
    }

    /* 
    Module : Send command ack 
    Author : Mayank [SOFTWEB]
    Inputs : data, time and message type 
    Output : message
    Date   : 2020-03-11
     */
    sendAck(objdata, mt) {
        var self = this;
        try {
            if (this.STOP_SDK_CONNECTION == true && objdata && typeof objdata == 'object' && mt) {
                self.commonLib.sendCommandAck(objdata, mt, function (response) {
                    self.commonLib.manageDebugLog("INFO_CM10", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                })
            } else {
                if (self.STOP_SDK_CONNECTION == false) {
                    self.commonLib.manageDebugLog("ERR_CM04", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
                }
                if (!objdata || !mt) {
                    self.commonLib.manageDebugLog("ERR_CM02", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
                } else {
                    if (typeof objdata != "object") {
                        self.commonLib.manageDebugLog("ERR_CM03", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
                    }
                }
            }
        } catch (error) {
            self.commonLib.manageDebugLog("ERR_CM01", self.UNIQUE_ID, self.SID, error.message, 0, self.IS_DEBUG);
        }
    }

    /* 
      Module : get all twins properties 
      Author : Mayank [SOFTWEB]
      Inputs :  
      Output : publish message
      Date   : 2020-04-20
       */
    getAllTwins() {
        var self = this;
        try {
            if (this.STOP_SDK_CONNECTION == true && self.DEVICE_CONNECTED == true ) {
                self.commonLib.getAllTwins(function (response) {
                    self.commonLib.manageDebugLog("INFO_TP02", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                })
            } else {
                self.commonLib.manageDebugLog("ERR_TP04", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
            }
        } catch (error) {
            self.commonLib.manageDebugLog("ERR_TP01", self.UNIQUE_ID, self.SID, err.message, 0, self.IS_DEBUG);
        }
    }

    async checkDateObjFormat(dateObj) {
        if (Object.prototype.toString.call(dateObj) === "[object Date]") {
            if (isNaN(dateObj.getTime())) {
                return false;
            } else {
                return true;
            }
        } else {
            return false;
        }
    }

    async setConnectionStatusChangedCallback(callback) {
        var self = this;
        if(typeof callback == "function"){
            self.CONNECTION_STATUS_CALLBACK = callback;
        } else {
            self.commonLib.manageDebugLog("ERR_CM05", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
        }
    }
    
    async setTwinChangedCallback(callback) {
        var self = this;
        if(typeof callback == "function"){
            self.TWIN_CHANGED_CALLBACK = callback;
        } else {
            self.commonLib.manageDebugLog("ERR_CM06", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
        }
    }

    async setDeviceCommandCallback(callback) {
        var self = this;
        if(typeof callback == "function"){
            self.DEVICE_CMD_CALLBACK = callback;
        } else {
            self.commonLib.manageDebugLog("ERR_CM07", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
            
        }
    }

    async setOTAReceivedCallback(callback) {
        var self = this;
        if(typeof callback == "function"){
            self.OTA_CMD_RECEIVED_CALLBACK = callback;
        } else {
            self.commonLib.manageDebugLog("ERR_CM08", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
        }
    }

    async setAttributeChangedCallback(callback) {
        var self = this;
        if(typeof callback == "function"){
            self.ATTRIBUTE_CHANGED_CALLBACK = callback;
        } else {
            self.commonLib.manageDebugLog("ERR_CM09", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
        }
    }

    async setDeviceChangedCallback(callback) {
        var self = this;
        if(typeof callback == "function"){
            self.DEVICE_CHANGED_CALLBACK = callback;
        } else {
            self.commonLib.manageDebugLog("ERR_CM10", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
        }
    }

    async setModuleReceivedCallback(callback) {
        var self = this;
        if(typeof callback == "function"){
            self.MODULE_RECEIVED_CALLBACK = callback;
        } else {
            self.commonLib.manageDebugLog("ERR_CM11", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
        }
    }


    /*
      Module : Device 
      Author : Mayank [SOFTWEB]
      Inputs : deviceId, deviceTag, displayName
      Output : Create Device
      Date   : 2021-09-13
    */
    async createChildDevice(deviceId, deviceTag, displayName, callback) {
        var self = this;
        try {
            self.commonLib.createChildDevice(deviceId, deviceTag, displayName, function (response) {
                callback(response)
            });
        } catch (err) {
            callback({
                status: false,
                data: null,
                message: err.message
            })
        }
    }

    /*
    Module : Device 
    Author : Mayank [SOFTWEB]
    Inputs : deviceId, deviceTag, displayName
    Output : Delete Device
    Date   : 2021-09-13
    */
    async deleteChildDevice(deviceId, callback) {
        var self = this;
        try {
            self.commonLib.deleteChildDevice(deviceId, function (response) {
                callback(response)
            });
        } catch (err) {
            callback({
                status: false,
                data: null,
                message: err.message
            })
        }
    }

    /* 
    Module : Device 
    Author : Mayank [SOFTWEB]
    Inputs : item key reference attr, d, r
    Output : Call edge configuration after all required process done
    Date   : 2020-09-03  
    */
    checkForEdgeDeviceConfigurationProcess(item){
        console.log("====> Mqtt -> item -> ", item)
        var self = this;
        var deviceData = cache.get(self.SID+"_"+self.UNIQUE_ID);
        var hasItems = _.cloneDeep(deviceData.has);

        delete hasItems.ota;
        delete hasItems.set;
        if(!self.SDK_OPTIONS.isGatewayDevice)
            delete hasItems.d;

        var tempArray = [];
        _.filter(hasItems, function (o, index) {
            if (o == true) {
                tempArray.push(index)
            }
        });
        var hasCount = 0;

        if(tempArray.length > 0) {
            hasCount = tempArray.length;
            async.forEachSeries(tempArray, function (data, cb) {
                if(item == data) {
                    self.HAS_ACTIVE_COUNT++;
                }
                cb();
            }, function () {
                if(hasCount == self.HAS_ACTIVE_COUNT){
                    self.HAS_ACTIVE_COUNT = 0;
                    self.startEdgeDeviceProcess();  
                }
            });
        }
    }

    /* 
    Module : Attribute 
    Author : Mayank [SOFTWEB]
    Inputs : item key reference attr, d, r
    Output : Call attribute changed callback after all required process done
    Date   : 2020-09-03  
    */
    attributeChangedCallbackProcess(item){
        var self = this;
        var deviceData = cache.get(self.SID+"_"+self.UNIQUE_ID);
        var hasItems = _.cloneDeep(deviceData.has);
        // console.log("Az -> attributeChangedCallbackProcess -> hasItems", hasItems)
        if(hasItems) {
            delete hasItems.ota;
            delete hasItems.set;
            delete hasItems.r;
    
            var tempArray = [];
            _.filter(hasItems, function (o, index) {
                if (o == true) {
                    tempArray.push(index)
                }
            });
            var hasCount = 0;
    
            if(tempArray.length > 0) {
                hasCount = tempArray.length;
                async.forEachSeries(tempArray, function (data, cb) {
                    if(item == data) {
                        self.HAS_ACTIVE_COUNT_ATTRIBUTE_CHANGES++;
                    }
                    cb();
                }, function () {
                    if(hasCount == self.HAS_ACTIVE_COUNT_ATTRIBUTE_CHANGES){
                        if(self.ATTRIBUTE_CHANGED_CALLBACK){
                            self.HAS_ACTIVE_COUNT_ATTRIBUTE_CHANGES = 0;
                            self.ATTRIBUTE_CHANGED_CALLBACK(deviceData.att);
                        }
                    }
                });
            }
        }
    }
}

function dataTypeToString(value) {
    switch (value) {
        case config.dataType.NON_OBJ: 	// 0 NON_OBJ
            return "NON_OBJ";
        case config.dataType.INTEGER:	// 1 INTEGER
            return "INTEGER";
        case config.dataType.LONG:		// 2 LONG
            return "LONG";
        case config.dataType.DECIMAL:	// 3 DECIMAL
            return "DECIMAL";
        case config.dataType.STRING:	// 4 STRING
            return "STRING";
        case config.dataType.TIME:		// 5 TIME
            return "TIME";
        case config.dataType.DATE:		// 6 DATE
            return "DATE";
        case config.dataType.DATETIME:	// 7 DATETIME
            return "DATETIME";
        case config.dataType.BIT:		// 8 BIT
            return "BIT";
        case config.dataType.BOOLEAN:	// 9 BOOLEAN
            return "BOOLEAN";
        case config.dataType.LATLONG: 	// 10 LATLONG
            return "LATLONG";
        case config.dataType.OBJECT: 	// 11 OBJECT
            return "OBJECT";
    }
}

function generateSasToken(resourceUri, signingKey, policyName, expiresInMins, callback) {
    resourceUri = encodeURIComponent(resourceUri);

    // Set expiration in seconds
    var expires = (Date.now() / 1000) + expiresInMins * 60;
    expires = Math.ceil(expires);
    var toSign = resourceUri + '\n' + expires;

    // Use crypto
    var hmac = crypto.createHmac('sha256', Buffer.from(signingKey, 'base64'));
    hmac.update(toSign);
    var base64UriEncoded = encodeURIComponent(hmac.digest('base64'));

    // Construct authorization string
    var token = "SharedAccessSignature sr=" + resourceUri + "&sig="
    + base64UriEncoded + "&se=" + expires;
    if (policyName) token += "&skn="+policyName;
    
    callback(token);
};

module.exports = Az;