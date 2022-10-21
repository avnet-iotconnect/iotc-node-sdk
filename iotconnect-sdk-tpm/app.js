'use strict';

var cache = require('memory-cache');
var config = require('./config/config');
var fs = require('fs-extra');
var async = require('async');
global.GLOBAL_CALLBACK_TWIN = "";
global.GLOBAL_CALLBACK = "";

class Init {
  constructor(cpid, uniqueId, scopeId, messageCallback, twinCallback, sdkOptions={}, env = "") {
    this.commonLib = require('./lib/common');
    this.UNIQUE_ID = uniqueId;
    this.CPID = cpid;
    this.ENV = (env && env != "" && env != undefined && env != null) ? env : "prod";
    this.CERT_PATH_FLAG = true;
    try {
      if(sdkOptions && 'isDebug' in sdkOptions) {
        this.IS_DEBUG = sdkOptions.isDebug;
      } else {
        this.IS_DEBUG = false; // for Local testing true else false
      }
    } catch (error) {
      console.log(error);
    }
    
    if(!cpid){
      this.commonLib.manageDebugLog("ERR_IN04", this.UNIQUE_ID, this.CPID, "", 0, this.IS_DEBUG);
    }
    if(!uniqueId){
      this.commonLib.manageDebugLog("ERR_IN05", this.UNIQUE_ID, this.CPID, "", 0, this.IS_DEBUG);
    }

    let sdkOpt = {};
    if(scopeId) {
      this.SCOPE_ID = scopeId;
    } else {
      this.commonLib.manageDebugLog("ERR_IN16", this.UNIQUE_ID, this.CPID, "", 0, this.IS_DEBUG);
      this.SCOPE_ID = "";
      process.exit();
    }
    this.IS_TPM_DEVICE = (this.SCOPE_ID) ? true : false;

    if(sdkOptions && 'isSimulatedTPMDevice' in sdkOptions) {
      this.IS_TPM_SIMULATOR_AUTH = sdkOptions.isSimulatedTPMDevice;
    } else {
      this.IS_TPM_SIMULATOR_AUTH = false; // for Local testing true else false
    }
    sdkOpt['isSimulatedTPM'] = this.IS_TPM_SIMULATOR_AUTH;
    
    this.createPredeffinedLogDirecctories();
    if (sdkOptions && 'discoveryUrl' in sdkOptions) {
      if(sdkOptions.discoveryUrl != "" && sdkOptions.discoveryUrl != undefined && sdkOptions.discoveryUrl != null) {
        this.DISCOVERY_URL = sdkOptions.discoveryUrl;
        if(this.DISCOVERY_URL.charAt(this.DISCOVERY_URL.length-1) == "/") {
          this.DISCOVERY_URL = this.DISCOVERY_URL.substring(0, this.DISCOVERY_URL.length - 1);
        }
        sdkOpt['discoveryUrl'] = this.DISCOVERY_URL;
      } else {
        this.commonLib.manageDebugLog("ERR_IN02", this.UNIQUE_ID, this.CPID, "", 0, this.IS_DEBUG);
      }
    } else {
      sdkOpt['discoveryUrl'] = config.discoveryUrlHost;
      this.DISCOVERY_URL = config.discoveryUrlHost;
    }

    if (sdkOptions && 'certificate' in sdkOptions) {
      let cert = {
        "SSLKeyPath"	: (sdkOptions.certificate.SSLKeyPath && fs.existsSync(sdkOptions.certificate.SSLKeyPath)) ? sdkOptions.certificate.SSLKeyPath : this.CERT_PATH_FLAG = false , //<< SystemPath >>/key.pem",
        "SSLCertPath" : (sdkOptions.certificate.SSLCertPath && fs.existsSync(sdkOptions.certificate.SSLCertPath)) ? sdkOptions.certificate.SSLCertPath : this.CERT_PATH_FLAG = false, //"<< SystemPath >>/cert.pem",
        "SSLCaPath"   : (sdkOptions.certificate.SSLCaPath && fs.existsSync(sdkOptions.certificate.SSLCaPath)) ? sdkOptions.certificate.SSLCaPath : this.CERT_PATH_FLAG = false //"<< SystemPath >>/ms.pem"
      }
      sdkOpt['certificate'] = cert;
    } else {
      this.CERT_PATH_FLAG = false;
    }
    
    if (sdkOptions && 'offlineStorage' in sdkOptions) {
      let offline = {
        "disabled" : (!sdkOptions.offlineStorage.disabled) ? false : sdkOptions.offlineStorage.disabled, //in MB deafault is FALSE 
        "availSpaceInMb" : (!sdkOptions.offlineStorage.availSpaceInMb) ? 0 : sdkOptions.offlineStorage.availSpaceInMb, //in MB deafault is unlimited MB
        "fileCount" : (!sdkOptions.offlineStorage.fileCount || !sdkOptions.offlineStorage.availSpaceInMb) ? 1 : sdkOptions.offlineStorage.fileCount  //Default fileCount is 1
      }
      sdkOpt['offlineStorage'] = offline;
    } else {
      let offline = {
        "disabled" : false, //in MB deafault is FALSE 
        "availSpaceInMb" : 0, //in MB deafault is unlimited MB
        "fileCount" : 1  //Default fileCount is 1
      }
      sdkOpt['offlineStorage'] = offline;
    }
    let offlinePerFileDataLimit = eval(eval(sdkOpt.offlineStorage.availSpaceInMb * 1024) / sdkOpt.offlineStorage.fileCount); //Convert In KB
    let offlineFileCouunt = sdkOpt.offlineStorage.fileCount;
    let offlineProcessDisabled = sdkOpt.offlineStorage.disabled;
    this.offlineFileConfig = { 
      "offlineProcessDisabled" : offlineProcessDisabled,
      "offlinePerFileDataLimit" : offlinePerFileDataLimit,
      "offlineFileCouunt" : offlineFileCouunt 
    }
    this.SDK_OPTIONS = sdkOpt;
    this.DEVICE_CONNECTED = false;
    this.STOP_SDK_CONNECTION = false;
    this.CLIENT_CONNECTION = "";
    this.LOG_PATH = "./logs/offline/" + cpid + "_" + uniqueId + "/";
    GLOBAL_CALLBACK = messageCallback
    GLOBAL_CALLBACK_TWIN = twinCallback
    this.intervalObj = [];
    if(cpid && uniqueId){
      this.init(cpid, uniqueId, env, sdkOpt, function (response) {
        messageCallback(response)
      })
    }
  }

  async createPredeffinedLogDirecctories(){
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
        let logText = "\n[ERR_IN01] "+new Date().toUTCString()+" ["+self.CPID+"_"+self.UNIQUE_ID+"] : "+error.message;
        console.log(logText);
      }
    }
  }

  /* 
  Module : Init Call
  Author : Mayank [SOFTWEB]
  Inputs : cpid, uniqueId, env, sdkOption params
  Output : Connected brokr client object 
  Date   : 2018-01-24
   */
  async init(cpId, uniqueId, env, sdkOptions, callback) {
    var self = this;
    if ((cpId != "" || cpId != undefined || cpId != null) && (uniqueId != "" || uniqueId != undefined || uniqueId != null) && (env != "" || env != undefined || env != null)) {
      var cpId = cpId;
      var uniqueId = uniqueId;
      var LOG_PATH = this.LOG_PATH;
      var newDevice = {};
      try {
        var syncData = "";
        self.commonLib.manageDebugLog("INFO_IN04", self.UNIQUE_ID, self.CPID, "", 1, self.IS_DEBUG);
        self.syncDevice(function (response) {
          syncData = response;
          if (response.status) {
            // response.data.rc = 1;
            if (response.data.ds == 0) {
              response.data["id"] = uniqueId;
              cache.put(self.CPID+"_"+uniqueId, response.data);
              self.DEVICE_CONNECTED = false;
              if(!self.offlineFileConfig.offlineProcessDisabled)
              {
                try {
                  if (!fs.existsSync(LOG_PATH)) {
                    fs.mkdirSync(LOG_PATH);
                  }
                } catch (error) {
                  self.commonLib.manageDebugLog("ERR_IN07", self.UNIQUE_ID, self.CPID, "", 0, self.IS_DEBUG);
                  self.commonLib.manageDebugLog("ERR_IN01", self.UNIQUE_ID, self.CPID, error.message, 0, self.IS_DEBUG);
                  callback({
                    status: false,
                    data: [],
                    message: "Log directory create error :: "+error.message
                  })
                }
              }
              /*
              if(hbStatusFlag == 0)
              {
                hbStatusFlag = 1;  
                self.commonLib.startHeartBeat(self.UNIQUE_ID);*/
                if((response.data.at == config.authType.CA_SIGNED || response.data.at == config.authType.CA_SELF_SIGNED) && self.CERT_PATH_FLAG == false){
                  self.commonLib.manageDebugLog("ERR_IN06", self.UNIQUE_ID, self.CPID, "", 0, self.IS_DEBUG);
                  // process.exit();
                } else {
                  self.deviceConnectionProcess(function (response) {
                    callback({
                      status: response.status,
                      data: response.data,
                      message: response.message
                    })
                  });
                }
              //}
            } else {
              var message = "";
              switch (response.data.ds) {
                case config.responseCode.DEVICE_NOT_REGISTERED: // 1 - Device Not Registered
                  self.commonLib.manageDebugLog("INFO_IN09", self.UNIQUE_ID, self.CPID, "", 1, self.IS_DEBUG);
                  if (response.data.sc) {
                    var duration = parseInt(response.data.sc.sf) * 1000;
                  } else {
                    var duration = 10000;
                  }
                  if(self.IS_TPM_DEVICE && response.data.at == config.authType.TPM) {
                    self.tpmDeviceEnrollment(function (response) {
                      if(response.status) {
                        self.commonLib.manageDebugLog("INFO_IN16", self.UNIQUE_ID, self.CPID, "", 1, self.IS_DEBUG);
                        setTimeout(() => {
                          self.init(cpId, uniqueId, env, sdkOptions, function (cb) {
                            GLOBAL_CALLBACK = cb;
                          });
                        }, duration);
                      } else {
                        self.commonLib.manageDebugLog("INFO_IN06", self.UNIQUE_ID, self.CPID, "", 1, self.IS_DEBUG);
                        self.init(cpId, uniqueId, env, sdkOptions, function (cb) {
                          GLOBAL_CALLBACK = cb;
                        });
                      }
                    })
                  } else {
                    setTimeout(() => {
                      self.commonLib.manageDebugLog("INFO_IN06", self.UNIQUE_ID, self.CPID, "", 1, self.IS_DEBUG);
                      self.init(cpId, uniqueId, env, sdkOptions, function (cb) {
                        GLOBAL_CALLBACK = cb;
                      });
                    }, duration);
                  }
                  var message = "DEVICE_NOT_REGISTERED";
                  break;

                case config.responseCode.AUTO_REGISTER: // 2 - Auto Register
                  self.commonLib.manageDebugLog("INFO_IN10", self.UNIQUE_ID, self.CPID, "", 1, self.IS_DEBUG);
                  var message = "AUTO_REGISTER";
                  break;

                case config.responseCode.DEVICE_NOT_FOUND: // 3 - Device Not Found
                  self.commonLib.manageDebugLog("INFO_IN11", self.UNIQUE_ID, self.CPID, "", 1, self.IS_DEBUG);
                  if (response.data.sc) {
                    var duration = parseInt(response.data.sc.sf) * 1000;
                  } else {
                    var duration = 10000;
                  }
                  setTimeout(() => {
                    self.commonLib.manageDebugLog("INFO_IN06", self.UNIQUE_ID, self.CPID, "", 1, self.IS_DEBUG);
                    self.init(cpId, uniqueId, env, sdkOptions, function (cb) {
                      GLOBAL_CALLBACK = cb;
                    });
                  }, duration);
                  var message = "DEVICE_NOT_FOUND";
                  break;

                case config.responseCode.DEVICE_INACTIVE: // 4 - Device InActive
                  self.commonLib.manageDebugLog("INFO_IN12", self.UNIQUE_ID, self.CPID, "", 1, self.IS_DEBUG);
                  if (response.data.sc) {
                    var duration = parseInt(response.data.sc.sf) * 1000;
                  } else {
                    var duration = 10000;
                  }
                  setTimeout(() => {
                    self.commonLib.manageDebugLog("INFO_IN06", self.UNIQUE_ID, self.CPID, "", 1, self.IS_DEBUG);
                    self.init(cpId, uniqueId, env, sdkOptions, function (cb) {
                      GLOBAL_CALLBACK = cb;
                    });
                  }, duration);
                  var message = "DEVICE_INACTIVE";
                  break;

                case config.responseCode.OBJECT_MOVED: // 5 - Object Moved
                  self.commonLib.manageDebugLog("INFO_IN13", self.UNIQUE_ID, self.CPID, "", 1, self.IS_DEBUG);
                  var message = "OBJECT_MOVED";
                  break;

                case config.responseCode.CPID_NOT_FOUND: // 6 - Device InActive
                  self.commonLib.manageDebugLog("INFO_IN14", self.UNIQUE_ID, self.CPID, "", 1, self.IS_DEBUG);
                  var message = "CPID_NOT_FOUND";
                  // process.exit();
                  break;

                default:
                  self.commonLib.manageDebugLog("INFO_IN15", self.UNIQUE_ID, self.CPID, "", 1, self.IS_DEBUG);
                  var message = "NO_RESPONSE_CODE_MATCHED";
                  break;
              }
              callback({
                status: false,
                data: [],
                message: message
              })
            }
          } else {
            self.commonLib.manageDebugLog("ERR_IN01", self.UNIQUE_ID, self.CPID, response.message, 0, self.IS_DEBUG);
            callback({
              status: false,
              data: response.data,
              message: response.message
            })
          }
        })
      } catch (err) {
        self.commonLib.manageDebugLog("ERR_IN01", self.UNIQUE_ID, self.CPID, err.message, 0, self.IS_DEBUG);
        callback({
          status: false,
          data: err.message,
          message: "Something  went wrong."
        })
      }
    } else {
      self.commonLib.manageDebugLog("ERR_IN15", self.UNIQUE_ID, self.CPID, "", 0, self.IS_DEBUG);
      callback({
        status: false,
        data: [],
        message: "Missing required parameter 'cpId' or 'uniqueId' or 'env' to initialize the device connection"
      })
    }
  }

  /* 
  Module : Get Device Information
  Author : Mayank [SOFTWEB]
  Inputs : cpid, uniqueId, env
  Output : Devie info 
  Date   : 2018-01-24
   */
  syncDevice(callback) {
    try {
      var initialParams = config.defaultParams;
      this.commonLib.syncDevice(this.CPID, this.UNIQUE_ID, initialParams, this.ENV, this.DISCOVERY_URL, this.IS_DEBUG, function (response) {
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
  Module : Device Connection process
  Author : Mayank [SOFTWEB]
  Inputs : 
  Output : Global callback for command and other data 
  Date   : 2020-04-13
   */
  tpmDeviceEnrollment(callback) {
    var self = this;
    try {
      self.commonLib.tpmDeviceEnrollment(self.CPID, self.UNIQUE_ID, self.SCOPE_ID, this.SDK_OPTIONS,  function (response) {
        if(response.status) {
          callback(response)
        } else {
          self.commonLib.manageDebugLog("ERR_IN01", self.UNIQUE_ID, self.CPID, response.message, 0, self.IS_DEBUG);
          callback(response)
        }
      })
    } catch (error) {
      self.commonLib.manageDebugLog("ERR_IN01", self.UNIQUE_ID, self.CPID, error.message, 0, self.IS_DEBUG);
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
  Output : Global callback for command and other data 
  Date   : 2020-04-13
   */
  deviceConnectionProcess(callback) {
    var self = this;
    this.clientConnection(function (clientResponse) {
      if (clientResponse.status) {
        var mqttClient = clientResponse.data.data.mqttClient;
        self.CLIENT_CONNECTION = mqttClient;
        self.startEdgeDeviceProcess();
        self.startCommandSubscriber(self.CPID, self.UNIQUE_ID, clientResponse.data, self.IS_TPM_DEVICE, function (response) {
          if (response.status) { 
            if(response.data.uniqueId == self.UNIQUE_ID) {
              GLOBAL_CALLBACK(response.data);
            }
          } else {
            callback({
              status: response.status,
              data: response.data,
              message: response.message
            })
          }
        })
      } else {
        callback(clientResponse)
      }
    })
  }

  /* 
  Module : Client Connection
  Author : Mayank [SOFTWEB]
  Inputs : uniqueId, sdk Option params
  Output : Connected brokr client object 
  Date   : 2020-04-13
   */
  clientConnection(callback) {
    try {
      this.commonLib.clientConnection(this.UNIQUE_ID, this.SDK_OPTIONS, this.CPID, this.IS_DEBUG, function (response) {
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
  Inputs : cpid, uniqueId, device client connection
  Output : start listner 
  Date   : 2018-01-24
  */
  startCommandSubscriber(cpId, uniqueId, clientData, isTpmDevice, callback) {
    try {
      var self = this;
      this.commonLib.subscriberProcess(cpId, uniqueId, clientData, this.DEVICE_CONNECTED, this.offlineFileConfig, this.IS_DEBUG, isTpmDevice, function (response) {
        if (response.status) {
          self.manageCommand(cpId, uniqueId, response, function (deviceCommandAck) {
            callback({
              status: response.status,
              data: deviceCommandAck,
              message: response.message
            })
          })
        } else {
          callback({
            status: response.status,
            data: response.data,
            message: response.message
          })
        }
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
  Inputs : cpid, uniqueId, message from subscribed listener
  Output : Manage Command
  Date   : 2020-04-13   
  */
  manageCommand(cpid, uniqueId, response, callback) {
    var self = this;
    var cmdType = response.data.cmdType;
    switch (cmdType) {
      case config.commandType.CORE_COMMAND: //1 - Ok device
        self.commonLib.manageDebugLog("INFO_CM01", self.UNIQUE_ID, self.CPID, "", 1, self.IS_DEBUG);
        var data = response.data.data;
        callback(data);
        break;

      case config.commandType.FIRMWARE_UPDATE: //2 - Firmware update
        self.commonLib.manageDebugLog("INFO_CM02", self.UNIQUE_ID, self.CPID, "", 1, self.IS_DEBUG);
        var data = response.data.data;
        callback(data);
        break;

      case config.commandType.ATTRIBUTE_INFO_UPDATE: //10 - Attribute Changed
        self.commonLib.manageDebugLog("INFO_CM03", self.UNIQUE_ID, self.CPID, "", 1, self.IS_DEBUG);
        var requestedParams = config.attributeParams;
        break;

      case config.commandType.SETTING_INFO_UPDATE: //11 - Setting Changed
        self.commonLib.manageDebugLog("INFO_CM04", self.UNIQUE_ID, self.CPID, "", 1, self.IS_DEBUG);
        var requestedParams = config.settingeParams;
        break;

      case config.commandType.PASSWORD_INFO_UPDATE: //12 - Password Changed
        self.commonLib.manageDebugLog("INFO_CM05", self.UNIQUE_ID, self.CPID, "", 1, self.IS_DEBUG);
        var requestedParams = config.protocolParams;
        // if (self.CLIENT_CONNECTION && self.DEVICE_CONNECTED) {
        //   var deviceConnection = self.CLIENT_CONNECTION;
        //   deviceConnection.end();
        //   self.DEVICE_CONNECTED = false;
        //   self.STOP_SDK_CONNECTION = false;
        // }
        break;

      case config.commandType.DEVICE_INFO_UPDATE: //13 - Device Changed
        self.commonLib.manageDebugLog("INFO_CM06", self.UNIQUE_ID, self.CPID, "", 1, self.IS_DEBUG);
        var requestedParams = config.deviceParams;
        break;

      case config.commandType.RULE_INFO_UPDATE: //15 - Rule Changed
        self.commonLib.manageDebugLog("INFO_CM07", self.UNIQUE_ID, self.CPID, "", 1, self.IS_DEBUG);
        var requestedParams = config.ruleParams;
        break;

      case config.commandType.STOP_SDK_CONNECTION: //99 - STOP SDK CONNECTION
        self.commonLib.manageDebugLog("INFO_CM08", self.UNIQUE_ID, self.CPID, "", 1, self.IS_DEBUG);
        self.dispose(config.commandType.STOP_SDK_CONNECTION);
        var requestedParams = undefined;
        break;

      case config.commandType.DEVICE_CONNECTION_STATUS: //16 - Connection status true/false
        
        var data = response.data.data;
        self.DEVICE_CONNECTED = true;
        self.STOP_SDK_CONNECTION = true;
        var requestedParams = undefined;
        self.commonLib.manageDebugLog("INFO_CM09", self.UNIQUE_ID, self.CPID, "", 1, self.IS_DEBUG);
        callback(data);
        break;

      default:
        break;
    }

    if (requestedParams != "" && requestedParams != undefined) {
      this.commonLib.syncDeviceOnDemand(cpid, self.ENV, uniqueId, requestedParams, cmdType, this.intervalObj, this.DISCOVERY_URL, this.IS_DEBUG, function (response) {
        if (cmdType == config.commandType.PASSWORD_INFO_UPDATE && IS_TPM_DEVICE == false) {
          self.deviceConnectionProcess()
        } else {
          // self.intervalObj = [];
          self.startEdgeDeviceProcess(requestedParams);
        }
      });
    }
  }

  /* 
  Module : Device 
  Author : Mayank [SOFTWEB]
  Inputs : 
  Output : Edge devie processing
  Date   : 2020-04-14
   */
  startEdgeDeviceProcess(requestedParams="") {
    var self = this;
    var responseData = cache.get(this.CPID+"_"+this.UNIQUE_ID);
    if (responseData.ee == config.edgeEnableStatus.enabled) {
      async.series([
        function (cb_series) {
          try {
            self.commonLib.setEdgeConfiguration(responseData.att, self.UNIQUE_ID, responseData.d, function (res) {
              if(res.status){
                responseData.edgeData = res.data.mainObj;
                if((requestedParams && requestedParams.attribute) || requestedParams == ""){
                  async.forEachSeries(res.data.intObj, function (data, cb_inner) {
                    self.commonLib.setIntervalForEdgeDevice(data.tumblingWindowTime, data.lastChar, data.edgeAttributeKey, data.uniqueId, data.attrTag, data.devices, self.CLIENT_CONNECTION, self.ENV, self.offlineFileConfig, self.intervalObj, self.CPID, self.IS_DEBUG);
                      cb_inner();
                  }, function () {
                   });
                }
              } else {
                self.commonLib.manageDebugLog("ERR_IN01", self.UNIQUE_ID, self.CPID, res.message, 0, self.IS_DEBUG);
              }
              cb_series();
            });
          } catch (err) {
            self.commonLib.manageDebugLog("ERR_IN01", self.UNIQUE_ID, self.CPID, err.message, 0, self.IS_DEBUG);
            cb_series();
          }
        },
        function (cb_series) {
          try {
            self.commonLib.setRuleaConfiguration(responseData.r, self.UNIQUE_ID, function (res) {
              if(res.status)
                responseData.rulesData = res.data;
              else
                self.commonLib.manageDebugLog("ERR_IN01", self.UNIQUE_ID, self.CPID, res.message, 0, self.IS_DEBUG);
              cb_series();
            });
          } catch (err) {
            self.commonLib.manageDebugLog("ERR_IN01", self.UNIQUE_ID, self.CPID, err.message, 0, self.IS_DEBUG);
            cb_series();
          }
        }
      ], function (err, response) {})
    }
  }

  /*
    Module : Device 
    Author : Mayank [SOFTWEB]
    Inputs : cpid, uniqueId (Device serial number)
    Output : Device detail with all atrributes
    Date   : 2018-01-24
  */
  sendData(data) {
    if (data != "" && data.length > 0 && typeof data == 'object') {
      try {
        var self = this;
        var dateTimeArray = data.filter(date => {
          if(checkDateObjFormat(date.time)){
            return true; 
          } else {
            return true; 
          }
        });
        if (this.STOP_SDK_CONNECTION == true && this.UNIQUE_ID == data[0].uniqueId && dateTimeArray.length == data.length) {
          this.commonLib.SendDataToHub(data, this.UNIQUE_ID, this.CPID, this.ENV, this.CLIENT_CONNECTION, this.LOG_PATH, self.offlineFileConfig, self.IS_DEBUG, function (response) {
            if (response.status) {}
          })
        } else {
          if(this.UNIQUE_ID != data[0].uniqueId) {
            this.commonLib.manageDebugLog("ERR_SD02", this.UNIQUE_ID, this.CPID, "", 0, this.IS_DEBUG);
          } 
          if(dateTimeArray.length != data.length) {
            this.commonLib.manageDebugLog("ERR_SD03", this.UNIQUE_ID, this.CPID, "", 0, this.IS_DEBUG);
          }
          if(this.STOP_SDK_CONNECTION == false){
            this.commonLib.manageDebugLog("ERR_SD04", this.UNIQUE_ID, this.CPID, "", 0, this.IS_DEBUG);
          }
        }
      } catch (err) {
        this.commonLib.manageDebugLog("ERR_SD01", this.UNIQUE_ID, this.CPID, err.message, 0, this.IS_DEBUG);
      }
    } else {
      if(!data){
        this.commonLib.manageDebugLog("ERR_SD06", this.UNIQUE_ID, this.CPID, "", 0, this.IS_DEBUG);
      }
      if(typeof data != 'object'){
        this.commonLib.manageDebugLog("ERR_SD05", this.UNIQUE_ID, this.CPID, "", 0, this.IS_DEBUG);
      }
    }
  }

  /*
    Module : Device 
    Author : Mayank [SOFTWEB]
    Inputs : cpid, uniqueId (Device serial number)
    Output : Device detail with all atrributes
    Date   : 2018-04-06
  */
  getAttributes(callback) {
    try {
      var self = this;
      var deviceUniqueId = this.UNIQUE_ID;
      this.commonLib.getAttributes(deviceUniqueId, this.CPID, function (response) {
        if(response.status){
          var sdkDataArray = [];
          async.forEachSeries(response.data.device, function (device, callbackdev) {
                    var attArray = {
                      "device": { "id" : device.id,"tg": device.tg == "" ? undefined : device.tg },
                      "attributes": []
                    }
                    var attributeData = response.data.attribute;
                    async.forEachSeries(attributeData, function (attrib, callbackatt) {
                        if(attrib.p == "") // Parent
                        {
                            if(attrib.dt == 2){
                              if(attrib.p != "")
                                {
                                  delete attrib.agt;
                                  var pcAttributes = {
                                    "ln" : attrib.p,
                                    "dt": dataTYpeToString(attrib.dt),
                                    "tw": attrib.tw == "" ? undefined : attrib.tw,
                                    "d" : [] 
                                  };
                              }
                              async.forEachSeries(attrib.d, function (att, cb_attr) {
                                  if(att.tg == device.tg) // Parent
                                  {
                                    var cAttribute = {
                                      "ln" : att.ln,
                                      "dt" : dataTYpeToString(att.dt),
                                      "dv" : att.dv,
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
                                async.forEachSeries(attrib.d, function (att, cb_attr) {
                                    if(att.tg == device.tg) // Parent
                                    {
                                        if(att.tg == "")
                                          delete att.tg;
                                        delete att.agt;
                                        att.dt = dataTYpeToString(att.dt)
                                        attArray['attributes'].push(att);
                                    } 
                                    cb_attr();
                                }, function () {
                                    callbackatt();
                                })
                            }
                        } else {  
                            if(attrib.tg == device.tg) // Parent
                            {
                                if(attrib.p != "")
                                {
                                  delete attrib.agt;
                                  var pcAttributes = {
                                    "ln" : attrib.p,
                                    "dt": dataTYpeToString(attrib.dt),
                                    "tg": attrib.tg == "" ? undefined : attrib.tg,
                                    "tw": attrib.tw == "" ? undefined : attrib.tw,
                                    "d" : [] 
                                  };
                                }
                                async.forEachSeries(attrib.d, function (att, cb_attr) {
                                    if(att.tg == device.tg) // Parent
                                    {
                                      var cAttribute = {
                                        "ln" : att.ln,
                                        "dt" : dataTYpeToString(att.dt),
                                        "dv" : att.dv,
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
                self.commonLib.manageDebugLog("INFO_GA01", self.UNIQUE_ID, self.CPID, "", 1, self.IS_DEBUG);
                callback({
                  status: true,
                  data: sdkDataArray,
                  message: "Attribute get successfully."
                });
            })
        } else {
          self.commonLib.manageDebugLog("ERR_GA02", self.UNIQUE_ID, self.CPID, "", 0, self.IS_DEBUG);
          callback({
            status: false,
            data: null,
            message: "Attributes data not found"
          });
        }
      })
    } catch (err) {
      self.commonLib.manageDebugLog("ERR_GA01", self.UNIQUE_ID, self.CPID, err.message, 0, self.IS_DEBUG);
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
    try {
      var self = this;
      if (self.STOP_SDK_CONNECTION == true && key && value) {
        var obj = {};
        obj[key] = value;
        // obj['cpId'] = self.CPID;
        // console.log("obj => ", obj);
        self.commonLib.UpdateTwin(obj, self.UNIQUE_ID, self.CLIENT_CONNECTION, self.offlineFileConfig, self.IS_DEBUG, self.CPID, function (response) {
          if(response.status) {
            self.commonLib.manageDebugLog("INFO_TP01", self.UNIQUE_ID, self.CPID, "", 1, self.IS_DEBUG);
          } else {
            self.commonLib.manageDebugLog("ERR_TP01", self.UNIQUE_ID, self.CPID, response.message, 0, self.IS_DEBUG);
          }
        })
      } else {
        if(self.STOP_SDK_CONNECTION == false) {
          self.commonLib.manageDebugLog("ERR_TP02", self.UNIQUE_ID, self.CPID, "", 0, self.IS_DEBUG);
        }
        if(!key || !value) {
          self.commonLib.manageDebugLog("ERR_TP03", self.UNIQUE_ID, self.CPID, "", 0, self.IS_DEBUG);
        }
      }
    } catch (err) {
      self.commonLib.manageDebugLog("ERR_TP01", self.UNIQUE_ID, self.CPID, err.message, 0, self.IS_DEBUG);
    }
  }


  /* 
  Module : Device disconnect 
  Author : Mayank [SOFTWEB]
  Inputs : uniqueID, client connecction
  Output : device disconnected message
  Date   : 2019-06-11
  */
  dispose(sdkconnection="") {
    try {
      if (this.DEVICE_CONNECTED) {
        var self = this;
        var deviceConnection = this.CLIENT_CONNECTION;
        this.commonLib.disconnectDevice(function (response) {
          if(response.status){
            var deviceCommandAck = {
                cpid: self.CPID,
                guid: '',
                uniqueId: self.UNIQUE_ID,
                command: false,
                ack: false,
                ackId: '',
                cmdType: config.commandType.DEVICE_CONNECTION_STATUS
            }
            self.DEVICE_CONNECTED = false;
            self.STOP_SDK_CONNECTION = false;
            if(sdkconnection != ""){
              self.commonLib.deleteAllLogFile(self.LOG_PATH);
            } 
            GLOBAL_CALLBACK(deviceCommandAck);
          }
        })
      } else {
        if(this.DEVICE_CONNECTED == false){
          this.commonLib.manageDebugLog("INFO_DC01", this.UNIQUE_ID, this.CPID, "", 1, this.IS_DEBUG);
        } else {
          this.commonLib.manageDebugLog("ERR_DC02", this.UNIQUE_ID, this.CPID, "", 0, this.IS_DEBUG);
        }
      }
    } catch (error) {
      this.commonLib.manageDebugLog("ERR_DC01", this.UNIQUE_ID, this.CPID, error.message, 0, this.IS_DEBUG);
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
    try {
      if (this.STOP_SDK_CONNECTION == true &&  objdata && typeof objdata == 'object' && mt) {
        var uniqueId = this.UNIQUE_ID;
        var cpId = this.CPID;
        var env = this.ENV;
        var self = this
        this.commonLib.sendCommandAck(objdata, mt, uniqueId, cpId, env, this.CLIENT_CONNECTION, this.offlineFileConfig, this.IS_DEBUG, function (response) {
          self.commonLib.manageDebugLog("INFO_CM10", uniqueId, cpId, "", 1, self.IS_DEBUG);
        })
      } else {
        if(this.STOP_SDK_CONNECTION == false) {
          this.commonLib.manageDebugLog("ERR_CM04", this.UNIQUE_ID, this.CPID, "", 0, this.IS_DEBUG);
        }
        if(!objdata || !mt) {
          this.commonLib.manageDebugLog("ERR_CM02", this.UNIQUE_ID, this.CPID, "", 0, this.IS_DEBUG);
        } else {
          if(typeof objdata != "object"){
            this.commonLib.manageDebugLog("ERR_CM03", this.UNIQUE_ID, this.CPID, "", 0, this.IS_DEBUG);
          }
        }
      }
    } catch (error) {
      this.commonLib.manageDebugLog("ERR_CM01", this.UNIQUE_ID, this.CPID, error.message, 0, this.IS_DEBUG);
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
    try {
      if (this.STOP_SDK_CONNECTION == true && this.DEVICE_CONNECTED == true) {
        var self = this;
        this.commonLib.getAllTwins(this.CLIENT_CONNECTION, this.UNIQUE_ID, this.CPID, function (response) {
          if(response.status){
            self.commonLib.manageDebugLog("INFO_TP02", self.UNIQUE_ID, self.CPID, "", 1, self.IS_DEBUG);
          } else {
            self.commonLib.manageDebugLog("ERR_TP05", self.UNIQUE_ID, self.CPID, "", 0, self.IS_DEBUG);
          }
        })
      } else {
        this.commonLib.manageDebugLog("ERR_TP04", this.UNIQUE_ID, this.CPID, "", 0, this.IS_DEBUG);
      }
    } catch (error) {
      this.commonLib.manageDebugLog("ERR_TP01", this.UNIQUE_ID, this.CPID, err.message, 0, this.IS_DEBUG);
    }
  }
}

function checkDateObjFormat(dateObj){
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

function dataTYpeToString(value){
  switch (value) {
    case config.dataType.number: // 0 = number
      return 'number';
    case config.dataType.string: // 1 = string
      return 'string'
    case config.dataType.object: // 2 = object
      return 'object';
  }
}

module.exports = Init;