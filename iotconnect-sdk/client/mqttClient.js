
var config = require('../config/config');
var mqtt = require('mqtt');
var cache = require('memory-cache');
var _ = require('lodash');

class MqttClient {
    
    constructor(sId, uniqueId, sdkOption){
        this.clientConnectionConfiguration = ""; 
        this.mqttClient = ""; 
        this.clientConnectionStatus = false;
        this.SID = sId;
        this.UNIQUEID = uniqueId;
        this.CONNCALLBACK = uniqueId;
        this.connectionError = false;
        this.connectionErrorMessage = "";
    }

    /* 
    * MQTT SDK client
    * @author : MK
    * Create client connection
    * @param: mqttUrl, mqttOption
    */
    clientConnection(conObj, callback) {
        var mqttUrl = conObj.mqttUrl;
        var mqttOption = conObj.mqttOption;
        // console.log("MqttClient -> clientConnection -> mqttOption", mqttUrl)
        var self = this;
        try {
            // console.log("else =====", self.mqttClient);
            // if(self.mqttClient){
            //     self.mqttClient.end();
            // } else {
            //     console.log("else =====", mqttUrl);
            // }

            self.mqttClient = mqtt.connect(mqttUrl, mqttOption);

            callback({
                status: true,
                data: [],
                message: "Device connection process initiated"
            })
        } catch (error) {
            // console.log("MqttClient -> clientConnection -> error", error)
            callback({
                status: false,
                data: error,
                message: error.message
            })
        }
    }

    /* 
    * Azure TPM SDK
    * @author : MK
    * Subscribe the command and twin messages
    * @param: uniqueId, sId
    */
    subscribeData(callback) {
        var self = this;
        var cacheId = self.SID+"_"+self.UNIQUEID;
        var deviceSyncRes = cache.get(cacheId);
        var twinPropertySubTopic = config.twinPropertySubTopic;
        var twinResponseSubTopic = config.twinResponseSubTopic;
        var brokerConfiguration = deviceSyncRes.p;
        var deviceSubTopic = brokerConfiguration.topics.c2d;
        var connectionCnt = 0;
        try {

            self.mqttClient.on('connect', function () {
                self.mqttClient.subscribe(deviceSubTopic);
                self.mqttClient.subscribe(twinPropertySubTopic);
                self.mqttClient.subscribe(twinResponseSubTopic);
                
                // setTimeout(() => {
                //     var d = { 
                //         "ct": 112,
                //         "v": 2.1,
                //         "debugFlag": false
                //     }
                //     callback({
                //         status: true,
                //         data: {
                //             "cmdReceiveType"  : "cmd",
                //             "connectionCnt" : connectionCnt,
                //             "data" : d
                //         },
                //         message: "Debug flag"
                //     })
                // }, 50000);

                // setTimeout(() => {
                //     var d = { 
                //         "ct": 112,
                //         "v": 2.1,
                //         "debugFlag": true
                //     }
                //     callback({
                //         status: true,
                //         data: {
                //             "cmdReceiveType"  : "cmd",
                //             "connectionCnt" : connectionCnt,
                //             "data" : d
                //         },
                //         message: "Debug flag"
                //     })
                // }, 150000);
                
                // setTimeout(() => {
                //     var d = { 
                //         "ct": 113,
                //         "v": 2.1,
                //         "skipValidation": true
                //     }
                //     callback({
                //         status: true,
                //         data: {
                //             "cmdReceiveType"  : "cmd",
                //             "connectionCnt" : connectionCnt,
                //             "data" : d
                //         },
                //         message: "Skip data validation"
                //     })
                // }, 300000);
                
                // setTimeout(() => {
                //     var d = { 
                //         "ct": 114,
                //         "v": 2.1,
                //         "skipValidation": false
                //     }
                //     callback({
                //         status: true,
                //         data: {
                //             "cmdReceiveType"  : "cmd",
                //             "connectionCnt" : connectionCnt,
                //             "data" : d
                //         },
                //         message: "Skip data validation"
                //     })
                // }, 50000);

                // setTimeout(() => {
                //     var d = { 
                //         "ct": 115,
                //         "v": 2.1,
                //         "skipValidation": false
                //     }
                //     callback({
                //         status: true,
                //         data: {
                //             "cmdReceiveType"  : "cmd",
                //             "connectionCnt" : connectionCnt,
                //             "data" : d
                //         },
                //         message: "Skip data validation"
                //     })
                // }, 50000);

                self.connectionError = false;
                var deviceCommandAck = {
                    ct: config.commandType.DEVICE_CONNECTION_STATUS,
                    uniqueId: self.UNIQUEID,
                    sid: self.SID,
                    command: true
                }

                callback({
                    status: true,
                    data: {
                        "cmdReceiveType"  : "cmd",
                        "connectionCnt" : connectionCnt,
                        "data" : deviceCommandAck
                    },
                    message: "Device connected"
                })
                connectionCnt++;
            })
            
            self.mqttClient.on("message", function (topic, payload) {
                // console.log("new command :::::::::::::::::::: ", JSON.stringify(JSON.parse(payload)) );
                if (topic.indexOf(twinPropertySubTopic.substring(0, twinPropertySubTopic.length - 1)) != -1) {
                    if(payload.toString('utf-8')) {
                        var twinData = {};
                        twinData['desired'] = JSON.parse(payload);
                        twinData["uniqueId"] = self.UNIQUEID;
                        callback({
                            status: true,
                            data: {
                                "cmdReceiveType"  : "twin",
                                "data" : twinData
                            },
                            message: "Desired twin message received"
                        })
                    }
                } else if (topic.indexOf(twinResponseSubTopic.substring(0, twinResponseSubTopic.length - 1)) != -1) {
                    if(payload.toString('utf-8')) {
                        var twinData = JSON.parse(payload);
                        twinData["uniqueId"] = self.UNIQUEID;
                        callback({
                            status: true,
                            data: {
                                "cmdReceiveType"  : "twin",
                                "data" : twinData
                            },
                            message: "All twin message received"
                        })
                    }
                } else {
                    callback({
                        status: true,
                        data: {
                            "cmdReceiveType"  : "cmd",
                            "connectionCnt" : connectionCnt,
                            "data" : JSON.parse(payload)
                        },
                        message: "Device command"
                    })
                }
            })

            self.mqttClient.on('error', function (err) {
                // console.log("Erro => ", err.message);
                self.connectionError = true;
                self.connectionErrorMessage = err.message;
            });

            self.mqttClient.on('close', function () {

                var deviceCommandAck = {
                    ct: config.commandType.DEVICE_CONNECTION_STATUS,
                    uniqueId: self.UNIQUEID,
                    sid: self.SID,
                    command: false
                }
                if(self.connectionError && self.connectionErrorMessage ) {
                    var msg = self.connectionErrorMessage
                } else {
                    var msg = "Device disconnected";
                }
                callback({
                    status: false,
                    data: {
                        "cmdReceiveType"  : "cmd",
                        "connectionCnt" : connectionCnt,
                        "data" : deviceCommandAck
                    },
                    message: msg
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
    * Azure TPM SDK
    * @author : MK
    * Publish the message on cloud
    * @param: sensorData, uniqueId, cpId
    */
    messagePublish(sensorData, callback) {
        try {
            // console.log("Data 0 publish ==> ", JSON.stringify(sensorData));
            var self = this;
            var pubTopic = sensorData.pubTopic;

            // Temp comment to check for pub topic
            if(sensorData.pubTopic)
                delete sensorData.pubTopic;
            
            if(sensorData.mt || sensorData.mt == 0){
                if(!_.includes([200, 201, 202, 203, 204, 205, 210, 221, 222], sensorData.mt))
                    delete sensorData.mt;

                if("sid" in sensorData && sensorData.mt != config.msgType.all)
                    delete sensorData.sid; // Temp Data
            } 
            if(!sensorData.sid && sensorData.cd){
                delete sensorData.cd;
            }
            
            if(sensorData.twin == "all"){
                sensorData = {};
            }

            //console.log("Data 1 publish ==> ", JSON.stringify(sensorData));
            self.mqttClient.publish(pubTopic, JSON.stringify(sensorData));
            callback({
                status: true,
                data: [],
                message: "Message published successfully"
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
    * Disconnect
    * @author : MK
    * Disconnect the device
    * @param:
    */
    disconnect(callback) {
        var self = this;
        try {
            self.mqttClient.end();
            callback({
                status: true,
                data: [],
                message: config.infoLog.INFO_IN03
            })
        } catch (error) {
            callback({
                status: false,
                data: error,
                message: error.message
            })
        }
    }

}

module.exports = MqttClient;