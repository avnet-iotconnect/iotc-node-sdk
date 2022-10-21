var cache = require('memory-cache');
var config = require('./../config/config');
var fs = require('fs-extra');
var async = require('async');
var CommonFunctions = require("./../common/common");

class Tpm {
    //constructor(cpid, this.UNIQUE_ID, messageCallback, twinCallback, sdkOptions = "", env = "") {
    constructor(uniqueId, sId, scopeId, sdkOptions = "", getSecretCallback, callback) {
        this.commonLib = "";
        this.UNIQUE_ID = uniqueId;
        this.SID = sId;
        this.DEVICE_CONNECTED = false;
        this.STOP_SDK_CONNECTION = false;
        this.ATTR_ACTIVE = false;
        this.RULE_ACTIVE = false;
        this.DEVICE_ACTIVE = false;
		
		//set callback options
		this.CONNECTION_STATUS_CALLBACK = "";
		this.TWIN_CHANGED_CALLBACK = "";
		this.DEVICE_CMD_CALLBACK = "";
		this.OTA_CMD_RECEIVED_CALLBACK = "";
		this.ATTRIBUTE_CHANGED_CALLBACK = "";
		this.DEVICE_CHANGED_CALLBACK = "";
		this.MODULE_RECEIVED_CALLBACK = "";
		this.REQUEST_FOR_SECRET_CONFIGURATION = "";
		let sdkOpt = {};
        sdkOpt['SDK_TYPE'] = "TPM";
        
        if(sdkOptions && 'isSimulatedTPMDevice' in sdkOptions) {
            this.IS_TPM_SIMULATOR_AUTH = sdkOptions.isSimulatedTPMDevice;
        } else {
            this.IS_TPM_SIMULATOR_AUTH = false; // for Local testing true else false
        }
        
		if (sdkOptions && 'dpsHost' in sdkOptions) {
            if (sdkOptions.dpsHost != "" && sdkOptions.dpsHost != undefined && sdkOptions.dpsHost != null) {
                this.DPS_PROVISIONING_HOST_URL = sdkOptions.dpsHost;
            } else {
                this.DPS_PROVISIONING_HOST_URL = config.dpsHostUrl;
            }
        } else {
            this.DPS_PROVISIONING_HOST_URL = config.dpsHostUrl;
        }
		
		if (sdkOptions && 'devicePrefix' in sdkOptions) {
			this.DEVICE_PREFIX = sdkOptions.devicePrefifvx;
        } else {
			this.DEVICE_PREFIX = true; // Default value
        }

		if (sdkOptions && 'azureIotEdgeDevice' in sdkOptions) {
            this.AZURE_IOT_EDGE_DEVICE = sdkOptions.azureIotEdgeDevice;
        } else {
            this.AZURE_IOT_EDGE_DEVICE = false; // Default value
        }

        sdkOpt['TPM'] = {
            "IS_SIMULATED_TPM_DEVICE" :  this.IS_TPM_SIMULATOR_AUTH,
			"TPM_DEVICE_REGISTRATION_ID" : this.SID.substr(0, 43)+'-'+this.UNIQUE_ID,
			"TPM_INITIAL_TWIN_SID" : this.SID.substr(0, 43),
            "SCOPE_ID" : "",
            "IS_TPM_DEVICE" : true,
            "DPS_PROVISIONING_HOST_URL" : this.DPS_PROVISIONING_HOST_URL,
			"SID_TPM_VERSION" : "1",
			"DEVICE_PREFIX" : this.DEVICE_PREFIX,
			"AZURE_IOT_EDGE_DEVICE" : this.AZURE_IOT_EDGE_DEVICE,
			"DEVICE_REGISTRATION_ID": this.DEVICE_PREFIX == true ? this.UNIQUE_ID : this.SID.substr(0, 43)+'-'+this.UNIQUE_ID
        }

		/** getSecret Logic */
		var dpsCs = getSecretCallback("DPSCS");
		var ekey = getSecretCallback("EKEY");
		var iotHubHost = getSecretCallback("IOTHUB");

		sdkOpt['TPM']['DPS_CONNECTION_STRING'] = dpsCs ? dpsCs : "";
		sdkOpt['TPM']['ENDORCEMENT_KEY'] =  ekey ? ekey : "";
		sdkOpt['TPM']['IOTHUB_HOST_NAME'] =  iotHubHost ? iotHubHost : "";
		/** getSecret Logic */
        
        if (sdkOptions && 'debug' in sdkOptions) {
            this.IS_DEBUG = sdkOptions.debug;
        } else {
            this.IS_DEBUG = false; // for Local testing true else false
        }
        sdkOpt['isDebug'] = this.IS_DEBUG;
        this.LOG_PATH = "./logs/offline/" + sId + "_" + this.UNIQUE_ID + "/";
		sdkOpt['logPath'] = this.LOG_PATH;

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
        if(scopeId) {
			sdkOpt['SCOPE_ID'] = scopeId;
        } else {
			sdkOpt['SCOPE_ID'] = "";
        }
		
		this.commonLib = new CommonFunctions(sId, this.UNIQUE_ID, sdkOpt);
		if(!sdkOpt['SCOPE_ID']) {
			this.commonLib.manageDebugLog("ERR_IN16", this.UNIQUE_ID, this.SID, "", 0, this.IS_DEBUG);
			process.exit();
        }
        if (!sId) {
            this.commonLib.manageDebugLog("ERR_IN04", this.UNIQUE_ID, this.SID, "", 0, this.IS_DEBUG);
			process.exit();
        }
        if (!this.UNIQUE_ID) {
            this.commonLib.manageDebugLog("ERR_IN05", this.UNIQUE_ID, this.SID, "", 0, this.IS_DEBUG);
			process.exit();
        }

		if (!sdkOpt['TPM']['DPS_CONNECTION_STRING']) {
            this.commonLib.manageDebugLog("ERR_IN18", this.UNIQUE_ID, this.SID, "", 0, this.IS_DEBUG);
			process.exit();
        }
		if (!sdkOpt['TPM']['ENDORCEMENT_KEY']) {
            this.commonLib.manageDebugLog("ERR_IN19", this.UNIQUE_ID, this.SID, "", 0, this.IS_DEBUG);
			process.exit();
        }
		if (!sdkOpt['TPM']['IOTHUB_HOST_NAME']) {
            this.commonLib.manageDebugLog("ERR_IN20", this.UNIQUE_ID, this.SID, "", 0, this.IS_DEBUG);
			// process.exit();
        }
        
        this.SDK_OPTIONS = sdkOpt;

        // console.log("this.SDK_OPTIONS => ", this.SDK_OPTIONS);
        // return false;

        if (sId && this.UNIQUE_ID) {
            this.createPredefinedLogDirectories();
            this.init(function (response) {
                callback(response)
            })
        }
    }

	async getDetail(arg, getSecretCallback){
		return getSecretCallback(arg); 
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
            try {
                var initData = {
                    "id" : self.UNIQUE_ID,
                    "sid" : self.SID
                } 
                if (!self.offlineFileConfig.offlineProcessDisabled) {
                    try {
                        if (!fs.existsSync(LOG_PATH)) {
                            fs.mkdirSync(LOG_PATH);
                        }
                    } catch (error) {
                        self.commonLib.manageDebugLog("ERR_IN07", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
                        self.commonLib.manageDebugLog("ERR_IN01", self.UNIQUE_ID, self.SID, error.message, 0, self.IS_DEBUG);
                    }
                }
                cache.put(self.SID + "_" + self.UNIQUE_ID, initData);

				// Logic to enroll and provisioning of the device 
				
				async.series([
					function(enrollmentCB){
						console.log("In device Enrolling..");
						try {
							self.deviceEnrollment(function (response) {
								enrollmentCB(null, response);
							})
						} catch (error) {
							enrollmentCB(null, null);
						}
					},
					function(enrollmentCB){
						console.log("In Provisioning");
						try {
							self.deviceDPSProvisioning(function (response) {
								enrollmentCB(null, response);
							})
						} catch (error) {
							enrollmentCB(null, null);
						}
					},
				],
				function(err, results){ 
					if(results.length > 0) {
						callback({
							status: true,
							data: null,
							message: "Init success"
						})
					} else {
						callback({
							status: false,
							data: null,
							message: "Init failed"
						})
					}
					// console.log("results => ", results);
				});

			} catch (err) {
                self.commonLib.manageDebugLog("ERR_IN01", self.UNIQUE_ID, self.SID, err.message, 0, self.IS_DEBUG);
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
            var initialParams = config.defaultParams;
            self.getSyncDataByCommandType(config.msgType.allStatus, function(response){
                // pcb();
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
    async connect() {
        var self = this;
        try {

			if(!self.DEVICE_CONNECTED) {
				self.deviceConnectionProcess();
			} else {
				self.commonLib.manageDebugLog("ERR_TP06", self.UNIQUE_ID, self.SID, err.message, 0, self.IS_DEBUG);
			}

			// // self.deviceConnectionProcess();
			// async.waterfall([
			// 	function(cb_waterfall) {
			// 			self.deviceEnrollment(function (response) {
			// 				// console.log("Device Enrollment process done => ", response.status);
			// 				cb_waterfall(null, response);
			// 			})
			// 		// } else {
			// 		// 	cb_waterfall(null, {
			// 		// 		status: false,
			// 		// 		data: null,
			// 		// 		message: config.errorLog.ERR_IN18
			// 		// 	})
			// 		// }
			// 	}
			// ], function (err, result) {
			// 	if(result.status) {
			// 		self.deviceDPSProvisioning(function (response) {
			// 			// console.log("Device provisioning process done => ", response);
			// 			if(response.status) {
			// 				self.deviceConnectionProcess();
			// 			}
			// 		})
			// 	} else {
			// 		self.commonLib.manageDebugLog("ERR_IN01", self.UNIQUE_ID, self.SID, result.message, 0, self.IS_DEBUG);
			// 	}
			// });
        } catch (err) {
            self.commonLib.manageDebugLog("ERR_IN01", self.UNIQUE_ID, self.SID, err.message, 0, self.IS_DEBUG);
        }
    }
    
	/* 
  Module : Device Connection process
  Author : Mayank [SOFTWEB]
  Inputs : 
  Output : Device enrollment process response
  Date   : 2020-04-13
   */
  deviceEnrollment(callback) {
    var self = this;
    try {
		// callback(true);
        self.commonLib.deviceEnrollment(function (response) {
            if(response.status) {
                self.commonLib.manageDebugLog("INFO_IN16", self.UNIQUE_ID, self.SID, response.message, 1, self.IS_DEBUG);
                callback(response)
            } else {
                self.commonLib.manageDebugLog("ERR_IN01", self.UNIQUE_ID, self.SID, response.message, 0, self.IS_DEBUG);
                callback(response)
            }
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
  Module : Device Connection process
  Author : Mayank [SOFTWEB]
  Inputs : 
  Output : Device provisioning response
  Date   : 2020-04-13
   */
  deviceDPSProvisioning(callback) {
    var self = this;
    try {
        self.commonLib.deviceDPSProvisioning(function (response) {
            if(response.status) {
                self.commonLib.manageDebugLog("INFO_IN17", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                callback(response)
            } else {
                self.commonLib.manageDebugLog("ERR_IN01", self.UNIQUE_ID, self.SID, response.message, 0, self.IS_DEBUG);
                callback(response)
            }
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
						// console.log("=========== sub responseData ==> ", response);
                        if(response.status) {
                            var responseData = cache.get(self.SID + "_" + self.UNIQUE_ID);
							// console.log("=========== sub responseData ==> ", responseData);
                            if(responseData && "has" in responseData) { 
                                self.reqDataForActiveProperty(responseData.has);
                            } else { // For Azure 
                                setTimeout(() => {
                                    self.getSyncDataByCommandType(config.msgType.all, function(res){
                                        // console.log("all 200 request send => ",res);
                                    });
                                }, 1000);
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
        var cmdType = response.data.cmdType;
        switch (response.data.cmdType) {
            case config.commandType.CORE_COMMAND: //1 - Ok device
                self.commonLib.manageDebugLog("INFO_CM01", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                var data = response.data.data;
                if(self.DEVICE_CMD_CALLBACK)
                    self.DEVICE_CMD_CALLBACK(data);
                break;

            case config.commandType.FIRMWARE_UPDATE: //2 - Firmware update
                self.commonLib.manageDebugLog("INFO_CM02", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                var data = response.data.data;
                if(self.OTA_CMD_RECEIVED_CALLBACK)
                    self.OTA_CMD_RECEIVED_CALLBACK(data);
                break;

            case config.commandType.ATTRIBUTE_INFO_UPDATE: //10 - Attribute Changed
                self.commonLib.manageDebugLog("INFO_CM03", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                var requestedParams = config.attributeParams;
                break;

            case config.commandType.SETTING_INFO_UPDATE: //11 - Setting Changed
                self.commonLib.manageDebugLog("INFO_CM04", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                var requestedParams = config.settingsParams;
                break;

            // case config.commandType.PASSWORD_INFO_UPDATE: //12 - Password Changed
            //     self.commonLib.manageDebugLog("INFO_CM05", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
            //     // var requestedParams = config.protocolParams;
            //     var requestedParams = undefined;
            //     // if (self.DEVICE_CONNECTED) {
            //     //     // var deviceConnection = self.CLIENT_CONNECTION;
            //     //     // deviceConnection.end();
            //     //     console.log("disconnect 1.0.0");
            //     //     self.disconnect();
            //     //     // self.DEVICE_CONNECTED = false;
            //     //     // self.STOP_SDK_CONNECTION = false;
            //     // }
            //     break;

            case config.commandType.DEVICE_INFO_UPDATE: //13 - Device Changed
                self.commonLib.manageDebugLog("INFO_CM06", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                var requestedParams = config.deviceParams;
                break;

            case config.commandType.RULE_INFO_UPDATE: //15 - Rule Changed
                self.commonLib.manageDebugLog("INFO_CM07", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                var requestedParams = config.ruleParams;
                break;

            case config.commandType.STOP_SDK_CONNECTION: //99 - STOP SDK CONNECTION
                self.commonLib.manageDebugLog("INFO_CM08", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                self.disconnect(config.commandType.STOP_SDK_CONNECTION);
                var requestedParams = undefined;
                break;

            case config.commandType.DEVICE_CONNECTION_STATUS: //16 - Connection status true/false
                var data = response.data.data;
                if(data.command) {
                    self.DEVICE_CONNECTED = true;
                    // self.STOP_SDK_CONNECTION = true;
                } else {
                    self.DEVICE_CONNECTED = false;
                    // self.STOP_SDK_CONNECTION = false;
                }
                var requestedParams = undefined;
                self.commonLib.manageDebugLog("INFO_CM09", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                if(self.CONNECTION_STATUS_CALLBACK)
                    self.CONNECTION_STATUS_CALLBACK(data);
                break;
			
			case config.commandType.DATA_FREQUENCY_UPDATE: //17 - Data Frequency Updated
				self.commonLib.manageDebugLog("INFO_CM18", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
				var requestedParams = config.allStatusParams;
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
        var self = this;
        var ctStatus = response.d.ct;
        var cacheId = self.SID+"_"+self.UNIQUE_ID;
        // console.log("response.d => ", response.d);
        switch (ctStatus) {
            case config.msgType.allStatus: //200 - All data
                // console.log("response.d ==> ", response.d)
                if (response.d.ec == 0 && response.d.ct == config.msgType.allStatus) {  
                    response.d["id"] = self.UNIQUE_ID;
                    response.d["sid"] = self.SID;
                    if(response.d.meta && response.d.meta.tg){
                        response.d["d"] = [ { "tg": response.d.meta.tg, "id": self.UNIQUE_ID, "s": 0 } ]
                        self.SDK_OPTIONS.isGatewayDevice = true;
                    } else {
                        response.d["d"] = [ { "tg": '', "id": self.UNIQUE_ID, "s": 0 } ]
                        self.SDK_OPTIONS.isGatewayDevice = false;
                    }
                    // response.d["env"] = self.ENV;
                    // console.log("response.d ==> ", JSON.stringify(response.d));
                    cache.put(cacheId, response.d);
                    // console.log("======= > ", cache.get(cacheId));
                    this.reqDataForActiveProperty(response.d.has);
                    // self.startEdgeDeviceProcess();
                    self.commonLib.manageDebugLog("INFO_CM11", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                }
            break;
        
            case config.msgType.attribute: //201 - attribute
                if (response.d.ec == 0  && response.d.ct == config.msgType.attribute) {  
                    var deviceData = cache.get(cacheId);
                    deviceData["att"] = response.d['att'];
                    cache.put(cacheId, deviceData);
                    self.commonLib.manageDebugLog("INFO_CM12", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                    self.ATTR_ACTIVE = true;
                    // console.log("attribute ",self.ATTR_ACTIVE + "=== "+ self.RULE_ACTIVE);
                    if(self.ATTR_ACTIVE && self.RULE_ACTIVE && (self.DEVICE_ACTIVE || deviceData.meta.tg == "") ){
                        self.startEdgeDeviceProcess();  
                    }

                    if(self.ATTR_ACTIVE && (self.DEVICE_ACTIVE || deviceData.meta.tg == "") ){
                        if(self.ATTRIBUTE_CHANGED_CALLBACK){
                            self.ATTRIBUTE_CHANGED_CALLBACK(response.d['att']);
                        }
                    }
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
                    deviceData["r"] = response.d['r'];
                    cache.put(cacheId, deviceData);
                    self.RULE_ACTIVE = true;
                    self.commonLib.manageDebugLog("INFO_CM14", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                    if(self.ATTR_ACTIVE && self.RULE_ACTIVE && self.DEVICE_ACTIVE){
                        // console.log("rule ",self.ATTR_ACTIVE + "=== "+ self.RULE_ACTIVE);
                        self.startEdgeDeviceProcess();  
                    }
                }
                break;
        
            case config.msgType.childDevice: //204 - childDevice
                if (response.d.ec == 0 && response.d.ct == config.msgType.childDevice) {  
                    var deviceData = cache.get(cacheId);
                    deviceData["d"] = response.d['d'];
                    cache.put(cacheId, deviceData);
                    self.DEVICE_ACTIVE = true;
                    self.commonLib.manageDebugLog("INFO_CM15", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                    if(self.ATTR_ACTIVE && self.RULE_ACTIVE && self.DEVICE_ACTIVE){
                        // console.log("rule ",self.ATTR_ACTIVE + "=== "+ self.RULE_ACTIVE);
                        self.startEdgeDeviceProcess();  
                    }
                    // console.log("attribute changed from de   vice => ",self.ATTR_ACTIVE + "=== "+ self.RULE_ACTIVE);
                    if(self.ATTR_ACTIVE && (self.DEVICE_ACTIVE  || deviceData.meta.tg == "") ){
                        if(self.ATTRIBUTE_CHANGED_CALLBACK){
                            self.ATTRIBUTE_CHANGED_CALLBACK(response.d['att']);
                        }
                    }
                }
                break;

            case config.msgType.ota: //205 - ota
                if (response.d.ec == 0 && response.d.ct == config.msgType.ota) {  
                    var deviceData = cache.get(cacheId);
                    deviceData["ota"] = response.d['ota'];
                    cache.put(cacheId, deviceData);
                    // if(self.OTA_CMD_RECEIVED_CALLBACK){
                    //     self.OTA_CMD_RECEIVED_CALLBACK(response.d['ota']);
                    // }
                }
                break;

            case config.msgType.all: //210 - All information
                if (response.d.ec == 0 && response.d.ct == config.msgType.all) {  
                    var deviceData = {};
                    response.d["id"] = self.UNIQUE_ID;
                    response.d["sid"] = self.SID;
                    cache.put(cacheId, response.d);
                    self.ATTR_ACTIVE = true;
                    self.RULE_ACTIVE = true;
                    self.DEVICE_ACTIVE = true;
                    self.commonLib.manageDebugLog("INFO_CM17", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                    if(self.ATTR_ACTIVE && self.RULE_ACTIVE && self.DEVICE_ACTIVE){
                        self.startEdgeDeviceProcess();  
                    }
                    if(self.ATTR_ACTIVE && self.DEVICE_ACTIVE ){
                        if(self.ATTRIBUTE_CHANGED_CALLBACK){
                            self.ATTRIBUTE_CHANGED_CALLBACK(response.d["att"]);
                        }
                    }
                }
                break;
            
            default:
                // console.log(cpid + "_" + uniqueId + " :: SYNC MessageType :: " + ctStatus + " :: UNKNOWN_COMMAND_FOUND");
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
      Output : Device detail with all atrributes
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
            // var deviceUniqueId = self.UNIQUE_ID;
            self.commonLib.getAttributes(function (response) {
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
                                if (attrib.dt == 2) {
                                    console.log(attrib)
                                    if (attrib.p != "") {
                                        delete attrib.agt;
                                        var pcAttributes = {
                                            "ln": attrib.p,
                                            "dt": self.dataTypeToString(attrib.dt),
                                            "tw": attrib.tw == "" ? undefined : attrib.tw,
                                            "d": []
                                        };
                                    }
                                    async.forEachSeries(attrib.d, function (att, cb_attr) {
                                        if (att.tg == device.tg) // Parent
                                        {
                                            var cAttribute = {
                                                "ln": att.ln,
                                                "dt": self.dataTypeToString(att.dt),
                                                "dv": att.dv,
                                                "tg": att.tg == "" ? undefined : att.tg,
                                                "tw": att.tw == "" ? undefined : att.tw
                                            }
                                            pcAttributes.d.push(cAttribute)
                                        }
                                        cb_attr();
                                    }, function () {
                                        console.log(pcAttributes);
                                        attArray['attributes'].push(pcAttributes)
                                        callbackatt();
                                    })
                                } else {
                                    async.forEachSeries(attrib.d, function (att, cb_attr) {
                                        if (att.tg == device.tg) // Parent
                                        {
                                            if (att.tg == "")
                                                delete att.tg;
                                            delete att.agt;
                                            att.dt = self.dataTypeToString(att.dt)
                                            attArray['attributes'].push(att);
                                        }
                                        cb_attr();
                                    }, function () {
                                        callbackatt();
                                    })
                                }
                            } else {
                                if (attrib.tg == device.tg) // Parent
                                {
                                    if (attrib.p != "") {
                                        delete attrib.agt;
                                        var pcAttributes = {
                                            "ln": attrib.p,
                                            "dt": self.dataTypeToString(attrib.dt),
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
                                                "dt": self.dataTypeToString(att.dt),
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
    Inputs : uniqueID, client connecction
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

    async dataTypeToString(value) {
        switch (value) {
            case config.dataType.number: // 0 = number
                return 'number';
            case config.dataType.string: // 1 = string
                return 'string'
            case config.dataType.object: // 2 = object
                return 'object';
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

	async getSecrets(callback) {
        var self = this;
        if(typeof callback == "function"){
            self.REQUEST_FOR_SECRET_CONFIGURATION = callback;
        } else {
            self.commonLib.manageDebugLog("ERR_CM11", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
        }
    }
}

module.exports = Tpm;