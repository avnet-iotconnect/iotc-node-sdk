var config = require("../config/config");
var mqtt = require("mqtt");
var cache = require("memory-cache");
var _ = require("lodash");

class MqttClient {
    constructor(sId, uniqueId, sdkOption) {
        this.clientConnectionConfiguration = "";
        this.mqttClient = "";
        this.clientConnectionStatus = false;
        this.SID = sId;
        this.UNIQUEID = uniqueId;
        this.clientId = "";
        this.CONNCALLBACK = uniqueId;
        this.connectionError = false;
        this.connectionErrorMessage = "";
        this.sdkOption = sdkOption;
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
        var self = this;

        try {
            self.clientId = mqttOption.clientId;
            self.mqttClient = mqtt.connect(mqttUrl, mqttOption);

            callback({
                status: true,
                data: [],
                message: "Device connection process initiated",
            });
        } catch (error) {
            callback({
                status: false,
                data: error,
                message: error.message,
            });
        }
    }

    /*
     *
     * @author : MK
     * Subscribe the command and twin messages
     * @param: uniqueId, sId
     */
    subscribeData(callback) {
        var self = this;
        var cacheId = self.SID + "_" + self.UNIQUEID;
        var deviceSyncRes = cache.get(cacheId);
        var twinPropertySubTopic = config[self.sdkOption.pf]?.twinPropertySubTopic;
        var twinResponseSubTopic = config[self.sdkOption.pf]?.twinResponseSubTopic;
        var brokerConfiguration = deviceSyncRes.p;
        var deviceSubTopic = brokerConfiguration.topics.c2d;
        var connectionCnt = 0;

        if (self.sdkOption.pf === "aws") {
            twinPropertySubTopic = deviceSyncRes.p.topics.set.sub;
            twinResponseSubTopic = deviceSyncRes.p.topics.set.subForAll;
        }

        try {
            self.mqttClient.on("connect", function () {
                self.mqttClient.subscribe(deviceSubTopic);
                self.mqttClient.subscribe(twinPropertySubTopic);
                self.mqttClient.subscribe(twinResponseSubTopic);

                self.connectionError = false;
                var deviceCommandAck = {
                    ct: config.commandType.DEVICE_CONNECTION_STATUS,
                    uniqueId: self.UNIQUEID,
                    sid: self.SID,
                    command: true,
                };

                callback({
                    status: true,
                    data: {
                        cmdReceiveType: "cmd",
                        connectionCnt: connectionCnt,
                        data: deviceCommandAck,
                    },
                    message: "Device connected",
                });
                connectionCnt++;
            });

            self.mqttClient.on("message", function (topic, payload) {
                console.log("\x1b[42m %s %s\x1b[0m", topic, JSON.stringify(JSON.parse(payload), null, 2));
                if (topic.indexOf(twinPropertySubTopic.substring(0, twinPropertySubTopic.length - 1)) != -1) {
                    if (payload.toString("utf-8")) {
                        var twinData = {};
                        twinData["desired"] = JSON.parse(payload);
                        twinData["uniqueId"] = self.UNIQUEID;
                        callback({
                            status: true,
                            data: {
                                cmdReceiveType: "twin",
                                data: twinData,
                            },
                            message: "Desired twin message received",
                        });
                    }
                } else if (topic.indexOf(twinResponseSubTopic.substring(0, twinResponseSubTopic.length - 1)) != -1) {
                    if (payload.toString("utf-8")) {
                        var twinData = JSON.parse(payload);
                        twinData["uniqueId"] = self.UNIQUEID;
                        callback({
                            status: true,
                            data: {
                                cmdReceiveType: "twin",
                                data: twinData,
                            },
                            message: "All twin message received",
                        });
                    }
                } else {
                    callback({
                        status: true,
                        data: {
                            cmdReceiveType: "cmd",
                            connectionCnt: connectionCnt,
                            data: JSON.parse(payload),
                        },
                        message: "Device command",
                    });
                }
            });

            self.mqttClient.on("error", function (err) {
                self.connectionError = true;
                self.connectionErrorMessage = err.message;
            });            

            self.mqttClient.on("close", function (err) {
                var deviceCommandAck = {
                    ct: config.commandType.DEVICE_CONNECTION_STATUS,
                    uniqueId: self.UNIQUEID,
                    sid: self.SID,
                    command: false,
                };
                if (self.connectionError && self.connectionErrorMessage) {
                    var msg = self.connectionErrorMessage;
                } else {
                    var msg = "Device disconnected";
                }
                callback({
                    status: false,
                    data: {
                        cmdReceiveType: "cmd",
                        connectionCnt: connectionCnt,
                        data: deviceCommandAck,
                    },
                    message: msg,
                });
            });
        } catch (error) {
            callback({
                status: false,
                data: error,
                message: error.message,
            });
        }
    }

    /*
     *
     * @author : MK
     * Publish the message on cloud
     * @param: sensorData, uniqueId, cpId
     */
    messagePublish(sensorData, callback) {
        try {
            var self = this;
            var pubTopic = sensorData.pubTopic;
            var isTwin = false;

            // Temp comment to check for pub topic
            let message = "";
            if (sensorData.pubTopic)
                if (sensorData.pubTopic.includes("twin") || sensorData.pubTopic.includes("shadow")) {
                    isTwin = true;
                    if (self.sdkOption.pf === "aws") {
                        message = "Shadow Updated Successfully";
                    } else {
                        message = "Twin Updated Successfully";
                    }
                }
            delete sensorData.pubTopic;

            if (sensorData.mt || sensorData.mt == 0) {
                if (!_.includes([200, 201, 202, 203, 204, 205, 210, 221, 222], sensorData.mt)) delete sensorData.mt;

                if ("sid" in sensorData && sensorData.mt != config.msgType.all) delete sensorData.sid; // Temp Data
            }
            if (!sensorData.sid && sensorData.cd) {
                delete sensorData.cd;
            }

            if (sensorData.twin == "all") {
                sensorData = {};
            }
            self.mqttClient.publish(pubTopic, JSON.stringify(sensorData));
            callback({
                status: true,
                data: [],
                message: isTwin == true ? message : "Message published successfully",
            });
        } catch (error) {
            callback({
                status: false,
                data: error,
                message: error.message,
            });
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
                message: config.infoLog.INFO_IN03,
            });
        } catch (error) {
            callback({
                status: false,
                data: error,
                message: error.message,
            });
        }
    }
}

module.exports = MqttClient;
