var cache = require('memory-cache');
var config = require('./../config/config');
var fs = require('fs-extra');
var async = require('async');
var _ = require('lodash');
var crypto = require('crypto');
var CommonFunctions = require("./../common/common");

class Mqtt {
    constructor(uniqueId, sId, sdkOptions = "", callback) {
        this.commonLib = "";
        this.UNIQUE_ID = uniqueId;
        this.SID = sId;
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
        this.RULE_CHANGED_CALLBACK = "";
        let sdkOpt = {};
        this.initCallback = callback;
        sdkOpt['SDK_TYPE'] = "MQTT";

        if(sdkOptions && 'skipValidation' in sdkOptions) {
            this.SKIP_VALIDATION = sdkOptions.skipValidation;
        } else {
            this.SKIP_VALIDATION = false; 
        }
        sdkOpt['isSkipValidation'] = this.SKIP_VALIDATION;

        if(sdkOptions && 'keepalive' in sdkOptions) {
            this.KEEP_ALIVE = typeof sdkOptions.keepalive == "integer" ? sdkOptions.keepalive : "";
        } else {
            this.KEEP_ALIVE = ""; 
        }
        sdkOpt['keepAliveTime'] = this.KEEP_ALIVE;

        if (sdkOptions && 'debug' in sdkOptions) {
            this.IS_DEBUG = sdkOptions.debug;
        } else {
            this.IS_DEBUG = false; // for Local testing true else false
        }
        sdkOpt['isDebug'] = this.IS_DEBUG;

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
                "disabled": (!sdkOptions.offlineStorage.disabled) ? false : sdkOptions.offlineStorage.disabled, //in MB deafault is FALSE 
                "availSpaceInMb": (!sdkOptions.offlineStorage.availSpaceInMb) ? 0 : sdkOptions.offlineStorage.availSpaceInMb, //in MB deafault is unlimited MB
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
        this.LOG_PATH = "./logs/offline/" + (sId ||  sdkOptions.cpId) + "_" + uniqueId + "/";
        sdkOpt['logPath'] = this.LOG_PATH;
        sdkOpt['cpId'] = sdkOptions.cpId;
        sdkOpt['env'] = sdkOptions.env;
        sdkOpt['pf'] = sdkOptions.pf;

        this.commonLib = new CommonFunctions(sId, uniqueId, sdkOpt);
        if (!sId) {
            this.commonLib.manageDebugLog("ERR_IN04", this.UNIQUE_ID, this.SID, "", 0, this.IS_DEBUG);
        }
        if (!uniqueId) {
            this.commonLib.manageDebugLog("ERR_IN05", this.UNIQUE_ID, this.SID, "", 0, this.IS_DEBUG);
        }

        if (sdkOptions && 'discoveryURL' in sdkOptions && this.commonLib) {
            if (sdkOptions.discoveryURL != "" && sdkOptions.discoveryURL != undefined && sdkOptions.discoveryURL != null) {
                this.DISCOVERY_URL = sdkOptions.discoveryURL;
                if (this.DISCOVERY_URL.charAt(this.DISCOVERY_URL.length - 1) == "/") {
                    this.DISCOVERY_URL = this.DISCOVERY_URL.substring(0, this.DISCOVERY_URL.length - 1);
                }
                sdkOpt['discoveryUrl'] = this.DISCOVERY_URL;
            } else {
                sdkOpt['discoveryUrl'] = config.discoveryUrlHost;
                this.DISCOVERY_URL = config.discoveryUrlHost;
            }
        } else {
            sdkOpt['discoveryUrl'] = config.discoveryUrlHost;
            this.DISCOVERY_URL = config.discoveryUrlHost;
        }
        this.SDK_OPTIONS = sdkOpt;

        if ((sId || sdkOpt.cpId) && uniqueId && !sdkOpt.offlineStorage.offlineProcessDisabled) {
            var self = this;
            this.createPredefinedLogDirectories();
            this.init(function (response) {
                callback(response)
            })
        }
    }

    /* 
    Object : Create necessary file and directory to store the offline data and log details
    Author : Mayank [SOFTWEB]
    Inputs : 
    Output : 
    Date   : 2019-01-24
     */
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
    Object : Init Call
    Author : Mayank [SOFTWEB]
    Inputs : sId, uniqueId, sdkOption params
    Output : Connected brokr client object 
    Date   : 2018-01-24
     */
    async init(callback) {
        var self = this;
        var sId = self.SID || self.SDK_OPTIONS.cpId;
        var uniqueId = self.UNIQUE_ID;
        if (sId && uniqueId) {
            var sId = sId;
            var uniqueId = uniqueId;
            var LOG_PATH = self.LOG_PATH;
            try {
                var syncData = "";
                self.commonLib.manageDebugLog("INFO_IN04", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                self.syncDevice(function (response) {
                    // console.log("==== 200 command ======", JSON.stringify(response,null,2));
                    syncData = response;
                    if (response) {

                        if (response.data.ec == config.responseCode.OK && response.data.ct == config.msgType.allStatus && response.status) {
                            response.data["id"] = self.UNIQUE_ID;
                            response.data["sid"] = self.SID;
                            if (response.data.meta && response.data.meta.edge == true) {
                                self.SDK_OPTIONS.isEdgeDevice = true;
                            }
                            if (response.data.meta && response.data.meta.gtw != null) {
                                response.data["d"] = [{
                                    "tg": response.data.meta.gtw.tg,
                                    "id": self.UNIQUE_ID,
                                    "s": 0
                                }]
                                self.SDK_OPTIONS.isGatewayDevice = true;
                            } else {                                        
                                response.data["d"] = [{
                                    "id": self.UNIQUE_ID,
                                    "s": 0
                                }]
                                self.SDK_OPTIONS.isGatewayDevice = false;
                            }
                            cache.put(self.SID + "_" + self.UNIQUE_ID, response.data);

                            self.commonLib.manageDebugLog("INFO_CM11", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                            //console.log("Mqtt -> init -> response.data.meta.at", response.data.meta.at)
                            if ((response.data.meta.at == config.authType.CA_SIGNED || response.data.meta.at == config.authType.CA_SELF_SIGNED || response.data.meta.at == config.authType.CA_INDIVIDUAL) && self.CERT_PATH_FLAG == false) {
                                self.commonLib.manageDebugLog("ERR_IN06", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG)
                                //process.exit();
                            }
                            self.DEVICE_CONNECTED = false;
                            async.series([
                                function (cbSeriesIn) {
                                    if (!self.offlineFileConfig.offlineProcessDisabled) {
                                        try {
                                            if (!fs.existsSync(LOG_PATH)) {
                                                fs.mkdirSync(LOG_PATH);
                                            }
                                            cbSeriesIn();
                                        } catch (error) {
                                            self.commonLib.manageDebugLog("ERR_IN07", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
                                            self.commonLib.manageDebugLog("ERR_IN01", self.UNIQUE_ID, self.SID, error.message, 0, self.IS_DEBUG);
                                            cbSeriesIn();
                                        }
                                    } else {
                                        cbSeriesIn();
                                    }
                                }
                            ],
                            function (err, results) {
                                callback({
                                    status: response.status,
                                    data: null,
                                    message: response.message
                                })
                            });
                        } else {
                            var message = "";
                            switch (response.data.ec) {
                                case config.responseCode.DEVICE_NOT_FOUND: // 1 - Device Not Found
                                    self.commonLib.manageDebugLog("INFO_IN09", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                                    self.reCheckForSyncTheDevice();
                                    var message = config.infoLog.INFO_IN09;
                                    break;
                                
                                case config.responseCode.DEVICE_INACTIVE: // 2 - Device InActive
                                    self.commonLib.manageDebugLog("INFO_IN10", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                                    self.reCheckForSyncTheDevice();
                                    var message = config.infoLog.INFO_IN10;
                                    break;
                                
                                case config.responseCode.UN_ASSOCIATED_DEVICE: // 3 - Un associate device
                                    self.commonLib.manageDebugLog("INFO_IN11", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                                    self.reCheckForSyncTheDevice();
                                    var message = config.infoLog.INFO_IN11;
                                    break;

                                case config.responseCode.DEVICE_NOT_ACQUIRED: // 4 - Device not acquired
                                    self.commonLib.manageDebugLog("INFO_IN12", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                                    self.reCheckForSyncTheDevice();
                                    var message = config.infoLog.INFO_IN12;
                                    break;

                                case config.responseCode.DEVICE_DISABLED: // 5 - Device disabled
                                    self.commonLib.manageDebugLog("INFO_IN13", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                                    self.reCheckForSyncTheDevice();
                                    var message = config.infoLog.INFO_IN13;
                                    break;

                                case config.responseCode.COMPANY_NOT_FOUND: // 6 - Company not found
                                    self.commonLib.manageDebugLog("INFO_IN14", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                                    var message = config.infoLog.INFO_IN14;
                                    process.exit();
                                    break;

                                case config.responseCode.SUBSCRIPTION_HAS_EXPIRED: // 7 - Subscription has expired
                                    self.commonLib.manageDebugLog("INFO_IN21", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                                    self.reCheckForSyncTheDevice();
                                    var message = config.infoLog.INFO_IN21;
                                    break;

                                case config.responseCode.CONNECTION_NOT_ALLOWED: // 8 - Connection not allowed
                                    self.commonLib.manageDebugLog("INFO_IN22", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                                    self.reCheckForSyncTheDevice();
                                    var message = config.infoLog.INFO_IN22;
                                    break;

                                default:
                                    self.commonLib.manageDebugLog("INFO_IN15", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                                    var message = config.infoLog.INFO_IN15;
                                    break;
                            }
                            callback({
                                status: false,
                                data: [],
                                message: message
                            })
                        }
                    } else {
                        callback({
                            status: false,
                            data: response.data,
                            message: response.message
                        })
                    }
                })
            } catch (err) {
                self.commonLib.manageDebugLog("ERR_IN01", self.UNIQUE_ID, self.SID, err.message, 0, self.IS_DEBUG);
                callback({
                    status: false,
                    data: err.message,
                    message: config.errorLog.ERR_GM01
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
    Object : Common function for auto retry to connect the device 
    Author : Mayank [SOFTWEB]
    Inputs : 
    Output : Devie info 
    Date   : 2020-01-06
    */
    async reCheckForSyncTheDevice() {
        var self = this;
        var duration = config.resyncFrequency;
        setTimeout(() => {
            self.commonLib.manageDebugLog("INFO_IN06", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
            self.init(function (cb) {
                if(cb.status) {
                    self.initCallback(cb);
                }
            });
        }, duration * 1000);
    }


    /* 
    Object : Get the device information
    Author : Mayank [SOFTWEB]
    Inputs : msgType
    Output : Devie info 
    Date   : 2020-01-06
    */
    getSyncDataByCommandType(msgType, callback) {
        var self = this;
        try {
            self.commonLib.getSyncData(msgType, function (response) {
                if (response.status) {
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
    Object : Get Device Information
    Author : Mayank [SOFTWEB]
    Inputs : 
    Output : Devie info 
    Date   : 2018-01-24
     */
    syncDevice(callback) {
        var self = this;
        try {
            self.commonLib.syncDevice(function (response) {
                callback({
                    status: response.status,
                    data: response.data,
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
    Object : Device connection process
    Author : Mayank [SOFTWEB]
    Inputs : 
    Output : Device connection
    Date   : 2020-12-31
    */
    async connect(successCallback, failedCallback, connectionStatusCallback) {
        var self = this;
        try {
            // Init the global callback for the connection
            if (typeof connectionStatusCallback == "function") {
                self.CONNECTION_STATUS_CALLBACK = connectionStatusCallback;
            } else {
                self.commonLib.manageDebugLog("ERR_CM05", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
            }
            self.deviceConnectionProcess(function (response) {
                if(response.status) {
                    successCallback(response.message);
                } else {
                    failedCallback(response.message);
                }
            });
        } catch (err) {
            self.commonLib.manageDebugLog("ERR_IN01", self.UNIQUE_ID, self.SID, err.message, 0, self.IS_DEBUG);
            failedCallback(err.message);
        }
    }

    /* 
    Object : Device Connection process
    Author : Mayank [SOFTWEB]
    Inputs : "has" property json data
    Output : Send Request for the dtaa which have 'true' value
    Date   : 2021-02-02
     */
    reqDataForActiveProperty(resData) {
        var self = this;
        try {
            async.series([
                    function (pcb) {
                        if (resData['d'] == 1) {
                            self.getSyncDataByCommandType(config.msgType.childDevice, function (res) {
                                pcb();
                            });
                        } else {
                            pcb();
                        }
                    },
                    function (pcb) {
                        if (resData['attr'] == 1) {
                            self.getSyncDataByCommandType(config.msgType.attribute, function (res) {
                                pcb();
                            });
                        } else {
                            pcb();
                        }
                    },
                    function (pcb) {
                        if (resData['set'] == 1) {
                            self.getSyncDataByCommandType(config.msgType.setting, function (res) {
                                pcb();
                            });
                        } else {
                            pcb();
                        }
                    },
                    function (pcb) {
                        if (resData['r'] == 1) {
                            self.getSyncDataByCommandType(config.msgType.rule, function (res) {
                                pcb();
                            });
                        } else {
                            pcb();
                        }
                    },
                    function (pcb) {
                        if (resData['ota'] == 1) {
                            self.getSyncDataByCommandType(config.msgType.ota, function (res) {
                                pcb();
                            });
                        } else {
                            pcb();
                        }
                    }
                ],
                function (err, results) {});
        } catch (error) {
            self.commonLib.manageDebugLog("ERR_IN01", self.UNIQUE_ID, self.SID, error.message, 0, self.IS_DEBUG);
        }
    }

    /* 
    Object : Device Connection process
    Author : Mayank [SOFTWEB]
    Inputs : 
    Output : Go for device connection and start device subscriber
    Date   : 2020-04-13
     */
    deviceConnectionProcess(callback) {
        var self = this;
        try {
            self.clientConnection(function (clientResponse) {
                // console.log("Mqtt -> deviceConnectionProcess -> clientResponse 11111 ==> ", clientResponse)
                if (clientResponse?.status) {
                    self.DEVICE_CONNECTED = true;
                    self.STOP_SDK_CONNECTION = true;
                    self.startCommandSubscriber(function (response) {
                        // console.log("================== ", response.status)
                        if (response.status ) {
                            var responseData = cache.get(self.SID + "_" + self.UNIQUE_ID);
                            if (responseData && "has" in responseData) {
                                self.reqDataForActiveProperty(responseData.has);
                            }
                            callback({
                                status: true,
                                data: null,
                                message: response.message
                            })
                        } else {
                            self.commonLib.manageDebugLog("ERR_IN17", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
                            callback({
                                status: false,
                                data: null,
                                message: response.message
                            })
                        }
                    });
                } else {
                    self.commonLib.manageDebugLog("ERR_IN13", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
                    callback({
                        status: false,
                        data: null,
                        message: clientResponse.message
                    })
                }
            })
            
            
        } catch (error) {
            self.commonLib.manageDebugLog("ERR_IN01", self.UNIQUE_ID, self.SID, error.message, 0, self.IS_DEBUG);
            callback({
                status: false,
                data: null,
                message: error.message
            })
        }
    }

    /* 
    Object : Client Connection
    Author : Mayank [SOFTWEB]
    Inputs : Make connection 
    Output : Connected brokr client object 
    Date   : 2020-04-13
     */
    clientConnection(callback) {
        var self = this;
        try {
            self.commonLib.clientConnection(function (response) {
                callback({
                    status: response?.status,
                    data: response,
                    message: response?.message
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
    Object : Start Command subscriber
    Author : Mayank [SOFTWEB]
    Inputs : 
    Output : start listner and receive command from cloud
    Date   : 2018-01-24
    */
    startCommandSubscriber(callback) {
        var self = this;
        try {
            self.commonLib.subscriberProcess(function (response) {

                // console.log(":::::::::: cmd msg :::::::::: ", response);
                // console.log(":::::::::: cmd msg :::::::::: ", response.data.connectionCnt);

                if (response.status) {
                    if (response.data.cmdReceiveType == "cmd") {
                        if (!response.data.data.d) {
                            self.manageCommand(response.data);
                        } else {
                            self.manageDeviceInfo(response.data.data);
                        }
                        if(response.data.connectionCnt == 0){
                            // console.log("Mqtt -> startCommandSubscriber -> sssssssssss.status", response.status)
                            
                            callback({
                                status: response.status,
                                data: null,
                                message: response.message
                            })
                        }
                    }

                    if (response.data.cmdReceiveType == "twin") {
                        if (self.TWIN_CHANGED_CALLBACK){
                            self.TWIN_CHANGED_CALLBACK(response.data.data);
                        }
                    }
                } else {
                    if (response.data.cmdReceiveType == "cmd") {
                        if (!response.data.data.d) {
                            self.manageCommand(response.data);
                        }
                        // if(response.data.connectionCnt == 0){
                        //     // console.log("Mqtt -> startCommandSubscriber -> fffffffffffffff.status", response.status)
                            
                        //     callback({
                        //         status: response.status,
                        //         data: null,
                        //         message: response.message
                        //     })
                        // }
                    }
                }
                // callback({
                //     status: response.status,
                //     data: null,
                //     message: response.message
                // })
            });
            // callback({
            //     status: true,
            //     data: null,
            //     message: "sub success"
            // })
        } catch (error) {
            self.commonLib.manageDebugLog("ERR_IN01", self.UNIQUE_ID, self.SID, error.message, 0, self.IS_DEBUG);
            callback({
                status: false,
                data: error,
                message: error.message
            })
        }
    }

    dispose () {
        var self = this;
        self.commonLib.onHardStopCommand();
        console.log("DeviceId ::: [" + self.UNIQUE_ID + "] :: SDK Disconnected :: ", new Date());            
        process.exit();
    }

    /* 
    Object : Device 
    Author : Mayank [SOFTWEB]
    Inputs : C2D command response
    Output : Manage Command
    Date   : 2020-04-13   
    */
    manageCommand(response) {
        var self = this;
        var cmdType = response.data.ct;
        var commandData = response.data;
        var commandDataJson = commandData ? JSON.stringify(commandData) : ""

        switch (response.data.ct) {
            case config.commandType.CORE_COMMAND: //0 - Ok device
                self.commonLib.manageDebugLog("INFO_CM01", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                self.commonLib.manageDebugLog("INFO_CM01", self.UNIQUE_ID, self.SID, commandDataJson, 1, self.IS_DEBUG);
                var requestedParams = undefined;
                if (self.DEVICE_CMD_CALLBACK)
                    self.DEVICE_CMD_CALLBACK(commandData);
                break;

            case config.commandType.FIRMWARE_UPDATE: //1 - OTA Firmware update
                self.commonLib.manageDebugLog("INFO_CM02", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                self.commonLib.manageDebugLog("INFO_CM02", self.UNIQUE_ID, self.SID, commandDataJson, 1, self.IS_DEBUG);
                var requestedParams = undefined;
                if (self.OTA_CMD_RECEIVED_CALLBACK)
                    setTimeout(()=>{
                        self.OTA_CMD_RECEIVED_CALLBACK(commandData);
                    }, 10000)
                break;

            case config.commandType.MODULE_COMMAND: //2 - Module command 
                self.commonLib.manageDebugLog("INFO_CM05", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                self.commonLib.manageDebugLog("INFO_CM05", self.UNIQUE_ID, self.SID, commandDataJson, 1, self.IS_DEBUG);
                var requestedParams = undefined;
                if (self.MODULE_RECEIVED_CALLBACK)
                    self.MODULE_RECEIVED_CALLBACK(commandData);
                break;

            case config.commandType.DEVICE_CONNECTION_STATUS: // 3 - Connection status true/false
                if (commandData.command) {
                    self.DEVICE_CONNECTED = true;
                } else {
                    self.DEVICE_CONNECTED = false;
                }
                var requestedParams = undefined;
                self.commonLib.manageDebugLog("INFO_CM09", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                self.commonLib.manageDebugLog("INFO_CM09", self.UNIQUE_ID, self.SID, commandDataJson, 1, self.IS_DEBUG);
                if (self.CONNECTION_STATUS_CALLBACK)
                    self.CONNECTION_STATUS_CALLBACK(commandData);
                break;

            case config.commandType.REFRESH_ATTRIBUTE: //101 - Attribute Changed
                self.commonLib.manageDebugLog("INFO_CM03", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                self.commonLib.manageDebugLog("INFO_CM03", self.UNIQUE_ID, self.SID, commandDataJson, 1, self.IS_DEBUG);
                var requestedParams = config.attributeParams;
                break;

            case config.commandType.REFRESH_SETTING_TWIN: //102 - Setting Changed
                self.commonLib.manageDebugLog("INFO_CM04", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                self.commonLib.manageDebugLog("INFO_CM04", self.UNIQUE_ID, self.SID, commandDataJson, 1, self.IS_DEBUG);
                var requestedParams = config.settingsParams;
                break;

            case config.commandType.REFRESH_EDGE_RULE: //103 - Rule Changed
                self.commonLib.manageDebugLog("INFO_CM07", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                self.commonLib.manageDebugLog("INFO_CM07", self.UNIQUE_ID, self.SID, commandDataJson, 1, self.IS_DEBUG);
                var requestedParams = config.ruleParams;
                break;

            case config.commandType.REFRESH_CHILD_DEVICE: //104 - Device Changed
                self.commonLib.manageDebugLog("INFO_CM06", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                self.commonLib.manageDebugLog("INFO_CM06", self.UNIQUE_ID, self.SID, commandDataJson, 1, self.IS_DEBUG);
                if(self.SDK_OPTIONS.isGatewayDevice) {
                    var requestedParams = config.deviceParams;
                } else {
                    var requestedParams = undefined;
                }
                break;

            case config.commandType.DATA_FREQUENCY_CHANGE: //105 - Data Frequency Updated
                self.commonLib.manageDebugLog("INFO_CM18", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                self.commonLib.manageDebugLog("INFO_CM18", self.UNIQUE_ID, self.SID, commandDataJson, 1, self.IS_DEBUG);
                var deviceSyncResDf = cache.get(self.SID + "_" + self.UNIQUE_ID);
                deviceSyncResDf.meta.df = commandData.df;
                cache.put(self.SID + "_" + self.UNIQUE_ID, deviceSyncResDf);
                var requestedParams = undefined;
                break;

            case config.commandType.DEVICE_DELETED: //106 - Device Deleted
                self.commonLib.onHardStopCommand();
                self.STOP_SDK_CONNECTION = false;
                var requestedParams = undefined;
                self.commonLib.manageDebugLog("INFO_CM21", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                self.commonLib.manageDebugLog("INFO_CM21", self.UNIQUE_ID, self.SID, commandDataJson, 1, self.IS_DEBUG);
                break;

            case config.commandType.DEVICE_DISABLED: //107 - Device Disabled
                self.commonLib.onHardStopCommand();
                self.STOP_SDK_CONNECTION = false;
                var requestedParams = config.deviceParams;
                self.commonLib.manageDebugLog("INFO_CM22", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                self.commonLib.manageDebugLog("INFO_CM22", self.UNIQUE_ID, self.SID, commandDataJson, 1, self.IS_DEBUG);
                break;

            case config.commandType.DEVICE_RELEASED: //108 - Device Released
                self.commonLib.onHardStopCommand();
                self.STOP_SDK_CONNECTION = false;    
                self.commonLib.manageDebugLog("INFO_CM23", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                self.commonLib.manageDebugLog("INFO_CM23", self.UNIQUE_ID, self.SID, commandDataJson, 1, self.IS_DEBUG);
                var requestedParams = undefined;
                break;

            case config.commandType.STOP_OPERATION: //109 - STOP SDK CONNECTION
                self.commonLib.manageDebugLog("INFO_CM08", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                self.commonLib.manageDebugLog("INFO_CM08", self.UNIQUE_ID, self.SID, commandDataJson, 1, self.IS_DEBUG);
                // self.disconnect(config.commandType.STOP_OPERATION);
                self.commonLib.onHardStopCommand();
                self.STOP_SDK_CONNECTION = false;
                var requestedParams = undefined;
                break;

            case config.commandType.START_HEARTBEAT_DEVICE: //110 - Heartbeat Start
                self.commonLib.manageDebugLog("INFO_CM24", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                self.commonLib.manageDebugLog("INFO_CM24", self.UNIQUE_ID, self.SID, commandDataJson, 1, self.IS_DEBUG);
                var requestedParams = undefined;
                var deviceSyncResDf = cache.get(self.SID + "_" + self.UNIQUE_ID);
                deviceSyncResDf.meta["hbf"] = commandData.f;
                self.commonLib.onHeartbeatCommand(true, deviceSyncResDf.meta["hbf"]);
                cache.put(self.SID + "_" + self.UNIQUE_ID, deviceSyncResDf);
                break;

            case config.commandType.STOP_HEARTBEAT_DEVICE: //111 - Heartbeat Stop
                self.commonLib.manageDebugLog("INFO_CM25", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                self.commonLib.manageDebugLog("INFO_CM25", self.UNIQUE_ID, self.SID, commandDataJson, 1, self.IS_DEBUG);
                var deviceSyncResDf = cache.get(self.SID + "_" + self.UNIQUE_ID);
                deviceSyncResDf.meta["hbf"] = null;
                self.commonLib.onHeartbeatCommand(false, 0);
                cache.put(self.SID + "_" + self.UNIQUE_ID, deviceSyncResDf);
                var requestedParams = undefined;
                break;

            case config.commandType.SDK_LOG_FLAG: //112 - SDK LOG ENABLED/DISABLED - Update flag SDK log display in cmd prompt
                self.commonLib.manageDebugLog("INFO_CM26", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                self.commonLib.manageDebugLog("INFO_CM26", self.UNIQUE_ID, self.SID, commandDataJson, 1, self.IS_DEBUG);
                self.SDK_OPTIONS.isDebug = commandData.debugFlag;
                self.IS_DEBUG = commandData.debugFlag;
                self.commonLib.onLogCommand(commandData);
                var requestedParams = undefined;
                break;
                
            case config.commandType.SKIP_ATTRIBUTE_VALIDATION: //113 - SKIP ATTRIBUTE VALIDATION - Skip Attribute validation during data send 
                self.commonLib.manageDebugLog("INFO_CM27", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                self.commonLib.manageDebugLog("INFO_CM27", self.UNIQUE_ID, self.SID, commandDataJson, 1, self.IS_DEBUG);
                self.SDK_OPTIONS.skipValidation = commandData.skipValidation;
                self.commonLib.onValidationSkipCommand(commandData);
                var requestedParams = undefined;
                break;

            case config.commandType.SEND_SDK_LOG_FILE: //114 - SEND SDK LOG FILE - Request command for SDK Log file upload
                self.commonLib.manageDebugLog("INFO_CM28", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                self.commonLib.manageDebugLog("INFO_CM28", self.UNIQUE_ID, self.SID, commandDataJson, 1, self.IS_DEBUG);
                console.log(" Remain to be develope send SDK log file feature");
                var requestedParams = undefined;
                break;

            case config.commandType.DEVICE_DELETE_REQUEST: //115 - DELETE DEVICE - Delete device request command
                self.commonLib.manageDebugLog("INFO_CM29", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                self.commonLib.manageDebugLog("INFO_CM29", self.UNIQUE_ID, self.SID, commandDataJson, 1, self.IS_DEBUG);
                console.log(" Remain to be develope delete device feature");
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
    Object : Manage device with c@d command 
    Author : Mayank [SOFTWEB]
    Inputs : uniqueId, device data
    Output : Manage Device information
    Date   : 2020-05-04  
    */
    manageDeviceInfo(response) {
        var self = this;
        var ctStatus = response.d.ct;
        var cacheId = self.SID + "_" + self.UNIQUE_ID;

        switch (ctStatus) {
            case config.msgType.allStatus: //200 - All data
                if (response.d.ec == 0 && response.d.ct == config.msgType.allStatus) {
                    response.d["id"] = self.UNIQUE_ID;
                    response.d["sid"] = self.SID;
                    if (response.d.meta && response.d.meta.edge == true) {
                        self.SDK_OPTIONS.isEdgeDevice = true;
                    }
                    if (response.d.meta && response.d.meta.gtw != null) {
                        response.d["d"] = [{
                            "tg": response.d.meta.gtw.tg,
                            "id": self.UNIQUE_ID,
                            "s": 0
                        }]
                        self.SDK_OPTIONS.isGatewayDevice = true;
                    } else {
                        response.d["d"] = [{
                            "id": self.UNIQUE_ID,
                            "s": 0
                        }]
                        self.SDK_OPTIONS.isGatewayDevice = false;
                    }
                    
                    var cacheData = cache.get(cacheId);
                    if (cacheData) {
                        var authType = cacheData.meta.at;
                        cacheData.meta = response.d.meta;
                        cacheData.meta['at'] = authType;
                        cacheData['d'] = response.d["d"];
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
                if (response.d.ec == 0 && response.d.ct == config.msgType.attribute) {
                    var deviceData = cache.get(cacheId);
                    deviceData["att"] = response.d['att'];
                    cache.put(cacheId, deviceData);
                    console.log("Attribute Received ===>>>", JSON.stringify(response, null, 2))
                    self.commonLib.manageDebugLog("INFO_CM12", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                    if (self.SDK_OPTIONS.isEdgeDevice)
                        self.checkForEdgeDeviceConfigurationProcess("attr");
                    self.attributeChangedCallbackProcess("attr");
                }
                break;

            case config.msgType.setting: //202 - setting
                if (response.d.ec == 0 && response.d.ct == config.msgType.setting) {
                    var deviceData = cache.get(cacheId);
                    deviceData["set"] = response.d['set'];
                    cache.put(cacheId, deviceData);
                    console.log("Device setting >>>>>",JSON.stringify(response, null, 2));
                    self.commonLib.manageDebugLog("INFO_CM13", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                }
                break;

            case config.msgType.rule: //203 - rule
                if (response.d.ec == 0 && response.d.ct == config.msgType.rule) {
                    var deviceData = cache.get(cacheId);
                    deviceData["r"] = response.d['r'];
                    cache.put(cacheId, deviceData);
                    self.commonLib.manageDebugLog("INFO_CM14", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                    if(self.RULE_CHANGED_CALLBACK)
                        self.RULE_CHANGED_CALLBACK(deviceData["r"]);
                    if (self.SDK_OPTIONS.isEdgeDevice)
                        self.checkForEdgeDeviceConfigurationProcess("r");
                }
                break;

            case config.msgType.childDevice: //204 - childDevice
                if (response.d.ec == 0 && response.d.ct == config.msgType.childDevice) {
                    var deviceData = cache.get(cacheId);
                    var devices = response.d['d'];
                    if (self.SDK_OPTIONS.isGatewayDevice) {
                        var gatewayDevice = [{
                            "tg": deviceData.meta.gtw.tg,
                            "id": self.UNIQUE_ID
                        }];
                        var result = _.unionWith(gatewayDevice, devices, _.isEqual);
                        deviceData["d"] = result;
                        deviceData["has"]["d"] = result.length - 1;
                        if(self.DEVICE_CHANGED_CALLBACK)
                            self.DEVICE_CHANGED_CALLBACK(deviceData["d"]);
                        if (self.SDK_OPTIONS.isEdgeDevice)
                            self.checkForEdgeDeviceConfigurationProcess("d", true);
                        self.attributeChangedCallbackProcess("d", true);
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
                    self.commonLib.manageDebugLog("INFO_CM11", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                    if (response.d.meta && response.d.meta.edge == true) {
                        self.SDK_OPTIONS.isEdgeDevice = true;
                    }
                    if (response.d.meta && response.d.meta.gtw) {
                        response.d["d"] = [{
                            "tg": response.d.meta.gtw.tg,
                            "id": self.UNIQUE_ID,
                            "s": 0
                        }]
                        self.SDK_OPTIONS.isGatewayDevice = true;
                    } else {
                        response.d["d"] = [{
                            "id": self.UNIQUE_ID,
                            "s": 0
                        }]
                        self.SDK_OPTIONS.isGatewayDevice = false;
                    }
                    cache.put(cacheId, response.d);
                    self.attributeChangedCallbackProcess("d");
                    self.attributeChangedCallbackProcess("r");
                    self.attributeChangedCallbackProcess("att");
                    if (self.SDK_OPTIONS.isEdgeDevice) {
                        self.checkForEdgeDeviceConfigurationProcess("d");
                        self.checkForEdgeDeviceConfigurationProcess("att");
                        self.checkForEdgeDeviceConfigurationProcess("r");
                    }
                }
                break;

            case config.msgType.createChildDevice: //221 - Create child device response
                if (response.d.ec == 0 && response.d.ct == config.msgType.createChildDevice) {
                    self.commonLib.manageDebugLog("INFO_CM19", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                }
                break;

            case config.msgType.deleteChildDevice: //222 - Create child device response
                console.log(response)
                if (response.d.ec == 0 && response.d.ct == config.msgType.deleteChildDevice) {
                    self.commonLib.manageDebugLog("INFO_CM20", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                }
                break;

            default: // unknown command
                break;
        }
    }

    /* 
    Object : Edge device processing 
    Author : Mayank [SOFTWEB]
    Inputs : requested params
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
                                        //console.log('1025', data.tumblingWindowTime, data.lastChar, data.edgeAttributeKey, data.uniqueId, data.attrTag, data.devices)
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
                        setTimeout(() => {
                            var hasItems = _.cloneDeep(responseData.has);
                            if(responseData.r && hasItems.r) {
                                self.commonLib.setRuleaConfiguration(responseData.r, self.UNIQUE_ID, function (res) {
                                    if (res.status) {
                                        responseData.rulesData = res.data;
                                        // self.commonLib.manageDebugLog("INFO_EE03", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                                    } else {
                                        self.commonLib.manageDebugLog("ERR_IN01", self.UNIQUE_ID, self.SID, res.message, 0, self.IS_DEBUG);
                                    }
                                    cb_series();
                                });
                            } else {
                                cb_series();
                            }
                        }, 500);
                    } catch (err) {
                        cb_series();
                    }
                }
            ], function (err, response) {})
        }
    }

    /*
    Object : Send data on cloud 
    Author : Mayank [SOFTWEB]
    Inputs : json data
    Output : 
    Date   : 2018-01-24
    */
    sendData(data) {
        var self = this;
        if (data != "" && data.length > 0 && typeof data == 'object') {
            try {
                if (self.STOP_SDK_CONNECTION) {
                    self.commonLib.SendDataToHub(data, function (response) {
                        if (response.status) {}
                    })
                } else {
                    if (self.UNIQUE_ID != data[0].uniqueId) {
                        self.commonLib.manageDebugLog("ERR_SD02", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
                    }
                    if (self.STOP_SDK_CONNECTION == false) {
                        self.commonLib.manageDebugLog("ERR_SD04", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
                    }
                }
            } catch (err) {
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
    Object : Give list of attributes 
    Author : Mayank [SOFTWEB]
    Inputs : 
    Output : Device detail with all attributes
    Date   : 2018-04-06
    */
    getAttributes(callback) {
        var self = this;
        try {
            self.commonLib.getAttributes(function (response) {
                callback(response);
            })
        } catch (err) {
            self.commonLib.manageDebugLog("ERR_GA01", self.UNIQUE_ID, self.SID, err.message, 0, self.IS_DEBUG);
            callback({
                status: false,
                data: err,
                message: err.message
            });
        }
    }

    /*
    Object : Get Devices 
    Author : Mayank [SOFTWEB]
    Inputs : 
    Output : get device detail
    Date   : 2021-11-25
    */
    getChildDevices(callback) {
        var self = this;
        try {
            self.commonLib.getChildDevices(function (response) {
                callback(response);
            })
        } catch (err) {
            self.commonLib.manageDebugLog("ERR_DL01", self.UNIQUE_ID, self.SID, err.message, 0, self.IS_DEBUG);
            callback({
                status: false,
                data: err,
                message: err.message
            });
        }
    }

    /*
    Object : Update twin 
    Author : Mayank [SOFTWEB]
    Inputs : Key, Value
    Output : Device list
    Date   : 2019-06-11
    */
    updateTwin(key, value, callback) {
        var self = this;
        try {
            if (self.STOP_SDK_CONNECTION == true && key && ((_.isNumber(value) ? !_.isNil(value) : (!_.isNil(value))) || value === null)) {
                var obj = {};
                obj[key] = value;
                // obj['sid'] = self.SID;
                console.log("Shadow update received :::::",JSON.stringify(obj));
                self.commonLib.UpdateTwin(obj, function (response) {
                    if (response.status) {
                        self.commonLib.manageDebugLog("INFO_TP01", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                        callback({
                            status: true,
                            data: null,
                            message: response.message
                        });
                    } else {
                        self.commonLib.manageDebugLog("ERR_TP01", self.UNIQUE_ID, self.SID, response.message, 0, self.IS_DEBUG);
                        callback({
                            status: false,
                            data: null,
                            message: response.message
                        });
                    }
                })
            } else {
                if (self.STOP_SDK_CONNECTION == false) {
                    var msg = config.errorLog.ERR_TP02;
                    self.commonLib.manageDebugLog("ERR_TP02", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
                }
                if (!key || !value) {
                    var msg = config.errorLog.ERR_TP02;
                    self.commonLib.manageDebugLog("ERR_TP03", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
                }
                callback({
                    status: false,
                    data: null,
                    message: msg
                });
            }
        } catch (err) {
            self.commonLib.manageDebugLog("ERR_TP01", self.UNIQUE_ID, self.SID, err.message, 0, self.IS_DEBUG);
            callback({
                status: false,
                data: null,
                message: err.message
            });
        }
    }

    /* 
    Object : Device disconnect 
    Author : Mayank [SOFTWEB]
    Inputs : hard stop command(optional)
    Output : device disconnected message
    Date   : 2019-06-11
    */
    disconnect(hardStopCmd = "") {
        var self = this;
        try {
            if (self.DEVICE_CONNECTED) {
                self.commonLib.disconnectDevice(function (response) {
                    if (response.status) {
                        self.DEVICE_CONNECTED = false;
                        // if (hardStopCmd) {
                        //     self.STOP_SDK_CONNECTION = false;
                        //     self.commonLib.deleteAllLogFile(self.LOG_PATH);
                        // }
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
    Object : Send Module command ack 
    Author : Mayank [SOFTWEB]
    Inputs : ackGuid, status, msg
    Output : message
    Date   : 2021-11-30
     */
    sendAckModule(ackGuid, status, msg) {
        var self = this;
        try {
            if (this.STOP_SDK_CONNECTION == true && ackGuid && status >= 0) {
                var msgType = config.messageType.moduleCommandAck;
                var cmdType = config.commandTypeFlag.MODULE_COMMAND;
                self.commonLib.sendCommandAck(ackGuid, status, msg, msgType, cmdType, function (response) {
                    self.commonLib.manageDebugLog("INFO_CM10", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                })
            } else {
                if (self.STOP_SDK_CONNECTION == false) {
                    self.commonLib.manageDebugLog("ERR_CM04", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
                } else if(!ackGuid) {
                    self.commonLib.manageDebugLog("ERR_CM12", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
                } else if(!status) {
                    self.commonLib.manageDebugLog("ERR_CM02", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
                }
            }
        } catch (error) {
            self.commonLib.manageDebugLog("ERR_CM01", self.UNIQUE_ID, self.SID, error.message, 0, self.IS_DEBUG);
        }
    }
    
    /* 
    Object : Send Device command ack 
    Author : Mayank [SOFTWEB]
    Inputs : ackGuid, status, msg, childId
    Output : message
    Date   : 2021-11-30
     */
    sendAckCmd(ackGuid, status, msg, childId = "") {
        var self = this;
        try {
            if (this.STOP_SDK_CONNECTION == true && ackGuid) {
                var msgType = config.messageType.deviceCommandAck;
                var cmdType = config.commandTypeFlag.DEVICE_COMMAND;
                self.commonLib.sendCommandAck(ackGuid, status, msg, childId, msgType, cmdType, function (response) {
                    self.commonLib.manageDebugLog("INFO_CM10", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                })
            } else {
                if (self.STOP_SDK_CONNECTION == false) {
                    self.commonLib.manageDebugLog("ERR_CM04", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
                } else if(!ackGuid) {
                    self.commonLib.manageDebugLog("ERR_CM12", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
                } else if(!status) {
                    self.commonLib.manageDebugLog("ERR_CM02", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
                }
            }
        } catch (error) {
            self.commonLib.manageDebugLog("ERR_CM01", self.UNIQUE_ID, self.SID, error.message, 0, self.IS_DEBUG);
        }
    }

    /* 
    Object : Send OTA command ack 
    Author : Mayank [SOFTWEB]
    Inputs : ackGuid, status, msg, childId
    Output : message
    Date   : 2021-11-30
     */
    sendAckOTA(ackGuid, status, msg, childId = "") {
        var self = this;
    console.log("Mqtt -> sendAckOTA -> msg", msg)
    console.log("Mqtt -> sendAckOTA -> status", status)
    console.log("Mqtt -> sendAckOTA -> ackGuid", ackGuid)
    console.log("Mqtt -> sendAckOTA -> self.STOP_SDK_CONNECTION -> ", self.STOP_SDK_CONNECTION)
        
        try {
            if (self.STOP_SDK_CONNECTION == true && ackGuid && status >= 0) {
                var msgType = config.messageType.otaCommandAck;
                console.log("Mqtt -> sendAckOTA -> msgType", msgType)
                var cmdType = config.commandTypeFlag.OTA_COMMAND;
                console.log("Mqtt -> sendAckOTA -> cmdType", cmdType)
                self.commonLib.sendCommandAck(ackGuid, status, msg, childId, msgType, cmdType, function (response) {
                console.log("0000 :: Mqtt -> sendAckOTA -> response", response)
                    self.commonLib.manageDebugLog("INFO_CM10", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                })
            } else {
                if (self.STOP_SDK_CONNECTION == false) {
                    self.commonLib.manageDebugLog("ERR_CM04", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
                } else if(!ackGuid) {
                    self.commonLib.manageDebugLog("ERR_CM12", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
                } else if(!status) {
                    self.commonLib.manageDebugLog("ERR_CM02", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
                } else {
                    self.commonLib.manageDebugLog("ERR_CM03", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
                }
            }
        } catch (error) {
            console.log("Mqtt -> sendAckOTA -> error", error)
            self.commonLib.manageDebugLog("ERR_CM01", self.UNIQUE_ID, self.SID, error.message, 0, self.IS_DEBUG);
        }
    }

    /* 
    Object : get all twins properties 
    Author : Mayank [SOFTWEB]
    Inputs :  
    Output : publish message
    Date   : 2020-04-20
     */
    getTwins(callback) {
        var self = this;
        try {
            if (typeof callback == "function") {
                //self.TWIN_CHANGED_CALLBACK = callback;
                if (this.STOP_SDK_CONNECTION == true && self.DEVICE_CONNECTED == true) {
                    self.commonLib.getAllTwins(function (response) {
                        self.commonLib.manageDebugLog("INFO_TP02", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                    })
                } else {
                    self.commonLib.manageDebugLog("ERR_TP04", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
                }
            } else {
                self.commonLib.manageDebugLog("ERR_CM06", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
            }
            callback();
        } catch (error) {
            self.commonLib.manageDebugLog("ERR_TP01", self.UNIQUE_ID, self.SID, err.message, 0, self.IS_DEBUG);
        }
    }

    // async checkDateObjFormat(dateObj) {
    //     if (Object.prototype.toString.call(dateObj) === "[object Date]") {
    //         if (isNaN(dateObj.getTime())) {
    //             return false;
    //         } else {
    //             return true;
    //         }
    //     } else {
    //         return false;
    //     }
    // }

    /* 
    Object : Send Twin property to firmware by setCallbackFunction
    Author : Mayank [SOFTWEB]
    Inputs :  
    Output : Twin property data
    Date   : 2020-04-20
     */
    async onTwinChangeCommand(callback) {
        var self = this;
        if (typeof callback == "function") {
            self.TWIN_CHANGED_CALLBACK = callback;
        } else {
            self.commonLib.manageDebugLog("ERR_CM06", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
        }
    }

    /* 
    Object : Send device command to firmware by setCallbackFunction
    Author : Mayank [SOFTWEB]
    Inputs :  
    Output : Device command
    Date   : 2020-04-20
     */
    async onDeviceCommand(callback) {
        var self = this;
        if (typeof callback == "function") {
            self.DEVICE_CMD_CALLBACK = callback;
        } else {
            self.commonLib.manageDebugLog("ERR_CM07", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);

        }
    }

    /* 
    Object : Send OTA command to firmware by setCallbackFunction
    Author : Mayank [SOFTWEB]
    Inputs :  
    Output : OTA command
    Date   : 2020-04-20
     */
    async onOTACommand(callback) {
        var self = this;
        if (typeof callback == "function") {
            self.OTA_CMD_RECEIVED_CALLBACK = callback;
        } else {
            self.commonLib.manageDebugLog("ERR_CM08", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
        }
    }

    /* 
    Object : Send Attribute updated flag to firmware by setCallbackFunction
    Author : Mayank [SOFTWEB]
    Inputs :  
    Output : Attribute changed status
    Date   : 2020-04-20
     */
    async onAttrChangeCommand(callback) {
        var self = this;
        if (typeof callback == "function") {
            self.ATTRIBUTE_CHANGED_CALLBACK = callback;
        } else {
            self.commonLib.manageDebugLog("ERR_CM09", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
        }
    }

    /* 
    Object : Send Device info updated to firmware by setCallbackFunction
    Author : Mayank [SOFTWEB]
    Inputs :  
    Output : Device info updated status
    Date   : 2020-04-20
     */
    async onDeviceChangeCommand(callback) {
        var self = this;
        if (typeof callback == "function") {
            self.DEVICE_CHANGED_CALLBACK = callback;
        } else {
            self.commonLib.manageDebugLog("ERR_CM10", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
        }
    }
    
    /* 
    Object : Send rule information updated to firmware by setCallbackFunction
    Author : Mayank [SOFTWEB]
    Inputs :  
    Output : Rule info updated status
    Date   : 2021-12-20
     */
    async onRuleChangeCommand(callback) {
        var self = this;
        if (typeof callback == "function") {
            self.RULE_CHANGED_CALLBACK = callback;
        } else {
            self.commonLib.manageDebugLog("ERR_CM13", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
        }
    }

    /* 
    Object : Send module command status to firmware by setCallbackFunction
    Author : Mayank [SOFTWEB]
    Inputs :  
    Output : module command status
    Date   : 2020-04-20
     */
    async onModuleCommand(callback) {
        var self = this;
        if (typeof callback == "function") {
            self.MODULE_RECEIVED_CALLBACK = callback;
        } else {
            self.commonLib.manageDebugLog("ERR_CM11", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
        }
    }

    /*
    Object : Create child device 
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
    Object : Delete child device 
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
    Object : Device 
    Author : Mayank [SOFTWEB]
    Inputs : item key reference attr, d, r
    Output : Call edge configuration after all required process done
    Date   : 2020-09-03  
    */
    checkForEdgeDeviceConfigurationProcess(item, deviceChanged) {
        var self = this;
        var deviceData = cache.get(self.SID + "_" + self.UNIQUE_ID);
        var hasItems = _.cloneDeep(deviceData.has);

        delete hasItems.ota;
        delete hasItems.set;
        if (!self.SDK_OPTIONS.isGatewayDevice)
            delete hasItems.d;

        var tempArray = [];
        _.filter(hasItems, function (o, index) {
            if (o == true) {
                tempArray.push(index)
            }
        });
        var hasCount = 0;

            
        if (tempArray.length > 0) {
            hasCount = tempArray.length;
            async.forEachSeries(tempArray, function (data, cb) {
                if (item == data) {
                    self.HAS_ACTIVE_COUNT++;
                }
                cb();
            }, function () {
                if (hasCount == self.HAS_ACTIVE_COUNT || deviceChanged) {
                    self.HAS_ACTIVE_COUNT = 0;
                    self.startEdgeDeviceProcess();
                }
            });
        }
    }

    /* 
    Object : Attribute 
    Author : Mayank [SOFTWEB]
    Inputs : item key reference attr, d, r
    Output : Call attribute changed callback after all required process done
    Date   : 2020-09-03  
    */
    attributeChangedCallbackProcess(item, deviceChanged) {
        var self = this;
        var deviceData = cache.get(self.SID + "_" + self.UNIQUE_ID);
        var hasItems = _.cloneDeep(deviceData.has);

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

        if (tempArray.length > 0) {
            hasCount = tempArray.length;
            async.forEachSeries(tempArray, function (data, cb) {
                if (item == data) {
                    self.HAS_ACTIVE_COUNT_ATTRIBUTE_CHANGES++;
                }
                cb();
            }, function () {
                if (hasCount == self.HAS_ACTIVE_COUNT_ATTRIBUTE_CHANGES || deviceChanged) {
                    if (self.ATTRIBUTE_CHANGED_CALLBACK) {
                        self.HAS_ACTIVE_COUNT_ATTRIBUTE_CHANGES = 0;
                        self.ATTRIBUTE_CHANGED_CALLBACK(deviceData.att);
                    }
                }
            });
        }
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
    var token = "SharedAccessSignature sr=" + resourceUri + "&sig=" +
        base64UriEncoded + "&se=" + expires;
    if (policyName) token += "&skn=" + policyName;

    callback(token);
};

module.exports = Mqtt;