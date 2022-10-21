'use strict';

var request = require('request');
var cache = require('memory-cache');
var async = require('async');
var jsonQuery = require('json-query');
var _ = require('lodash');
var mqtt = require('mqtt');
var fs = require('fs-extra');
var fsep = require('fs-extra-promise');
var config = require('../config/config');
const { errorLog } = require('../config/config');
var logBaseUrl = "./logs/offline/";
let azureDps = require("../client/azDps")
var azDpsClient = "";

/*
   Module : Device 
   Author : Mayank [SOFTWEB]
   Inputs : cpid, uniqueId (Device serial number)
   Output : Device detail with all atrributes
   Date   : 2018-01-24
*/
var getBaseUrl = function getBaseUrl(cpid, env, uniqueId, discoveryUrl, isDebug, callback) {
    var url = discoveryUrl+config.discoveryBaseUrl;
    var tempUrl = "";
    var discoveryUrl = "";
    async.series([
        function (cb_series) {
            tempUrl = url.replace("<<CPIDNAME>>", cpid);
            cb_series();
        },
        function (cb_series) {
            discoveryUrl = tempUrl.replace("<<ENVNAME>>", env);
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
                    manageDebugLog("ERR_IN08", uniqueId, cpid, "", 0, isDebug);
                    callback(false, config.errorLog.IN08);
                } else {
                    manageDebugLog("ERR_IN01", uniqueId, cpid, error.message, 0, isDebug);
                    callback(false, error.message);
                }
            } else {
                if (response && response.statusCode == 200 && body != undefined) {
                    manageDebugLog("INFO_IN07", uniqueId, cpid, "", 1, isDebug);
                    callback(true, body);
                } else {
                    manageDebugLog("ERR_IN09", uniqueId, cpid, error.message, 0, isDebug);
                    callback(false, config.errorLog.IN09);
                }
            }
        });
    });
}

/*
   Module : Device 
   Author : Mayank [SOFTWEB]
   Inputs : cpid, uniqueId (Device serial number)
   Output : Device detail with all atrributes
   Date   : 2018-01-24
*/
var syncDevice = function syncDevice(cpid, uniqueId, params, env, discoveryUrl, isDebug, callback) {
    try {
        getBaseUrl(cpid, env, uniqueId, discoveryUrl, isDebug, function (status, responseData) {
            if (status == true) {
                var storeSensorArray = {
                    "cpId": cpid,
                    "uniqueId": uniqueId,
                    "option": params
                };
                request.post({
                        url: responseData.baseUrl + "sync",
                        body: storeSensorArray,
                        json: true
                    },
                    function (error, response, body) {
                        if (error) {
                            if (error.code == "EAI_AGAIN" || error.code == "ETIMEDOUT" || error.code == "ENOTFOUND") {
                                manageDebugLog("ERR_IN08", uniqueId, cpid, "", 0, isDebug);
                                callback({
                                    status: false,
                                    data: null,
                                    message: config.errorLog.IN08
                                });
                            } else {
                                manageDebugLog("ERR_IN01", uniqueId, cpid, error.message, 0, isDebug);
                                callback({
                                    status: false,
                                    data: null,
                                    message: error.message
                                });
                            }
                        } else {
                            // console.log(JSON.stringify(body));
                            if (response && response.statusCode == 200 && body != undefined) {
                                manageDebugLog("INFO_IN01", uniqueId, cpid, "", 1, isDebug);
                                var resultData = body.d;
                                // console.log(JSON.stringify(resultData));
                                resultData['edgeData'] = "";
                                resultData['rulesData'] = "";
                                callback({
                                    status: true,
                                    data: resultData,
                                    message: config.infoLog.IN01
                                })
                            } else {
                                manageDebugLog("ERR_IN10", uniqueId, cpid, "", 0, isDebug);
                                callback({
                                    status: false,
                                    data: [],
                                    message: config.errorLog.IN10
                                })
                            }
                        }
                    });
            } else {
                manageDebugLog("ERR_IN09", uniqueId, cpid, "", 0, isDebug);
                callback({
                    status: status,
                    data: [],
                    message: config.errorLog.IN09
                })
            }
        })
    } catch (err) {
        manageDebugLog("ERR_IN01", uniqueId, cpid, err.message, 0, isDebug);
        callback({
            status: false,
            data: err.message,
            message: err.message
        })
    }
}

/*
   Module : Device 
   Author : Mayank [SOFTWEB]
   Inputs : cpid, uniqueId (Device serial number)
   Output : Device detail with all atrributes
   Date   : 2018-01-24
*/
var syncDeviceByParam = function syncDeviceByParam(cpid, env, uniqueId, params, discoveryUrl, isDebug, callback) {
    try {
        getBaseUrl(cpid, env, uniqueId, discoveryUrl, isDebug, function (status, responseData) {
            if (status == true) {
                var storeSensorArray = {
                    "cpId": cpid,
                    "uniqueId": uniqueId,
                    "option": params
                };
                request.post({
                        url: responseData.baseUrl + "sync",
                        body: storeSensorArray,
                        json: true
                    },
                    function (error, response, body) {
                        if (error) {
                            if (error.code == "EAI_AGAIN") {
                                manageDebugLog("ERR_IN08", uniqueId, cpid, "", 0, isDebug);
                                callback({
                                    status: false,
                                    data: null,
                                    message: config.errorLog.IN08
                                });
                            } else {
                                manageDebugLog("ERR_IN01", uniqueId, cpid, error.message, "ERR", isDebug);
                                callback({
                                    status: false,
                                    data: null,
                                    message: error.message
                                });
                            }
                        } else {
                            if (response && response.statusCode == 200) {
                                var resultData = body.d;
                                if (resultData.ee == config.edgeEnableStatus.enabled) {
                                    async.series([
                                        function (cb_series) {
                                            if (params.rule == true) {
                                                cb_series();
                                            } else if (params.attribute == true) {
                                                cb_series();
                                            } else if (params.setting == true) {
                                                cb_series();
                                            } else if (params.protocol == true) {
                                                cb_series();
                                            } else if (params.device == true) {
                                                cb_series();
                                            }
                                        }
                                    ], function (err, response) {
                                        manageDebugLog("INFO_IN01", uniqueId, cpid, "", 1, isDebug);
                                        callback({
                                            status: true,
                                            data: resultData,
                                            message: config.infoLog.IN01
                                        })
                                    })
                                } else {
                                    manageDebugLog("INFO_IN01", uniqueId, cpid, "", 1, isDebug);
                                    callback({
                                        status: true,
                                        data: resultData,
                                        message: config.infoLog.IN01
                                    })
                                }
                            } else {
                                manageDebugLog("ERR_IN10", uniqueId, cpid, "", "ERR", isDebug);
                                callback({
                                    status: false,
                                    data: [],
                                    message: config.errorLog.IN10
                                })
                            }
                        }
                    });
            } else {
                manageDebugLog("ERR_IN09", uniqueId, cpid, "", "ERR", isDebug);
                callback({
                    status: false,
                    data: [],
                    message: config.errorLog.IN09
                })
            }
        })
    } catch (err) {
        manageDebugLog("ERR_IN01", uniqueId, cpid, err.message, "ERR", isDebug);
        callback({
            status: false,
            data: err.message,
            message: err.message
        })
    }
}

/*
   Module : Device 
   Author : Mayank [SOFTWEB]
   Inputs : Attribute data 
   Output : Set Edge configuration for attriibute value
   Date   : 2018-02-20
*/
function setEdgeConfiguration(attributes, uniqueId, devices, callback) {
    var mainObj = {};
    var InObj = [];
    try {
        async.forEachSeries(attributes, function (attribute, cb_main) {
            if (attribute.p == "") {
                async.forEachSeries(attribute.d, function (attr, cb_pc) {
                    var edgeAttributeKey = attr.ln + "-" + attr.tg;
                    var attrTag = attr.tg;
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
                            "uniqueId": uniqueId,
                            "attrTag": attrTag,
                            "devices": devices
                        }
                        InObj.push(obj);
                    }

                    var setAttributeObj = {};
                    async.forEachSeries(Object.keys(config.aggrigateType), function (key, cb) {
                        var val = config.aggrigateType[key];
                        setAttributeObj.localName = attr.ln;
                        if (val & attr.agt) {
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
                        cb_pc()
                    });
                }, function () {
                    cb_main();
                });
            } else {
                //console.log("==== In parent Child ====");
                var attrObj = {};
                attrObj.parent = attribute.p;
                attrObj.sTime = "";
                attrObj.data = [];
                var edgeAttributeKey = attribute.p + "-" + attribute.tg;
                var attrTag = attribute.tg;
                var dataSendFrequency = attribute.tw;
                var lastChar = dataSendFrequency.substring(dataSendFrequency.length, dataSendFrequency.length - 1);
                var tumblingWindowTime = dataSendFrequency.substring(0, dataSendFrequency.length - 1);
                async.forEachSeries(attribute.d, function (attr, cb_pc) {
                    var setAttributeObj = {};
                    async.forEachSeries(Object.keys(config.aggrigateType), function (key, cb) {
                        var val = config.aggrigateType[key];
                        setAttributeObj.localName = attr.ln;
                        if (val & attribute.agt) {
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
                    mainObj[edgeAttributeKey] = attrObj;
                    var strArray = ['s', 'm', 'h'];
                    var strArrayStr = strArray.toString();
                    if (strArrayStr.indexOf(lastChar) != -1) // Check the Tumbling Window validation
                    {
                        var obj = {
                            "tumblingWindowTime": tumblingWindowTime,
                            "lastChar": lastChar,
                            "edgeAttributeKey": edgeAttributeKey,
                            "uniqueId": uniqueId,
                            "attrTag": attrTag,
                            "devices": devices
                        }
                        InObj.push(obj);
                        // setIntervalForEdgeDevice(tumblingWindowTime, lastChar, edgeAttributeKey, uniqueId, attrTag, devices, brokerClient, env);
                    }
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
   Module : Device 
   Author : Mayank [SOFTWEB]
   Inputs : Attribute data 
   Output : Set Edge configuration for attriibute value
   Date   : 2018-02-20
*/
function setRuleaConfiguration(rules, uniqueId, callback) {
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
                message: "Edge data :: Rule evalution script set."
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
   Module : Device 
   Author : Mayank [SOFTWEB]
   Inputs : Sensor data 
   Output : Sensor data send with all attributes on iotHub
   Date   : 2018-01-25
*/
function setIntervalForEdgeDevice(tumblingWindowTime, timeType, edgeAttributeKey, uniqueId, attrTag, devices, brokerClient, env, offlineConfig, intervalObj, cpId, isDebug) {
    try {
        var parentUniqueId = uniqueId
        var cacheId = cpId+"_"+uniqueId;
        var deviceSyncRes = cache.get(cacheId);
        async.series([
            function (cb_series) {
                var tagArray = [];
                async.forEachSeries(devices, function (device, cbdevice) {
                    if (tagArray.indexOf(device.tg) == -1 && device.tg == attrTag) {
                        tagArray.push(device.tg);
                        uniqueId = device.id;
                        cbdevice()
                    } else {
                        cbdevice()
                    }
                }, function () {
                    cb_series();
                });
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
            async.forEachSeries(intervalObj, function (interval, data_cb) {
                if (edgeAttributeKey in interval) {
                    intervalFlag = 1;
                }
                data_cb();
            }, function () {
                if (intervalFlag == 0) {
                    var newInterval = setInterval(function () {
                        cnt++;
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
                                    // agtObjEEArray.push(attrObj.agt);
                                    var localnameVar = "";
                                    async.forEachSeries(Object.keys(attrObj), function (key, cb) {
                                        if (attrObj.localName) {
                                            localnameVar = attrObj.localName;
                                        }
                                        if (key == config.aggrigateTypeLablel.min) {
                                            agtObjEEArray.push(parseFloat(attrObj.min));
                                        } else if (key == config.aggrigateTypeLablel.max) {
                                            agtObjEEArray.push(parseFloat(attrObj.max));
                                        } else if (key == config.aggrigateTypeLablel.sum) {
                                            agtObjEEArray.push(parseFloat(attrObj.sum));
                                        } else if (key == config.aggrigateTypeLablel.avg) {
                                            agtObjEEArray.push(parseFloat(attrObj.sum) / parseInt(attrObj.count));
                                        } else if (key == config.aggrigateTypeLablel.count && attrObj.count > 0) {
                                            agtObjEEArray.push(parseFloat(attrObj.count));
                                            dataSendFlag = 1;
                                        } else if (key == config.aggrigateTypeLablel.lv) {
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
                                        // console.log("newObj parent --> ", newObj);
                                        edgeDataEvaluation(newObj, uniqueId, parentUniqueId, brokerClient, env, offlineConfig, cpId, isDebug);
                                        refreshEdgeObj(edgeAttributeKey, uniqueId, parentUniqueId, cpId, isDebug);
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
                                    // agtObjEEArray.push(attrObj.agt);
                                    var localnameVar = "";
                                    async.forEachSeries(Object.keys(attrObj), function (key, cb) {
                                        if (attrObj.localName) {
                                            localnameVar = attrObj.localName;
                                        }
                                        if (key == config.aggrigateTypeLablel.min) {
                                            agtObjEEArray.push(parseFloat(attrObj.min));
                                        } else if (key == config.aggrigateTypeLablel.max) {
                                            agtObjEEArray.push(parseFloat(attrObj.max));
                                        } else if (key == config.aggrigateTypeLablel.sum) {
                                            agtObjEEArray.push(parseFloat(attrObj.sum));
                                        } else if (key == config.aggrigateTypeLablel.avg) {
                                            agtObjEEArray.push(parseFloat(attrObj.sum) / parseInt(attrObj.count));
                                        } else if (key == config.aggrigateTypeLablel.count && attrObj.count > 0) {
                                            agtObjEEArray.push(parseFloat(attrObj.count));
                                            dataSendFlag = 1;
                                        } else if (key == config.aggrigateTypeLablel.lv) {
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
                                        // console.log("newObj Non parent --> ", newObj);
                                        edgeDataEvaluation(newObj, uniqueId, parentUniqueId, brokerClient, env, offlineConfig, cpId, isDebug);
                                        refreshEdgeObj(edgeAttributeKey, uniqueId, parentUniqueId, cpId, isDebug);
                                    }
                                });
                            }
                        }
                    }, duration);
                    objInt[edgeAttributeKey] = newInterval;
                    intervalObj.push(objInt);
                } else {
                    //console.log(edgeAttributeKey+"--- Duplicate Found ----",intervalFlag)
                }
            });
        })
    } catch (error) {
        console.log("setIntervalForEdgeDevice ERROR :: ", error.message);
    }
}

function refreshEdgeObj(edgeAttributeKey, uniqueId, parentUniqueId, cpId, isDebug) {
    var cacheId = cpId+"_"+parentUniqueId;
    var deviceSyncRes = cache.get(cacheId);
    var edgeDatObj = deviceSyncRes.edgeData;
    var edgeObj = edgeDatObj[edgeAttributeKey];
    async.forEachSeries(edgeObj.data, function (obj, cb) {
        async.forEachSeries(Object.keys(obj), function (key, cb1) {
            // console.log("key => ", key);
            if (key == config.aggrigateTypeLablel.sum) {
                obj[key] = "";
            }
            if (key == config.aggrigateTypeLablel.min) {
                obj[key] = "";
            }
            if (key == config.aggrigateTypeLablel.max) {
                obj[key] = "";
            }
            if (key == config.aggrigateTypeLablel.count) {
                obj[key] = 0;
            }
            if (key == config.aggrigateTypeLablel.avg) {
                obj[key] = "";
            }
            if (key == config.aggrigateTypeLablel.lv) {
                obj[key] = "";
            }
            if (key == config.aggrigateTypeLablel.agt) {
                obj[key] = "";
            }
            cb1()
        }, function () {
            cb();
        });
    }, function () {

    });
}

function edgeDataEvaluation(deviceInputData, uniqueId, parentUniqueId, brokerClient, env, offlineConfig, cpId, isDebug) {
    var deviceSendTime = deviceInputData.t;
    var tag = "";
    var deviceEdgeData = deviceInputData.d;
    var cacheId = cpId+"_"+parentUniqueId;
    var deviceData = cache.get(cacheId);
    var dataObj = {
        "cpId": deviceData.cpId,
        "dtg": deviceData.dtg,
        "t": new Date(),
        "mt": config.messageType.rptEdge,
        "sdk": {
            "l": config.sdkLanguage,
            "v": config.sdkVersion,
            "e": env
        },
        "d": []
    };

    var attributeObj = {};
    var attributeObjFLT = {};
    async.series([
        function (cb_series) {
            var sendArray = {};
            var resultDevice = jsonQuery('d[*id=' + uniqueId + ']', {
                data: deviceData
            })
            attributeObj["id"] = uniqueId;
            attributeObj["dt"] = deviceSendTime;
            attributeObj["tg"] = resultDevice.value[0].tg;
            attributeObj["d"] = [];
            cb_series();
        },
        function (cb_series) {
            var withoutParentAttrObj = "";
            async.forEachSeries(deviceEdgeData, function (data, cb_fl_dData) {
                attributeObj.d.push(data);
                cb_fl_dData();
            }, function () {
                cb_series();
            });
        }
    ], function (err, response) {
        if (deviceData.ee == config.edgeEnableStatus.enabled) {
            dataObj.d.push(attributeObj);
            sendDataOnAzureMQTT(dataObj, parentUniqueId, brokerClient, offlineConfig, isDebug, cpId);
        }
    })
}

var dataSendFrequencyFlag = true;
async function holdDataFrequency(dataFrequencyInSec) {
    await setTimeout(() => {
      dataSendFrequencyFlag = true;
    }, dataFrequencyInSec * 1000);
}

/*
   Module : Device 
   Author : Mayank [SOFTWEB]
   Inputs : Sensor data 
   Output : Sensor data send with all attributes on iotHub
   Date   : 2018-01-25
*/
var SendDataToHub = function SendDataToHub(sensorData, dUniqueId, cpId, env, brokerClient, LOG_PATH, offlineConfig, isDebug, cb) {
    var cacheId = cpId+"_"+dUniqueId;
    var deviceSyncRes = cache.get(cacheId);
    var dataFrequencyInSec = deviceSyncRes.sc.df; 
    try {
        if ((deviceSyncRes != undefined || deviceSyncRes != "") && (typeof deviceSyncRes == 'object')) {
            if(deviceSyncRes.ee) {
                setSendDataFormat(sensorData, dUniqueId, cpId, env, brokerClient, offlineConfig, isDebug);
            } else {
                if(dataSendFrequencyFlag == true) {
                    setSendDataFormat(sensorData, dUniqueId, cpId, env, brokerClient, offlineConfig, isDebug);
                    dataSendFrequencyFlag = false;
                    holdDataFrequency(dataFrequencyInSec);
                }
            }
            cb({
                status: true,
                data: [],
                message: 'Sensor information has been sent to cloud.'
            })
        } else {
            cb({
                status: false,
                data: [],
                message: 'Device information has not found. Please call Init() method first.'
            })
        }
    } catch (error) {
        cb({
            status: false,
            data: error,
            message: error.message
        })
    }
}

/*
   Module : Device 
   Author : Mayank [SOFTWEB]
   Inputs : Sensor data 
   Output : Sensor data send with all attributes on iotHub
   Date   : 2018-01-25
*/
var setSendDataFormat = function setSendDataFormat(deviceSensorData, dUniqueId, cpId, env, brokerClient, offlineConfig, isDebug) {
    var cacheId = cpId+"_"+dUniqueId;
    var deviceSyncRes = cache.get(cacheId);
    var deviceData = deviceSyncRes;
    var dataObj = {
        "cpId": deviceData.cpId,
        "dtg": deviceData.dtg,
        "t": new Date(),
        "mt": config.messageType.rpt,
        "sdk": {
            "l": config.sdkLanguage,
            "v": config.sdkVersion,
            "e": env
        },
        "d": []
    };

    var dataObjFLT = {
        "cpId": deviceData.cpId,
        "dtg": deviceData.dtg,
        "t": new Date(),
        "mt": config.messageType.flt,
        "sdk": {
            "l": config.sdkLanguage,
            "v": config.sdkVersion,
            "e": env
        },
        "d": []
    };

    async.forEachSeries(deviceSensorData, function (deviceInputData, cb_fl_dData) {
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
                        tag = resultDevice.value[0].tg;
                        attributeObj["id"] = uniqueId;
                        attributeObj["dt"] = deviceSendTime;
                        attributeObj["tg"] = tag;
                        attributeObj["d"] = [];

                        attributeObjFLT["id"] = uniqueId;
                        attributeObjFLT["dt"] = deviceSendTime;
                        attributeObjFLT["tg"] = tag;
                        attributeObjFLT["d"] = [];
                        cb_series();
                    },
                    function (cb_series) {
                        var withoutParentAttrObj = {};
                        var withoutParentAttrObjFLT = {};
                        var withoutParentRuleAttrObj = {};
                        var parentRuleAttrObj = {};
                        var ruleAttributeValidateArray = [];
                        async.forEachSeries(Object.keys(data), function (attributeKey, cb_fl_dData) {
                            var parentAttrObj = {}
                            var parentAttrObjFLT = {}
                            if (typeof data[attributeKey] == "object") // true = Parent attribute
                            {
                                var parentChildArray = data[attributeKey];
                                var resultDevice = jsonQuery('att[*p=' + attributeKey + ' & tg=' + tag + ']', {
                                    data: deviceData
                                })
                                if (resultDevice.value.length > 0) {
                                    async.forEachSeries(resultDevice.value, function (parentdeviceInfo, cb_fl_pdi) {
                                        var parentAttributeName = parentdeviceInfo.p;
                                        var parentDeviceAttributeInfo = [];
                                        var ruleValueFlag = 0;
                                        async.forEachSeries(parentdeviceInfo.d, function (childDeviceInfo, cb_fl_cdi) {
                                            async.forEachSeries(Object.keys(parentChildArray), function (parentChildKey, cb_fl_child) {
                                                var msgTypeStatus = 0;
                                                var attrValue = 0;
                                                if (parentChildKey == childDeviceInfo.ln) {
                                                    var dataType = childDeviceInfo.dt;
                                                    var dataValidation = childDeviceInfo.dv;
                                                    attrValue = parentChildArray[parentChildKey];
                                                    if (attrValue != "") {
                                                        dataValidationTest(dataType, dataValidation, attrValue, childDeviceInfo, msgTypeStatus, function (childAttrObj) {
                                                            if (childAttrObj.msgTypeStatus == 1) //msgTypeStatus = 1 (Validation Failed)
                                                            {
                                                                if (!parentAttrObjFLT[parentAttributeName])
                                                                    parentAttrObjFLT[parentAttributeName] = {};
                                                                delete childAttrObj['msgTypeStatus'];
                                                                parentAttrObjFLT[parentAttributeName][childAttrObj.ln] = childAttrObj.v;
                                                                cntFLT++;
                                                            } else {
                                                                if (deviceData.ee == config.edgeEnableStatus.enabled && dataType == config.dataType.number) // Its Edge Enable Device
                                                                {
                                                                    ruleValueFlag = 1;
                                                                    childDeviceInfo.parentGuid = parentdeviceInfo.guid;
                                                                    childDeviceInfo.p = parentAttributeName;
                                                                    childDeviceInfo.value = attrValue;
                                                                    parentDeviceAttributeInfo.push(childDeviceInfo);

                                                                    setEdgeVal(childDeviceInfo, attrValue, dUniqueId, cpId);
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
                                                            cb_fl_child();
                                                        })
                                                    } else {
                                                        cb_fl_child();
                                                    }
                                                } else {
                                                    cb_fl_child();
                                                }
                                            }, function () {
                                                cb_fl_cdi();
                                            });
                                        }, function () {
                                            if (deviceData.ee == config.edgeEnableStatus.enabled && ruleValueFlag == 1) // Its Edge Enable Device
                                            {
                                                var tobj = {
                                                    "parentDeviceAttributeInfo": parentDeviceAttributeInfo,
                                                    "attrValue": null,
                                                    "attributeObj": attributeObj,
                                                    "dUniqueId": dUniqueId,
                                                    "brokerClient": brokerClient,
                                                    "env": env,
                                                    "offlineConfig": offlineConfig
                                                }
                                                ruleAttributeValidateArray.push(tobj);
                                            }
                                            cb_fl_pdi();
                                        });
                                    }, function () {
                                        if (parentAttrObjFLT) {
                                            attributeObjFLT.d.push(parentAttrObjFLT);
                                        }
                                        if (parentAttrObj) {
                                            attributeObj.d.push(parentAttrObj);
                                        }
                                        cb_fl_dData();
                                    });
                                } else {
                                    cb_fl_dData();
                                }
                            } else // No Parent
                            {
                                async.forEachSeries(deviceData.att, function (noParentDeviceInfo, cb_fl_npdi) {
                                    if (noParentDeviceInfo.p == "") {
                                        var parentAttributeName = noParentDeviceInfo.p;
                                        async.forEachSeries(noParentDeviceInfo.d, function (childDeviceInfo, cb_fl_cdi) {
                                            var msgTypeStatus = 0;
                                            if (childDeviceInfo.tg == tag && attributeKey == childDeviceInfo.ln) {
                                                var attrValue = data[attributeKey];
                                                var dataType = childDeviceInfo.dt;
                                                var dataValidation = childDeviceInfo.dv;
                                                if (attrValue != "") {
                                                    dataValidationTest(dataType, dataValidation, attrValue, childDeviceInfo, msgTypeStatus, function (childAttrObj) {
                                                        if (childAttrObj.msgTypeStatus == 1) //msgTypeStatus = 1 (Validation Failed)
                                                        {
                                                            delete childAttrObj['msgTypeStatus'];
                                                            withoutParentAttrObjFLT[childAttrObj.ln] = childAttrObj.v;
                                                            cntFLT++;
                                                        } else {
                                                            if (deviceData.ee == config.edgeEnableStatus.enabled && dataType == config.dataType.number) // Its Edge Enable Device
                                                            {
                                                                childDeviceInfo.parentGuid = noParentDeviceInfo.guid;
                                                                childDeviceInfo.p = parentAttributeName;
                                                                setEdgeVal(childDeviceInfo, attrValue, dUniqueId, cpId);
                                                                var tobj = {
                                                                    "parentDeviceAttributeInfo": childDeviceInfo,
                                                                    "attrValue": attrValue,
                                                                    "attributeObj": attributeObj,
                                                                    "dUniqueId": dUniqueId,
                                                                    "brokerClient": brokerClient,
                                                                    "env": env,
                                                                    "offlineConfig": offlineConfig
                                                                }
                                                                ruleAttributeValidateArray.push(tobj);
                                                                // setRuleVal(childDeviceInfo, attrValue, attributeObj, dUniqueId, brokerClient, env, offlineConfig, isDebug);
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
                                        setRuleVal(ruleatt.parentDeviceAttributeInfo, ruleatt.attrValue, ruleatt.attributeObj, ruleatt.dUniqueId, ruleatt.brokerClient, ruleatt.env, ruleatt.offlineConfig, combineRuleAttrArray, cpId, isDebug);
                                        cbatt();
                                    }, 200);
                                }, function () {});
                            }
                            cb_series();
                        });
                    }
                ], function (err, response) {
                    if (cntFLT > 0 && deviceData.ee == config.edgeEnableStatus.disabled) {
                        attributeObjFLT.d = [_.reduce(attributeObjFLT.d, _.extend)];
                        dataObjFLT.d.push(attributeObjFLT)
                    }
                    if (cntRPT > 0 && deviceData.ee == config.edgeEnableStatus.disabled) {
                        attributeObj.d = [_.reduce(attributeObj.d, _.extend)];
                        dataObj.d.push(attributeObj);
                    }
                    cb_fl_dData();
                })
            } else {
                // console.log("----- deviceSyncRes not available ---- \n----- need to call Init() the method first ----");
                cb_fl_dData();
            }
        } else {
            // console.log("Device data not found");
            cb_fl_dData();
        }
    }, function () {
        if (dataObjFLT.d.length > 0 && deviceData.ee == config.edgeEnableStatus.disabled) {
            // console.log("===> flt => ", JSON.stringify(dataObjFLT));
            sendDataOnAzureMQTT(dataObjFLT, dUniqueId, brokerClient, offlineConfig, isDebug, cpId);
        }
        if (dataObj.d.length > 0 && deviceData.ee == config.edgeEnableStatus.disabled) {
            // console.log("===> rpt => ", JSON.stringify(dataObj));
            sendDataOnAzureMQTT(dataObj, dUniqueId, brokerClient, offlineConfig, isDebug, cpId);
        }
    });
}

function setEdgeVal(attributeInfo, attrValue, dUniqueId, cpId) {
    var cacheId = cpId+"_"+dUniqueId;
    var deviceSyncRes = cache.get(cacheId);
    var edgeDatObj = deviceSyncRes.edgeData;
    if (attributeInfo.p != "" && attributeInfo.p != undefined) // If Parent attribute
    {
        //console.log("---- its parent ----");
        var eekey = attributeInfo.p + "-" + attributeInfo.tg
        var edgeObj = edgeDatObj[eekey];
        async.forEachSeries(edgeObj.data, function (atrributeData, cb) {
            atrributeData["agt"] = attributeInfo.agt;
            if (attributeInfo.ln == atrributeData.localName) {
                var newAtrrValue = atrributeData;
                var inputCounter = parseInt(atrributeData.count) + 1;
                newAtrrValue.count = inputCounter;
                async.forEachSeries(Object.keys(newAtrrValue), function (key, cb_atr) {
                    if (key == config.aggrigateTypeLablel.min) {
                        if (newAtrrValue[key] == "" || isNaN(newAtrrValue[key])) {
                            newAtrrValue[key] = attrValue;
                        } else if (parseFloat(newAtrrValue[key]) > parseFloat(attrValue)) {
                            newAtrrValue[key] = attrValue;
                        } else {
                            newAtrrValue[key] = atrributeData[key];
                        }
                    }
                    if (key == config.aggrigateTypeLablel.max) {
                        if (newAtrrValue[key] == "" || isNaN(newAtrrValue[key])) {
                            newAtrrValue[key] = attrValue;
                        } else if (parseFloat(newAtrrValue[key]) < parseFloat(attrValue)) {
                            newAtrrValue[key] = attrValue;
                        } else {
                            newAtrrValue[key] = newAtrrValue[key];
                        }
                    }
                    if (key == config.aggrigateTypeLablel.sum) {
                        if (newAtrrValue[key] == "" || isNaN(newAtrrValue[key])) {
                            newAtrrValue[key] = attrValue;
                        } else {
                            newAtrrValue[key] = parseFloat(newAtrrValue[key]) + parseFloat(attrValue);
                        }
                    }
                    if (key == config.aggrigateTypeLablel.lv) {
                        newAtrrValue[key] = attrValue;
                    }
                    cb_atr()
                }, function () {
                    cb()
                });
            } else {
                cb();
            }
        }, function () {
            var deviceSyncRes = cache.get(cacheId);
            deviceSyncRes = deviceSyncRes.edgeData[attributeInfo.parentGuid];
        });
    } else { // No parent attribute
        //console.log("=== Non Parent ===");
        var eekey = attributeInfo.ln + "-" + attributeInfo.tg
        var edgeObj = edgeDatObj[eekey];
        async.forEachSeries(edgeObj.data, function (atrributeData, cb) {
            atrributeData["agt"] = attributeInfo.agt;
            var newAtrrValue = atrributeData;
            var inputCounter = parseInt(atrributeData.count) + 1;
            newAtrrValue.count = inputCounter;
            async.forEachSeries(Object.keys(newAtrrValue), function (key, cb_atr) {

                if (key == config.aggrigateTypeLablel.min) {
                    if (newAtrrValue[key] == "" || isNaN(newAtrrValue[key])) {
                        newAtrrValue[key] = attrValue;
                    } else if (parseFloat(newAtrrValue[key]) > parseFloat(attrValue)) {
                        newAtrrValue[key] = attrValue;
                    } else {
                        newAtrrValue[key] = atrributeData[key];
                    }
                }
                if (key == config.aggrigateTypeLablel.max) {
                    if (newAtrrValue[key] == "" || isNaN(newAtrrValue[key])) {
                        newAtrrValue[key] = attrValue;
                    } else if (parseFloat(newAtrrValue[key]) < parseFloat(attrValue)) {
                        newAtrrValue[key] = attrValue;
                    } else {
                        newAtrrValue[key] = newAtrrValue[key];
                    }
                }
                if (key == config.aggrigateTypeLablel.sum) {
                    if (newAtrrValue[key] == "" || isNaN(newAtrrValue[key])) {
                        newAtrrValue[key] = attrValue;
                    } else {
                        if (attributeInfo.dt == config.dataType.number) {
                            newAtrrValue[key] = parseFloat(newAtrrValue[key]) + parseFloat(attrValue);
                        } else if (attributeInfo.dt == config.dataType.float) {
                            newAtrrValue[key] = parseFloat(newAtrrValue[key]) + parseFloat(attrValue);
                        }
                    }
                }
                if (key == config.aggrigateTypeLablel.lv) {
                    newAtrrValue[key] = attrValue;
                }
                cb_atr()
            }, function () {
                cb()
            });
        }, function () {
            var deviceSyncRes = cache.get(cacheId);
            deviceSyncRes = deviceSyncRes.edgeData[attributeInfo.guid];
        });
    }
}

function setRuleVal(attributeInfo, attrVal, attributeObj, uniqueId, brokerClient, env, offlineConfig, validateAttributes, cpId, isDebug) {

    // console.log("attributeInfo ==> ", attributeInfo);
    // console.log("attrVal ==> ", attrVal);
    // console.log("attributeObj ==> ", attributeObj);


    var ruleData = [];
    var cacheId = cpId+"_"+uniqueId;
    var deviceSyncRes = cache.get(cacheId);
    var rules = deviceSyncRes.r;
    // console.log("attributeInfo ==> ",attributeInfo)
    if (_.isArray(attributeInfo)) //Parent attributes
    {
        // console.log("//Parent attributes");
        var attributeArrayObj = {
            "data": []
        }
        async.forEachSeries(rules, function (rulesData, cb_main) {
            var conditionText = rulesData.con;
            async.forEachSeries(rulesData.att, function (attributes, cb_attr) {
                if (_.isArray(attributes.g)) // Its Child
                {
                    attributeArrayObj["parentFlag"] = 1;
                    var countSq = 1;
                    async.forEachSeries(attributes.g, function (ids, cb_inner) {
                        var atId = ids;
                        async.forEachSeries(attributeInfo, function (attrInfo, cb_attrInfo) {
                            attributeArrayObj["parentGuid"] = attrInfo.parentGuid;
                            var attrValue = attrInfo.value;
                            var attPname = attrInfo.p;
                            try {
                                splitCondition(conditionText, attPname, function (conditionResponse) {
                                    var myObj = {};
                                    var countSqAtt = 1;
                                    async.forEachSeries(conditionResponse, function (response, cb_lnv) {
                                        if (attrInfo.ln == response.localNameChild && response.localNameParent == response.currentAttParent && countSq == countSqAtt) {
                                            myObj[atId] = {
                                                "guid": rulesData.g, //FD143FA6-D15F-4BBF-BC49-7876FB2E9C6
                                                "eventSubscriptionGuid": rulesData.es, //"C360A375-9B93-4F54-ACD4-EAF6C2EE54C5",
                                                "conditionText": response.condition, //"Gyro.X > 20 AND Gyro.Y > 50",
                                                "conditionTextMain": rulesData.con, //"Gyro.X > 20 AND Gyro.Y > 50",
                                                "commandText": rulesData.cmd, //"reboot"
                                                "value": attrInfo.value,
                                                "attGuid": atId, //attribute Guid
                                                "localName": attrInfo.ln, //"reboot"
                                                "localNameParent": response.localNameParent, //"Parent attribute name"
                                                "currentAttParent": response.currentAttParent //"Current Parent attribute need to match
                                            };
                                        }
                                        countSqAtt++;
                                        cb_lnv()
                                    }, function () {
                                        // console.log("========= myObj ========", myObj);
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
                            cb_inner();
                        });
                    }, function () {
                        cb_attr();
                    });
                } else {
                    cb_attr();
                }

            }, function () {
                cb_main();
            });
        }, function () {
            evaluateRule(attributeArrayObj, attributeObj, attrVal, uniqueId, brokerClient, env, offlineConfig, validateAttributes, cpId, isDebug);
        });
    } else // Non Parent Attributes
    {
        var attributeArrayObj = {
            "data": []
        }

        async.forEachSeries(rules, function (rulesData, cb_main) {
            // console.log("==== start Non Parent ====");
            var conditionText = rulesData.con;
            async.forEachSeries(rulesData.att, function (attributes, cb_attr) {
                if (_.isArray(attributes.g)) // Its Child
                {
                    var objData = {};
                    var atId = attributes.g;
                    attributeArrayObj["parentFlag"] = 0;
                    var attributeInfo1 = [attributeInfo];
                    async.forEachSeries(attributeInfo1, function (attrInfo, cb_attrInfo) {
                        attributeArrayObj["parentGuid"] = attrInfo.parentGuid;
                        var attrValue = attrVal;
                        var attPname = attrInfo.p;
                        splitCondition(conditionText, attPname, function (conditionResponse) {
                            var myObj = {}
                            async.forEachSeries(conditionResponse, function (response, cb_lnv) {
                                if (attrInfo.ln == response.localNameParent) {
                                    myObj = {
                                        "guid": rulesData.g, //FD143FA6-D15F-4BBF-BC49-7876FB2E9C6
                                        "eventSubscriptionGuid": rulesData.es, //"C360A375-9B93-4F54-ACD4-EAF6C2EE54C5",
                                        "conditionText": response.condition, //"Gyro.X > 20 AND Gyro.Y > 50",
                                        "conditionTextMain": rulesData.con, //"Gyro.X > 20 AND Gyro.Y > 50",
                                        "commandText": rulesData.cmd, //"reboot"
                                        "value": attrValue, //"reboot"
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
                        cb_attr();
                    });
                } else {
                    cb_attr();
                }
            }, function () {
                cb_main();
            });

        }, function () {
            evaluateRule(attributeArrayObj, attributeObj, attrVal, uniqueId, brokerClient, env, offlineConfig, validateAttributes, cpId, isDebug);
        });

    }
}

function splitCondition(conditionText, attPname, callback) {
    // console.log("conditionText==========>",conditionText);
    var ruleCondition = conditionText.trim();
    if (ruleCondition.indexOf("=") != -1) {
        ruleCondition = ruleCondition.replace("=", "==");
    }
    var resArray = ruleCondition.split("AND");
    var parentObj = [];
    async.forEachSeries(resArray, function (conditions, cb_cond) {
        conditions = conditions.trim();
        // console.log("conditionText==========>", conditions);
        var res = conditions.split(" ");
        // console.log(res);

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

function evaluateRule(ruleEvaluationData, attributeObjOld, attrValue, uniqueId, brokerClient, env, offlineConfig, validateAttributes, cpId, isDebug) {

    //  console.log("================================================")
    //  console.log("attributeArrayObj==>",attributeObjOld);
    //  console.log("attrValue ==>",attrValue);
    //  console.log("validateAttributes ==>",validateAttributes);
    //  console.log(ruleEvaluationData)
    //  console.log("================================================")
    var cacheId = cpId+"_"+uniqueId;
    var deviceSyncRes = cache.get(cacheId);
    var deviceData = deviceSyncRes;
    var deviceTag = attributeObjOld.tg;
    var newObj = {
        "cpId": deviceData.cpId,
        "dtg": deviceData.dtg,
        "t": new Date(),
        "mt": config.messageType.ruleMatchedEdge,
        "sdk": {
            "l": config.sdkLanguage,
            "v": config.sdkVersion,
            "e": env
        },
        "d": []
    };

    var ruledataObj = [];
    var ruleEvaluationDataLength = ruleEvaluationData.data;
    try {
        if (ruleEvaluationDataLength.length > 0) {
            if (ruleEvaluationData.parentFlag == 1) // Its parent
            {
                var attributeLevel = {};
                var attributeParentGuid = ruleEvaluationData.parentGuid;
                var attributeObj = {};
                attributeObj['id'] = attributeObjOld.id;
                attributeObj['dt'] = new Date();
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
                    // console.log("childAttribute ********** ", ruleData);   
                    //console.log(childAttribute);  
                    //console.log(Object.keys(childAttribute));
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
                    // console.log('currentAttParent ==> ', currentAttParent);
                    if (conditionTextMain.indexOf(">=") != -1 || conditionTextMain.indexOf("<=") != -1 || ruleCondition.indexOf("!=") != -1) {} else {
                        // console.log("ruleCondition==>",conditionTextMain);
                        // console.log("ruleCondition==>",conditionTextMain.indexOf("="));
                        if (conditionTextMain.indexOf("=") != -1) {
                            conditionTextMain = conditionTextMain.replace("=", "==");
                        }
                    }
                    var resArray = conditionTextMain.split("AND");
                    // console.log("TCL: evaluateRule -> resArray", resArray)
                    thirdLevelChildObj = {};
                    thirdLevelChildObj[localNameParent] = {};
                    async.forEachSeries(resArray, function (conditions, cb_cond) {
                        conditions = conditions.trim();
                        var aconditions = conditions.trim();
                        var res = conditions.split(" ");
                        if (aconditions.indexOf("#") != -1) {
                            var attlocalName = aconditions.split("#");
                            conditionTag = attlocalName[0];
                            // console.log("tag name ==> ", attlocalName[0]);
                        }

                        var localName = res[0];
                        // console.log(localName);
                        localName = localName.split(".");
                        // console.log("localName[0] ==> ",localName[0])
                        thirdLevelObj.parent = localName[0];
                        var localNameChild = localName[1];
                        // console.log("attrLocalName == localNameChild " + attrLocalName + "==" + localNameChild)
                        // console.log("attrLocalName == localNameParent " + localNameParent + "==" + currentAttParent)

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
                    // console.log("--- completed ====", ruleAttObj);
                    var ruleAttObjUpdated = _.reduce(ruleAttObj, _.extend)
                    // console.log("--- completed ====", ruleAttObjUpdated);
                    thirdLevelChildObj[attParentName] = ruleAttObjUpdated;
                    // thirdLevelChildObj[localNameChild] = attrValue;
                    // thirdLevelObj.data.push(thirdLevelChildObj);
                    attributeObj['cv'] = thirdLevelChildObj;
                    attributeObj.d.push(validateAttributes);
                    // console.log("--- temp ====", temp)
                    var fconfitionAtt = fullCondition.split("AND");
                    // console.log("--- temp ====", fconfitionAtt)
                    // console.log("--- temp ====", fconfitionAtt.length)
                    // console.log("TCL: evaluateRule -> attConditionFlag", attConditionFlag)
                    if (attConditionFlag == 1 && temp.length == fconfitionAtt.length) {
                        attConditionFlag = 0;
                        var evalCondition = temp.join(' && ');
                        // console.log("\nEdge Device ::: Condition :: ", evalCondition + " :: [" + fullCondition + "] ");
                        // console.log("eval(evalCondition) == true && conditionTag == deviceTag", eval(evalCondition) +"&&"+ conditionTag +"=="+ deviceTag)
                        if (eval(evalCondition) == true && conditionTag == deviceTag) {
                            ruleFlag = 1;
                            var deviceCID = deviceData.cpId + "-" + attributeObjOld.id
                            // console.log("Edge Device ::: [Rule MATCHED] ::: DeviceId :: " + deviceCID + " :: ", new Date());
                            manageDebugLog("INFO_EE01", uniqueId, cpId, "", 1, isDebug);
                            var cmdObj = {
                                cpid: deviceData.cpId,
                                guid: deviceData.company,
                                cmdType: config.commandType.CORE_COMMAND,
                                uniqueId: attributeObjOld.id,
                                command: ruleCommandText,
                                ack: true,
                                ackId: null
                            }

                            sendCommand(cmdObj);
                            //attributeObj.data.push(thirdLevelObj)
                            newObj.d.push(attributeObj);
                            // console.log(JSON.stringify(newObj));
                            sendDataOnAzureMQTT(newObj, uniqueId, brokerClient, offlineConfig, isDebug, cpId);
                            //console.log(thirdLevelObj);
                        } else {
                            // console.log("--- Rule not Matched --- ");
                            var deviceCID = deviceData.cpId + "-" + attributeObjOld.id
                            // console.log("Edge Device ::: [Rule NOT MATCHED] ::: device :: " + deviceCID + " :: ", new Date());
                            
                            manageDebugLog("INFO_EE02", uniqueId, cpId, "", 1, isDebug);
                        }
                        //dataObj.data.push(attributeObj)
                    }
                });
            } else {
                // console.log("---- NO PPPPPPP -----");
                var attributeLevel = {};
                //var attributeGuid = ruleEvaluationData.data;
                var attributeGuid = "";
                //console.log(attributeGuid);
                var attributeObj = {};
                attributeObj['id'] = attributeObjOld.id; //attributeObjOld.uniqueId;
                // attributeObj['guid'] = attributeObjOld.guid;
                attributeObj['dt'] = new Date();
                attributeObj['d'] = [];
                attributeObj['cv'] = "";
                fullCondition = "";
                async.forEachSeries(ruleEvaluationData.data, function (ruleData, cb_rl) {
                    // console.log("====== cnt ==== ",ruleData);

                    var childAttribute = Object.keys(ruleData);
                    attributeGuid = childAttribute[0];
                    // console.log("====== attributeGuid ==== ",childAttribute[0]);
                    // console.log("====== attributeGuid ==== ",ruleData.guid);
                    // console.log("====== attributeGuid ==== ",ruleData[attributeGuid].conditionText);
                    //console.log(childAttribute);
                    //var ruleGuid = ruleDate.guid;

                    var ruleCondition = ruleData.conditionText.trim();
                    var conditionTextMain = ruleData.conditionTextMain.trim();
                    attributeObj['rg'] = ruleData.guid;
                    attributeObj['ct'] = conditionTextMain;
                    fullCondition = conditionTextMain;
                    attributeObj['sg'] = ruleData.eventSubscriptionGuid;
                    ruleCommandText = ruleData.commandText;
                    attrValue = ruleData.value;
                    var attrLocalName = ruleData.localName;

                    // console.log("ruleCondition 1 ==> ",ruleCondition);
                    if (ruleCondition.indexOf(">=") != -1 || ruleCondition.indexOf("<=") != -1 || ruleCondition.indexOf("!=") != -1) {
                        if (ruleCondition.indexOf("==") != -1) {
                            ruleCondition = ruleCondition.replace("==", "=");
                        }
                    } else {
                        // console.log("--- in else ---");
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
                        // console.log("tag name ==> ", attlocalName[0]);
                        attlocalName = attlocalName[1];
                    } else {
                        attlocalName = localName;
                    }
                    // console.log("Local name ==> ", attlocalName);
                    var actualConditions = ruleCondition.replace(res[0], attrValue);
                    // console.log("\nEdge Device ::: Condition :: ", actualConditions + " :: [" + fullCondition + "] ");
                    if (eval(actualConditions.toString()) == true && conditionTag == deviceTag) {
                        var deviceCID = deviceData.cpId + "-" + attributeObjOld.id
                        // console.log("Edge Device ::: [Rule MATCHED] ::: device :: " + deviceCID + " :: ", new Date());
                        manageDebugLog("INFO_EE01", uniqueId, cpId, "", 1, isDebug);
                        ruleFlag = 1
                        var thirdLevelObj = {};
                        thirdLevelObj[attlocalName] = attrValue;
                        attributeObj['cv'] = thirdLevelObj;
                        attributeObj.d.push(validateAttributes)
                        newObj.d.push(attributeObj);

                        var cmdObj = {
                            cpid: deviceData.cpId,
                            guid: deviceData.company,
                            cmdType: config.commandType.CORE_COMMAND,
                            uniqueId: attributeObjOld.id,
                            command: ruleCommandText,
                            ack: true,
                            ackId: null
                        }
                        sendCommand(cmdObj);
                    } else {
                        var deviceCID = deviceData.cpId + "-" + attributeObjOld.id
                        // console.log("Edge Device ::: [Rule NOT MATCHED] ::: device :: " + deviceCID + " :: ", new Date());
                        manageDebugLog("INFO_EE02", uniqueId, cpId, "", 1, isDebug);
                    }
                    cb_rl();
                }, function () {
                    if (ruleFlag == 1) {
                        sendDataOnAzureMQTT(newObj, uniqueId, brokerClient, offlineConfig, isDebug, cpId);
                    }
                });
            }
        }
    } catch (error) {
        manageDebugLog("ERR_EE01", uniqueId, cpId, error.message, 0, isDebug);
    }
}

function sendCommand(obj) {
    GLOBAL_CALLBACK(obj);
}

function dataValidationTest(dataType, dataValidation, attrValue, childDeviceInfo, msgTypeStatus, cb) {
    var childAttrObj = {};
    if (dataType == config.dataType.number) {
        var valueArray = dataValidation.split(",");
        var attrValue = attrValue.toString();
        var numbersInt = /^[-+]?[0-9]+$/;
        var numbersFloat = /^[-+]?[0-9]+\.[0-9]+$/;
        if (attrValue.match(numbersInt) != null || attrValue.match(numbersFloat) != null) {
            var isNumber = true;
        } else {
            var isNumber = false;
        }

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
    } else if (dataType == config.dataType.string && (dataValidation != "" && dataValidation != null)) {
        if (dataValidation.indexOf(attrValue) == -1) {
            msgTypeStatus = 1;
        }
        childAttrObj["ln"] = childDeviceInfo.ln;
        childAttrObj["v"] = attrValue;
        childAttrObj["msgTypeStatus"] = msgTypeStatus;
    } else {
        childAttrObj["ln"] = childDeviceInfo.ln;
        childAttrObj["v"] = attrValue;
        childAttrObj["msgTypeStatus"] = msgTypeStatus;
    }
    cb(childAttrObj);
}

/* 
 * Azure Receiver
 * @author : MK
 * Send data using MQTT to MQTT topic
 * @param: mqttTopic = MQTT Topic
 * @param: data_array = Receive Data
 */
async function sendDataOnAzureMQTT(sensorData, uniqueId, brokerClient, offlineConfig, isDebug, cpId) {
    // console.log(sensorData.cpId);    
    // console.log(uniqueId);
    // return false;
    var cacheId = cpId+"_"+uniqueId;
    var deviceSyncRes = cache.get(cacheId);
    // console.log(deviceSyncRes);
    var brokerConfiguration = deviceSyncRes.p;
    var protocoalName = brokerConfiguration.n;
    if (protocoalName.toLowerCase() == "mqtt" || protocoalName.toLowerCase() == "tpm") {
        var mqttHost = brokerConfiguration.h; //"demohub.azure-devices.net";
        var isEdgeDevice = false;
        if(deviceSyncRes.ee) {
            isEdgeDevice = true
        } else {
            isEdgeDevice = false
        }
        var cpId = deviceSyncRes.cpId;
        var dataFrequencyInSec = deviceSyncRes.sc.df; 
        // if(sensorData.mt || sensorData.mt == 0){

        // } else {
        //     delete sensorData.cpId;
        // } 
        await mqttPublishData(mqttHost, sensorData, uniqueId, brokerClient, offlineConfig, cpId, dataFrequencyInSec, isEdgeDevice, isDebug);
    } else if (protocoalName.toLowerCase() == "http" || protocoalName.toLowerCase() == "https") {
        var headers = {
            "accept": "application/json",
            "content-type": "application/json",
            "authorization": brokerConfiguration.pwd
        };
        request.post({
                url: "https://" + brokerConfiguration.h + "/devices/" + brokerConfiguration.id + "/messages/events?api-version=" + config.httpAPIVersion,
                headers: headers,
                body: sensorData,
                json: true
            },
            function (error, response, body) {
                if(error) {
                    manageDebugLog("ERR_SD01", uniqueId, cpId, error.message, error.message, isDebug);
                } else {
                    manageDebugLog("INFO_SD01", uniqueId, cpId, "", 1, isDebug);
                }
            });
    } else {
        manageDebugLog("ERR_SD11", uniqueId, cpId, error.message, 0, isDebug);
    }
}

// function reConnectMqttInfo(offlineData) {
//     var deviceSyncRes = cache.get("deviceSyncRes");
//     var brokerConfiguration = deviceSyncRes.p;
//     var protocoalName = brokerConfiguration.n;
//     if (protocoalName.toLowerCase() == "mqtt") {
//         var mqttHost = brokerConfiguration.h; //"demohub.azure-devices.net";
//         var mqttUrl = 'mqtts://' + mqttHost;
//         var mqttOption = {
//             clientId: brokerConfiguration.id, //"520uta-sdk003",
//             port: brokerConfiguration.port, //8883,
//             username: brokerConfiguration.un, //"demohub.azure-devices.net/520uta-sdk003",
//             password: brokerConfiguration.pwd, //"HostName=demohub.azure-devices.net;DeviceId=520uta-sdk003;SharedAccessSignature=SharedAccessSignature sr=demohub.azure-devices.net%2Fdevices%2F520uta-sdk003&sig=9ckd1upGemFSHYkWnaxWiKqh7CsQhsjY%2F49KM42Na3Y%3D&se=1518083719",
//             rejectUnauthorized: true,
//             // ,
//             // reconnecting: true,
//             // reconnectPeriod: 100,
//             // pingTimer: 10
//         };
//         mqttPublishData(mqttUrl, mqttHost, mqttOption, brokerConfiguration.pub, offlineData);
//     } else {
//         console.log("Protocol not matched.");
//     }
// }

let isRunning = false;
function offlineProcess(offlineData, uniqueId, offlineConfig, cpId, isDebug) {
    try {
        if (!offlineData['cpId'])
            offlineData['cpId'] = cpId;
        if (isRunning) {
            setTimeout(() => {
                offlineProcess(offlineData, uniqueId, offlineConfig, cpId, isDebug);
            }, 500);
        } else {
            isRunning = true;
            var logPath = logBaseUrl + cpId + "_" + uniqueId + "/";
            try {
                fs.readdir(logPath, function (err, files) {
                    if (err) {
                        manageDebugLog("ERR_OS04", uniqueId, cpId, config.errorLog.ERR_OS04+ " " +err.message, 0, isDebug);
                    }
                    if (files.length == 0) {
                        createFile(offlineData, null, logPath, uniqueId, cpId, isDebug, function (res) {
                            isRunning = false;
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
                                        // if(offlineData.mt != 0)
                                        //     delete offlineData.cpId;
                                        var uid = uniqueId;
                                    } else {
                                        var uid = offlineData.d[0].id;
                                    }
                                    if (offlineConfig.offlinePerFileDataLimit > fileSize || offlineConfig.offlinePerFileDataLimit == 0) {
                                        try {
                                            fsep.readJsonAsync(filePath).then(function (packageObj) {
                                                packageObj.push(offlineData);
                                                try {
                                                    fsep.writeJsonAsync(filePath, packageObj, err => {
                                                        if (err) {
                                                            manageDebugLog("ERR_OS01", uid, cpId, err.message, 0, isDebug);
                                                            cb();
                                                        } else {
                                                            // console.log("\nOffline data saved ::: DeviceId :: " + clientId + " :: ", new Date());
                                                            manageDebugLog("INFO_OS02", uid, cpId, "", 1, isDebug);
                                                            cb();
                                                        }
                                                    })
                                                } catch (error) {
                                                    manageDebugLog("ERR_OS01", uid, cpId, error.message, 0, isDebug);
                                                }
                                            });
                                        } catch (error) {
                                            manageDebugLog("ERR_OS01", uid, cpId, error.message, 0, isDebug);
                                            cb();
                                        }
                                    } else {
                                        // console.log("Exceeded the file limit as predetermined...")
                                        if (offlineConfig.offlineFileCouunt == 1) {
                                            if (eval(fileSize - offlineConfig.offlinePerFileDataLimit) > 1500) {
                                                var shiftcnt = 3;
                                            } else if (eval(fileSize - offlineConfig.offlinePerFileDataLimit) > 1024) {
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
                                                                var clientId = cpId + "_" + uid;
                                                                manageDebugLog("INFO_OS02", uid, cpId, "", 1, isDebug);
                                                                cb();
                                                            }
                                                        })
                                                    } catch (error) {
                                                        manageDebugLog("ERR_OS01", uid, cpId, error.message, 0, isDebug);
                                                    }
                                                });
                                            } catch (error) {
                                                manageDebugLog("ERR_OS01", uid, cpId, error.message, 0, isDebug);
                                                cb();
                                            }
                                        } else {
                                            try {
                                                createFile(offlineData, file, logPath, uniqueId, cpId, isDebug, function (res) {
                                                    fs.readdir(logPath, function (err, allFiles) {
                                                        if (err)
                                                            manageDebugLog("ERR_OS04", uniqueId, cpId, config.errorLog.ERR_OS04+ " " +err.message, 0, isDebug);
                                                            cb();

                                                        if (allFiles.length > offlineConfig.offlineFileCouunt) {
                                                            deleteFile(logPath, isDebug);
                                                            cb();
                                                        } else {
                                                            cb();
                                                        }
                                                    });
                                                });
                                            } catch (error) {
                                                manageDebugLog("ERR_OS01", uniqueId, cpId, error.message, 0, isDebug);
                                                cb();
                                            }
                                        }
                                    }
                                });
                            } else {
                                cb()
                            }
                        }, function () {
                            isRunning = false;
                        })
                    }
                });
            } catch (error) {
                manageDebugLog("ERR_OS01", uniqueId, cpId, error.message, 0, isDebug);
            }
        }
    } catch (error) {
        manageDebugLog("ERR_OS01", uniqueId, cpId, error.message, 0, isDebug);
    }
}

async function swapFilename(oldFileName, logPath, uniqueId, cpId, callback) {
    try {
        fs.exists(logPath + oldFileName, (exists) => {
            if (exists) {
                var newFile = oldFileName.substr(7, oldFileName.length - 1);
                var oldPath = logPath + oldFileName;
                var newPath = logPath + newFile;
                fs.rename(oldPath, newPath, function (err, res) {
                    // console.log("File name updated due to file size exceeded.");
                    callback();
                })
            } else {
                callback();
            }
        });
    } catch (error) {
        manageDebugLog("ERR_OS01", uniqueId, cpId, error.message, 0, isDebug);
        callback();
    }
}

async function createFile(offlineData, oldFile = "", logPath, uniqueId, cpId, isDebug, callback) {
    try {
        if (!offlineData.mt || offlineData.mt == config.messageType.ack) {
            // if(offlineData.mt != 0)
            //     delete offlineData.cpId;
            var uid = uniqueId;
        } else {
            var uid = offlineData.d[0].id;
        }
        await swapFilename(oldFile, logPath, uniqueId, cpId, function () {
            var date = new Date();
            var newFilePath = logPath + "Active_" + date.getTime() + '.json';
            var offlineDataArray = [offlineData];
            try {
                fsep.writeJsonAsync(newFilePath, offlineDataArray, err => {
                    if (err) {
                        manageDebugLog("ERR_OS01", uniqueId, cpId, err.message, 0, isDebug);
                        callback(false);
                    } else {
                        manageDebugLog("INFO_OS03", uniqueId, cpId, "", 1, isDebug);
                        manageDebugLog("INFO_OS02", uniqueId, cpId, "", 1, isDebug);
                        callback(true);
                    }
                })
            } catch (error) {
                manageDebugLog("ERR_OS01", uniqueId, cpId, error.message, 0, isDebug);
                callback(true);
            }
        });
    } catch (error) {
        manageDebugLog("ERR_OS01", uniqueId, cpId, error.message, 0, isDebug);
        callback
    }
}

async function deleteFile(logPath, isDebug, deleteFilePath = "") {
    var clientId = logPath.split("/");
    var companyInfo = clientId[3].split("_");
    var cpId = companyInfo[0];
    var uniqueId = companyInfo[1];
    if (logPath && deleteFilePath == "") {
        try {
            fs.readdir(logPath, function (err, files) {
                if (err) {
                    manageDebugLog("ERR_OS04", uniqueId, cpId, config.errorLog.ERR_OS04+ " " +err.message, 0, isDebug);
                }
                if (files.length > 0) {
                    var tempArray = [];
                    files.forEach(function (file) {
                        tempArray.push(file.substr(file.length - 18, 13));
                    });
                    var deleteFileTimeStamp = _.min(tempArray);
                    if (tempArray.indexOf(deleteFileTimeStamp) != -1) {
                        fs.remove(logPath + files[tempArray.indexOf(deleteFileTimeStamp)])
                        .then(() => {
                            manageDebugLog("INFO_OS04", uniqueId, cpId, "", 1, isDebug);
                        })
                        .catch(err => {
                            manageDebugLog("ERR_OS01", uniqueId, cpId, error.message, 0, isDebug);
                        })
                    }
                }
            });
        } catch (error) {
            manageDebugLog("ERR_OS01", uniqueId, cpId, error.message, 0, isDebug);
        }
    } else {
        try {
            fs.remove(deleteFilePath)
                .then(() => {
                    manageDebugLog("INFO_OS04", uniqueId, cpId, "", 1, isDebug);
                })
                .catch(err => {
                    manageDebugLog("ERR_OS01", uniqueId, cpId, err.message, 0, isDebug);
                })
        } catch (error) {
            manageDebugLog("ERR_OS01", uniqueId, cpId, error.message, 0, isDebug);
        }
    }
}

async function deleteAllLogFile(logPath) {
    if (logPath) {
        try {
            var clientId = logPath.split("/");
            var companyInfo = clientId[3].split("-");
            var cpId = companyInfo[0];
            var uniqueId = companyInfo[1];
            fs.readdir(logPath, function (err, files) {
                if (err) {
                    manageDebugLog("ERR_OS04", uniqueId, cpId, config.errorLog.ERR_OS04+ " " +err.message, 0, this.IS_DEBUG);
                }
                if (files.length > 0) {
                    files.forEach(function (file) {
                        try {
                            fs.remove(logPath + file)
                                .then(() => {
                                    manageDebugLog("INFO_OS04", uniqueId, cpId, "", 1, isDebug);
                                })
                                .catch(err => {
                                    manageDebugLog("ERR_OS01", uniqueId, cpId, error.message, 0, isDebug);
                                })
                        } catch (error) {
                            manageDebugLog("ERR_OS01", uniqueId, cpId, error.message, 0, isDebug);
                        }
                    });
                }
            });
        } catch (error) {
            manageDebugLog("ERR_OS01", uniqueId, cpId, error.message, 0, isDebug);
        }
    }
}

let isRunningOfflineSending = false;
async function checkOfflineData(cpId, duniqueid, client, offlineFileConfig, isDebug) {
    try {
        isRunningOfflineSending = true;
        // console.log("Offline data sending...", isRunningOfflineSending);
        var dataPublishFileArray = "";
        var logPath = "";
        var uniqueId = duniqueid;
        var cpId = cpId;
        var clientId = cpId + "_" + uniqueId
        async.waterfall([
            function (callback) {
                logPath = logBaseUrl + cpId + "_" + uniqueId + "/";
                callback(null, logPath)
            },
            function (logPath, callback) {
                try {
                    fs.readdir(logPath, function (err, files) {
                        if (err) {
                            manageDebugLog("ERR_OS04", uniqueId, cpId, config.errorLog.ERR_OS04+ " " +err.message, 0, this.IS_DEBUG);
                        }
                        if (files.length > 0) {
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
                    manageDebugLog("ERR_OS01", uniqueId, cpId, error.message, 0, isDebug);
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
                                checkAndSendOfflineData(clientId, client, logPath + dataFile, logPath, offlineFileConfig, isDebug, uniqueId, cpId, function (res) {
                                    // console.log(res);
                                })
                            } else {
                                dataFile = logPath + "Active_" + dataFile;
                                fs.exists(dataFile, (exists) => {
                                    if (exists) {
                                        checkAndSendOfflineData(clientId, client, dataFile, logPath, offlineFileConfig, isDebug, uniqueId, cpId, function (res) {
                                            //console.log(res);
                                        })
                                    }
                                });
                            }
                        });
                    } catch (error) {
                        manageDebugLog("ERR_OS01", uniqueId, cpId, error.message, 0, isDebug);
                    }
                });
            } else {
                // console.log("Device: ["+clientId+"] :: No offline data found.");
                // manageDebugLog("INFO_OS05", uniqueId, cpId, "", 1, isDebug);
                isRunningOfflineSending = false;
            }
        });
    } catch (error) {
        manageDebugLog("ERR_OS01", uniqueId, cpId, error.message, 0, isDebug);
    }
}

async function holdFunc(offDataObj, offlineDataLength, client, clientId, offlineDataFile, logPath, offlineFileConfig, isDebug, uniqueId, cpId) {
    setTimeout(() => {
      console.log("\n");
      sendOfflineDataProcess(offDataObj, offlineDataLength, client, clientId, offlineDataFile, logPath, offlineFileConfig, isDebug, uniqueId, cpId)
    }, 10000);
}

var totalRecordCnt = 0;
function sendOfflineDataProcess(offDataObj, offlineDataLength, client, clientId, offlineDataFile, logPath, offlineFileConfig, isDebug, uniqueId, cpId){
    var offlineData = _.cloneDeep(offDataObj);
    var startTime = new Date().getTime();
    var actualDataLength = offlineDataLength;
    async.forEachSeries(offlineData, function (offlineDataResult, off_cb) {
        // if (client) {
            var curtime = new Date().getTime()
            if(curtime > (parseInt(startTime) + parseInt(10000)))
            {
                manageDebugLog("INFO_OS06", uniqueId, cpId, config.infoLog.INFO_OS06+totalRecordCnt+ " / " +actualDataLength, 1, isDebug);
                // console.log("Offline data publish :: Send/Total :: "+ totalRecordCnt+ " / " +actualDataLength+ " :: ", new Date)
                // console.log("Sending STOP :: ", new Date());
                // console.log("********************************************")
                // console.log(":: START HOLD ::")
                holdFunc(offDataObj, offlineDataLength, client, clientId, offlineDataFile, logPath, offlineFileConfig, isDebug, uniqueId, cpId);
            } else {
                totalRecordCnt++;
                try {
                    offlineDataResult['od'] = 1;
                    sendDataOnAzureMQTT(offlineDataResult, uniqueId, client, offlineFileConfig, isDebug, cpId)

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
                    // console.log("actualDataLength == totalRecordCnt "+ actualDataLength +"=="+ totalRecordCnt)
                    if(actualDataLength == totalRecordCnt) {
                            manageDebugLog("INFO_OS06", uniqueId, cpId, config.infoLog.INFO_OS06+totalRecordCnt+ " / " +actualDataLength, 1, isDebug);
                            // console.log("Offline data publish :: Send/Total :: "+ totalRecordCnt+ " / " +actualDataLength+ " :: ", new Date)
                            isRunningOfflineSending = false;
                    }
                    off_cb();
                } catch (error) {
                    manageDebugLog("ERR_OS01", uniqueId, cpId, error.message, 0, isDebug);
                }
            }
        // } else {
        //     manageDebugLog("ERR_SD10", uniqueId, cpId, "", 0, isDebug);
        // }
    }, function () {
        try {
            if (offDataObj.length > 0) {
                fs.writeJsonSync(offlineDataFile, offDataObj, function (err) {
                    if (err) {
                        manageDebugLog("ERR_OS01", uniqueId, cpId, err.message, 0, isDebug);
                    } else {
                        console.log('Data re-added in offline JSON file.');
                    }
                });
            } else {
                deleteFile(logPath, isDebug, offlineDataFile)
            }
        } catch (error) {
            manageDebugLog("ERR_OS01", uniqueId, cpId, error.message, 0, isDebug);
        }
    });
}

async function checkAndSendOfflineData(clientId, client, offlineDataFile, logPath, offlineFileConfig, isDebug,  uniqueId, cpId, callback) {
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
                                sendOfflineDataProcess(offDataObj, offlineDtaCountforAllFIles, client, clientId, offlineDataFile, logPath, offlineFileConfig, isDebug, uniqueId, cpId)                              
                            } else {
                                deleteFile(logPath, isDebug, offlineDataFile)
                                callback(true);
                            }
                        }
                    })
                } catch (error) {
                    manageDebugLog("ERR_OS01", uniqueId, cpId, error.message, 0, isDebug);
                }
            } else {
                callback(true);
            }
        });
    } catch (error) {
        manageDebugLog("ERR_OS01", uniqueId, cpId, error.message, 0, isDebug);
        callback(true);
    }
}




async function mqttPublishData(mqttHost, sensorData, uniqueid, brokerClient, offlineConfig, cpId, dataFrequencyInSec, isEdgeDevice, isDebug) {
    await require('dns').resolve(mqttHost, function (err) {
        if (err) {
            if (sensorData.mt == 1) {
                setTimeout(() => {
                    if(!offlineConfig.offlineProcessDisabled){
                        offlineProcess(sensorData, uniqueid, offlineConfig, cpId, isDebug)
                    }
                }, 100);
            } else {
                if(!offlineConfig.offlineProcessDisabled){
                    offlineProcess(sensorData, uniqueid, offlineConfig, cpId, isDebug)
                }
            }
        } else {
            try {
               if(sensorData) {
                    try {
                        if(!offlineConfig.offlineProcessDisabled && isRunningOfflineSending == false) {
                            totalRecordCnt = 0;
                            checkOfflineData(cpId, uniqueid, brokerClient, offlineConfig, isDebug);
                        }
                        azDpsClient.azMessagePublish(sensorData, uniqueid, cpId, function (response) {
                            manageDebugLog("INFO_SD01", uniqueid, cpId, "", 1, isDebug);
                        });
                    } catch (error) {
                        manageDebugLog("ERR_SD01", uniqueid, cpId, error.message, 0, isDebug);
                    }
                } else {
                    manageDebugLog("ERR_SD12", uniqueid, cpId, "", 0, isDebug);
                }
            } catch (err) {
                manageDebugLog("ERR_SD01", uniqueid, cpId, err.message, 0, isDebug);
            }
        }
    });
}

function mqttSubscribeData(client, topic, duniqueid, clientId, pubTopic, deviceConnectionStatus, offlineFileConfig, cpId, isDebug, cb) {
    if (deviceConnectionStatus == false) {
        if (client) {
            azDpsClient.azSubscribeData(duniqueid, cpId, function (response) {
                if(response.cmdType == config.commandType.DEVICE_CONNECTION_STATUS && response.data.command == true) {
                    manageDebugLog("INFO_IN02", duniqueid, cpId, "", 1, isDebug);
                    if(!offlineFileConfig.offlineProcessDisabled && isRunningOfflineSending == false) {
                        totalRecordCnt = 0;
                        checkOfflineData(cpId, duniqueid, client, offlineFileConfig, isDebug);
                    }
                } else if(response.cmdType == config.commandType.DEVICE_CONNECTION_STATUS && response.data.command == false) {
                    manageDebugLog("INFO_IN03", duniqueid, cpId, "", 1, isDebug);
                } else if('status' in response) {
                    manageDebugLog("ERR_IN01", duniqueid, cpId, response.message, 0, isDebug);
                }
                cb(response);
            });
        }
        // var cnt = 0;
        // client.on('connect', function () {
        //     cnt++;
        //     client.subscribe(topic);
        //     client.subscribe(config.twinPropertySubTopic);
        //     client.subscribe(config.twinResponseSubTopic);
            
        //     setTimeout(() => {
        //         // console.log("Offline data sending...", isRunningOfflineSending);
        //         if(!offlineFileConfig.offlineProcessDisabled && isRunningOfflineSending == false) {
        //             totalRecordCnt = 0;
        //             // offlineDtaCountforAllFIles = 0; 
        //             checkOfflineData(cpId, duniqueid, client, pubTopic, offlineFileConfig, isDebug);
        //         }
        //     }, 1000);

        //     var deviceCommandAck = {
        //         cmdType: config.commandType.DEVICE_CONNECTION_STATUS,
        //         data: {
        //           cpid: cpId,
        //           guid: '',
        //           uniqueId: duniqueid,
        //           command: true,
        //           ack: false,
        //           ackId: '',
        //           cmdType: config.commandType.DEVICE_CONNECTION_STATUS
        //         }
        //     }
        //     manageDebugLog("INFO_IN02", duniqueid, cpId, "", 1, isDebug);
        //     cb(deviceCommandAck)
        // })
        // var twinPropertySubTopic = config.twinPropertySubTopic;
        // var twinResponseSubTopic = config.twinResponseSubTopic;
        // client.on("message", function (topic, payload) {
        //     if (topic.indexOf(twinPropertySubTopic.substring(0, twinPropertySubTopic.length - 1)) != -1) {
        //         try {
        //             var twinData = {};
        //             twinData['desired'] = JSON.parse(payload);
        //             twinData["uniqueId"] = duniqueid;
        //             GLOBAL_CALLBACK_TWIN(twinData);
        //         } catch (error) {}
        //     } else if (topic.indexOf(twinResponseSubTopic.substring(0, twinResponseSubTopic.length - 1)) != -1) {
        //         try {
        //             var twinData = JSON.parse(payload);
        //             twinData["uniqueId"] = duniqueid;
        //             GLOBAL_CALLBACK_TWIN(twinData);
        //         } catch (error) {}
        //     } else {
        //         // console.log("payload : ", JSON.parse(payload));
        //         cb(JSON.parse(payload));
        //     }
        // })
    }
}

var clientConnection = function clientConnection(uniqueId, sdkOption, cpId, isDebug, cb) {
    try {
        var cacheId = cpId+"_"+uniqueId;
        var deviceSyncRes = cache.get(cacheId);
        var brokerConfiguration = deviceSyncRes.p;
        manageDebugLog("INFO_IN05", uniqueId, cpId, "", 1, isDebug);
        if(!azDpsClient) 
            azDpsClient = new azureDps(cpId+'-'+uniqueId, sdkOption.isSimulatedTPM);
        azDpsClient.azClientConnection(brokerConfiguration.h, brokerConfiguration.id, function (response) {
            if(response.status) {
                var result = {
                    status: true,
                    data: response.data,
                    message: "Connection Established"
                }
                cb(result);
            } else {
                var result = {
                    status: false,
                    data: null,
                    message: "Device broker information not found"
                }
                cb(result);
            }
        })
    } catch (error) {
        var result = {
            status: false,
            data: error,
            message: "There is issue in broker information."
        }
        cb(result);0
    }

    // var cacheId = cpId+"_"+uniqueId;
    // var deviceSyncRes = cache.get(cacheId);
    // var authType = deviceSyncRes.at;
    // var brokerConfiguration = deviceSyncRes.p;
    // var protocoalName = brokerConfiguration.n;
    // var host = brokerConfiguration.h; //"demohub.azure-devices.net";
    // var mqttUrl = 'mqtts://' + host;
    // if (authType == config.authType.KEY) {
    //     try {
    //         if (brokerConfiguration) {
    //             manageDebugLog("INFO_IN05", uniqueId, cpId, "", 1, isDebug);
    //             var mqttOption = {
    //                 clientId: brokerConfiguration.id, //"520uta-sdk003",
    //                 port: brokerConfiguration.p, //8883,
    //                 username: brokerConfiguration.un, //"demohub.azure-devices.net/520uta-sdk003",
    //                 password: brokerConfiguration.pwd, //"HostName=demohub.azure-devices.net;DeviceId=520uta-sdk003;SharedAccessSignature=SharedAccessSignature sr=demohub.azure-devices.net%2Fdevices%2F520uta-sdk003&sig=9ckd1upGemFSHYkWnaxWiKqh7CsQhsjY%2F49KM42Na3Y%3D&se=1518083719",
    //                 rejectUnauthorized: false,
    //                 // rejectUnauthorized: true,
    //                 reconnecting: true,
    //                 reconnectPeriod: 25000,
    //                 // pingTimer: 10
    //             };
    //             try {
    //                 var mqttClient = mqtt.connect(mqttUrl, mqttOption);
    //                 mqttClient.on('close', function () {
    //                     manageDebugLog("ERR_IN14", uniqueId, cpId, "", 0, isDebug);
    //                     var deviceCommandAck = {
    //                         cpid: cpId,
    //                         guid: '',
    //                         uniqueId: uniqueId,
    //                         command: false,
    //                         ack: false,
    //                         ackId: '',
    //                         cmdType: config.commandType.DEVICE_CONNECTION_STATUS
    //                     }
    //                     manageDebugLog("INFO_IN03", uniqueId, cpId, "", 1, isDebug);
    //                     GLOBAL_CALLBACK(deviceCommandAck);
    //                 })
    //                 var result = {
    //                     status: true,
    //                     data: {
    //                         "mqttClient": mqttClient,
    //                         "mqttClientId": brokerConfiguration.id
    //                     },
    //                     message: "Connection Established"
    //                 }
    //             } catch (error) {
    //                 manageDebugLog("ERR_IN13", uniqueId, cpId, "", 0, isDebug);
    //                 manageDebugLog("ERR_IN01", uniqueId, cpId, error.message, 0, isDebug);
    //                 var result = {
    //                     status: false,
    //                     data: {
    //                         "mqttClient": null,
    //                         "mqttClientId": null
    //                     },
    //                     message: error.message
    //                 }
    //             }
    //             cb(result);
    //         } else {
    //             manageDebugLog("ERR_IN11", uniqueId, cpId, "", 0, isDebug);
    //             var result = {
    //                 status: false,
    //                 data: null,
    //                 message: "Device broker information not found"
    //             }
    //             cb(result);
    //         }
    //     } catch (e) {
    //         manageDebugLog("ERR_IN01", uniqueId, cpId, e.message, 0, isDebug);
    //         var result = {
    //             status: false,
    //             data: e,
    //             message: "There is issue in broker information."
    //         }
    //         cb(result);
    //     }
    // } else if (authType == config.authType.CA_SIGNED) {
    //     try {
    //         if (brokerConfiguration) {
    //             manageDebugLog("INFO_IN05", uniqueId, cpId, "", 1, isDebug);
    //             var mqttOption = {
    //                 clientId: brokerConfiguration.id,
    //                 port: brokerConfiguration.p, //8883,
    //                 username: brokerConfiguration.un,
    //                 key: fs.readFileSync(sdkOption.certificate.SSLKeyPath),
    //                 cert: fs.readFileSync(sdkOption.certificate.SSLCertPath),
    //                 // ca: fs.readFileSync(sdkOption.certificate.SSLCaPath),
    //                 rejectUnauthorized: true,
    //                 reconnecting: true
    //             };

    //             try {
    //                 var mqttClient = mqtt.connect(mqttUrl, mqttOption);
    //                 mqttClient.on('close', function () {
    //                     manageDebugLog("ERR_IN14", uniqueId, cpId, "", 0, isDebug);
    //                     var deviceCommandAck = {
    //                         cpid: cpId,
    //                         guid: '',
    //                         uniqueId: uniqueId,
    //                         command: false,
    //                         ack: false,
    //                         ackId: '',
    //                         cmdType: config.commandType.DEVICE_CONNECTION_STATUS
    //                     }
    //                     manageDebugLog("INFO_IN03", uniqueId, cpId, "", 1, isDebug);
    //                     GLOBAL_CALLBACK(deviceCommandAck);
    //                 })
    //                 var result = {
    //                     status: true,
    //                     data: {
    //                         "mqttClient": mqttClient,
    //                         "mqttClientId": brokerConfiguration.id
    //                     },
    //                     message: "Secure Connection Established"
    //                 }
    //             } catch (error) {
    //                 manageDebugLog("ERR_IN13", uniqueId, cpId, "", 0, isDebug);
    //                 manageDebugLog("ERR_IN01", uniqueId, cpId, error.message, 0, isDebug);
    //                 var result = {
    //                     status: false,
    //                     data: {
    //                         "mqttClient": null,
    //                         "mqttClientId": null
    //                     },
    //                     message: error.message
    //                 }
    //             }
    //             cb(result);
    //         } else {
    //             manageDebugLog("ERR_IN11", uniqueId, cpId, "", 0, isDebug);
    //             var result = {
    //                 status: false,
    //                 data: null,
    //                 message: "Device broker information not found"
    //             }
    //             cb(result);
    //         }
    //     } catch (e) {
    //         manageDebugLog("ERR_IN01", uniqueId, cpId, e.message, 0, isDebug);
    //         var result = {
    //             status: false,
    //             data: e,
    //             message: "Invalid certificate file."
    //         }
    //         cb(result);
    //     }
    // } else if (authType == config.authType.CA_SELF_SIGNED) {
    //     try {
    //         if (brokerConfiguration) {
    //             manageDebugLog("INFO_IN05", uniqueId, cpId, "", 1, isDebug);
    //             var mqttOption = {
    //                 clientId: brokerConfiguration.id,
    //                 port: brokerConfiguration.p, //8883,
    //                 username: brokerConfiguration.un,
    //                 key: fs.readFileSync(sdkOption.certificate.SSLKeyPath),
    //                 cert: fs.readFileSync(sdkOption.certificate.SSLCertPath),
    //                 rejectUnauthorized: true,
    //                 reconnecting: true
    //             };
    //             try {
    //                 var mqttClient = mqtt.connect(mqttUrl, mqttOption);
    //                 mqttClient.on('close', function () {
    //                     manageDebugLog("ERR_IN14", uniqueId, cpId, "", 0, isDebug);
    //                     var deviceCommandAck = {
    //                         cpid: cpId,
    //                         guid: '',
    //                         uniqueId: uniqueId,
    //                         command: false,
    //                         ack: false,
    //                         ackId: '',
    //                         cmdType: config.commandType.DEVICE_CONNECTION_STATUS
    //                     }
    //                     manageDebugLog("INFO_IN03", uniqueId, cpId, "", 1, isDebug);
    //                     GLOBAL_CALLBACK(deviceCommandAck);
    //                 })
    //                 var result = {
    //                     status: true,
    //                     data: {
    //                         "mqttClient": mqttClient,
    //                         "mqttClientId": brokerConfiguration.id
    //                     },
    //                     message: "Secure Connection Established"
    //                 }
    //             } catch (error) {
    //                 var result = {
    //                     status: false,
    //                     data: {
    //                         "mqttClient": null,
    //                         "mqttClientId": null
    //                     },
    //                     message: error.message
    //                 }
    //                 manageDebugLog("ERR_IN13", uniqueId, cpId, "", 0, isDebug);
    //                 manageDebugLog("ERR_IN01", uniqueId, cpId, error.message, 0, isDebug);
    //             }
    //             cb(result);
    //         } else {
    //             manageDebugLog("ERR_IN11", uniqueId, cpId, "", 0, isDebug);
    //             var result = {
    //                 status: false,
    //                 data: null,
    //                 message: "Device broker information not found"
    //             }
    //             cb(result);
    //         }
    //     } catch (e) {
    //         manageDebugLog("ERR_IN01", uniqueId, cpId, e.message, 0, isDebug);
    //         var result = {
    //             status: false,
    //             data: e,
    //             message: "Invalid certificate file."
    //         }
    //         cb(result);
    //     }
    // }
}

var startCommandSubsriber = function startCommandSubsriber(uniqueId, clientData, deviceConnectionStatus, offlineFileConfig, cpId, isDebug, isTpmDevice, cb) {
    var cacheId = cpId+"_"+uniqueId;
    var deviceSyncRes = cache.get(cacheId);
    var brokerConfiguration = deviceSyncRes.p;
    var duniqueid = deviceSyncRes.id;
    try {
        if (brokerConfiguration) {
            var mqttClient = clientData;
            var mqttClientId = brokerConfiguration.id;
            try {
                mqttSubscribeData(mqttClient, brokerConfiguration.sub, duniqueid, mqttClientId, brokerConfiguration.pub, deviceConnectionStatus, offlineFileConfig, cpId, isDebug, function (response) {
                    if('status' in response){
                        cb(response);
                    } else {
                        var uniqueIdFromCtoDCommand = response.data.uniqueId;
                        var resultDevice = jsonQuery('d[*id=' + uniqueIdFromCtoDCommand + ']', {
                            data: deviceSyncRes
                        });
                        if (resultDevice.value.length > 0) {
                            cb({
                                status: true,
                                data: response,
                                message: "Command get successfully."
                            })
                        } else {
                            cb({
                                status: false,
                                data: [],
                                message: "Message from unknown device. Kindly check the process..!"
                            })
                        }
                    }
                });
            } catch (error) {
                cb({
                    status: false,
                    data: error,
                    message: error.message
                })
            }
        } else {
            cb({
                status: false,
                data: brokerConfiguration,
                message: "Device Protocol information not found."
            })
        }
    } catch (e) {
        manageDebugLog("ERR_SD01", uniqueId, cpId, e.message, 0, isDebug);
        cb({
            status: false,
            data: e.message,
            message: "MQTT connection error"
        })
    }
}

/*
   Module : Offline data 
   Author : Mayank [SOFTWEB]
   Inputs : uniqueId
   Output : check simulator health
   Date   : 2019-05-17
*/
var startHeartBeat = function startHeartBeat(uniqueId, cpId) {
    var cacheId = cpId+"_"+uniqueId;
    var deviceSyncRes = cache.get(cacheId);
    if (deviceSyncRes.sc) {
        var sdkConfig = deviceSyncRes.sc;
        if (intervalValue != '') {
            clearInterval(intervalValue);
        }
        if (sdkConfig.hb && sdkConfig.hb != null) {
            try {
                var pingFrequency = sdkConfig.hb.fq * 1000;
                var brokerConfiguration = deviceSyncRes.p;
                var protocoalName = brokerConfiguration.n;
                var host = sdkConfig.hb.h; //"demohub.azure-devices.net";
                var mqttUrl = 'mqtts://' + host;
                var mqttOption = {
                    port: 8883, //8883,
                    username: sdkConfig.hb.un, //"demohub.azure-devices.net/520uta-sdk003",
                    password: sdkConfig.hb.pwd, //"HostName=demohub.azure-devices.net;DeviceId=520uta-sdk003;SharedAccessSignature=SharedAccessSignature sr=demohub.azure-devices.net%2Fdevices%2F520uta-sdk003&sig=9ckd1upGemFSHYkWnaxWiKqh7CsQhsjY%2F49KM42Na3Y%3D&se=1518083719",
                    rejectUnauthorized: true
                };
                var v = 0;
                intervalValue = setInterval(function () {
                    v++;
                    var offlineData = {
                        "data": {}
                    }
                }, pingFrequency);
            } catch (error) {
                console.log("HB Error : ", error);
            }
        } else {
            console.log("HB :: Data missing");
        }
    } else {
        console.log("SDKCONFIG :: Data missing");
    }
}

var getAttributes = function getAttributes(deviceUniqueId, cpId, callback) {
    var cacheId = cpId+"_"+deviceUniqueId;
    var deviceSyncRes = cache.get(cacheId);
    var deviceData = deviceSyncRes;
    var newAttributeObj = _.cloneDeep(deviceData.att);
    var newDeviceObj = _.cloneDeep(deviceData.d);
    var isEdgeDevice = false;
    var isGatewayDevice = false;
    if(deviceData.ee) {
        isEdgeDevice = true
    } else {
        isEdgeDevice = false
    }
    async.series([
        function (cb_series) {
            try {
                async.forEachSeries(newDeviceObj, function (devices, mainDevices_cb) {
                    if(devices.tg != "") {
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
                    if(!isEdgeDevice){
                        delete attributes.tw;
                        delete attributes.agt;
                    }
                    async.forEachSeries(attributes.d, function (data, data_cb) {
                        if(!isEdgeDevice){
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
        var resultData = {
            "attribute": newAttributeObj,
            "device": newDeviceObj
        }
        callback({
            status: true,
            data: resultData,
            message: "Data sync successfully."
        })
    })
}

var syncDeviceOnDemand = function syncDeviceOnDemand(cpid, env, uniqueId, requestedParams, cmdType, intervalObj, discoveryBaseUrl, isDebug, cb) {
    if (cmdType == config.commandType.ATTRIBUTE_INFO_UPDATE) {
        var cnt = 0;
        async.forEachSeries(intervalObj, function (interval, data_cb) {
            cnt++;
            var x = Object.keys(interval);
            var key = x[0];
            clearInterval(interval[key]);
            delete interval[key];
            data_cb();
        }, function () {
            try {
                syncDeviceByParam(cpid, env, uniqueId, requestedParams, discoveryBaseUrl, isDebug, function (response) {
                    if (response.status) {
                        var cacheId = cpid+"_"+uniqueId;
                        var syncInfo = cache.get(cacheId);
                        if (cmdType == config.commandType.ATTRIBUTE_INFO_UPDATE) {
                            syncInfo.att = response.data.att;
                        }
                        cb({
                            status: true,
                            data: [],
                            message: response.message
                        })
                    } else {
                        cb({
                            status: false,
                            data: [],
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
            syncDeviceByParam(cpid, env, uniqueId, requestedParams, discoveryBaseUrl, isDebug, function (response) {
                if (response.status) {
                    var cacheId = cpid+"_"+uniqueId;
                    var syncInfo = cache.get(cacheId);
                    if (cmdType == config.commandType.SETTING_INFO_UPDATE) {
                        syncInfo.set = response.data.set;
                    } else if (cmdType == config.commandType.PASSWORD_INFO_UPDATE) {
                        syncInfo.p = response.data.p;
                    } else if (cmdType == config.commandType.DEVICE_INFO_UPDATE) {
                        syncInfo.d = response.data.d;
                    } else if (cmdType == config.commandType.RULE_INFO_UPDATE) {
                        syncInfo.r = response.data.r;
                    }
                    cb({
                        status: true,
                        data: [],
                        message: response.message
                    })
                } else {
                    cb({
                        status: false,
                        data: [],
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

var subscriberProcess = function subscriberProcess(cpid, uniqueId, clientData, deviceConnectionStatus, offlineFileConfig, isDebug, isTpmDevice, callback) {
    startCommandSubsriber(uniqueId, clientData, deviceConnectionStatus, offlineFileConfig, cpid, isDebug, isTpmDevice, function (response) {
        callback(response);
    });
}

var UpdateTwin = function UpdateTwin(obj, uniqueId, brokerClient, offlineFileConfig, isDebug, cpId, callback) {
    try {
        if(obj) {
            azDpsClient.azUpdateTwinProperty(obj, function (response) {
                callback(response)
            });
        } else {
            callback({
                status: true,
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
 * send command ack
 * @author : MK
 * send command ack
 * @param: 
 */
var sendCommandAck = function sendCommandAck(objdata, mt, deviceUniqueId, cpId, env, brokerClient, offlineFileConfig, isDebug, callback) {
    try {
        var obj = {
            "uniqueId": deviceUniqueId,
            "d": objdata,
            "cpId": cpId,
            "t": new Date(),
            "mt": mt,
            "sdk": {
                "l": config.sdkLanguage,
                "v": config.sdkVersion,
                "e": env
            }
        }
        sendDataOnAzureMQTT(obj, deviceUniqueId, brokerClient, offlineFileConfig, isDebug, cpId)
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
 * send command ack
 * @author : MK
 * send command ack
 * @param: 
 */
var getAllTwins = function getAllTwins(brokerClient, uniqueId, cpId, callback) {
    try {
        azDpsClient.azGetTwinProperty(uniqueId, cpId, function (response) {
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

var writeLogFile = function writeFile(path, data) {
    try {
        fs.writeFileSync(path, data, {flag:'a+'});   //'a+' is append mode 
    } catch (error) {
        console.log("Error log file write : ");
    }
}

var manageDebugLog = function manageDebugLog(code, uniqueId, cpId, message, logFlag, isDebugEnabled) {
    try {
        if(isDebugEnabled && code) {
            if(!logFlag && message == "") {
                message = config.errorLog[code];
            } else {
                if(message == ""){
                    message = config.infoLog[code];
                }
            }
            let logText = "\n["+code+"] "+new Date().toUTCString()+" ["+cpId+"_"+uniqueId+"] : "+message;
            let logConsoleText = "["+code+"] "+new Date().toUTCString()+" ["+cpId+"_"+uniqueId+"] : "+message;
            console.log(logConsoleText);
            var debugPathBasUrl = "./logs/debug/";
            let debugErrorLogPath = debugPathBasUrl+ "error.txt"; 
            let debugInfoLogPath = debugPathBasUrl+ "info.txt";
            
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
                    if(!logFlag) { // ERR Log
                        fs.access(debugErrorLogPath, fs.constants.F_OK | fs.constants.W_OK, (err) => {
                            if (err) {
                                if(err.code === 'ENOENT' && !logFlag) {
                                    writeLogFile(debugErrorLogPath, logText);
                                    // fs.writeFileSync(debugErrorLogPath, " ",{flag:'a+'});   //'a+' is append mode 
                                } else {
                                    // console.log(debugErrorLogPath + "File has ready only access");
                                }
                            } else {
                            //    console.log(`${debugErrorLogPath} exists, and it is writable`);
                               writeLogFile(debugErrorLogPath, logText);
                            }
                            cb_series();
                        });
                    } else if(logFlag) { // INFO Log
                        fs.access(debugInfoLogPath, fs.constants.F_OK | fs.constants.W_OK, (err) => {
                            if (err) {
                                if(err.code === 'ENOENT' && logFlag) {
                                    writeLogFile(debugInfoLogPath, logText);
                                    // fs.writeFileSync(debugInfoLogPath, " ",{flag:'a+'});   //'a+' is append mode 
                                } else {
                                    // console.log(debugInfoLogPath + "File has ready only access");
                                }
                            } else {
                                // console.log(`${debugInfoLogPath} exists, and it is writable`);
                                writeLogFile(debugInfoLogPath, logText);
                            }
                            cb_series();
                        });
                    } else {
                        cb_series();
                    }
                }
            ], function (err, response) {
                // console.log("Log process done...");
                // console.log("===================================");
            });
        }
    } catch (error) {
        console.log("Log process error : ", error);
    }
};



/* 
 * send command ack
 * @author : MK
 * send command ack
 * @param: 
 */
var tpmDeviceEnrollment = function tpmDeviceEnrollment(cpId, uniqueId, scopeId, sdkOption, callback) {
    try {
        if(!azDpsClient) 
            azDpsClient = new azureDps(cpId+'-'+uniqueId, sdkOption.isSimulatedTPM);
        azDpsClient.deviceEnrollment(cpId, uniqueId, scopeId, function (response) {
            callback(response);
        } );
    } catch (error) {
        callback({
            status: false,
            data: error,
            message: error.message
        })
    }
}

/* 
 * Disconnect client device connection
 * @author : MK
 * Disconnct devise
 * @param: 
 */
var disconnectDevice = function disconnectDevice(callback) {
    try {
        azDpsClient.azDisconnect(function (response) {
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

module.exports = {
    syncDevice: syncDevice,
    SendDataToHub: SendDataToHub,
    startHeartBeat: startHeartBeat,
    setEdgeConfiguration: setEdgeConfiguration,
    setIntervalForEdgeDevice: setIntervalForEdgeDevice,
    setRuleaConfiguration: setRuleaConfiguration,
    startCommandSubsriber: startCommandSubsriber,
    clientConnection: clientConnection,
    syncDeviceOnDemand: syncDeviceOnDemand,
    getAttributes: getAttributes,
    subscriberProcess: subscriberProcess,
    UpdateTwin: UpdateTwin,
    sendCommandAck: sendCommandAck,
    deleteAllLogFile: deleteAllLogFile,
    getAllTwins: getAllTwins,
    manageDebugLog: manageDebugLog,
    tpmDeviceEnrollment: tpmDeviceEnrollment,
    disconnectDevice: disconnectDevice
}