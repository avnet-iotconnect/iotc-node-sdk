'use strict';

var request = require('request');
var cache = require('memory-cache');
var async = require('async');
var jsonQuery = require('json-query');
var _ = require('lodash');
var mqtt = require('mqtt');
var fs = require('fs-extra');
var fsep = require('fs-extra-promise');
var config = require('./../config/config');
var moment = require('moment');
const isOnline = require('is-online');

const {
    authType
} = require('./../config/config');

let lastEdgeFaultyDataTime = new Date().getTime();

class CommonFunctions {

    constructor(sId, uniqueId, sdkOption) {
        this.SID = sId;
        this.UNIQUEID = uniqueId;
        this.SDK_OPTIONS = sdkOption;
        // console.log(this.SDK_OPTIONS)
        this.LOG_PATH = sdkOption.logPath;
        this.IS_DEBUG = sdkOption.isDebug;
        this.IS_RUNNING_OFFLINE_SENDING = false;
        this.TOTAL_RECORD_COUNT = 0;
        this.IS_RUNNING = false;
        this.DATA_SEND_FREQUENCY_FLAG = true;
        this.DATA_FREQUENCY_NEXT_TIME = 0;
        this.IS_DEVICE_CONNECTED = false;
        let deviceClient = "";
        this.HEARTBEAT_INTERVAL = "";

        if (sdkOption.SDK_TYPE == "MQTT") {
            deviceClient = require("./../client/mqttClient");
        }
        this.BROKER_CLIENT = new deviceClient(sId, uniqueId, sdkOption);
        this.INTERVAL_OBJ = [];
        this.CMD_CALLBACK = "";
    }

    /*
    Object : Get base URL by calling discovery API 
    Author : Mayank [SOFTWEB]
    Detail : Device detail with all atrributes
    Date   : 2018-01-24
    */
    getBaseUrl(callback) {
        var self = this;
        var url = self.SDK_OPTIONS.discoveryUrl;
        var discoveryUrl = "";

        async.series([
            function (cb_series) {
                
                if(self.SDK_OPTIONS.cpId){
                    discoveryUrl = url + config.discoveryUrlwithCpid;
                    discoveryUrl = discoveryUrl.replace("<<CPID>>", self.SDK_OPTIONS.cpId).replace("<<ENV>>", self.SDK_OPTIONS.env).replace("<<PF>>", self.SDK_OPTIONS.pf);
                } else {
                    discoveryUrl = url + config.discoveryBaseUrl;
                    discoveryUrl = discoveryUrl.replace("<<SID>>", self.SID);
                }
                cb_series();
            }
        ], function (err, response) {
            request.get({
                    url: discoveryUrl,
                    json: true
                },
                function (error, response, body) {
                    if (error) {
                        if (error.code == "EAI_AGAIN" || error.code == "ETIMEDOUT" || error.code == "ENOTFOUND") {
                            self.manageDebugLog("ERR_IN08", self.UNIQUEID, self.SID, "", 0, self.IS_DEBUG);
                            callback(false, config.errorLog.ERR_IN08);
                        } else {
                            self.manageDebugLog("ERR_IN01", self.UNIQUEID, self.SID, error.message, 0, self.IS_DEBUG);
                            callback(false, error.message);
                        }
                    } else {
                        if (response && response.statusCode == 200 && body != undefined) {
                            switch (body.d.ec) {
                                case config.discoveryErrorCode.SUCCESS: // 0
                                    self.manageDebugLog("INFO_IN07", self.UNIQUEID, self.SID, "", 1, self.IS_DEBUG);
                                    callback(true, body);
                                    break;

                                case config.discoveryErrorCode.IN_VALID_SID: // 1
                                    self.manageDebugLog("ERR_IN21", self.UNIQUEID, self.SID, "", 0, self.IS_DEBUG);
                                    callback(false, body);
                                    break;

                                case config.discoveryErrorCode.COMPANY_NOT_FOUND: // 2
                                    self.manageDebugLog("ERR_IN22", self.UNIQUEID, self.SID, "", 0, self.IS_DEBUG);
                                    callback(false, body);
                                    break;

                                case config.discoveryErrorCode.SUBSCRIPTION_EXPIRED: // 3
                                    self.manageDebugLog("ERR_IN23", self.UNIQUEID, self.SID, "", 0, self.IS_DEBUG);
                                    callback(false, body);
                                    break;

                                default:
                                    self.manageDebugLog("ERR_IN24", self.UNIQUEID, self.SID, "", 0, self.IS_DEBUG);
                                    callback(false, body);
                                    break;
                            }
                        } else {
                            self.manageDebugLog("ERR_IN09", self.UNIQUEID, self.SID, "", 0, self.IS_DEBUG);
                            callback(false, config.errorLog.ERR_IN09);
                        }
                    }
                });
        });
    }

    /*
    Object : Device 
    Author : Mayank [SOFTWEB]
    Detail : Device detail with all atrributes
    Date   : 2018-01-24
    */
    syncDevice(callback) {
        var self = this;
        try {
            self.getBaseUrl(function (status, responseData) {
                if (status == true && responseData.d.bu) {
                    let syncBaseUrl = responseData.d.bu + "/uid/" + self.UNIQUEID;
                    self.manageDebugLog("INFO_IN07", self.UNIQUEID, self.SID, syncBaseUrl, 1, true);
                    request.get({
                            url: syncBaseUrl,
                            json: true
                        },
                        function (error, response, body) {
                            if (error) {
                                if (error.code == "EAI_AGAIN" || error.code == "ETIMEDOUT" || error.code == "ENOTFOUND") {
                                    self.manageDebugLog("ERR_IN08", self.UNIQUEID, self.SID, "", 0, self.IS_DEBUG);
                                    callback({
                                        status: false,
                                        data: null,
                                        message: config.errorLog.ERR_IN08
                                    });
                                } else {
                                    self.manageDebugLog("ERR_IN01", self.UNIQUEID, self.SID, error.message, 0, self.IS_DEBUG);
                                    callback({
                                        status: false,
                                        data: null,
                                        message: error.message
                                    });
                                }
                            } else {
                                if (response && response.statusCode == 200 && body != undefined && body.d.ec == 0) {
                                    self.manageDebugLog("INFO_IN07", self.UNIQUEID, self.SID, JSON.stringify(body.d,null,2), 1, true);
                                    if (body.d.meta.v == config.msgFormatVersion) {
                                        self.manageDebugLog("INFO_IN01", self.UNIQUEID, self.SID, "", 1, self.IS_DEBUG);
                                        var resultData = body.d;
                                        resultData['edgeData'] = "";
                                        resultData['rulesData'] = "";
                                        callback({
                                            status: true,
                                            data: resultData,
                                            message: config.infoLog.INFO_IN01
                                        })
                                    } else {
                                        self.manageDebugLog("ERR_IN25", self.UNIQUEID, self.SID, "", 0, self.IS_DEBUG);
                                        callback({
                                            status: false,
                                            data: resultData,
                                            message: config.errorLog.ERR_IN25
                                        })
                                    }
                                } else {
                                    callback({
                                        status: false,
                                        data: body.d,
                                        message: config.errorLog.ERR_IN10
                                    })
                                }
                            }
                        });
                } else {
                    self.manageDebugLog("ERR_IN09", self.UNIQUEID, self.SID, "", 0, self.IS_DEBUG);
                    callback({
                        status: status,
                        data: [],
                        message: config.errorLog.ERR_IN09
                    })
                }
            })
        } catch (err) {
            self.manageDebugLog("ERR_IN01", self.UNIQUEID, self.SID, err.message, 0, self.IS_DEBUG);
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
    Detail : Device detail with all atrributes
    Date   : 2018-01-24
    */
    // syncDeviceByParam(params, callback) {
    //     var self = this;
    //     try {
    //         self.getBaseUrl(function (status, responseData) {
    //             if (status == true && responseData.d.bu) {
    //                 let syncBaseUrl = responseData.d.bu + "/uid/" + self.UNIQUEID;
    //                 request.get({
    //                         url: syncBaseUrl,
    //                         json: true
    //                     },
    //                     function (error, response, body) {
    //                         if (error) {
    //                             if (error.code == "EAI_AGAIN") {
    //                                 self.manageDebugLog("ERR_IN08", self.UNIQUEID, self.SID, "", 0, self.IS_DEBUG);
    //                                 callback({
    //                                     status: false,
    //                                     data: null,
    //                                     message: config.errorLog.ERR_IN08
    //                                 });
    //                             } else {
    //                                 self.manageDebugLog("ERR_IN01", self.UNIQUEID, self.SID, error.message, 0, self.IS_DEBUG);
    //                                 callback({
    //                                     status: false,
    //                                     data: null,
    //                                     message: error.message
    //                                 });
    //                             }
    //                         } else {
    //                             if (response && response.statusCode == 200) {
    //                                 var resultData = body.d;
    //                                 if (resultData.meta.edge == config.edgeEnableStatus.enabled) {
    //                                     async.series([
    //                                         function (cb_series) {
    //                                             if (params.rule == true) {
    //                                                 cb_series();
    //                                             } else if (params.attribute == true) {
    //                                                 cb_series();
    //                                             } else if (params.setting == true) {
    //                                                 cb_series();
    //                                             } else if (params.protocol == true) {
    //                                                 cb_series();
    //                                             } else if (params.device == true) {
    //                                                 cb_series();
    //                                             }
    //                                         }
    //                                     ], function (err, response) {
    //                                         self.manageDebugLog("INFO_IN01", self.UNIQUEID, self.SID, "", 1, self.IS_DEBUG);
    //                                         callback({
    //                                             status: true,
    //                                             data: resultData,
    //                                             message: config.infoLog.INFO_IN01
    //                                         })
    //                                     })
    //                                 } else {
    //                                     self.manageDebugLog("INFO_IN01", self.UNIQUEID, self.SID, "", 1, self.IS_DEBUG);
    //                                     callback({
    //                                         status: true,
    //                                         data: resultData,
    //                                         message: config.infoLog.INFO_IN01
    //                                     })
    //                                 }
    //                             } else {
    //                                 self.manageDebugLog("ERR_IN10", self.UNIQUEID, self.SID, "", 0, self.IS_DEBUG);
    //                                 callback({
    //                                     status: false,
    //                                     data: [],
    //                                     message: config.errorLog.ERR_IN10
    //                                 })
    //                             }
    //                         }
    //                     });
    //             } else {
    //                 self.manageDebugLog("ERR_IN09", self.UNIQUEID, self.SID, "", 0, self.IS_DEBUG);
    //                 callback({
    //                     status: false,
    //                     data: [],
    //                     message: config.errorLog.IN09
    //                 })
    //             }
    //         })
    //     } catch (err) {
    //         self.manageDebugLog("ERR_IN01", self.UNIQUEID, self.SID, err.message, 0, self.IS_DEBUG);
    //         callback({
    //             status: false,
    //             data: null,
    //             message: err.message
    //         })
    //     }
    // }

    /* 
     * send command ack
     * @author : MK
     * send command ack
     * @param: 
     */
    /*
    Object : Get device data 
    Author : Mayank [SOFTWEB]
    Detail : Send request to get the specific information
    Input  : msgType
    Output : NA
    Date   : 2018-01-24
    */
    getSyncData(msgType, callback) {
        var self = this;
        var self = this;
        var cacheId = self.SID + "_" + self.UNIQUEID;
        var deviceSyncRes = cache.get(cacheId);
        var pubTopic = "";
        try {

            if (msgType == 200) {
                var objData = {
                    "mt": msgType,
                    "sid": self.SID,
                    "v": config.sdkVersion,
                }
            } else {
                var objData = {
                    "mt": msgType,
                    "cd": deviceSyncRes.meta.cd ? deviceSyncRes.meta.cd : undefined
                }
            }

            if (deviceSyncRes.p && self.SDK_OPTIONS.SDK_TYPE == "MQTT") {
                pubTopic = deviceSyncRes.p.topics.di;
                objData["pubTopic"] = pubTopic ? pubTopic : deviceSyncRes.p.topics.c2d;
            }

            self.BROKER_CLIENT.messagePublish(objData, function (response) {
                if (response.status) {
                    callback({
                        status: true,
                        data: null,
                        message: config.infoLog.INFO_IN20
                    });
                } else {
                    callback({
                        status: true,
                        data: null,
                        message: config.infoLog.INFO_IN20
                    });
                }
            });
        } catch (error) {
            console.log(error)
            callback({
                status: false,
                data: [],
                message: error.message
            })
        }
    }

    /*
    Object : Edge Device 
    Author : Mayank [SOFTWEB]
    Detail : Set Edge configuration for attriibute value
    Date   : 2018-02-20
    */
    setEdgeConfiguration(attributes, devices, callback) {
        var mainObj = {};
        var InObj = [];
        var self = this;
        try {

            async.forEachSeries(attributes, function (attribute, cb_main) {
                if (attribute.p == "") {
                    async.forEachSeries(attribute.d, function (attr, cb_pc) {
                        if (self.SDK_OPTIONS.isGatewayDevice) {
                            var tagMatchedDevice = _.filter(devices, function (o) {
                                return o.tg == attr.tg;
                            });
                        } else {
                            var tagMatchedDevice = devices;
                        }

                        async.forEachSeries(tagMatchedDevice, function (device, cb_devices) {
                            var edgeAttributeKey = "";
                            if (self.SDK_OPTIONS.isGatewayDevice) {
                                edgeAttributeKey = device.id + "-" + attr.ln + "-" + attr.tg;
                                var attrTag = attr.tg;
                            } else {
                                edgeAttributeKey = device.id + "-" + attr.ln;
                                var attrTag = "";
                            }
                            var attrObj = {};
                            attrObj.parent = attribute.p;
                            attrObj.sTime = "";
                            attrObj.data = [];
                            var dataSendFrequency = attr.tw;
                            var lastChar = dataSendFrequency.substring(dataSendFrequency.length, dataSendFrequency.length - 1);
                            var strArray = ['s', 'm', 'h'];
                            var strArrayStr = strArray.toString();
                            if (strArrayStr.indexOf(lastChar) != -1) // Check the Tumbling Window validation
                            {
                                var tumblingWindowTime = dataSendFrequency.substring(0, dataSendFrequency.length - 1);
                                var obj = {
                                    "tumblingWindowTime": tumblingWindowTime,
                                    "lastChar": lastChar,
                                    "edgeAttributeKey": edgeAttributeKey,
                                    "uniqueId": self.UNIQUEID,
                                    "attrTag": attrTag,
                                    "devices": devices
                                }
                                InObj.push(obj);
                            }

                            var setAttributeObj = {};
                            async.forEachSeries(Object.keys(config.aggregateType), function (key, cb) {
                                var val = config.aggregateType[key];
                                setAttributeObj.localName = attr.ln;
                                if (val & config.aggregateValue) {
                                    if (key == "count") {
                                        setAttributeObj[key] = 0;
                                    } else {
                                        setAttributeObj[key] = "";
                                    }
                                }
                                cb()
                            }, function () {
                                attrObj.data.push(setAttributeObj);
                                mainObj[edgeAttributeKey] = attrObj;
                                cb_devices()
                            });
                        }, function () {
                            cb_pc()
                        });
                    }, function () {
                        cb_main();
                    });
                } else {
                    // console.log("==== In parent Child ====", attribute );

                    if (self.SDK_OPTIONS.isGatewayDevice) {
                        var tagMatchedDevice = _.filter(devices, function (o) {
                            return o.tg == attribute.tg;
                        });
                    } else {
                        var tagMatchedDevice = devices;
                    }
                    async.forEachSeries(tagMatchedDevice, function (device, cb_devices) {
                        var attrObj = {};
                        attrObj.parent = attribute.p;
                        attrObj.sTime = "";
                        attrObj.data = [];
                        var edgeAttributeKeyChild = "";
                        if (self.SDK_OPTIONS.isGatewayDevice) {
                            edgeAttributeKeyChild = device.id + "-" + attribute.p + "-" + attribute.tg;
                            var attrTag = attribute.tg;
                        } else {
                            edgeAttributeKeyChild = device.id + "-" + attribute.p;
                            var attrTag = "";
                        }

                        var tumblingWindowTime = "";
                        var lastChar = "";
                        async.forEachSeries(attribute.d, function (attr, cb_pc) {
                            var setAttributeObj = {};
                            var dataSendFrequency = attr.tw;
                            lastChar = dataSendFrequency.substring(dataSendFrequency.length, dataSendFrequency.length - 1);
                            tumblingWindowTime = dataSendFrequency.substring(0, dataSendFrequency.length - 1);
                            async.forEachSeries(Object.keys(config.aggregateType), function (key, cb) {
                                var val = config.aggregateType[key];
                                setAttributeObj.localName = attr.ln;
                                if (val & config.aggregateValue) {
                                    if (key == "count") {
                                        setAttributeObj[key] = 0;
                                    } else {
                                        setAttributeObj[key] = "";
                                    }
                                }
                                cb()
                            }, function () {
                                attrObj.data.push(setAttributeObj);
                                cb_pc()
                            });
                        }, function () {
                            mainObj[edgeAttributeKeyChild] = attrObj;
                            var strArray = ['s', 'm', 'h'];
                            var strArrayStr = strArray.toString();
                            if (strArrayStr.indexOf(lastChar) != -1) // Check the Tumbling Window validation
                            {
                                var obj = {
                                    "tumblingWindowTime": tumblingWindowTime,
                                    "lastChar": lastChar,
                                    "edgeAttributeKey": edgeAttributeKeyChild,
                                    "uniqueId": self.UNIQUEID,
                                    "attrTag": attrTag,
                                    "devices": devices
                                }
                                InObj.push(obj);
                            }
                            cb_devices();
                        });
                    }, function () {
                        cb_main();
                    });
                }
            }, function () {
                callback({
                    status: true,
                    data: {
                        "mainObj": mainObj,
                        "intObj": InObj
                    },
                    message: "Edge data set and started the interval as per attribute's tumbling window."
                });
            });
        } catch (error) {
            callback({
                status: false,
                data: null,
                message: error.message
            });
        }
    }

    /*
    Object : Edge Device 
    Author : Mayank [SOFTWEB]
    Detail : Set Edge configuration for attriibute value
    Date   : 2018-02-20
    */
    setRuleaConfiguration(rules, uniqueId, callback) {
        var self = this;
        try {
            var ruleData = [];
            async.forEachSeries(rules, function (rulesData, cb_main) {
                async.forEachSeries(rulesData.att, function (attributes, cb_attr) {
                    if (_.isArray(attributes.g)) // Its Parent
                    {
                        var objData = {};
                        async.forEachSeries(attributes.g, function (ids, cb_inner) {
                            var atId = ids;
                            objData[atId] = rulesData;
                            cb_inner();
                        }, function () {
                            ruleData.push(objData);
                            cb_attr();
                        });
                    } else {
                        var objData = {};
                        var atId = attributes.g;
                        objData[atId] = rulesData;
                        ruleData.push(objData);
                        cb_attr();
                    }
                }, function () {
                    cb_main();
                });
            }, function () {
                callback({
                    status: true,
                    data: ruleData,
                    message: config.infoLog.INFO_EE03
                });
            });
        } catch (error) {
            callback({
                status: false,
                data: null,
                message: error.message
            });
        }
    }

    /*
    Object : Edge Device to start interval for all attributes
    Author : Mayank [SOFTWEB]
    Detail : Sensor data send with all attributes on iotHub
    input  : tumbling window, timeType, attributeKey, uniqueId, attribute tag, devices
    Date   : 2018-01-25
    */
    setIntervalForEdgeDevice(tumblingWindowTime, timeType, edgeAttributeKey, uniqueId, attrTag, devices) {
        //console.log('edgeAttribute', edgeAttributeKey)
        var self = this;
        try {
            var cacheId = self.SID + "_" + self.UNIQUEID;
            var uniqueId = self.UNIQUEID;
            async.series([
                function (cb_series) {
                    var interKeyArray = edgeAttributeKey.split("-");
                    if (attrTag != "" && attrTag == interKeyArray[2]) {
                        uniqueId = interKeyArray[0];
                    }
                    cb_series();
                }
            ], function (err, response) {
                var cnt = 0;
                if (timeType == 's') {
                    var duration = parseInt(tumblingWindowTime) * 1000;
                } else if (timeType == 'm') {
                    var duration = parseInt(tumblingWindowTime) * 1000 * 60;
                } else if (timeType == 'h') {
                    var duration = parseInt(tumblingWindowTime) * 1000 * 60 * 60;
                }
                var objInt = {};
                var intervalFlag = 0;
                async.forEachSeries(self.INTERVAL_OBJ, function (interval, data_cb) {
                    if (edgeAttributeKey in interval) {
                        intervalFlag = 1;
                    }
                    data_cb();
                }, function () {
                    if (intervalFlag == 0) {
                        var newInterval = setInterval(function () {
                            cnt++;
                            //console.log('count', cnt)
                            var deviceSyncRes = cache.get(cacheId);
                            var edgeDatObj = deviceSyncRes.edgeData;
                            var edgeObj = edgeDatObj[edgeAttributeKey];
                            if (edgeDatObj[edgeAttributeKey] != undefined) {
                                if (edgeObj.parent != "" && edgeObj.parent != undefined) { // Its Parent - child attribute
                                    var deviceInputData = {
                                        "id": uniqueId,
                                        "t": new Date(),
                                        "d": []
                                    }
                                    var inputData = {};
                                    var inputDataObj = {};
                                    var objParentName = edgeObj.parent;
                                    async.forEachSeries(edgeObj.data, function (attrObj, cbfirst) {
                                        var dataSendFlag = 0;
                                        var agtObjEEArray = [];
                                        var localnameVar = "";
                                        async.forEachSeries(Object.keys(attrObj), function (key, cb) {
                                            if (attrObj.localName) {
                                                localnameVar = attrObj.localName;
                                            }
                                            if (key == config.aggregateTypeLabel.min) {
                                                agtObjEEArray.push(parseFloat(attrObj.min));
                                            } else if (key == config.aggregateTypeLabel.max) {
                                                agtObjEEArray.push(parseFloat(attrObj.max));
                                            } else if (key == config.aggregateTypeLabel.sum) {
                                                agtObjEEArray.push(parseFloat(attrObj.sum));
                                            } else if (key == config.aggregateTypeLabel.avg) {
                                                agtObjEEArray.push(parseFloat(attrObj.sum) / parseInt(attrObj.count));
                                            } else if (key == config.aggregateTypeLabel.count && attrObj.count > 0) {
                                                agtObjEEArray.push(parseFloat(attrObj.count));
                                                dataSendFlag = 1;
                                            } else if (key == config.aggregateTypeLabel.lv) {
                                                agtObjEEArray.push(parseFloat(attrObj.lv));
                                            }
                                            cb()
                                        }, function () {
                                            if (dataSendFlag == 1) {
                                                inputData[localnameVar] = agtObjEEArray;
                                            }
                                        });
                                        cbfirst()
                                    }, function () {
                                        if (Object.keys(inputData).length > 0) {
                                            inputDataObj[objParentName] = inputData;
                                            deviceInputData.d.push(inputDataObj);
                                            var newObj = _.cloneDeep(deviceInputData);
                                            self.edgeDataEvaluation(newObj, uniqueId);
                                            self.refreshEdgeObj(edgeAttributeKey);
                                        }
                                    });
                                } else { // Its Non Parent Attriobute 
                                    var deviceInputData = {
                                        "id": uniqueId,
                                        "t": new Date(),
                                        "d": []
                                    }
                                    var inputData = {};
                                    async.forEachSeries(edgeObj.data, function (attrObj, cbfirst) {
                                        var dataSendFlag = 0;
                                        var agtObjEEArray = [];
                                        var localnameVar = "";
                                        async.forEachSeries(Object.keys(attrObj), function (key, cb) {
                                            if (attrObj.localName) {
                                                localnameVar = attrObj.localName;
                                            }
                                            if (key == config.aggregateTypeLabel.min) {
                                                agtObjEEArray.push(attrObj.min ? parseFloat(attrObj.min) : '');
                                            } else if (key == config.aggregateTypeLabel.max) {
                                                agtObjEEArray.push(attrObj.max && parseFloat(attrObj.max));
                                            } else if (key == config.aggregateTypeLabel.sum) {
                                                agtObjEEArray.push(attrObj.sum && parseFloat(attrObj.sum));
                                            } else if (key == config.aggregateTypeLabel.avg) {
                                                agtObjEEArray.push(parseFloat(attrObj.sum) / parseInt(attrObj.count));
                                            } else if (key == config.aggregateTypeLabel.count && attrObj.count > 0) {
                                                agtObjEEArray.push(attrObj.count && parseFloat(attrObj.count));
                                                dataSendFlag = 1;
                                            } else if (key == config.aggregateTypeLabel.lv) {
                                                agtObjEEArray.push(parseFloat(attrObj.lv));
                                            }
                                            cb()
                                        }, function () {
                                            if (dataSendFlag == 1) {
                                                inputData[localnameVar] = agtObjEEArray;
                                            }
                                        });
                                        cbfirst()
                                    }, function () {

                                        if (Object.keys(inputData).length > 0) {
                                            deviceInputData.d.push(inputData);
                                            var newObj = _.cloneDeep(deviceInputData);
                                            self.edgeDataEvaluation(newObj, uniqueId);
                                            self.refreshEdgeObj(edgeAttributeKey);
                                        }
                                    });
                                }
                            }
                        }, duration);
                        objInt[edgeAttributeKey] = newInterval;
                        self.INTERVAL_OBJ.push(objInt);
                    }
                });
            })
        } catch (error) {
            self.manageDebugLog("ERR_EE01", self.UNIQUEID, self.SID, error.message, 0, self.IS_DEBUG);
        }
    }

    /*
    Object : Edge Device reset common object
    Author : Mayank [SOFTWEB]
    Detail : To empty the all edge enabled attributes to restart the aggregated data cycle
    Date   : 2018-01-25
    */
    refreshEdgeObj(edgeAttributeKey) {
        var self = this;
        var cacheId = self.SID + "_" + self.UNIQUEID;
        var deviceSyncRes = cache.get(cacheId);
        var edgeDatObj = deviceSyncRes.edgeData;
        var edgeObj = edgeDatObj[edgeAttributeKey];
        async.forEachSeries(edgeObj.data, function (obj, cb) {
            async.forEachSeries(Object.keys(obj), function (key, cb1) {
                if (key == config.aggregateTypeLabel.sum) {
                    obj[key] = "";
                }
                if (key == config.aggregateTypeLabel.min) {
                    obj[key] = "";
                }
                if (key == config.aggregateTypeLabel.max) {
                    obj[key] = "";
                }
                if (key == config.aggregateTypeLabel.count) {
                    obj[key] = 0;
                }
                if (key == config.aggregateTypeLabel.avg) {
                    obj[key] = "";
                }
                if (key == config.aggregateTypeLabel.lv) {
                    obj[key] = "";
                }
                if (key == config.aggregateTypeLabel.agt) {
                    obj[key] = "";
                }
                cb1()
            }, function () {
                cb();
            });
        }, function () {
            // self.manageDebugLog("ERR_EE01", self.UNIQUEID, self.SID, "", 0, self.IS_DEBUG);
        });
    }

    /*
    Object : Edge Device data evaluation
    Author : Mayank [SOFTWEB]
    Detail : To process for the edge data
    Date   : 2018-01-25
    */
    edgeDataEvaluation(deviceInputData, uniqueId) {
        var self = this;
        var deviceSendTime = deviceInputData.t;
        var tag = "";
        var deviceEdgeData = deviceInputData.d;
        var cacheId = self.SID + "_" + self.UNIQUEID;
        var deviceData = cache.get(cacheId);
        var dataObj = {
            "dt": new Date(),
            "mt": config.messageType.rptEdge,
            "d": []
        };

        var attributeObj = {};
        async.series([
            function (cb_series) {
                var resultDevice = jsonQuery('d[*id=' + uniqueId + ']', {
                    data: deviceData
                })
                attributeObj["id"] = self.SDK_OPTIONS.isGatewayDevice ? uniqueId : undefined;
                attributeObj["dt"] = deviceSendTime;
                attributeObj["tg"] = resultDevice.value[0].tg ? resultDevice.value[0].tg : undefined;
                attributeObj["d"] = [];
                cb_series();
            },
            function (cb_series) {
                async.forEachSeries(deviceEdgeData, function (data, cb_fl_dData) {
                    attributeObj.d.push(data);
                    cb_fl_dData();
                }, function () {
                    cb_series();
                });
            }
        ], function (err, response) {
            if (deviceData.meta.edge == config.edgeEnableStatus.enabled) {
                attributeObj.d = _.reduce(attributeObj.d, _.extend);
                dataObj.d.push(attributeObj);
                self.sendDataOnMQTT(dataObj);
            }
        })
    }

    /*
    Object : Device 
    Author : Mayank [SOFTWEB]
    Detail : It holds the data sending process till the "df" time 
    Date   : 2020-11-16
    */
    // holdDataFrequency(dataFrequencyInSec) {
    //     var self = this;
    //     setTimeout(() => {
    //         self.DATA_SEND_FREQUENCY_FLAG = true;
    //     }, dataFrequencyInSec * 1000);
    // }

    /*
    Object : Publish data 
    Author : Mayank [SOFTWEB]
    Detail : Sensor data send with all attributes on iotHub
    Input  : json payload
    Date   : 2018-01-25
    */
    SendDataToHub(sensorData, cb) {
        var self = this;
        var cacheId = self.SID + "_" + self.UNIQUEID;
        var deviceSyncRes = cache.get(cacheId);
        var dataFrequencyInSec = deviceSyncRes.meta.df * 1000; // convert df sec in miliseconds
        // var dataFrequencyInSec = 5 * 1000; // convert df sec in miliseconds
        try {
            if ((deviceSyncRes != undefined || deviceSyncRes != "") && (typeof deviceSyncRes == 'object')) {
                const newThings = [];
                sensorData.map( item => {
                    if(item && !item.hasOwnProperty("time")) {
                        item["time"] = new Date();
                    }
                    // if(item && !item.hasOwnProperty("childId") || !item["childId"]) {
                    //     item["childId"] = self.UNIQUEID;
                    // }
                    newThings.push(item)
                });
                    
                if (deviceSyncRes.meta.edge) {
                    self.setSendDataFormat(newThings);
                } else {
                    if (deviceSyncRes.meta.df == 0) {
                        self.setSendDataFormat(newThings);
                    } else {
                        var currentTime = new Date().getTime();
                        if (!self.DATA_FREQUENCY_NEXT_TIME || (self.DATA_FREQUENCY_NEXT_TIME && self.DATA_FREQUENCY_NEXT_TIME < currentTime)) {
                            self.setSendDataFormat(newThings);
                            self.DATA_FREQUENCY_NEXT_TIME = parseInt(currentTime) + parseInt(dataFrequencyInSec);
                        }
                    }
                }
                cb({
                    status: true,
                    data: [],
                    message: 'Sensor information has been sent to cloud.'
                })
            } else {
                self.manageDebugLog("ERR_SD05", self.UNIQUEID, self.SID, "", 0, self.IS_DEBUG);
                cb({
                    status: false,
                    data: [],
                    message: config.errorLog.ERR_SD05
                })
            }
        } catch (error) {
            self.manageDebugLog("ERR_SD01", self.UNIQUEID, self.SID, error.message, 0, self.IS_DEBUG);
            cb({
                status: false,
                data: error,
                message: error.message
            })
        }
    }

    /*
    Object : Device 
    Author : Mayank [SOFTWEB]
    Output : Sensor data send with all attributes on iotHub
    Date   : 2018-01-25
    */
    setSendDataFormat(deviceSensorData) {
        var self = this;
        try {
            var cacheId = self.SID + "_" + self.UNIQUEID;
            var deviceSyncRes = cache.get(cacheId);
            var deviceData = deviceSyncRes;
            var dataObj = {
                // "sid": self.SID,
                "dt": new Date(),
                "mt": config.messageType.rpt,
                "d": []
            };
            var dataObjFLT = {
                // "sid": self.SID,
                "dt": new Date(),
                "mt": config.messageType.flt,
                "d": []
            };
            async.forEachSeries(deviceSensorData, function (deviceInputData, cb_f2_dData) {
                if (deviceInputData) {
                    var uniqueId = deviceInputData.uniqueId;
                    var deviceSendTime = deviceInputData.time;
                    var tag = null;
                    var data = deviceInputData.data;
                    if ((data != undefined || data != "") && (typeof deviceSyncRes == 'object')) {
                        var cntRPT = 0;
                        var cntFLT = 0;
                        var attributeObj = {};
                        var attributeObjFLT = {};
                        async.series([
                            function (cb_series) {
                                var resultDevice = jsonQuery('d[*id=' + uniqueId + ']', {
                                    data: deviceData
                                })
                                if (self.SDK_OPTIONS.isGatewayDevice) {
                                    tag = resultDevice.value[0]?.tg;
                                } else {
                                    tag = undefined;
                                }

                                attributeObj["id"] =uniqueId// self.SDK_OPTIONS.isGatewayDevice ? uniqueId : undefined;
                                attributeObj["dt"] = deviceSendTime;
                                attributeObj["tg"] = tag ? tag : undefined;
                                attributeObj["d"] = [];

                                attributeObjFLT["id"] = uniqueId//self.SDK_OPTIONS.isGatewayDevice ? uniqueId : undefined;
                                attributeObjFLT["dt"] = deviceSendTime;
                                attributeObjFLT["tg"] = tag ? tag : undefined;
                                attributeObjFLT["d"] = [];
                                cb_series();
                            },
                            function (cb_series) {
                                var withoutParentAttrObj = {};
                                var withoutParentAttrObjFLT = {};
                                var withoutParentRuleAttrObj = {};
                                var parentRuleAttrObj = {};
                                var ruleAttributeValidateArray = [];
                                var parentDeviceAttributeInfo = [];
                                var ruleValueFlag = 0;
                                async.forEachSeries(Object.keys(data), function (attributeKey, cb_fl_dData) {
                                    var parentAttrObj = {}
                                    var parentAttrObjFLT = {}

                                    if (typeof data[attributeKey] == "object") {// true = Parent attribute, Attribute is of Object Type
                                        var parentChildArray = data[attributeKey];
                                        if (self.SDK_OPTIONS.isGatewayDevice && tag) {
                                            var resultDevice = jsonQuery('att[*p=' + attributeKey + ' & tg=' + tag + ']', {
                                                data: deviceData
                                            })
                                        } else {
                                            var resultDevice = jsonQuery('att[*p=' + attributeKey + ']', {
                                                data: deviceData
                                            })
                                        }
                                        if (resultDevice.value?.length > 0) {
                                            async.forEachSeries(Object.keys(parentChildArray), function (parentChildKey, cb_fl_child) {// START - Traverse all child Attribute in Object
                                            async.forEachSeries(resultDevice.value, function (parentdeviceInfo, cb_fl_pdi) {// START - Traverse all keys in Object for Current Attribute's Value
                                                // parentdeviceInfo = deviceInfo from server
                                                // console.log("AWS NODE ~ file: common.js:978 ~ parentdeviceInfo:", parentdeviceInfo)
                                                var parentAttributeName = parentdeviceInfo.p;
                                                var parentDevicechildDeviceInfoAttributeInfo = [];
                                                ruleValueFlag = 0;
                                                if(_.find(parentdeviceInfo.d, { "ln" : parentChildKey})){
                                                    
                                                        
                                                    
                                                        async.forEachSeries(parentdeviceInfo.d, function (childDeviceInfo, cb_fl_cdi) {
                                                            var msgTypeStatus = 0;
                                                            var attrValue = 0;
                                                            if (parentChildKey == childDeviceInfo.ln) {
                                                                var dataType = childDeviceInfo.dt;
                                                                var dataValidation = childDeviceInfo.dv;
                                                                attrValue = parentChildArray[parentChildKey];
                                                                if (attrValue !== "") {
                                                                    self.dataValidationTest(dataType, dataValidation, attrValue, childDeviceInfo, msgTypeStatus, function (childAttrObj) {
                                                                        if (childAttrObj.msgTypeStatus == 1) //msgTypeStatus = 1 (Validation Failed)
                                                                        {
                                                                            if (!parentAttrObjFLT[parentAttributeName])
                                                                                parentAttrObjFLT[parentAttributeName] = {};
                                                                            delete childAttrObj['msgTypeStatus'];
                                                                            parentAttrObjFLT[parentAttributeName][childAttrObj.ln] = childAttrObj.v;
                                                                            cntFLT++;
                                                                        } else {
                                                                            if (deviceData.meta.edge == config.edgeEnableStatus.enabled && (dataType == config.dataType.INTEGER || dataType == config.dataType.LONG || dataType == config.dataType.DECIMAL)) // Its Edge Enable Device
                                                                            {
                                                                                ruleValueFlag = 1;
                                                                                childDeviceInfo.parentGuid = parentdeviceInfo.guid;
                                                                                childDeviceInfo.p = parentAttributeName;
                                                                                childDeviceInfo.value = attrValue;
                                                                                parentDeviceAttributeInfo.push(childDeviceInfo);
                                                                                self.setEdgeVal(childDeviceInfo, attrValue, uniqueId);
                                                                                if (!parentRuleAttrObj[parentAttributeName])
                                                                                    parentRuleAttrObj[parentAttributeName] = {};
                                                                                parentRuleAttrObj[parentAttributeName][childAttrObj.ln] = childAttrObj.v;
                                                                            } else {
                                                                                if (!parentAttrObj[parentAttributeName])
                                                                                    parentAttrObj[parentAttributeName] = {};
                                                                                delete childAttrObj['msgTypeStatus'];
                                                                                parentAttrObj[parentAttributeName][childAttrObj.ln] = childAttrObj.v;
                                                                                cntRPT++;
                                                                            }
                                                                        }
                                                                        cb_fl_cdi();
                                                                    })
                                                                } else {
                                                                    cb_fl_cdi();
                                                                }
                                                            } else {
                                                                cb_fl_cdi();
                                                            }
                                                        }, function () {
                                                            // cb_fl_child();
                                                            cb_fl_pdi();
                                                        });
                                                    } else {
                                                        if (!parentAttrObjFLT[parentAttributeName])
                                                            parentAttrObjFLT[parentAttributeName] = {};
                                                        parentAttrObjFLT[parentAttributeName][parentChildKey] = parentChildArray[parentChildKey];
                                                        cntFLT++;
                                                        cb_fl_pdi();
                                                    }
                                                    }, function () { // END - Traverse all keys in Object for Current Attribute's Value 
                                                        if (deviceData.meta.edge == config.edgeEnableStatus.enabled && ruleValueFlag == 1) // Its Edge Enable Device
                                                        {
                                                            var tobj = {
                                                                "parentDeviceAttributeInfo": parentDeviceAttributeInfo,
                                                                "attrValue": null,
                                                                "attributeObj": attributeObj
                                                            }
                                                            ruleAttributeValidateArray.push(tobj);
                                                        }
                                                        cb_fl_child();
                                                    });
                                                // } else {
                                                //     // delete childAttrObj['msgTypeStatus'];
                                                //     // if (!parentAttrObjFLT[parentAttributeName])
                                                //     // parentAttrObjFLT[parentAttributeName] = {};
                                                //     // delete childAttrObj['msgTypeStatus'];
                                                //     // parentAttrObjFLT[parentAttributeName][childAttrObj.ln] = childAttrObj.v;
                                                //     parentAttrObjFLT[attributeKey] = data[attributeKey];
                                                //     cntFLT++;
                                                //     cb_fl_dData();
                                                // }
                                            }, function () { // END - Traverse all child Attribute in Object
                                                if (parentAttrObjFLT) {
                                                    attributeObjFLT.d.push(parentAttrObjFLT);
                                                }
                                                if (parentAttrObj) {
                                                    attributeObj.d.push(parentAttrObj);
                                                }
                                                cb_fl_dData();
                                            });
                                        } else {
                                            if (!parentAttrObjFLT[attributeKey])
                                                parentAttrObjFLT[attributeKey] = {};
                                            parentAttrObjFLT[attributeKey] = parentChildArray;
                                            cntFLT++;
                                            if (parentAttrObjFLT) {
                                                attributeObjFLT.d.push(parentAttrObjFLT);
                                            }
                                            cb_fl_dData();
                                        }
                                    } else { // No Parent 
                                        async.forEachSeries(deviceData.att, function (noParentDeviceInfo, cb_fl_npdi) {
                                            if (noParentDeviceInfo.p == "") {
                                                var parentAttributeName = noParentDeviceInfo.p;
                                                if(_.find(noParentDeviceInfo.d, { "ln" : attributeKey})){
                                                    async.forEachSeries(noParentDeviceInfo.d, function (childDeviceInfo, cb_fl_cdi) {
                                                        var msgTypeStatus = 0;
                                                        var tgflag = false;
                                                        if (self.SDK_OPTIONS.isGatewayDevice && tag && childDeviceInfo.tg == tag) {
                                                            tgflag = true;
                                                        }
                                                        if (!self.SDK_OPTIONS.isGatewayDevice && !tag) {
                                                            tgflag = true;
                                                        }
                                                        if (tgflag && attributeKey == childDeviceInfo.ln) {
                                                            var attrValue = data[attributeKey];
                                                            var dataType = childDeviceInfo.dt;
                                                            var dataValidation = childDeviceInfo.dv;
                                                            if (attrValue !== "" ) {
                                                                self.dataValidationTest(dataType, dataValidation, attrValue, childDeviceInfo, msgTypeStatus, function (childAttrObj) {
                                                                    if (childAttrObj.msgTypeStatus == 1) //msgTypeStatus = 1 (Validation Failed)
                                                                    {
                                                                        delete childAttrObj['msgTypeStatus'];
                                                                        withoutParentAttrObjFLT[childAttrObj.ln] = childAttrObj.v;
                                                                        cntFLT++;
                                                                    } else {
                                                                        if (deviceData.meta.edge == config.edgeEnableStatus.enabled && (dataType == config.dataType.INTEGER || dataType == config.dataType.LONG || dataType == config.dataType.DECIMAL)) // Its Edge Enable Device
                                                                        {
                                                                            childDeviceInfo.parentGuid = noParentDeviceInfo.guid;
                                                                            childDeviceInfo.p = parentAttributeName;
                                                                            self.setEdgeVal(childDeviceInfo, attrValue, uniqueId);
                                                                            var tobj = {
                                                                                "parentDeviceAttributeInfo": childDeviceInfo,
                                                                                "attrValue": attrValue,
                                                                                "attributeObj": attributeObj
                                                                            }
                                                                            ruleAttributeValidateArray.push(tobj);
                                                                            withoutParentRuleAttrObj[childAttrObj.ln] = childAttrObj.v;
                                                                        } else {
                                                                            delete childAttrObj['msgTypeStatus'];
                                                                            withoutParentAttrObj[childAttrObj.ln] = childAttrObj.v;
                                                                            cntRPT++;
                                                                        }
                                                                    }
                                                                    cb_fl_cdi();
                                                                })
                                                            } else {
                                                                cb_fl_cdi();
                                                            }
                                                        } else {
                                                            cb_fl_cdi();
                                                        }
                                                    }, function () {
                                                        cb_fl_npdi();
                                                    });
                                                } else {
                                                    // delete childAttrObj['msgTypeStatus'];
                                                    withoutParentAttrObjFLT[attributeKey] = data[attributeKey];
                                                    cntFLT++;
                                                    cb_fl_npdi();
                                                }
                                            } else {
                                                cb_fl_npdi();
                                            }
                                        }, function () {
                                            cb_fl_dData();
                                        });
                                    }
                                }, function () {

                                    if (withoutParentAttrObjFLT) {
                                        attributeObjFLT.d.push(withoutParentAttrObjFLT);
                                    }
                                    if (withoutParentAttrObj) {
                                        attributeObj.d.push(withoutParentAttrObj);
                                    }
                                    if (Object.keys(parentRuleAttrObj).length > 0 || Object.keys(withoutParentRuleAttrObj).length > 0) {
                                        var combineRuleAttrArray = Object.assign(withoutParentRuleAttrObj, parentRuleAttrObj);
                                        async.forEachSeries(ruleAttributeValidateArray, function (ruleatt, cbatt) {
                                            setTimeout(() => {
                                                self.setRuleVal(ruleatt.parentDeviceAttributeInfo, ruleatt.attrValue, ruleatt.attributeObj, combineRuleAttrArray);
                                                cbatt();
                                            }, 200);
                                        }, function () {});
                                    }
                                    cb_series();
                                });
                            }
                        ], function (err, response) {
                            // Edge Faulty TODO
                            if (cntFLT > 0 ) {
                                attributeObjFLT.d = _.reduce(attributeObjFLT.d, _.extend);
                                dataObjFLT.d.push(attributeObjFLT)
                            }
                            if (cntRPT > 0 && deviceData.meta.edge == config.edgeEnableStatus.disabled) {
                                attributeObj.d = _.reduce(attributeObj.d, _.extend);
                                dataObj.d.push(attributeObj)
                            }
                            cb_f2_dData();
                        })
                    } else {
                        cb_f2_dData();
                    }
                } else {
                    cb_f2_dData();
                }
            }, function () {
                // Edge Faulty TODO
                if(parseInt(new Date().getTime()) >= lastEdgeFaultyDataTime + config.edgeFaultDataFrequency){
                    if (dataObjFLT.d.length > 0 && deviceData.meta.edge == config.edgeEnableStatus.enabled) {
                        // console.log("===> flt => ", JSON.stringify(dataObjFLT));
                        lastEdgeFaultyDataTime = new Date().getTime()
                        self.sendDataOnMQTT(dataObjFLT);
                    }    
                }
                if (dataObjFLT.d.length > 0 && deviceData.meta.edge == config.edgeEnableStatus.disabled) {
                    // console.log("===> flt => ", JSON.stringify(dataObjFLT));
                    self.sendDataOnMQTT(dataObjFLT);
                }
                if (dataObj.d.length > 0 && deviceData.meta.edge == config.edgeEnableStatus.disabled) {
                    // console.log("===> rpt => ", JSON.stringify(dataObj));
                    self.sendDataOnMQTT(dataObj);
                }
            });
        } catch (error) {
            self.manageDebugLog("ERR_SD01", self.UNIQUEID, self.SID, error.message, 0, self.IS_DEBUG);
        }
    }

    /*
    Object : Edge Device
    Author : Mayank [SOFTWEB]
    Output : Aggregat the edge value for attribute wise
    Date   : 2018-01-25
    */
    setEdgeVal(attributeInfo, attrValue, actualDeviceId) {

        var self = this;
        var cacheId = self.SID + "_" + self.UNIQUEID;
        var deviceSyncRes = cache.get(cacheId);
        var edgeDatObj = deviceSyncRes.edgeData;

        if (attributeInfo.p != "" && attributeInfo.p != undefined) // If Parent attribute
        {
            if (self.SDK_OPTIONS.isGatewayDevice) {
                var eekey = actualDeviceId + "-" + attributeInfo.p + "-" + attributeInfo.tg;
            } else {
                var eekey = actualDeviceId + "-" + attributeInfo.p;
            }
            var edgeObj = edgeDatObj[eekey];
            async.forEachSeries(edgeObj?.data, function (atrributeData, cb) {
                atrributeData["agt"] = config.aggregateType;
                if (attributeInfo.ln == atrributeData.localName) {
                    var newAtrrValue = atrributeData;
                    var inputCounter = parseInt(atrributeData.count) + 1;
                    newAtrrValue.count = inputCounter;
                    async.forEachSeries(Object.keys(newAtrrValue), function (key, cb_atr) {
                        if (key == config.aggregateTypeLabel.min) {
                            if (newAtrrValue[key] == "" || isNaN(newAtrrValue[key])) {
                                newAtrrValue[key] = attrValue;
                            } else if (parseFloat(newAtrrValue[key]) > parseFloat(attrValue)) {
                                newAtrrValue[key] = attrValue;
                            } else {
                                newAtrrValue[key] = atrributeData[key];
                            }
                        }
                        if (key == config.aggregateTypeLabel.max) {
                            if (newAtrrValue[key] == "" || isNaN(newAtrrValue[key])) {
                                newAtrrValue[key] = attrValue;
                            } else if (parseFloat(newAtrrValue[key]) < parseFloat(attrValue)) {
                                newAtrrValue[key] = attrValue;
                            } else {
                                newAtrrValue[key] = newAtrrValue[key];
                            }
                        }
                        if (key == config.aggregateTypeLabel.sum) {
                            if (newAtrrValue[key] == "" || isNaN(newAtrrValue[key])) {
                                newAtrrValue[key] = attrValue;
                            } else {
                                newAtrrValue[key] = parseFloat(newAtrrValue[key]) + parseFloat(attrValue);
                            }
                        }
                        if (key == config.aggregateTypeLabel.lv) {
                            newAtrrValue[key] = attrValue;
                        }
                        cb_atr()
                    }, function () {
                        cb()
                    });
                } else {
                    cb();
                }
            }, function () { });
        } else { // No parent attribute
            if (self.SDK_OPTIONS.isGatewayDevice) {
                var eekey = actualDeviceId + "-" + attributeInfo.ln + "-" + attributeInfo.tg;
            } else {
                var eekey = actualDeviceId + "-" + attributeInfo.ln;
            }

            var edgeObj = edgeDatObj[eekey];
            async.forEachSeries(edgeObj?.data, function (atrributeData, cb) {
                atrributeData["agt"] = attributeInfo.agt;
                var newAtrrValue = atrributeData;
                var inputCounter = parseInt(atrributeData.count) + 1;
                newAtrrValue.count = inputCounter;
                async.forEachSeries(Object.keys(newAtrrValue), function (key, cb_atr) {

                    if (key == config.aggregateTypeLabel.min) {
                        if (newAtrrValue[key] == "" || isNaN(newAtrrValue[key])) {
                            newAtrrValue[key] = attrValue;
                        } else if (parseFloat(newAtrrValue[key]) > parseFloat(attrValue)) {
                            newAtrrValue[key] = attrValue;
                        } else {
                            newAtrrValue[key] = atrributeData[key];
                        }
                    }
                    if (key == config.aggregateTypeLabel.max) {
                        if (newAtrrValue[key] == "" || isNaN(newAtrrValue[key])) {
                            newAtrrValue[key] = attrValue;
                        } else if (parseFloat(newAtrrValue[key]) < parseFloat(attrValue)) {
                            newAtrrValue[key] = attrValue;
                        } else {
                            newAtrrValue[key] = newAtrrValue[key];
                        }
                    }
                    if (key == config.aggregateTypeLabel.sum) {
                        if (newAtrrValue[key] == "" || isNaN(newAtrrValue[key])) {
                            newAtrrValue[key] = attrValue;
                        } else {
                            if (attributeInfo.dt == config.dataType.INTEGER) {
                                newAtrrValue[key] = parseInt(newAtrrValue[key]) + parseInt(attrValue);
                            } else if (attributeInfo.dt == config.dataType.LONG) {
                                newAtrrValue[key] = parseFloat(newAtrrValue[key]) + parseFloat(attrValue);
                            }
                        }
                    }
                    if (key == config.aggregateTypeLabel.lv) {
                        newAtrrValue[key] = attrValue;
                    }
                    cb_atr()
                }, function () {
                    cb()
                });
            }, function () { });
        }
    }

    /*
    Object : Edge Device for rule
    Author : Mayank [SOFTWEB]
    Output : Set the rule and evaluate it 
    Date   : 2018-01-25
    */
    setRuleVal(attributeInfo, attrVal, attributeObj, validateAttributes) {
        var self = this;
        var ruleData = [];
        var cacheId = self.SID + "_" + self.UNIQUEID;
        var deviceSyncRes = cache.get(cacheId);
        var rules = deviceSyncRes.r;
        if (_.isArray(attributeInfo)) //Parent attributes
        {
            var attributeArrayObj = {
                "data": []
            }
            async.forEachSeries(rules, function (rulesData, cb_main) {
                var conditionText = rulesData.con;
                // async.forEachSeries(rulesData.att, function (attributes, cb_attr) {
                // console.log("1.0.0 ==> loop attributes parent child => ", attributes)
                // console.log("1.0.0 ==> loop attributes parent child => ", attributes.g,  _.isArray(attributes.g))
                if (ruleData.g) // Its Child
                {
                    // console.log("1.0.1 ==> loop attributes => Innnnn ")
                    attributeArrayObj["parentFlag"] = 1;
                    var countSq = 1;
                    // async.forEachSeries(attributes.g, function (ids, cb_inner) {
                    var atId = ids;
                    async.forEachSeries(attributeInfo, function (attrInfo, cb_attrInfo) {
                        attributeArrayObj["parentGuid"] = attrInfo.parentGuid;
                        var attrValue = attrInfo.value;
                        var attPname = attrInfo.p;
                        try {
                            self.splitCondition(conditionText, attPname, function (conditionResponse) {
                                var myObj = {};
                                var countSqAtt = 1;
                                async.forEachSeries(conditionResponse, function (response, cb_lnv) {
                                    if (attrInfo.ln == response.localNameChild && response.localNameParent == response.currentAttParent && countSq == countSqAtt) {
                                        myObj[attPname] = {
                                            "guid": rulesData.g, 
                                            "eventSubscriptionGuid": rulesData.es, 
                                            "conditionText": response.condition, 
                                            "conditionTextMain": rulesData.con, 
                                            "commandText": rulesData.cmd, 
                                            "value": attrInfo.value,
                                            "localName": attrInfo.ln, 
                                            "localNameParent": response.localNameParent, //"Parent attribute name"
                                            "currentAttParent": response.currentAttParent //"Current Parent attribute need to match
                                        };
                                    }
                                    countSqAtt++;
                                    cb_lnv()
                                }, function () {
                                    if (Object.entries(myObj).length != 0) {
                                        attributeArrayObj.data.push(myObj);
                                    }
                                    cb_attrInfo();
                                });
                            })
                        } catch (error) {
                            cb_attrInfo();
                        }
                    }, function () {
                        countSq++;
                        cb_main();
                    });
                } else {
                    // console.log("1.0.1 ==> loop attributes => elseee ")
                    cb_main();
                }
            }, function () {
                self.evaluateRule(attributeArrayObj, attributeObj, attrVal, validateAttributes);
            });
        } else { // Non Parent Attributes
            // console.log("1.00000000 elseee ");
            var attributeArrayObj = {
                "data": []
            }

            // console.log("==== start Non Parent ====" , rules);
            async.forEachSeries(rules, function (rulesData, cb_main) {
                // console.log("==== start Non Parent ====" , rulesData);
                var conditionText = rulesData.con;
                // console.log("CommonFunctions -> setRuleVal -> conditionText", conditionText)
                // console.log("1.0.0 ==> loop attributes => ", attributes)
                // console.log("1.0.0 ==> loop attributes => ", attributes.g,  _.isArray(attributes.g))
                if (rulesData.g) {
                    // console.log("1.0.1 ==> loop attributes => Innnnn ")
                    var objData = {};
                    // var atId = attributes.g;
                    attributeArrayObj["parentFlag"] = 0;
                    var attributeInfo1 = [attributeInfo];
                    async.forEachSeries(attributeInfo1, function (attrInfo, cb_attrInfo) {
                        attributeArrayObj["parentGuid"] = attrInfo.parentGuid;
                        var attrValue = attrVal;
                        var attPname = attrInfo.p;
                        self.splitCondition(conditionText, attPname, function (conditionResponse) {
                            var myObj = {}
                            async.forEachSeries(conditionResponse, function (response, cb_lnv) {
                                if (attrInfo.ln == response.localNameParent) {
                                    myObj = {
                                        "guid": rulesData.g, 
                                        "eventSubscriptionGuid": rulesData.es, 
                                        "conditionText": response.condition, 
                                        "conditionTextMain": rulesData.con, 
                                        "commandText": rulesData.cmd, 
                                        "value": attrValue, 
                                        "localName": attrInfo.ln,
                                        "localNameParent": response.localNameParent //"Parent attribute name"
                                    };
                                    attributeArrayObj.data.push(myObj);
                                }
                                cb_lnv()
                            }, function () {
                                cb_attrInfo();
                            });
                        })
                    }, function () {
                        cb_main();
                    });
                } else {
                    cb_main();
                }
            }, function () {
                self.evaluateRule(attributeArrayObj, attributeObj, attrVal, validateAttributes);
            });
        }
    }

    /*
    Object : Edge rule : split the rule condition to get device details
    Author : Mayank [SOFTWEB]
    Output : Get the data from command condition text
    Date   : 2018-01-25
    */
    splitCondition(conditionText, attPname, callback) {
        var self = this;
        var ruleCondition = conditionText.trim();
        if (ruleCondition.indexOf("=") != -1) {
            ruleCondition = ruleCondition.replace("=", "==");
        }
        var resArray = ruleCondition.split("AND");
        var parentObj = [];
        async.forEachSeries(resArray, function (conditions, cb_cond) {
            conditions = conditions.trim();
            var res = conditions.split(" ");
            var localName = res[0];
            if (localName.indexOf("#") != -1) {
                var lnp = localName.split("#");
                var lnpTag = lnp[0];
                var lnpAttName = lnp[1];
                if (lnpAttName.indexOf(".") != -1) {
                    var localNamearray = lnpAttName.split(".");
                    var parentName = localNamearray[0];
                    var childName = localNamearray[1];
                } else {
                    var parentName = lnpAttName;
                    var childName = "";
                }
                var obj = {
                    "localNameParent": parentName,
                    "localNameChild": childName,
                    "condition": conditions,
                    "tag": lnpTag,
                    "currentAttParent": attPname
                }
                parentObj.push(obj);
                cb_cond();
            } else {
                if (localName.indexOf(".") != -1) {
                    var localNamearray = localName.split(".");
                    var parentName = localNamearray[0];
                    var childName = localNamearray[1];
                } else {
                    var parentName = localName;
                    var childName = "";
                }
                var obj = {
                    "localNameParent": parentName,
                    "localNameChild": childName,
                    "condition": conditions,
                    "tag": "",
                    "currentAttParent": attPname
                }
                parentObj.push(obj);
                cb_cond();
            }
        }, function () {
            callback(parentObj);
        });

    }

    /*
    Object : Edge Device with rule evaluation process
    Author : Mayank [SOFTWEB]
    Output : Evaluate the edge device's rule
    Date   : 2018-01-25
    */
    evaluateRule(ruleEvaluationData, attributeObjOld, attrValue, validateAttributes) {
        var self = this;
        //  console.log("================================================")
        //  console.log("attributeArrayObj==>",attributeObjOld);
        //  console.log("attrValue ==>",attrValue);
        //  console.log("validateAttributes ==>",validateAttributes);
        //  console.log("ruleEvaluationData ==>",ruleEvaluationData)
        //  console.log("================================================")
        var cacheId = self.SID + "_" + self.UNIQUEID;
        var deviceSyncRes = cache.get(cacheId);
        var deviceData = deviceSyncRes;
        var deviceTag = attributeObjOld.tg;
        var newObj = {
            "dt": new Date(),
            "mt": config.messageType.ruleMatchedEdge,
            "d": []
        };

        var ruleEvaluationDataLength = ruleEvaluationData.data;
        try {
            if (ruleEvaluationDataLength.length > 0) {
                if (ruleEvaluationData.parentFlag == 1) // Its parent+child attribute
                {
                    var attributeParentGuid = ruleEvaluationData.parentGuid;
                    var attributeObj = {};
                    attributeObj['id'] = attributeObjOld.id ? attributeObjOld.id : undefined;
                    attributeObj['tg'] = attributeObjOld.tg ? attributeObjOld.tg : undefined;
                    attributeObj['d'] = [];
                    attributeObj['cv'] = "";
                    var ruleFlag = 0;
                    var thirdLevelObj = {
                        "parent": "",
                        "guid": attributeParentGuid,
                        "sTime": new Date(),
                        "data": []
                    };
                    var ruleCommandText = "";
                    var attParentName = "";
                    var thirdLevelChildObj;
                    var ruleAttObj = [];
                    var fullCondition = "";
                    var temp = [];
                    var attConditionFlag = 0;
                    var conditionTag = "";
                    async.forEachSeries(ruleEvaluationData.data, function (ruleData, cb_rl) {
                        var childAttribute = Object.keys(ruleData);
                        childAttribute = childAttribute[0];
                        var ruleCondition = ruleData[childAttribute].conditionText.trim();
                        var conditionTextMain = ruleData[childAttribute].conditionTextMain.trim();
                        attributeObj['rg'] = ruleData[childAttribute].guid;
                        attributeObj['ct'] = conditionTextMain;
                        fullCondition = conditionTextMain;
                        attributeObj['sg'] = ruleData[childAttribute].eventSubscriptionGuid;
                        ruleCommandText = ruleData[childAttribute].commandText;
                        attrValue = ruleData[childAttribute].value;
                        var attrLocalName = ruleData[childAttribute].localName;
                        var localNameParent = ruleData[childAttribute].localNameParent;
                        attParentName = localNameParent;
                        var currentAttParent = ruleData[childAttribute].currentAttParent;
                        if (conditionTextMain.indexOf(">=") != -1 || conditionTextMain.indexOf("<=") != -1 || ruleCondition.indexOf("!=") != -1) {} else {
                            if (conditionTextMain.indexOf("=") != -1) {
                                conditionTextMain = conditionTextMain.replace("=", "==");
                            }
                        }
                        var resArray = conditionTextMain.split("AND");
                        thirdLevelChildObj = {};
                        thirdLevelChildObj[localNameParent] = {};
                        async.forEachSeries(resArray, function (conditions, cb_cond) {
                            conditions = conditions.trim();
                            var aconditions = conditions.trim();
                            var res = conditions.split(" ");
                            if (aconditions.indexOf("#") != -1) {
                                var attlocalName = aconditions.split("#");
                                conditionTag = attlocalName[0];
                            }

                            var localName = res[0];
                            localName = localName.split(".");
                            thirdLevelObj.parent = localName[0];
                            var localNameChild = localName[1];
                            if (localNameParent == currentAttParent && attrLocalName == localNameChild) {
                                var tempObj = {};
                                tempObj[localNameChild] = attrValue;
                                ruleAttObj.push(tempObj)
                                var actualConditions = conditions.replace(res[0], attrValue);
                                temp.push(actualConditions);
                                attConditionFlag = 1;
                                cb_cond();
                            } else {
                                cb_cond();
                            }
                        }, function () {
                            cb_rl();
                        });
                    }, function () {
                        var ruleAttObjUpdated = _.reduce(ruleAttObj, _.extend)
                        thirdLevelChildObj[attParentName] = ruleAttObjUpdated;
                        attributeObj['cv'] = thirdLevelChildObj;
                        attributeObj['d'] = validateAttributes;
                        var fconfitionAtt = fullCondition.split("AND");
                        if (attConditionFlag == 1 && temp.length == fconfitionAtt.length) {
                            attConditionFlag = 0;
                            var evalCondition = temp.join(' && ');

                            var tgflagRule = false;
                            if (self.SDK_OPTIONS.isGatewayDevice && conditionTag == deviceTag) {
                                tgflagRule = true;
                            }
                            if (!self.SDK_OPTIONS.isGatewayDevice) {
                                tgflagRule = true;
                            }

                            if (eval(evalCondition) == true && tgflagRule) { // Matched Rule
                                ruleFlag = 1;
                                self.manageDebugLog("INFO_EE01", self.UNIQUEID, self.SID, "", 1, self.IS_DEBUG);
                                var cmdObj = {
                                    cmdType: config.commandType.CORE_COMMAND,
                                    data: {
                                        sid: deviceData.sid,
                                        guid: deviceData.company,
                                        cmdType: config.commandType.CORE_COMMAND,
                                        uniqueId: attributeObjOld.id,
                                        command: ruleCommandText,
                                        ack: true,
                                        ackId: null
                                    }
                                }
                                self.sendCommand(cmdObj);
                                newObj.d.push(attributeObj);
                                self.sendDataOnMQTT(newObj);
                            } else { // Not Matched rule    
                                self.manageDebugLog("INFO_EE02", self.UNIQUEID, self.SID, "", 1, self.IS_DEBUG);
                            }
                        }
                    });
                } else { // No Parent
                    var attributeGuid = "";
                    var attributeObj = {};
                    attributeObj['id'] = attributeObjOld.id ? attributeObjOld.id : undefined; //attributeObjOld.uniqueId;
                    // attributeObj['dt'] = new Date();
                    attributeObj['tg'] = attributeObjOld.tg ? attributeObjOld.tg : undefined;
                    attributeObj['d'] = [];
                    attributeObj['cv'] = "";
                    fullCondition = "";
                    async.forEachSeries(ruleEvaluationData.data, function (ruleData, cb_rl) {
                        var childAttribute = Object.keys(ruleData);
                        attributeGuid = childAttribute[0];
                        var ruleCondition = ruleData.conditionText.trim();
                        var conditionTextMain = ruleData.conditionTextMain.trim();
                        attributeObj['rg'] = ruleData.guid;
                        attributeObj['ct'] = conditionTextMain;
                        fullCondition = conditionTextMain;
                        attributeObj['sg'] = ruleData.eventSubscriptionGuid;
                        ruleCommandText = ruleData.commandText;
                        attrValue = ruleData.value;
                        var attrLocalName = ruleData.localName;
                        if (ruleCondition.indexOf(">=") != -1 || ruleCondition.indexOf("<=") != -1 || ruleCondition.indexOf("!=") != -1) {
                            if (ruleCondition.indexOf("==") != -1) {
                                ruleCondition = ruleCondition.replace("==", "=");
                            }
                        } else {
                            if (ruleCondition.indexOf("=") != -1) {
                                ruleCondition = ruleCondition.replace("=", "==");
                            }
                        }
                        var res = ruleCondition.split(" ");
                        var localName = res[0];
                        var conditionTag = "";
                        if (localName.indexOf("#") != -1) {
                            var attlocalName = localName.split("#");
                            conditionTag = attlocalName[0];
                            attlocalName = attlocalName[1];
                        } else {
                            attlocalName = localName;
                        }
                        var actualConditions = ruleCondition.replace(res[0], attrValue);

                        var tgflagRule = false;
                        if (self.SDK_OPTIONS.isGatewayDevice && conditionTag == deviceTag) {
                            tgflagRule = true;
                        }
                        if (!self.SDK_OPTIONS.isGatewayDevice) {
                            tgflagRule = true;
                        }

                        if (eval(actualConditions.toString()) == true && tgflagRule) { // Matched Rule
                            self.manageDebugLog("INFO_EE01", self.UNIQUEID, self.SID, "", 1, self.IS_DEBUG);
                            ruleFlag = 1
                            var thirdLevelObj = {};
                            thirdLevelObj[attlocalName] = attrValue;
                            attributeObj['cv'] = thirdLevelObj;
                            attributeObj['d'] = validateAttributes;
                            newObj.d.push(attributeObj);
                            var cmdObj = {
                                cmdType: config.commandType.CORE_COMMAND,
                                data: {
                                    sid: deviceData.sid,
                                    guid: deviceData.company,
                                    cmdType: config.commandType.CORE_COMMAND,
                                    uniqueId: attributeObjOld.id,
                                    command: ruleCommandText,
                                    ack: true,
                                    ackId: null
                                }
                            }
                            self.sendCommand(cmdObj);
                        } else { // Not Matched rule
                            self.manageDebugLog("INFO_EE02", self.UNIQUEID, self.SID, "", 1, self.IS_DEBUG);
                        }
                        cb_rl();
                    }, function () {
                        if (ruleFlag == 1) {
                            self.sendDataOnMQTT(newObj);
                        }
                    });
                }
            }
        } catch (error) {
            self.manageDebugLog("ERR_EE01", self.UNIQUEID, self.SID, error.message, 0, self.IS_DEBUG);
        }
    }

    /*
    Object : Device 
    Author : Mayank [SOFTWEB]
    Output : Send command to firmware
    Date   : 2019-01-25
    */
    sendCommand(obj) {
        var self = this;
        var data = {
            status: true,
            data: {
                "cmdReceiveType": "cmd",
                "data": obj
            },
            message: "Device rule command"
        }
        self.CMD_CALLBACK(data);
    }

    /*
    Object : Device data validation
    Author : Mayank [SOFTWEB]
    Output : Validates the message and determine its reporting or faulty data
    Date   : 2018-01-25
    */
    dataValidationTest(dataType, dataValidation, attrValue, childDeviceInfo, msgTypeStatus, cb) {
        //console.log('datatype', dataType)
        var self = this;
        var childAttrObj = {};
        var valueArray = dataValidation.split(",");
        if (dataType == config.dataType.INTEGER || dataType == config.dataType.LONG) {
            var attrValue = attrValue.toString();
            var numbersInt = /^[-+]?[0-9]+$/;
            var numbersFloat = /^[-+]?[0-9]+\.[0-9]+$/;
            if (attrValue.match(numbersInt) != null || attrValue.match(numbersFloat) != null) {
                var isNumber = true;
            } else {
                var isNumber = false;
            }

            if(self.SDK_OPTIONS.isSkipValidation) {
                if (isNumber == false) {
                    msgTypeStatus = 1;
                }
                childAttrObj["ln"] = childDeviceInfo.ln;
                childAttrObj["v"] = attrValue;
                childAttrObj["msgTypeStatus"] = msgTypeStatus;
            } else {
                if (dataValidation != "" && dataValidation != null) {
                    if (valueArray.indexOf(attrValue) == -1) {
    
                        var validationFlag = 1;
                        async.forEachSeries(valueArray, function (restrictedValue, cbValue) {
                            if (restrictedValue.indexOf("to") == -1) {
                                if (attrValue == parseInt(restrictedValue.trim())) {
                                    validationFlag = 0;
                                }
                                cbValue();
                            } else {
                                var valueRangeArray = restrictedValue.split("to");
                                if (attrValue >= parseInt(valueRangeArray[0].trim()) && attrValue <= parseInt(valueRangeArray[1].trim())) {
                                    validationFlag = 0;
                                }
                                cbValue();
                            }
    
                        }, function () {
                            if (validationFlag == 1 || isNumber == false) {
                                msgTypeStatus = 1;
                            }
    
                            childAttrObj["ln"] = childDeviceInfo.ln;
                            childAttrObj["v"] = attrValue;
                            childAttrObj["msgTypeStatus"] = msgTypeStatus;
                        });
                    } else {
                        if (isNumber == false) {
                            msgTypeStatus = 1;
                        }
                        childAttrObj["ln"] = childDeviceInfo.ln;
                        childAttrObj["v"] = attrValue;
                        childAttrObj["msgTypeStatus"] = msgTypeStatus;
                    }
                } else {
                    if (isNumber == false) {
                        msgTypeStatus = 1;
                    }
                    childAttrObj["ln"] = childDeviceInfo.ln;
                    childAttrObj["v"] = attrValue;
                    childAttrObj["msgTypeStatus"] = msgTypeStatus;
                }
            }
        } else if (dataType == config.dataType.STRING && (dataValidation != "" && dataValidation != null)) {
            var valueArray = dataValidation.split(",");
            var valueArrayTrimmed = _.map(valueArray, _.trim);
            if (valueArrayTrimmed.indexOf(attrValue) == -1) {
                msgTypeStatus = 1;
            }
            childAttrObj["ln"] = childDeviceInfo.ln;
            childAttrObj["v"] = attrValue;
            childAttrObj["msgTypeStatus"] = msgTypeStatus;
        }else if (dataType == config.dataType.LATLONG) {
            childAttrObj["ln"] = childDeviceInfo.ln;
            try{
                childAttrObj["v"] = attrValue ? JSON.parse(attrValue) : attrValue;
            } catch(error){
                childAttrObj["v"] = attrValue;
            }
            childAttrObj["msgTypeStatus"] = msgTypeStatus;
        }else if (dataType == config.dataType.BIT) {
            var attrValue1 = attrValue.toString();
            if(!attrValue1.match(/^(0|1)$/)) {
                msgTypeStatus = 1;
            }

            if(self.SDK_OPTIONS.isSkipValidation) {
                if (isNumber == false) {
                    msgTypeStatus = 1;
                }
                childAttrObj["ln"] = childDeviceInfo.ln;
                childAttrObj["v"] = attrValue;
                childAttrObj["msgTypeStatus"] = msgTypeStatus;
            } else {
                if (dataValidation != "" && dataValidation != null) {
                    if (valueArray.indexOf(attrValue) == -1) {
    
                        var validationFlag = 1;
                        async.forEachSeries(valueArray, function (restrictedValue, cbValue) {
                            if (restrictedValue.indexOf("to") == -1) {
                                if (attrValue == parseInt(restrictedValue.trim())) {
                                    validationFlag = 0;
                                }
                                cbValue();
                            } else {
                                var valueRangeArray = restrictedValue.split("to");
                                if (attrValue >= parseInt(valueRangeArray[0].trim()) && attrValue <= parseInt(valueRangeArray[1].trim())) {
                                    validationFlag = 0;
                                }
                                cbValue();
                            }
    
                        }, function () {
                            if (validationFlag == 1 || isNumber == false) {
                                msgTypeStatus = 1;
                            }
    
                            childAttrObj["ln"] = childDeviceInfo.ln;
                            childAttrObj["v"] = attrValue;
                            childAttrObj["msgTypeStatus"] = msgTypeStatus;
                        });
                    } else {
                        if (isNumber == false) {
                            msgTypeStatus = 1;
                        }
                        childAttrObj["ln"] = childDeviceInfo.ln;
                        childAttrObj["v"] = attrValue;
                        childAttrObj["msgTypeStatus"] = msgTypeStatus;
                    }
                } else {
                    if (isNumber == false) {
                        msgTypeStatus = 1;
                    }
                    childAttrObj["ln"] = childDeviceInfo.ln;
                    childAttrObj["v"] = attrValue;
                    childAttrObj["msgTypeStatus"] = msgTypeStatus;
                }
            }
        }else if (dataType == config.dataType.BOOLEAN) {
            var attrValue1 = attrValue.toString();
            if(!attrValue1.match(/^(true|false|False|True)$/)) {
                msgTypeStatus = 1;
            }
            if(self.SDK_OPTIONS.isSkipValidation) {
                if (isNumber == false) {
                    msgTypeStatus = 1;
                }
                childAttrObj["ln"] = childDeviceInfo.ln;
                childAttrObj["v"] = attrValue;
                childAttrObj["msgTypeStatus"] = msgTypeStatus;
            } else {
                if (dataValidation != "" && dataValidation != null) {
                    if (valueArray.indexOf(attrValue) == -1) {
    
                        var validationFlag = 1;
                        async.forEachSeries(valueArray, function (restrictedValue, cbValue) {
                            if (restrictedValue.indexOf("to") == -1) {
                                if (attrValue == parseInt(restrictedValue.trim())) {
                                    validationFlag = 0;
                                }
                                cbValue();
                            } else {
                                var valueRangeArray = restrictedValue.split("to");
                                if (attrValue >= parseInt(valueRangeArray[0].trim()) && attrValue <= parseInt(valueRangeArray[1].trim())) {
                                    validationFlag = 0;
                                }
                                cbValue();
                            }
    
                        }, function () {
                            if (validationFlag == 1 || isNumber == false) {
                                msgTypeStatus = 1;
                            }
    
                            childAttrObj["ln"] = childDeviceInfo.ln;
                            childAttrObj["v"] = attrValue;
                            childAttrObj["msgTypeStatus"] = msgTypeStatus;
                        });
                    } else {
                        if (isNumber == false) {
                            msgTypeStatus = 1;
                        }
                        childAttrObj["ln"] = childDeviceInfo.ln;
                        childAttrObj["v"] = attrValue;
                        childAttrObj["msgTypeStatus"] = msgTypeStatus;
                    }
                } else {
                    if (isNumber == false) {
                        msgTypeStatus = 1;
                    }
                    childAttrObj["ln"] = childDeviceInfo.ln;
                    childAttrObj["v"] = attrValue;
                    childAttrObj["msgTypeStatus"] = msgTypeStatus;
                }
            }
        }else if (dataType == config.dataType.DECIMAL) {
            var attrValue = attrValue.toString();
            var valueArray = dataValidation.split(",");
            var isDecimal = false
            if(!attrValue.match('^-?\\d+(\\.\\d{1,7})?$')) {
                msgTypeStatus = 1;
                isDecimal = false
            } else if(attrValue.match('^-?\\d+(\\.\\d{1,7})?$')){
                if(!(Number(_.trim(attrValue)) >= Number((-7.9*1028).toString()) && Number(_.trim(attrValue)) <= Number((7.9*1028).toString()))){
                    msgTypeStatus = 1
                    isDecimal = false
                }
                else {
                    isDecimal = true
                }
            } else {
                isDecimal = true
            }
            if(self.SDK_OPTIONS.isSkipValidation) {
                if (isDecimal == false) {
                    msgTypeStatus = 1;
                }
                childAttrObj["ln"] = childDeviceInfo.ln;
                childAttrObj["v"] = attrValue;
                childAttrObj["msgTypeStatus"] = msgTypeStatus;
            } else {
                if (dataValidation != "" && dataValidation != null) {
                    if (valueArray.indexOf(attrValue) == -1) {
    
                        var validationFlag = 1;
                        async.forEachSeries(valueArray, function (restrictedValue, cbValue) {
                            if (restrictedValue.indexOf("to") == -1) {
                                if (attrValue == Number(_.trim(restrictedValue))) {
                                    validationFlag = 0;
                                }
                                cbValue();
                            } else {
                                var valueRangeArray = restrictedValue.split("to");
                                if (attrValue >= Number(_.trim(valueRangeArray[0])) && attrValue <= Number(_.trim(valueRangeArray[1]))) {
                                    validationFlag = 0;
                                }
                                cbValue();
                            }
    
                        }, function () {
                            if (validationFlag == 1 || isDecimal == false) {
                                msgTypeStatus = 1;
                            }
    
                            childAttrObj["ln"] = childDeviceInfo.ln;
                            childAttrObj["v"] = attrValue;
                            childAttrObj["msgTypeStatus"] = msgTypeStatus;
                        });
                    } else {
                        if (isDecimal == false) {
                            msgTypeStatus = 1;
                        }
                        childAttrObj["ln"] = childDeviceInfo.ln;
                        childAttrObj["v"] = attrValue;
                        childAttrObj["msgTypeStatus"] = msgTypeStatus;
                    }
                } else {
                    if (isDecimal == false) {
                        msgTypeStatus = 1;
                    }
                    childAttrObj["ln"] = childDeviceInfo.ln;
                    childAttrObj["v"] = attrValue;
                    childAttrObj["msgTypeStatus"] = msgTypeStatus;
                }
            }
            childAttrObj["ln"] = childDeviceInfo.ln;
            childAttrObj["v"] = attrValue;
            childAttrObj["msgTypeStatus"] = msgTypeStatus;
        }else if (dataType == config.dataType.DATE) {
            var attrValue1 = attrValue.toString();
            var valid = true
            if(!moment(attrValue1, 'YYYY-MM-DD', true).isValid()) {
                msgTypeStatus = 1;
                valid = false
            }
            if(self.SDK_OPTIONS.isSkipValidation) {
                if (valid == false) {
                    msgTypeStatus = 1;
                }
                childAttrObj["ln"] = childDeviceInfo.ln;
                childAttrObj["v"] = attrValue;
                childAttrObj["msgTypeStatus"] = msgTypeStatus;
            } else {
                if (dataValidation != "" && dataValidation != null) {
                    let isValidFlag = false
                _.map(_.split(dataValidation, ','), function (group) {
                    let value = moment(attrValue1,'YYYY-MM-DD');
                    if (group.includes('to')) {
                    let tmpArr = _.split(group, 'to');
                    let beforeValue = moment(tmpArr[0].trim(),'YYYY-MM-DD');
                    let afterValue = moment(tmpArr[1].trim(),'YYYY-MM-DD');
                    if (value.isBetween(beforeValue, afterValue, undefined, '[]')) {
                        isValidFlag = true
                      } 
                      if (value.isBefore(beforeValue)) {
                        isValidFlag = false
                      } if (value.isAfter(afterValue)) {
                        isValidFlag = false
                      }
                    } else {
                        let value2 = moment(group.trim(),'YYYY-MM-DD');
                        if (value.isSame(value2)) {
                            isValidFlag = true
                          }
                    }
                });
                if (!isValidFlag){
                    msgTypeStatus = 1
                }
                childAttrObj["ln"] = childDeviceInfo.ln;
                childAttrObj["v"] = attrValue;
                childAttrObj["msgTypeStatus"] = msgTypeStatus;
            }       
        }   
            childAttrObj["ln"] = childDeviceInfo.ln;
            childAttrObj["v"] = attrValue;
            childAttrObj["msgTypeStatus"] = msgTypeStatus;
        }else if (dataType == config.dataType.DATETIME) {
            var attrValue1 = attrValue.toString();
            var valid = true
            if(!moment(attrValue1, 'YYYY-MM-DD[T]HH:mm:ss.SSS[Z]', true).isValid()) {
                msgTypeStatus = 1;
                valid = false
            }
            if(self.SDK_OPTIONS.isSkipValidation) {
                if (valid == false) {
                    msgTypeStatus = 1;
                }
                childAttrObj["ln"] = childDeviceInfo.ln;
                childAttrObj["v"] = attrValue;
                childAttrObj["msgTypeStatus"] = msgTypeStatus;
            } else {
                if (dataValidation != "" && dataValidation != null) {
                    let isValidFlag = false
                _.map(_.split(dataValidation, ','), function (group) {
                    let value = moment(attrValue1,'YYYY-MM-DD[T]HH:mm:ss.SSS[Z]');
                    if (group.includes('to')) {
                    let tmpArr = _.split(group, 'to');
                    let beforeValue = moment(tmpArr[0].trim(),'YYYY-MM-DD[T]HH:mm:ss.SSS[Z]');
                    let afterValue = moment(tmpArr[1].trim(),'YYYY-MM-DD[T]HH:mm:ss.SSS[Z]');
                    if (value.isBetween(beforeValue, afterValue, undefined, '[]')) {
                        isValidFlag = true
                      } 
                      if (value.isBefore(beforeValue)) {
                        isValidFlag = false
                      } if (value.isAfter(afterValue)) {
                        isValidFlag = false
                      }
                    } else {
                        let value2 = moment(group.trim(),'YYYY-MM-DD[T]HH:mm:ss.SSS[Z]');
                        if (value.isSame(value2)) {
                            isValidFlag = true
                          }
                    }
                });
                if (!isValidFlag){
                    msgTypeStatus = 1
                }
                childAttrObj["ln"] = childDeviceInfo.ln;
                childAttrObj["v"] = attrValue;
                childAttrObj["msgTypeStatus"] = msgTypeStatus;
            }
            }   
            childAttrObj["ln"] = childDeviceInfo.ln;
            childAttrObj["v"] = attrValue;
            childAttrObj["msgTypeStatus"] = msgTypeStatus;
        }else if (dataType == config.dataType.TIME) {
        var attrValue1 = attrValue.toString();
        var valid = true
        if(!moment(attrValue1, 'HH:mm:ss', true).isValid()) {
            msgTypeStatus = 1;
            valid = false
        }
        if(self.SDK_OPTIONS.isSkipValidation) {
            if (valid == false) {
                msgTypeStatus = 1;
            }
            childAttrObj["ln"] = childDeviceInfo.ln;
            childAttrObj["v"] = attrValue;
            childAttrObj["msgTypeStatus"] = msgTypeStatus;
        } else {
            if (dataValidation != "" && dataValidation != null) {
                let isValidFlag = false
                _.map(_.split(dataValidation, ','), function (group) {
                    let value = moment(attrValue1,'HH:mm:ss');
                    if (group.includes('to')) {
                    let tmpArr = _.split(group, 'to');
                    let beforeValue = moment(tmpArr[0].trim(),'HH:mm:ss');
                    let afterValue = moment(tmpArr[1].trim(),'HH:mm:ss');
                    if (value.isBetween(beforeValue, afterValue, undefined, '[]')) {
                        isValidFlag = true
                      } 
                      if (value.isBefore(beforeValue)) {
                        isValidFlag = false
                      } if (value.isAfter(afterValue)) {
                        isValidFlag = false
                      }
                    } else {
                        let value2 = moment(group.trim(),'HH:mm:ss');
                        if (value.isSame(value2)) {
                            isValidFlag = true
                          }
                    }
                });
                if (!isValidFlag){
                    msgTypeStatus = 1
                }
                childAttrObj["ln"] = childDeviceInfo.ln;
                childAttrObj["v"] = attrValue;
                childAttrObj["msgTypeStatus"] = msgTypeStatus;
            }
        }   
        childAttrObj["ln"] = childDeviceInfo.ln;
        childAttrObj["v"] = attrValue;
        childAttrObj["msgTypeStatus"] = msgTypeStatus;
    }
        else {
            childAttrObj["ln"] = childDeviceInfo.ln;
            childAttrObj["v"] = attrValue;
            childAttrObj["msgTypeStatus"] = msgTypeStatus;
        }
        cb(childAttrObj);
    }

    /*
    Object : Device 
    Author : Mayank [SOFTWEB]
    Output : Send data using MQTT to MQTT topic
    Date   : 2018-01-25
    */
    sendDataOnMQTT(sensorData) {
        var self = this;
        var cacheId = self.SID + "_" + self.UNIQUEID;
        var deviceSyncRes = cache.get(cacheId);
        if (self.SDK_OPTIONS.SDK_TYPE == "MQTT") {
            var brokerConfiguration = deviceSyncRes.p;
            var protocoalName = brokerConfiguration.n;
            if (protocoalName.toLowerCase() == "mqtt" && deviceSyncRes && "p" in deviceSyncRes) {
                var mqttHost = brokerConfiguration.h;
                //console.log("sendDataOnMQTT -> mqttPublishData -> sensorData.mt", sensorData.d)
                self.mqttPublishData(mqttHost, sensorData);
            } else if (protocoalName.toLowerCase() == "http" || protocoalName.toLowerCase() == "https") {
                var headers = {
                    "accept": "application/json",
                    "content-type": "application/json",
                    "authorization": brokerConfiguration.auth, // sas token
                    "iothub-app-cd": deviceSyncRes.meta.cd,
                    "iothub-app-v": deviceSyncRes.meta.v
                };
                request.post({
                        url: brokerConfiguration.url,
                        headers: headers,
                        body: sensorData,
                        json: true
                    },
                    function (error, response, body) {
                        if (error) {
                            self.manageDebugLog("ERR_SD01", self.UNIQUEID, self.SID, error.message, 0, self.IS_DEBUG);
                        } else {
                            self.manageDebugLog("INFO_SD01", self.UNIQUEID, self.SID, "", 1, self.IS_DEBUG);
                        }
                    });
            } else {
                self.manageDebugLog("ERR_SD11", self.UNIQUEID, self.SID, error.message, 0, self.IS_DEBUG);
            }
        } else if (self.SDK_OPTIONS.SDK_TYPE == "AZURE") {
            var mqttHost = self.SDK_OPTIONS.CONNECTION_STRING.split(";")[0].split("=")[1];
            //console.log("Azure -> mqttPublishData -> sensorData", sensorData)
            self.mqttPublishData(mqttHost, sensorData);
        }
    }

    /*
    Object : Offline Device 
    Author : Mayank [SOFTWEB]
    Output : Start the offline data store process
    Date   : 2020-01-25
    */
    offlineProcess(offlineData) {
        var self = this;
        try {
            
            // if (!offlineData['sid'])
            offlineData['sid'] = self.SID;
            if (self.IS_RUNNING) {
                setTimeout(() => {
                    offlineData['sid'] = self.SID;
                    self.offlineProcess(offlineData);
                }, 500);
            } else {
                self.IS_RUNNING = true;
                offlineData['sid'] = self.SID;
                var logPath = self.LOG_PATH;
                try {
                    fs.readdir(logPath, function (err, files) {
                        if (err) {
                            self.manageDebugLog("ERR_OS04", self.UNIQUEID, self.SID, config.errorLog.ERR_OS04 + " " + err.message, 0, self.IS_DEBUG);
                        }
                        if (files && files.length == 0) {
                            self.createFile(offlineData, null, logPath, function (res) {
                                self.IS_RUNNING = false;
                            });
                        } else {
                            async.forEachSeries(files, function (file, cb) {
                                var filePath = logPath + file;
                                if (file.indexOf("Active") != -1) // Check the Tumbling Window validation
                                {
                                    async.waterfall([
                                        function (wfcb) {
                                            var fileSize = eval(fs.statSync(filePath).size / 1024); //Convert Bytes to KB
                                            wfcb(null, fileSize)
                                        }
                                    ], function (err, fileSize) {
                                        if (!offlineData.mt || offlineData.mt == config.messageType.ack) {
                                            if (offlineData.mt != 0)
                                                // delete offlineData.sid; // Temp code
                                            var uid = self.UNIQUEID;
                                        } else {
                                            var uid = offlineData.d[0].id;
                                        }
                                        if (self.SDK_OPTIONS.offlineStorage.offlinePerFileDataLimit > fileSize || self.SDK_OPTIONS.offlineStorage.offlinePerFileDataLimit == 0) {
                                            try {
                                                fsep.readJsonAsync(filePath).then(function (packageObj) {
                                                    packageObj.push(offlineData);
                                                    try {
                                                        fsep.writeJsonAsync(filePath, packageObj, err => {
                                                            if (err) {
                                                                self.manageDebugLog("ERR_OS01", self.UNIQUEID, self.SID, err.message, 0, self.IS_DEBUG);
                                                                cb();
                                                            } else {
                                                                console.log("\nOffline data saved ::: DeviceId :: " + self.UNIQUEID + " :: ", new Date());
                                                                self.manageDebugLog("INFO_OS02", self.UNIQUEID, self.SID, "", 1, self.IS_DEBUG);
                                                                cb();
                                                            }
                                                        })
                                                    } catch (error) {
                                                        self.manageDebugLog("ERR_OS01", self.UNIQUEID, self.SID, error.message, 0, self.IS_DEBUG);
                                                    }
                                                });
                                            } catch (error) {
                                                self.manageDebugLog("ERR_OS01", self.UNIQUEID, self.SID, error.message, 0, self.IS_DEBUG);
                                                cb();
                                            }
                                        } else {
                                            console.log("Exceeded the file limit as predetermined...")
                                            if (self.SDK_OPTIONS.offlineStorage.offlineFileCount == 1) {
                                                if (eval(fileSize - self.SDK_OPTIONS.offlineStorage.offlinePerFileDataLimit) > 1500) {
                                                    var shiftcnt = 3;
                                                } else if (eval(fileSize - self.SDK_OPTIONS.offlineStorage.offlinePerFileDataLimit) > 1024) {
                                                    var shiftcnt = 2;
                                                } else {
                                                    var shiftcnt = 1;
                                                }

                                                try {
                                                    fsep.readJsonAsync(filePath).then(function (packageObj) {
                                                        if (shiftcnt == 3) {
                                                            packageObj.shift();
                                                            packageObj.shift();
                                                        } else if (shiftcnt == 2) {
                                                            packageObj.shift();
                                                        }
                                                        packageObj.shift();
                                                        setTimeout(() => {
                                                            packageObj.push(offlineData);
                                                        }, 100);
                                                        try {
                                                            fsep.writeJsonAsync(filePath, packageObj, err => {
                                                                if (err) {
                                                                    console.error(err)
                                                                    cb();
                                                                } else {
                                                                    var clientId = self.SID + "_" + self.UNIQUEID;
                                                                    self.manageDebugLog("INFO_OS02", self.UNIQUEID, self.SID, "", 1, self.IS_DEBUG);
                                                                    cb();
                                                                }
                                                            })
                                                        } catch (error) {
                                                            self.manageDebugLog("ERR_OS01", self.UNIQUEID, self.SID, error.message, 0, self.IS_DEBUG);
                                                        }
                                                    });
                                                } catch (error) {
                                                    self.manageDebugLog("ERR_OS01", self.UNIQUEID, self.SID, error.message, 0, self.IS_DEBUG);
                                                    cb();
                                                }
                                            } else {
                                                try {
                                                    self.createFile(offlineData, file, logPath, function (res) {
                                                        fs.readdir(logPath, function (err, allFiles) {
                                                            if (err) {
                                                                self.manageDebugLog("ERR_OS04", self.UNIQUEID, self.SID, config.errorLog.ERR_OS04 + " " + err.message, 0, self.IS_DEBUG);
                                                                cb();
                                                            } else if (allFiles.length > self.SDK_OPTIONS.offlineStorage.offlineFileCount) {
                                                                self.deleteFile(logPath);
                                                                cb();
                                                            } else {
                                                                cb();
                                                            }
                                                        });
                                                    });
                                                } catch (error) {
                                                    self.manageDebugLog("ERR_OS01", self.UNIQUEID, self.SID, error.message, 0, self.IS_DEBUG);
                                                    cb();
                                                }
                                            }
                                        }
                                    });
                                } else {
                                    cb()
                                }
                            }, function () {
                                self.IS_RUNNING = false;
                            })
                        }
                    });
                } catch (error) {
                    self.manageDebugLog("ERR_OS01", self.UNIQUEID, self.SID, error.message, 0, self.IS_DEBUG);
                }
            }
        } catch (error) {
            self.manageDebugLog("ERR_OS01", self.UNIQUEID, self.SID, error.message, 0, self.IS_DEBUG);
        }
    }

    /*
    Object : Offline Device : Switch filenmae from active to normal timestamp
    Author : Mayank [SOFTWEB]
    Output : Rename the file once it exceed the limit
    Date   : 2020-01-25
    */
    swapFilename(oldFileName, logPath, callback) {
        var self = this;
        try {
            fs.exists(logPath + oldFileName, (exists) => {
                if (exists) {
                    var newFile = oldFileName.substr(7, oldFileName.length - 1);
                    var oldPath = logPath + oldFileName;
                    var newPath = logPath + newFile;
                    fs.rename(oldPath, newPath, function (err, res) {
                        console.log("File name updated due to file size exceeded.");
                        callback();
                    })
                } else {
                    callback();
                }
            });
        } catch (error) {
            self.manageDebugLog("ERR_OS01", self.UNIQUEID, self.SID, error.message, 0, self.IS_DEBUG);
            callback();
        }
    }

    /*
    Object : Offline Device 
    Author : Mayank [SOFTWEB]
    Output : create the new file to store offline data
    Date   : 2020-01-25
    */
    createFile(offlineData, oldFile = "", logPath, callback) {
        var self = this;
        try {
            if (!offlineData.mt || offlineData.mt == config.messageType.ack) {
                // delete offlineData.sid; // Temp code
                //var uid = self.UNIQUEID;
            } else {
                //var uid = offlineData.d[0].id;
            }
            self.swapFilename(oldFile, logPath, function () {
                var date = new Date();
                var newFilePath = logPath + "Active_" + date.getTime() + '.json';
                var offlineDataArray = [offlineData];
                try {
                    fsep.writeJsonAsync(newFilePath, offlineDataArray, err => {
                        if (err) {
                            self.manageDebugLog("ERR_OS01", self.UNIQUEID, self.SID, err.message, 0, self.IS_DEBUG);
                            callback(false);
                        } else {
                            self.manageDebugLog("INFO_OS03", self.UNIQUEID, self.SID, "", 1, self.IS_DEBUG);
                            self.manageDebugLog("INFO_OS02", self.UNIQUEID, self.SID, "", 1, self.IS_DEBUG);
                            callback(true);
                        }
                    })
                } catch (error) {
                    self.manageDebugLog("ERR_OS01", self.UNIQUEID, self.SID, error.message, 0, self.IS_DEBUG);
                    callback(true);
                }
            });
        } catch (error) {
            self.manageDebugLog("ERR_OS01", self.UNIQUEID, self.SID, error.message, 0, self.IS_DEBUG);
            callback
        }
    }

    /*
    Object : Offline Device 
    Author : Mayank [SOFTWEB]
    Output : Delete speccific log file
    Date   : 2020-01-25
    */
    deleteFile(logPath, deleteFilePath = "") {
        var self = this;
        if (logPath && deleteFilePath == "") {
            try {
                fs.readdir(logPath, function (err, files) {
                    if (err) {
                        self.manageDebugLog("ERR_OS04", self.UNIQUEID, self.SID, config.errorLog.ERR_OS04 + " " + err.message, 0, self.IS_DEBUG);
                    }
                    if (files && files.length > 0) {
                        var tempArray = [];
                        files.forEach(function (file) {
                            tempArray.push(file.substr(file.length - 18, 13));
                        });
                        var deleteFileTimeStamp = _.min(tempArray);
                        if (tempArray.indexOf(deleteFileTimeStamp) != -1) {
                            fs.remove(logPath + files[tempArray.indexOf(deleteFileTimeStamp)])
                            .then(() => {
                                self.manageDebugLog("INFO_OS04", self.UNIQUEID, self.SID, "", 1, self.IS_DEBUG);
                            })
                            .catch(err => {
                                self.manageDebugLog("ERR_OS01", self.UNIQUEID, self.SID, error.message, 0, self.IS_DEBUG);
                            })
                        }
                    }
                });
            } catch (error) {
                self.manageDebugLog("ERR_OS01", self.UNIQUEID, self.SID, error.message, 0, self.IS_DEBUG);
            }
        } else {
            try {
                fs.remove(deleteFilePath)
                    .then(() => {
                        self.manageDebugLog("INFO_OS04", self.UNIQUEID, self.SID, "", 1, self.IS_DEBUG);
                    })
                    .catch(err => {
                        self.manageDebugLog("ERR_OS01", self.UNIQUEID, self.SID, err.message, 0, self.IS_DEBUG);
                    })
            } catch (error) {
                self.manageDebugLog("ERR_OS01", self.UNIQUEID, self.SID, error.message, 0, self.IS_DEBUG);
            }
        }
    }

    /*
    Object : Offline Device 
    Author : Mayank [SOFTWEB]
    Output : Delete All log files
    Date   : 2020-01-25
    */
    deleteAllLogFile(logPath) {
        var self = this;
        if (logPath) {
            try {
                fs.readdir(logPath, function (err, files) {
                    if (err) {
                        self.manageDebugLog("ERR_OS04", self.UNIQUEID, self.SID, config.errorLog.ERR_OS04 + " " + err.message, 0, this.IS_DEBUG);
                    }
                    if (files && files.length > 0) {
                        files.forEach(function (file) {
                            try {
                                fs.remove(logPath + file)
                                    .then(() => {
                                        self.manageDebugLog("INFO_OS04", self.UNIQUEID, self.SID, "", 1, self.IS_DEBUG);
                                    })
                                    .catch(err => {
                                        self.manageDebugLog("ERR_OS01", self.UNIQUEID, self.SID, error.message, 0, self.IS_DEBUG);
                                    })
                            } catch (error) {
                                self.manageDebugLog("ERR_OS01", self.UNIQUEID, self.SID, error.message, 0, self.IS_DEBUG);
                            }
                        });
                    }
                });
            } catch (error) {
                self.manageDebugLog("ERR_OS01", self.UNIQUEID, self.SID, error.message, 0, self.IS_DEBUG);
            }
        }
    }

    /*
    Object : Offline Device 
    Author : Mayank [SOFTWEB]
    Output : Check for offline data exist or not
    Date   : 2020-01-25
    */
    checkOfflineData() {
        var self = this;
        try {
            self.IS_RUNNINGOfflineSending = true;
            var dataPublishFileArray = "";
            var logPath = "";
            async.waterfall([
                function (callback) {
                    logPath = self.LOG_PATH;
                    callback(null, logPath)
                },
                function (logPath, callback) {
                    try {
                        fs.readdir(logPath, function (err, files) {
                            if (err) {
                                self.manageDebugLog("ERR_OS04", self.UNIQUEID, self.SID, config.errorLog.ERR_OS04 + " " + err.message, 0, self.IS_DEBUG);
                            }
                            if (files && files.length > 0) {
                                var tempArray = [];
                                files.forEach(function (file) {
                                    tempArray.push(file.substr(file.length - 18, 13));
                                });
                                tempArray.sort(function (a, b) {
                                    return b - a
                                });
                                callback(null, tempArray);
                            } else {
                                callback(null, null);
                            }
                        });
                    } catch (error) {
                        self.manageDebugLog("ERR_OS01", self.UNIQUEID, self.SID, error.message, 0, self.IS_DEBUG);
                        callback(null, null);
                    }
                },
                function (tempArray, callback) {
                    if (tempArray != null) {
                        dataPublishFileArray = _.reverse(tempArray);
                        callback(null, dataPublishFileArray);
                    } else {
                        callback(null, null);
                    }
                }
            ], function (err, seuenceArray) {
                if (seuenceArray != null) {
                    seuenceArray.forEach(function (file) {
                        var dataFile = file + ".json";
                        try {
                            fs.exists(logPath + dataFile, (exists) => {
                                if (exists) {
                                    self.checkAndSendOfflineData(logPath + dataFile, logPath, function (res) {})
                                } else {
                                    dataFile = logPath + "Active_" + dataFile;
                                    fs.exists(dataFile, (exists) => {
                                        if (exists) {
                                            self.checkAndSendOfflineData(dataFile, logPath, function (res) {})
                                        }
                                    });
                                }
                            });
                        } catch (error) {
                            self.manageDebugLog("ERR_OS01", self.UNIQUEID, self.SID, error.message, 0, self.IS_DEBUG);
                        }
                    });
                } else {
                    self.manageDebugLog("INFO_OS05", self.UNIQUEID, self.SID, "", 1, self.IS_DEBUG);
                    self.IS_RUNNINGOfflineSending = false;
                }
            });
        } catch (error) {
            self.manageDebugLog("ERR_OS01", self.UNIQUEID, self.SID, error.message, 0, self.IS_DEBUG);
        }
    }

    /*
    Object : Offline Device data send frequency 
    Author : Mayank [SOFTWEB]
    Output : Check for offline data exist or not
    Date   : 2020-11-25
    */
    holdFunc(offDataObj, offlineDataLength, offlineDataFile, logPath) {
        var self = this;
        setTimeout(() => {
            self.sendOfflineDataProcess(offDataObj, offlineDataLength, offlineDataFile, logPath)
        }, config.holdOfflineDataTime * 1000);
    }

    /*
    Object : Offline Device 
    Author : Mayank [SOFTWEB]
    Output : Publish the offline data on cloud once network connecion available
    Date   : 2020-11-25
    */
    sendOfflineDataProcess(offDataObj, offlineDataLength, offlineDataFile, logPath) {
        var self = this;
        var offlineData = _.cloneDeep(offDataObj);
        var startTime = new Date().getTime();
        var actualDataLength = offlineDataLength;
        var offlineHoldTimeDuration = config.holdOfflineDataTime * 1000; // convert time in mili seconds
        async.forEachSeries(offlineData, function (offlineDataResult, off_cb) {
            if (self.BROKER_CLIENT) {
                var curtime = new Date().getTime()
                if (curtime > (parseInt(startTime) + parseInt(offlineHoldTimeDuration))) {
                    self.manageDebugLog("INFO_OS06", self.UNIQUEID, self.SID, config.infoLog.INFO_OS06 + self.TOTAL_RECORD_COUNT + " / " + actualDataLength, 1, self.IS_DEBUG);

                    self.holdFunc(offDataObj, offlineDataLength, offlineDataFile, logPath);
                } else {
                    self.TOTAL_RECORD_COUNT++;

                    try {
                        offlineDataResult['od'] = 1;
                        // offlineDataResult['mt'] = config.;
                        self.sendDataOnMQTT(offlineDataResult);

                        var index = offDataObj.findIndex(obj => obj.t == offlineDataResult.t);
                        if (index > -1) {
                            offDataObj.splice(index, 1);
                            // fs.writeJsonSync(offlineDataFile, offDataObj, function (err) {
                            //     if (err) {
                            //         return console.log(err);
                            //     } else {
                            //         console.log('Data re-added in offline JSON file.');

                            //     }
                            // });
                        }
                        if (actualDataLength == self.TOTAL_RECORD_COUNT) {
                            self.manageDebugLog("INFO_OS06", self.UNIQUEID, self.SID, config.infoLog.INFO_OS06 + self.TOTAL_RECORD_COUNT + " / " + actualDataLength, 1, self.IS_DEBUG);
                            self.IS_RUNNINGOfflineSending = false;
                            self.TOTAL_RECORD_COUNT = 0
                        }
                        off_cb();
                    } catch (error) {
                        self.manageDebugLog("ERR_OS01", self.UNIQUEID, self.SID, error.message, 0, self.IS_DEBUG);
                    }
                }
            } else {
                self.manageDebugLog("ERR_SD10", self.UNIQUEID, self.SID, "", 0, self.IS_DEBUG);
            }
        }, function () {
            try {
                if (offDataObj.length > 0) {
                    fs.writeJsonSync(offlineDataFile, offDataObj, function (err) {
                        if (err) {
                            self.manageDebugLog("ERR_OS01", self.UNIQUEID, self.SID, err.message, 0, self.IS_DEBUG);
                        } else {
                            console.log('Data re-added in offline JSON file.');
                        }
                    });
                } else {
                    self.deleteFile(logPath, offlineDataFile)
                }
            } catch (error) {
                self.manageDebugLog("ERR_OS01", self.UNIQUEID, self.SID, error.message, 0, self.IS_DEBUG);
            }
        });
    }

    /*
    Object : Offline Device : Check if offline data available then publish it
    Author : Mayank [SOFTWEB]
    Output : Check the offline data availability and start send process
    Date   : 2020-11-25
    */
    checkAndSendOfflineData(offlineDataFile, logPath, callback) {
        var self = this;
        try {
            var offlineDtaCountforAllFIles = 0;
            fs.exists(offlineDataFile, (exists) => {
                if (exists) {
                    try {
                        fs.readJson(offlineDataFile, (err, offDataObj) => {
                            if (err) {
                                callback(true);
                            } else {
                                if (offDataObj.length > 0) {
                                    offlineDtaCountforAllFIles = parseInt(offlineDtaCountforAllFIles) + parseInt(offDataObj.length);
                                    self.sendOfflineDataProcess(offDataObj, offlineDtaCountforAllFIles, offlineDataFile, logPath)
                                } else {
                                    self.deleteFile(logPath, offlineDataFile)
                                    callback(true);
                                }
                            }
                        })
                    } catch (error) {
                        self.manageDebugLog("ERR_OS01", self.UNIQUEID, self.SID, error.message, 0, self.IS_DEBUG);
                    }
                } else {
                    callback(true);
                }
            });
        } catch (error) {
            self.manageDebugLog("ERR_OS01", self.UNIQUEID, self.SID, error.message, 0, self.IS_DEBUG);
            callback(true);
        }
    }

    /*
    Object : Device 
    Author : Mayank [SOFTWEB]
    Output : It publish the data on cloud using broker connection
    Date   : 2020-11-25
    */
    async mqttPublishData(mqttHost, sensorData) {        
        var self = this;
        var cacheId = self.SID + "_" + self.UNIQUEID;
        var deviceSyncRes = cache.get(cacheId);
        var brokerConfiguration = deviceSyncRes.p;
        let sysConnected = false;
        // self.offlineProcess(sensorData);
        // return false; 

        sysConnected = await isOnline();
            if (!sysConnected) {
                if (sensorData.mt == 1) {
                    setTimeout(() => {
                        if (!self.SDK_OPTIONS.offlineStorage.offlineProcessDisabled) {
                            self.offlineProcess(sensorData)
                        }
                    }, 100);
                } else {
                    if (!self.SDK_OPTIONS.offlineStorage.offlineProcessDisabled) {
                        self.offlineProcess(sensorData)
                    }
                }
            } else {
                try {
                    if (self.BROKER_CLIENT && self.IS_DEVICE_CONNECTED) {
                        // console.log("brokerConfiguration.topics -> ", brokerConfiguration.topics);
                        try {
                            var pubTopic = "";
                            var messageType = "";
                            // if(deviceSyncRes.p && self.SDK_OPTIONS.SDK_TYPE == "MQTT")
                            // pubTopic = deviceSyncRes.p.topics.ack;

                            // console.log("CommonFunctions -> mqttPublishData -> sensorData.mt", sensorData.mt)
                            if (sensorData == "" && self.SDK_OPTIONS.SDK_TYPE == "MQTT") {
                                sensorData = {"twin": "all"};
                                pubTopic = config[self.SDK_OPTIONS.pf]?.twinResponsePubTopic;
                                if(self.SDK_OPTIONS.pf === "aws"){
                                    pubTopic = deviceSyncRes.p.topics.set.pubForAll;
                                }
                            } else if (sensorData['od'] == 1) {
                                pubTopic = brokerConfiguration.topics.od;
                            } else if ((sensorData.mt || sensorData.mt == 0) && self.SDK_OPTIONS.SDK_TYPE == "MQTT") {
                                switch (sensorData.mt) {
                                    case config.messageType.rpt:
                                        pubTopic = brokerConfiguration.topics.rpt;
                                        messageType = "RPT"
                                        break;
                                    case config.messageType.flt:
                                        pubTopic = brokerConfiguration.topics.flt;
                                        messageType = "FLT"
                                        break;
                                    case config.messageType.rptEdge:
                                        pubTopic = brokerConfiguration.topics.erpt;
                                        messageType = "ERPT"
                                        break;
                                    case config.messageType.ruleMatchedEdge:
                                        pubTopic = brokerConfiguration.topics.erm;
                                        messageType = "ERM"
                                        break;
                                    case config.messageType.deviceCommandAck:
                                        pubTopic = brokerConfiguration.topics.ack;
                                        messageType = "CMD-ACK"
                                        break;
                                    case config.messageType.otaCommandAck:
                                        pubTopic = brokerConfiguration.topics.ack;
                                        messageType = "OTA-ACK"
                                        break;
                                    case config.messageType.moduleCommandAck:
                                        pubTopic = brokerConfiguration.topics.ack;
                                        messageType = "MOD-ACK"
                                        break;

                                    default:
                                        break;
                                }
                            } else if ((!sensorData.mt || sensorData.mt != 0) && self.SDK_OPTIONS.SDK_TYPE == "MQTT") {
                                pubTopic = config[self.SDK_OPTIONS.pf]?.twinPropertyPubTopic;
                                if(self.SDK_OPTIONS.pf === "aws"){
                                    pubTopic = deviceSyncRes.p.topics.set.pub;
                                }
                                // if("sid" in sensorData)
                                //     delete sensorData.sid; // Temp Data
                            }

                            if (pubTopic) {
                                sensorData["pubTopic"] = pubTopic;
                            }
                            sensorData["cd"] = deviceSyncRes.meta.cd ? deviceSyncRes.meta.cd : undefined;
                            
                            console.log("\x1b[33m %s %s\x1b[0m", messageType, pubTopic);
                            // console.log("sensorData === > ", self.SDK_OPTIONS.isDebug);
                            self.BROKER_CLIENT.messagePublish(sensorData, function (response) {
                                if (response.status) {
                                    console.log("Data Sent to IoTConnect ===>>> ", JSON.stringify(sensorData, null, 2));
                                    self.manageDebugLog("INFO_SD01", self.UNIQUEID, self.SID, "", 1, self.IS_DEBUG);
                                } else {

                                    self.manageDebugLog("ERR_SD01", self.UNIQUEID, self.SID, response.message, 0, self.IS_DEBUG);
                                }
                            })
                        } catch (error) {
                            self.manageDebugLog("ERR_SD01", self.UNIQUEID, self.SID, error.message, 0, self.IS_DEBUG);
                        }
                    } else {
                        self.manageDebugLog("ERR_SD10", self.UNIQUEID, self.SID, "", 0, self.IS_DEBUG);
                    }
                } catch (err) {
                    self.manageDebugLog("ERR_SD01", self.UNIQUEID, self.SID, err.message, 0, self.IS_DEBUG);
                }
            }
    }

    /*
    Object : Device 
    Author : Mayank [SOFTWEB]
    Output : It start the listerner for the all cloud to device communication process
    Date   : 2018-02-25
    */
    mqttSubscribeData(cb) {
        var self = this;
        // if (self.IS_DEVICE_CONNECTED) {
            self.CMD_CALLBACK = cb;
            // console.log("1.0.1 ==> ")
            self.BROKER_CLIENT.subscribeData(function (response) {
                // console.log("all commands -> ", JSON.stringify(response));
                if (response.status) {
                    // console.log("CommonFunctions -> mqttSubscribeData -> response.data.cmdReceiveType", response.data.cmdReceiveType)
                    if (response.data.cmdReceiveType == "cmd") {
                        // console.log("all commands -> ", JSON.stringify(response));
                        // command
                        if (response.data.data.ct == config.commandType.DEVICE_CONNECTION_STATUS && response.data.data.command == true) {
                            self.IS_DEVICE_CONNECTED = true;
                            self.manageDebugLog("INFO_IN02", self.UNIQUEID, self.SID, "", 1, self.IS_DEBUG);
                            // console.log(self.SDK_OPTIONS.offlineStorage.offlineProcessDisabled+ " == " +self.IS_RUNNING_OFFLINE_SENDING);
                            if (!self.SDK_OPTIONS.offlineStorage.offlineProcessDisabled && self.IS_RUNNING_OFFLINE_SENDING == false) {
                                self.TOTAL_RECORD_COUNT = 0;
                                self.checkOfflineData();
                            }
                        }
                        // else 
                        // {
                        //     if("ct" in response.data.data.d) {
                        //         self.manageDebugLog("INFO_IN03", self.UNIQUEID, self.SID, "", 1, self.IS_DEBUG);
                        //     }
                        //     console.log("cmd ==> ", response.data.data)
                        // }
                        // console.log("CommonFunctions -> mqttSubscribeData -> response", response)
                        cb(response);
                    }

                    if (response.data.cmdReceiveType == "twin") {
                        // Twin messages
                        self.manageDebugLog("INFO_TP03", self.UNIQUEID, self.SID, "", 1, self.IS_DEBUG);
                        cb(response);
                    }
                } else {
                    cb(response);
                    self.manageDebugLog("ERR_IN01", self.UNIQUEID, self.SID, response.message, 0, self.IS_DEBUG);
                }
            })
        // }
    }

    /*
    Object : Device 
    Author : Mayank [SOFTWEB]
    Output : To make the boker client (MQTT) connection Key, Self sign or CA sign and (HTTP) with key only
    Date   : 2018-02-25
    */
    clientConnection(cb) {
        var self = this;
        var sId = self.SID;
        var sdkOption = self.SDK_OPTIONS;
        var isDebug = self.IS_DEBUG;
        var uniqueId = self.UNIQUEID;
        try {

            if (self.SDK_OPTIONS.SDK_TYPE == "MQTT") {
                var cacheId = sId + "_" + uniqueId;
                var deviceSyncRes = cache.get(cacheId);
                var authType = deviceSyncRes.meta.at;
                var brokerConfiguration = deviceSyncRes.p;
                var protocoalName = brokerConfiguration.n;
                var host = brokerConfiguration.h; //"demohub.azure-devices.net";
                var mqttUrl = 'mqtts://' + host;
                if (authType == config.authType.KEY || authType == config.authType.SYMMETRIC_KEY) {
                    try {
                        if (brokerConfiguration) {
                            self.manageDebugLog("INFO_IN05", uniqueId, sId, "", 1, self.IS_DEBUG);
                            var mqttOption = {
                                clientId: brokerConfiguration.id,
                                port: brokerConfiguration.p,
                                username: brokerConfiguration.un,
                                password: brokerConfiguration.pwd,
                                rejectUnauthorized: false,
                                // rejectUnauthorized: true,
                                reconnecting: true,
                                reconnectPeriod: 25000,
                                // connectTimeout: 50000
                                // pingTimer: 10
                            };
                            if(self.SDK_OPTIONS.pf === "aws"){
                                delete mqttOption.username;
                                delete mqttOption.password;
                            }
                            try {
                                // console.log("mqttOption ==> ", mqttOption);
                                var conObj = {
                                    "mqttUrl": mqttUrl,
                                    "mqttOption": mqttOption,
                                }
                                self.BROKER_CLIENT.clientConnection(conObj, function (response) {
                                    if (response.status) {
                                        // var result = response
                                        // self.IS_DEVICE_CONNECTED = true;
                                        cb(response);
                                    } else {
                                        cb(response);
                                        // var result = response;
                                    }
                                })
                            } catch (error) {
                                self.manageDebugLog("ERR_IN13", uniqueId, sId, "", 0, self.IS_DEBUG);
                                self.manageDebugLog("ERR_IN01", uniqueId, sId, error.message, 0, self.IS_DEBUG);
                                cb({
                                    status: false,
                                    data: null,
                                    message: error.message
                                });
                            }
                        } else {
                            self.manageDebugLog("ERR_IN11", uniqueId, sId, "", 0, self.IS_DEBUG);
                            var result = {
                                status: false,
                                data: null,
                                message: "Device connection failed"
                            }
                            cb(result);
                        }
                    } catch (e) {
                        self.manageDebugLog("ERR_IN01", uniqueId, sId, e.message, 0, self.IS_DEBUG);
                        cb({
                            status: false,
                            data: null,
                            message: error.message
                        });
                    }
                } else if (authType == config.authType.CA_SIGNED) {
                    try {
                        if (brokerConfiguration) {
                            self.manageDebugLog("INFO_IN05", uniqueId, sId, "", 1, self.IS_DEBUG);
                            var mqttOption = {
                                clientId: brokerConfiguration.id,
                                port: brokerConfiguration.p, //8883,
                                username: brokerConfiguration.un,
                                key: fs.readFileSync(sdkOption.certificate.SSLKeyPath),
                                cert: fs.readFileSync(sdkOption.certificate.SSLCertPath),
                                ca: [fs.readFileSync(sdkOption.certificate.SSLCaPath)],
                                rejectUnauthorized: false,
                                reconnecting: true
                            };
                            if(self.SDK_OPTIONS.pf === "aws"){
                                delete mqttOption.username;
                                delete mqttOption.password;
                            }

                            try {
                                var conObj = {
                                    "mqttUrl": mqttUrl,
                                    "mqttOption": mqttOption,
                                }
                                self.BROKER_CLIENT.clientConnection(conObj, function (response) {
                                    // console.log("res ==> ", response);
                                    if (response.status) {
                                        var result = {
                                            status: true,
                                            data: {
                                                "mqttClient": response.data,
                                                "mqttClientId": brokerConfiguration.id
                                            },
                                            message: "Connection Established"
                                        }
                                    } else {
                                        var result = response;
                                    }
                                    cb(result);
                                })
                            } catch (error) {
                                self.manageDebugLog("ERR_IN13", uniqueId, sId, "", 0, self.IS_DEBUG);
                                self.manageDebugLog("ERR_IN01", uniqueId, sId, error.message, 0, self.IS_DEBUG);
                                cb({
                                    status: false,
                                    data: null,
                                    message: error.message
                                });
                            }
                        } else {
                            self.manageDebugLog("ERR_IN11", uniqueId, sId, "", 0, self.IS_DEBUG);
                            var result = {
                                status: false,
                                data: null,
                                message: "Device connection failed"
                            }
                            cb(result);
                        }
                    } catch (e) {
                        self.manageDebugLog("ERR_IN01", uniqueId, sId, e.message, 0, self.IS_DEBUG);
                        var result = {
                            status: false,
                            data: e,
                            message: "Invalid certificate file."
                        }
                        cb(result);
                    }
                } else if (authType == config.authType.CA_SELF_SIGNED) {
                    try {
                        if (brokerConfiguration) {
                            self.manageDebugLog("INFO_IN05", uniqueId, sId, "", 1, self.IS_DEBUG);
                            var mqttOption = {
                                clientId: brokerConfiguration.id,
                                // protocolId: 'MQIsdp', // Or 'MQIsdp' in MQTT 3.1 and 5.0
                                // protocolVersion: 5, // 
                                port: brokerConfiguration.p, //8883,
                                username: brokerConfiguration.un,
                                key: fs.readFileSync(sdkOption.certificate.SSLKeyPath),
                                cert: fs.readFileSync(sdkOption.certificate.SSLCertPath),
                                ca: [fs.readFileSync(sdkOption.certificate.SSLCaPath)],
                                rejectUnauthorized: false,
                                reconnecting: true
                            };
                            if(self.SDK_OPTIONS.pf === "aws"){
                                delete mqttOption.username;
                                delete mqttOption.password;
                            }
                            try {
                                var conObj = {
                                    "mqttUrl": mqttUrl,
                                    "mqttOption": mqttOption,
                                }
                                self.BROKER_CLIENT.clientConnection(conObj, function (response) {
                                    // console.log("res ==> ", response);
                                    if (response.status) {
                                        var result = {
                                            status: true,
                                            data: {
                                                "mqttClient": response.data,
                                                "mqttClientId": brokerConfiguration.id
                                            },
                                            message: "Connection Established"
                                        }
                                    } else {
                                        var result = response;
                                    }
                                    cb(result);
                                })
                            } catch (error) {
                                var result = {
                                    status: false,
                                    data: {
                                        "mqttClient": null,
                                        "mqttClientId": null
                                    },
                                    message: error.message
                                }
                                self.manageDebugLog("ERR_IN13", uniqueId, sId, "", 0, self.IS_DEBUG);
                                self.manageDebugLog("ERR_IN01", uniqueId, sId, error.message, 0, self.IS_DEBUG);
                            }
                        } else {
                            self.manageDebugLog("ERR_IN11", uniqueId, sId, "", 0, self.IS_DEBUG);
                            var result = {
                                status: false,
                                data: null,
                                message: "Device connection failed"
                            }
                            cb(result);
                        }
                    } catch (e) {
                        self.manageDebugLog("ERR_IN01", uniqueId, sId, e.message, 0, self.IS_DEBUG);
                        var result = {
                            status: false,
                            data: e,
                            message: "Invalid certificate file."
                        }
                        cb(result);
                    }
                } else if (authType == config.authType.CA_INDIVIDUAL) {
                    try {
                        if (brokerConfiguration) {
                            self.manageDebugLog("INFO_IN05", uniqueId, sId, "", 1, self.IS_DEBUG);
                            var mqttOption = {
                                clientId: brokerConfiguration.id,
                                // protocolId: 'MQIsdp', // Or 'MQIsdp' in MQTT 3.1 and 5.0
                                // protocolVersion: 5, // 
                                port: brokerConfiguration.p, //8883,
                                username: brokerConfiguration.un,
                                key: fs.readFileSync(sdkOption.certificate.SSLKeyPath),
                                cert: fs.readFileSync(sdkOption.certificate.SSLCertPath),
                                ca: [fs.readFileSync(sdkOption.certificate.SSLCaPath)],
                                rejectUnauthorized: false,
                                reconnecting: true
                            };
                            if(self.SDK_OPTIONS.pf === "aws"){
                                delete mqttOption.username;
                                delete mqttOption.password;
                            }
                            try {
                                var conObj = {
                                    "mqttUrl": mqttUrl,
                                    "mqttOption": mqttOption,
                                }
                                self.BROKER_CLIENT.clientConnection(conObj, function (response) {
                                    // console.log("res ==> ", response);
                                    if (response.status) {
                                        var result = {
                                            status: true,
                                            data: {
                                                "mqttClient": response.data,
                                                "mqttClientId": brokerConfiguration.id
                                            },
                                            message: "Connection Established"
                                        }
                                    } else {
                                        var result = response;
                                    }
                                    cb(result);
                                })
                            } catch (error) {
                                var result = {
                                    status: false,
                                    data: {
                                        "mqttClient": null,
                                        "mqttClientId": null
                                    },
                                    message: error.message
                                }
                                self.manageDebugLog("ERR_IN13", uniqueId, sId, "", 0, self.IS_DEBUG);
                                self.manageDebugLog("ERR_IN01", uniqueId, sId, error.message, 0, self.IS_DEBUG);
                            }
                        } else {
                            self.manageDebugLog("ERR_IN11", uniqueId, sId, "", 0, self.IS_DEBUG);
                            var result = {
                                status: false,
                                data: null,
                                message: "Device connection failed"
                            }
                            cb(result);
                        }
                    } catch (e) {
                        self.manageDebugLog("ERR_IN01", uniqueId, sId, e.message, 0, self.IS_DEBUG);
                        var result = {
                            status: false,
                            data: e,
                            message: "Invalid certificate file."
                        }
                        cb(result);
                    }
                }
            } 
        } catch (error) {
            var result = {
                status: false,
                data: null,
                message: config.errorLog.ERR_IN13
            }
            cb(result);
        }
    }


    
    /*
    Object : Device 
    Author : Mayank [SOFTWEB]
    Detail : To get the attributes list
    Date   : 2020-11-16
    */
    getAttributes(callback) {
        var self = this;
        var cacheId = self.SID + "_" + self.UNIQUEID;
        var deviceSyncRes = cache.get(cacheId);
        var deviceData = deviceSyncRes;
        var newAttributeObj = _.cloneDeep(deviceData.att);
        var newDeviceObj = _.cloneDeep(deviceData.d);
        var isEdgeDevice = false;
        var isGatewayDevice = false;

        if (deviceData.meta.edge) {
            isEdgeDevice = true
        } else {
            isEdgeDevice = false
        }
        async.series([
            function (cb_series) {
                try {
                    async.forEachSeries(newDeviceObj, function (devices, mainDevices_cb) {
                        if (devices.tg != "") {
                            isGatewayDevice = true;
                        }
                        delete devices.s;
                        mainDevices_cb();
                    }, function () {
                        cb_series()
                    });
                } catch (err) {
                    cb_series();
                }
            },
            function (cb_series) {
                try {
                    async.forEachSeries(newAttributeObj, function (attributes, mainAttributes_cb) {
                        if (!isEdgeDevice) {
                            delete attributes.tw;
                            delete attributes.agt;
                        }
                        async.forEachSeries(attributes.d, function (data, data_cb) {
                            if (!isEdgeDevice) {
                                delete data.tw;
                                delete data.agt;
                            }
                            delete data.sq;
                            data_cb();
                        }, function () {
                            mainAttributes_cb();
                        });
                    }, function () {
                        cb_series()
                    });
                } catch (err) {
                    cb_series();
                }
            }
        ], function (err, response) {
            if (newAttributeObj?.length > 0 && newDeviceObj?.length > 0) {
                var sdkDataArray = [];
                async.forEachSeries(newDeviceObj, function (device, callbackdev) {
                    var attArray = {
                        "device": {
                            "id": device.id,
                            "tg": device.tg == "" ? undefined : device.tg
                        },
                        "attributes": []
                    }
                    var attributeData = newAttributeObj;
                    async.forEachSeries(attributeData, function (attrib, callbackatt) {
                        if (attrib.p == "") // Parent
                        {
                            async.forEachSeries(attrib.d, function (att, cb_attr) {
                                if (self.SDK_OPTIONS.isGatewayDevice) {
                                    if (att.tg == device.tg) {
                                        delete att.tg;
                                        delete att.agt;
                                        att.dt = dataTypeToString(att.dt)
                                        attArray['attributes'].push(att);
                                    }
                                } else {
                                    if (att.agt)
                                        delete att.agt
                                    att.dt = dataTypeToString(att.dt)
                                    attArray['attributes'].push(att);
                                }
                                cb_attr();
                            }, function () {
                                callbackatt();
                            })
                        } else { // Parent-child
                            if (self.SDK_OPTIONS.isGatewayDevice) {
                                if (attrib.tg == device.tg) {
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
                    self.manageDebugLog("INFO_GA01", self.UNIQUEID, self.SID, "", 1, self.IS_DEBUG);
                    callback({
                        status: true,
                        data: sdkDataArray,
                        message: config.infoLog.INFO_GA01
                    });
                })
            } else {
                callback({
                    status: false,
                    data: null,
                    message: config.errorLog.ERR_GA02
                })
            }
        })
    }

    /*
    Object : Device 
    Author : Mayank [SOFTWEB]
    Detail : To get the device list
    Date   : 2020-11-16
    */
    getChildDevices(callback) {
        var self = this;
        var cacheId = self.SID + "_" + self.UNIQUEID;
        var deviceSyncRes = cache.get(cacheId);
        var newDeviceObj = _.cloneDeep(deviceSyncRes.d);
        
        if(self.SDK_OPTIONS.isGatewayDevice) {
            if (newDeviceObj.length > 1) {
                newDeviceObj.shift();
                self.manageDebugLog("INFO_DL01", self.UNIQUE_ID, self.SID, "", 1, self.IS_DEBUG);
                callback({
                    status: true,
                    data: newDeviceObj,
                    message: config.infoLog.INFO_DL01
                })
            } else {
                self.manageDebugLog("ERR_DL02", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
                callback({
                    status: false,
                    data: null,
                    message: config.errorLog.ERR_DL02
                })
            }
        } else {
            self.manageDebugLog("ERR_DL03", self.UNIQUE_ID, self.SID, "", 0, self.IS_DEBUG);
            callback({
                status: false,
                data: null,
                message: config.errorLog.ERR_DL03
            })
        }
    }

    /*
    Object : Device 
    Author : Mayank [SOFTWEB]
    Detail : Sync the device once any command recceived related to the device information
    Date   : 2018-11-16
    */
    syncDeviceOnDemand(requestedParams, cmdType, cb) {
        var self = this;
        var sId = self.SID;
        var uniqueId = self.UNIQUEID;
        if (cmdType == config.commandType.ATTRIBUTE_INFO_UPDATE) {
            var cnt = 0;
            async.forEachSeries(self.INTERVAL_OBJ, function (interval, data_cb) {
                cnt++;
                var x = Object.keys(interval);
                var key = x[0];
                clearInterval(interval[key]);
                delete interval[key];
                data_cb();
            }, function () {
                try {
                    // self.INTERVAL_OBJ = [];
                    // console.log("requestedParams => ", requestedParams);
                    // console.log("cmdType => ", cmdType);
                    // console.log("intervalObj => ", intervalObj);
                    self.getSyncData(requestedParams, function (response) {
                        if (response.status) {
                            cb({
                                status: true,
                                data: [],
                                message: response.message
                            })
                        } else {
                            cb({
                                status: false,
                                data: response.data,
                                message: response.message
                            })
                        }
                    })
                } catch (err) {
                    cb({
                        status: false,
                        data: err.message,
                        message: err.message
                    })
                }
            });
        } else {
            try {
                // console.log("requestedParams => ", requestedParams);
                // console.log("cmdType => ", cmdType);
                // console.log("intervalObj => ", intervalObj);
                self.getSyncData(requestedParams, function (response) {
                    if (response.status) {
                        cb({
                            status: true,
                            data: [],
                            message: response.message
                        })
                    } else {
                        cb({
                            status: false,
                            data: response.data,
                            message: response.message
                        })
                    }
                })
            } catch (err) {
                cb({
                    status: false,
                    data: err.message,
                    message: err.message
                })
            }
        }
    };

    /*
    Object : Device 
    Author : Mayank [SOFTWEB]
    Detail : Start the subscriber process
    Date   : 2018-11-16
    */
    subscriberProcess(callback) {
        var self = this;
        // console.log("1.0.0 ==> ")
        // var cacheId = self.SID + "_" + self.UNIQUEID;
        // var deviceSyncRes = cache.get(cacheId);
        // var brokerConfiguration = deviceSyncRes.p;
        // var duniqueid = deviceSyncRes.id;
        try {
            // if(self.SDK_OPTIONS.SDK_TYPE == "MQTT") {

            // } else if(self.SDK_OPTIONS.SDK_TYPE == "MQTT") {

            // } else if(self.SDK_OPTIONS.SDK_TYPE == "MQTT") {

            // }
            // if (brokerConfiguration) {
            // var mqttClient = clientData.data.mqttClient;
            // var mqttClientId = clientData.data.mqttClientId;
            self.mqttSubscribeData(function (response) {
                callback(response);
                // if (response) {
                //     callback({
                //         status: true,
                //         data: response.data,
                //         message: "Command get successfully."
                //     })
                // } else {
                //     callback({
                //         status: false,
                //         data: [],
                //         message: "Message from unknown device. Kindly check the process..!"
                //     })
                // }
            });
            // } else {
            //     callback({
            //         status: false,
            //         data: brokerConfiguration,
            //         message: "Device Protocol information not found."
            //     })
            // }
        } catch (error) {
            self.manageDebugLog("ERR_SD01", self.UNIQUEID, self.SID ,error.message, 0, self.IS_DEBUG);
            callback({
                status: false,
                data: error.message,
                message: "MQTT connection error"
            })
        }
    }

    /*
    Object : Device 
    Author : Mayank [SOFTWEB]
    Detail : To update the Twin reported property
    Date   : 2018-11-16
    */
    UpdateTwin(obj, callback) {
        var self = this;
        var cacheId = self.SID + "_" + self.UNIQUEID;
        var deviceSyncRes = cache.get(cacheId);
        var brokerConfiguration = deviceSyncRes.p;
        try {
            // obj['sid'] = self.SID;
            if (obj) {
                if (self.SDK_OPTIONS.SDK_TYPE == "MQTT") {
                    //self.sendDataOnMQTT(obj)
                    obj["pubTopic"] = config[self.SDK_OPTIONS.pf]?.twinPropertyPubTopic;
                    if(self.SDK_OPTIONS.pf === "aws"){
                        obj["pubTopic"] = obj["pubTopic"].replace(/{Cpid_DeviceID}/g,`${brokerConfiguration.id}`);
                    }
                    console.log("CommonFunctions -> UpdateTwin -> obj", obj)
                    // delete obj.sid;
                    self.BROKER_CLIENT.messagePublish(obj, function (response) {
                        if (response.status) {
                            self.manageDebugLog("INFO_SD01", self.UNIQUEID, self.SID, "", 1, self.IS_DEBUG);
                        } else {
                            self.manageDebugLog("ERR_SD01", self.UNIQUEID, self.SID, response.message, 0, self.IS_DEBUG);
                        }
                        callback(response);
                    })
                } else if (self.SDK_OPTIONS.SDK_TYPE == "AZURE") {
                    // delete obj.sid;
                    self.BROKER_CLIENT.updateTwinProperty(obj, function (response) {
                        callback(response)
                    });
                }
            } else {
                callback({
                    status: false,
                    data: null,
                    message: "Twin updated object not found to update reported property."
                });
            }
        } catch (err) {
            callback({
                status: false,
                data: err,
                message: err.message
            });
        }
    };

    /*
    Object : Device 
    Author : Mayank [SOFTWEB]
    Detail : Send Command Ack
    Date   : 2020-05-16
    */
    sendCommandAck(ackGuid, status, msg, childId, msgType, cmdType, callback) {
        var self = this;
        try {
            var obj = {
                "dt": new Date(),
                "mt": msgType,
                "d": {
                    "ack": ackGuid,
                    "type": cmdType,
                    "st": status,
                    // "st": msgType,
                    "msg": msg,
                    "cid": childId ? childId : null
                }
            }
            self.sendDataOnMQTT(obj);
            callback({
                status: true,
                data: null,
                message: "Command acknowledgement success"
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
    Object : Device 
    Author : Mayank [SOFTWEB]
    Detail : Get all twins request
    Date   : 2020-01-10
    */
    getAllTwins(callback) {
        var self = this;
        try {

            if (self.SDK_OPTIONS.SDK_TYPE == "MQTT") {
                self.sendDataOnMQTT("");
                callback({
                    status: true,
                    data: null,
                    message: "Twin updated successfully"
                });
            } else if (self.SDK_OPTIONS.SDK_TYPE == "AZURE") {
                self.BROKER_CLIENT.getTwinProperty(function (response) {
                    callback(response)
                });
            }
        } catch (error) {
            callback({
                status: false,
                data: error,
                message: error.message
            })
        }
    }

    /*
    Object : Device 
    Author : Mayank [SOFTWEB]
    Detail : To write the log file
    Date   : 2020-11-16
    */
    writeLogFile(path, data) {
        var self = this;
        try {
            fs.writeFileSync(path, data, {
                flag: 'a+'
            }); //'a+' is append mode 
        } catch (error) {
            console.log("Error log file write : ");
        }
    }

    /*
    Object : Device 
    Author : Mayank [SOFTWEB]
    Detail : Maanage the debug log with error and output information
    Date   : 2020-11-16
    */
    manageDebugLog(code, uniqueId, sId, message, logFlag, isDebugEnabled) {
        var self = this;
        let debugPathBasUrl = "./logs/debug/";
        let debugErrorLogPath = debugPathBasUrl + "error.txt";
        let debugInfoLogPath = debugPathBasUrl + "info.txt";
        try {
            if (isDebugEnabled && code) {
                if (!logFlag && message == "") {
                    message = config.errorLog[code];
                } else {
                    if (message == "") {
                        message = config.infoLog[code];
                    }
                }
                let logText = "\n[" + code + "] " + new Date().toUTCString() + " [" + sId + "_" + uniqueId + "] : " + message;
                let logConsoleText = "[" + code + "] " + new Date().toUTCString() + " [" + sId + "_" + uniqueId + "] : " + message;
                console.log(logConsoleText);

                async.series([
                    function (cb_series) {
                        if (!fs.existsSync(debugPathBasUrl)) {
                            fs.mkdirSync(debugPathBasUrl);
                            cb_series();
                        } else {
                            cb_series();
                        }
                    },
                    function (cb_series) {
                        if (!logFlag) { // ERR Log
                            fs.access(debugErrorLogPath, fs.constants.F_OK | fs.constants.W_OK, (err) => {
                                if (err) {
                                    if (err.code === 'ENOENT' && !logFlag) {
                                        self.writeLogFile(debugErrorLogPath, logText);
                                    }
                                } else {
                                    self.writeLogFile(debugErrorLogPath, logText);
                                }
                                cb_series();
                            });
                        } else if (logFlag) { // INFO Log
                            fs.access(debugInfoLogPath, fs.constants.F_OK | fs.constants.W_OK, (err) => {
                                if (err) {
                                    if (err.code === 'ENOENT' && logFlag) {
                                        self.writeLogFile(debugInfoLogPath, logText);
                                    }
                                } else {
                                    self.writeLogFile(debugInfoLogPath, logText);
                                }
                                cb_series();
                            });
                        } else {
                            cb_series();
                        }
                    }
                ], function (err, response) {});
            }
        } catch (error) {
            if (isDebugEnabled && code) {
                let logText = "\n[" + code + "] " + new Date().toUTCString() + " [" + sId + "_" + uniqueId + "] : " + error.message;
                let logConsoleText = "[" + code + "] " + new Date().toUTCString() + " [" + sId + "_" + uniqueId + "] : " + error.message;
                console.log(logConsoleText);
                self.writeLogFile(debugErrorLogPath, logText);
            }
        }
    }

    /* 
     * Disconnect client device connection
     * @author : MK
     * Disconnct devise
     * @param: 
     */
    disconnectDevice(callback) {
        var self = this;
        try {
            // console.log("In common => ");
            self.BROKER_CLIENT.disconnect(function (response) {
                // console.log("In common => ", response);
                self.IS_DEVICE_CONNECTED = false;
                callback(response)
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
     * send command ack
     * @author : MK
     * send command ack
     * @param: 
     */
    //deviceDPSPovisioning
    deviceDPSProvisioning(callback) {
        var self = this;
        try {
            self.BROKER_CLIENT.deviceDPSProvisioning(function (response) {
                callback(response);
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
     *
     * @author : MK
     * @param: 
     */
    deviceEnrollment(callback) {
        var self = this;
        try {
            self.BROKER_CLIENT.deviceEnrollment(function (response) {
                callback(response);
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
     * Create child device for Gateway device
     * @author : MK
     * @param: deviceId, deviceTag, displayName
     */
    createChildDevice(deviceId, deviceTag, displayName, callback) {
        var self = this;
        var cacheId = self.SID + "_" + self.UNIQUEID;
        var deviceSyncRes = cache.get(cacheId);
        var gatewayDeviceInfo = deviceSyncRes.meta.gtw;
        var pubTopic = "";
        try {
            var dataObj = {
                "g": gatewayDeviceInfo ? gatewayDeviceInfo.g : undefined,
                "dn": displayName,
                "id": deviceId,
                "tg": deviceTag
            };
            var authType = deviceSyncRes.meta.at;
            if (deviceSyncRes.p && self.SDK_OPTIONS.SDK_TYPE == "MQTT")
                pubTopic = deviceSyncRes.p.topics.di;

            async.series([
                function (cb_series) {
                    childDeviceCreateValidation(dataObj, authType, function (errResponse) {
                        if (errResponse.length > 0) {
                            self.manageDebugLog("ERR_GD05", self.UNIQUEID, self.SID, "", 0, self.IS_DEBUG);
                            callback({
                                status: false,
                                data: errResponse,
                                message: config.errorLog.ERR_GD05
                            })
                        } else {
                            cb_series();
                        }
                    })
                }
            ], function (err, response) {
                if (gatewayDeviceInfo && gatewayDeviceInfo.g) {
                    var obj = {
                        "mt": config.messageType.createChildDevice, //Message type 
                        "d": dataObj,
                        "pubTopic": pubTopic ? pubTopic : undefined,
                        "cd": deviceSyncRes.meta.cd ? deviceSyncRes.meta.cd : undefined
                    }
                    self.BROKER_CLIENT.messagePublish(obj, function (response) {
                        if (response.status) {
                            self.manageDebugLog("INFO_GD01", self.UNIQUEID, self.SID, "", 1, self.IS_DEBUG);
                            callback({
                                status: true,
                                data: null,
                                message: config.infoLog.INFO_GD01
                            });
                        } else {
                            self.manageDebugLog("ERR_GD02", self.UNIQUEID, self.SID, "", 0, self.IS_DEBUG);
                            callback({
                                status: false,
                                data: null,
                                message: config.errorLog.ERR_GD02
                            });
                        }
                    });
                } else {
                    self.manageDebugLog("ERR_GD04", self.UNIQUEID, self.SID, "", 0, self.IS_DEBUG);
                    callback({
                        status: true,
                        data: null,
                        message: config.errorLog.ERR_GD04
                    });
                }
            });
        } catch (error) {
            self.manageDebugLog("ERR_GD01", self.UNIQUEID, self.SID, error.message, 0, self.IS_DEBUG);
            callback({
                status: false,
                data: error,
                message: error.message
            })
        }
    }

    /* 
     * Delete child device for Gateway device
     * @author : MK
     * @param: deviceId
     */
    deleteChildDevice(deviceId, callback) {
        var self = this;
        var cacheId = self.SID + "_" + self.UNIQUEID;
        var deviceSyncRes = cache.get(cacheId);
        var gatewayDeviceInfo = deviceSyncRes.meta.gtw;
        var pubTopic = "";
        try {
            var dataObj = {
                "id": deviceId
            };
            var authType = deviceSyncRes.meta.at;
            if (deviceSyncRes.p && self.SDK_OPTIONS.SDK_TYPE == "MQTT")
                pubTopic = deviceSyncRes.p.topics.di;
            async.series([
                function (cb_series) {
                    childDeviceDeleteValidation(dataObj, authType, function (errResponse) {
                        console.log(errResponse);
                        if (errResponse.length > 0) {
                            self.manageDebugLog("ERR_GD05", self.UNIQUEID, self.SID, "", 0, self.IS_DEBUG);
                            callback({
                                status: false,
                                data: errResponse,
                                message: config.errorLog.ERR_GD05
                            })
                        } else {
                            cb_series();
                        }
                    })
                }
            ], function (err, response) {
                if (gatewayDeviceInfo && gatewayDeviceInfo.g) {
                    var obj = {
                        "mt": config.messageType.deleteChildDevice, //Message type 
                        "d": dataObj,
                        "pubTopic": pubTopic ? pubTopic : undefined,
                        "cd": deviceSyncRes.meta.cd ? deviceSyncRes.meta.cd : undefined
                    }
                    self.BROKER_CLIENT.messagePublish(obj, function (response) {
                        if (response.status) {
                            self.manageDebugLog("INFO_GD03", self.UNIQUEID, self.SID, "", 1, self.IS_DEBUG);
                            callback({
                                status: true,
                                data: null,
                                message: config.infoLog.INFO_GD03
                            });
                        } else {
                            self.manageDebugLog("ERR_GD03", self.UNIQUEID, self.SID, "", 0, self.IS_DEBUG);
                            callback({
                                status: false,
                                data: null,
                                message: config.errorLog.ERR_GD03
                            });
                        }
                    });
                } else {
                    self.manageDebugLog("ERR_GD04", self.UNIQUEID, self.SID, "", 0, self.IS_DEBUG);
                    callback({
                        status: true,
                        data: null,
                        message: config.errorLog.ERR_GD04
                    });
                }
            });
        } catch (error) {
            self.manageDebugLog("ERR_GD01", self.UNIQUEID, self.SID, error.message, 0, self.IS_DEBUG);
            callback({
                status: false,
                data: error,
                message: error.message
            })
        }
    }

    /*
    Object : Device 
    Author : Mayank [SOFTWEB]
    Detail : Start/stop Heart beats process 
    Date   : 2021-12-28
    */
    onHeartbeatCommand(action, hbFrequency) {
        var self = this;
        var cacheId = self.SID + "_" + self.UNIQUEID;
        var deviceSyncRes = cache.get(cacheId);
        var brokerConfiguration = deviceSyncRes.p;
        var pubTopic = brokerConfiguration.topics.hb;

        if (action) {
            if (self.HEARTBEAT_INTERVAL) {
                self.manageDebugLog("INFO_HB03", self.UNIQUEID, self.SID, "", 1, self.IS_DEBUG);
            } else {
                if (hbFrequency && hbFrequency > 0) {
                    try {
                        self.HEARTBEAT_INTERVAL = setInterval(function () {
                            var obj = {
                                "pubTopic": pubTopic ? pubTopic : undefined,
                                "cd": deviceSyncRes.meta.cd ? deviceSyncRes.meta.cd : undefined
                            }
                            self.BROKER_CLIENT.messagePublish(obj, function (response) {
                                if (response.status) {
                                    self.manageDebugLog("INFO_HB05", self.UNIQUEID, self.SID, "", 1, self.IS_DEBUG);
                                } else {
                                    self.manageDebugLog("ERR_HB01", self.UNIQUEID, self.SID, response.message, 0, self.IS_DEBUG);
                                }
                            })
                        }, hbFrequency * 1000);
                        if (self.HEARTBEAT_INTERVAL) {
                            self.manageDebugLog("INFO_HB01", self.UNIQUEID, self.SID, "", 1, self.IS_DEBUG);
                        }
                    } catch (error) {
                        self.manageDebugLog("ERR_HB01", self.UNIQUEID, self.SID, error.message, 0, self.IS_DEBUG);
                    }
                } else {
                    self.manageDebugLog("ERR_HB02", self.UNIQUEID, self.SID, "", 0, self.IS_DEBUG);
                }
            }
        } else {
            if (self.HEARTBEAT_INTERVAL) {
                clearInterval(self.HEARTBEAT_INTERVAL);
                self.HEARTBEAT_INTERVAL = undefined;
                self.manageDebugLog("INFO_HB02", self.UNIQUEID, self.SID, "", 1, self.IS_DEBUG);
            } else {
                self.manageDebugLog("INFO_HB04", self.UNIQUEID, self.SID, "", 1, self.IS_DEBUG);
            }
        }

    }
    
    /*
    Object : Device hard stop cpmmunication
    Author : Mayank [SOFTWEB]
    Detail : Hard stop command from cloud 
    Date   : 2021-12-28
    */
    onHardStopCommand() {
        var self = this;
        try {
            if (self.BROKER_CLIENT && self.IS_DEVICE_CONNECTED) {
                self.disconnectDevice(function (response) {
                    if (response.status) {
                        self.IS_DEVICE_CONNECTED = false;
                        self.STOP_SDK_CONNECTION = false;
                        self.commonLib.deleteAllLogFile(self.LOG_PATH);
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
    Object : Device log display flag updated
    Author : Mayank [SOFTWEB]
    Detail : Device log display flag updated
    Date   : 2021-12-30
    */
    onLogCommand(cmd) {
        var self = this;
        self.IS_DEBUG = cmd.debugFlag;
    }
    
    /*
    Object : Device log display flag updated
    Author : Mayank [SOFTWEB]
    Detail : Device log display flag updated
    Date   : 2021-12-30
    */
    onValidationSkipCommand(cmd) {
        var self = this;
        self.SDK_OPTIONS.isSkipValidation = cmd.skipValidation
    }
}

function childDeviceCreateValidation(data, authType, callback) {
    let errors = [];
    // if (data && _.isEmpty(_.trim(data.dn))) {
    //     errors.push('Please provide display name');
    // }

    // if (data && _.isEmpty(_.trim(data.id))) {
    //     errors.push('Please provide unique ID');
    // }

    // if (data && !_.isEmpty(data.id) && (authType == 2 || authType == 3) && data.id.length > 64) {
    //     errors.push('Unique Id should not be greater than 64 character');
    // }

    // if (data && _.isEmpty(_.trim(data.tg))) {
    //     errors.push('Please provide tag');
    // }
    // What to do if I am sending the wrong child device tag.?
    callback(errors);
}

function childDeviceDeleteValidation(data, authType, callback) {
    let errors = [];
    if (data && _.isEmpty(_.trim(data.id))) {
        errors.push('Please provide unique ID');
    }
    callback(errors);
}

function dataTypeToString(value) {
    switch (value) {
        case config.dataType.NON_OBJ: // 0 NON_OBJ
            return "NON_OBJ";
        case config.dataType.INTEGER: // 1 INTEGER
            return "INTEGER";
        case config.dataType.LONG: // 2 LONG
            return "LONG";
        case config.dataType.DECIMAL: // 3 DECIMAL
            return "DECIMAL";
        case config.dataType.STRING: // 4 STRING
            return "STRING";
        case config.dataType.TIME: // 5 TIME
            return "TIME";
        case config.dataType.DATE: // 6 DATE
            return "DATE";
        case config.dataType.DATETIME: // 7 DATETIME
            return "DATETIME";
        case config.dataType.BIT: // 8 BIT
            return "BIT";
        case config.dataType.BOOLEAN: // 9 BOOLEAN
            return "BOOLEAN";
        case config.dataType.LATLONG: // 10 LATLONG
            return "LATLONG";
        case config.dataType.OBJECT: // 11 OBJECT
            return "OBJECT";
    }
}

module.exports = CommonFunctions;