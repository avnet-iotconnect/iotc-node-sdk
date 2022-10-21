
var config = require('../config/config');
var Protocol = require('azure-iot-device-mqtt').Mqtt;
var Client = require('azure-iot-device').Client;
var Message = require('azure-iot-device').Message;
var _ = require('lodash');

class AzureClient {
    
    constructor(sId, uniqueId, sdkOption){
        this.SID = sId;
        this.UNIQUEID = uniqueId;
        this.CONNECTION_STRING = sdkOption.CONNECTION_STRING;
        // console.log("CONNECTION_STRING =.> ", this.CONNECTION_STRING);
        this.azClient = ""
    }

    // connectCallback() {
    //     console.log('Client hello connected => ', new Date());
      
        
        // Create a message and send it to the IoT Hub every two seconds
        // sendInterval = setInterval(() => {
        //   const message = generateMessage();
        //   // console.log('Sending message: ' + message.getData());
        //   client.sendEvent(message, printResultFor('send'));
        // }, 10000);
      
    // }

    /* 
    * Azure TPM SDK
    * @author : MK
    * Create client connection
    * @param: 
    */
    clientConnection(callback) {
        var self = this;
        try {

            // console.log("Protocol => ", Client);
            self.azClient = Client.fromConnectionString(self.CONNECTION_STRING, Protocol);
            // Once network connection not vailable then raise the event disconnect and error after defined mili seconds
            // console.log("self.azClient => ", self.azClient._maxOperationTimeout);
            self.azClient._maxOperationTimeout = 30000; 
            // self.azClient.on('connect', self.connectCallback);
            callback({
                status: true,
                data: self.azClient,
                message: "Device Connected success fully"
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
    * Subscribe the command and twin messages
    * @param: uniqueId, cpId
    */
    subscribeData(callback) {
        try {
            var self = this;
            let twinCountCall = 0; 
            if (self.azClient) {
                // console.log("self.azClient => ", self.azClient._maxOperationTimeout);
                // self.azClient._maxOperationTimeout = 10000;
                // console.log("self.azClient => ", self.azClient);
                self.azClient.on('connect', function (err) {
                    console.log("Device connected => ", new Date());
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
                            "data" : deviceCommandAck
                        },
                        message: "Device connected"
                    })
                    // callback(deviceCommandAck);
                });
                self.azClient.on('disconnect', function () {
                    // self.azClient.removeAllListeners();
                    console.log("Device disconnected => ", new Date());
                    var deviceCommandAck = {
                        ct: config.commandType.DEVICE_CONNECTION_STATUS,
                        uniqueId: self.UNIQUEID,
                        sid: self.SID,
                        command: false
                        // cmdType: config.commandType.DEVICE_CONNECTION_STATUS,
                        // data: {
                        //     cpid: self.SID,
                        //     guid: '',
                        //     uniqueId: self.UNIQUEID,
                        //     command: false,
                        //     ack: false,
                        //     ackId: '',
                        //     cmdType: config.commandType.DEVICE_CONNECTION_STATUS
                        // }
                    }
                    // self.manageDebugLog("INFO_IN03", uniqueId, cpId, "", 1, isDebug);
                    callback({
                        status: true,
                        data: {
                            "cmdReceiveType"  : "cmd",
                            "data" : deviceCommandAck
                        },
                        message: "Device disconnected"
                    })
                });
                self.azClient.open(function (err) {
                    if (err) {
                        callback({
                            status: false,
                            data: null,
                            message: err.message
                        })
                    } else {
                        
                        self.azClient.on('message', function (msg) {
                            var a = JSON.parse(msg.data);
							console.log("Command received => ", JSON.stringify(a));
                            // console.log('Id: ' + msg.messageId + ' Body: ' , JSON.parse(msg.data));
                            callback({
                                status: true,
                                data: {
                                    "cmdReceiveType"  : "cmd",
                                    "data" : JSON.parse(msg.data)
                                },
                                message: "Device command"
                            })
                        });
                        // self.azClient.on('error', function (err) {
                        //     console.error(err.message);
                        // });
                        self.azClient.getTwin(function (err, twin) {
                            self.twinProperty = twin;
                            if (err) {
                                callback({
                                    status: false,
                                    data: err,
                                    message: err.message
                                })
                            } else {
                                twin.on('properties.desired', function(delta) {
                                    var twinData = {};
                                    twinData['desired'] = delta;
                                    twinData["uniqueId"] = self.UNIQUEID;
                                    if(twinCountCall == 0){
                                        twinCountCall++;
                                    } else {
                                        callback({
                                            status: true,
                                            data: {
                                                "cmdReceiveType"  : "twin",
                                                "data" : twinData
                                            },
                                            message: "All twin message received"
                                        })
                                        // GLOBAL_CALLBACK_TWIN(twinData);
                                    }
                                });
                            }
                        });
                    }
                });
            } else {
                callback({
                    status: false,
                    data: error,
                    message: config.errorLog.ERR_IN11
                })
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
    * Azure TPM SDK
    * @author : MK
    * Publish the message on cloud
    * @param: sensorData, uniqueId, cpId
    */
    messagePublish(sensorData, callback) {
        // console.log("AzureClient -> ============================ -> sensorData", sensorData)
        try {
            var self = this;
            var cd = "";
            var mt = "";
            if(sensorData){
                
                mt = sensorData.mt;
                if(sensorData.pubTopic)
                    delete sensorData.pubTopic;
                if(sensorData.mt || sensorData.mt == 0){
                    if(!_.includes([200, 201, 202, 203, 204, 205, 210, 221, 222], sensorData.mt))
                        delete sensorData.mt;
                    // if(sensorData.mt != 200)
                    if("sid" in sensorData && sensorData.mt != config.msgType.allStatus)
                        delete sensorData.sid; // Temp Data
                    if("v" in sensorData)
                        delete sensorData.v;
                }
                if("cd" in sensorData && sensorData.cd) {
                    cd = sensorData.cd;
                    delete sensorData.cd;
                }
                var message = new Message(JSON.stringify(sensorData));
            } 
            // var tmp = JSON.parse(message);
            if(cd) {
                message.properties.add("cd", cd );
            }
            if(_.includes([200, 201, 202, 203, 204, 205, 210, 221, 222], mt)){
                message.properties.add("di", 1 );
            } else {
                message.properties.add("mt", mt );
            }
            message.properties.add("v", config.sdkVersion );

            // message.properties.add("mt", sensorData.mt );
            console.log('Sending message: ' ,  message.getData() );
            console.log('Sending message: ' ,  JSON.stringify(message) );
            try {
				self.azClient.sendEvent(message, self.printResultFor('send', self.SID + "_" + self.UNIQUEID));
			} catch (error) {
				console.log("error -> ", error );				
			}
            callback({
                status: true,
                data: [],
                message: "Message published successfully"
            })
        } catch (error) {
            console.log("error -> ", error );				
            callback({
                status: false,
                data: error,
                message: error.message
            })
        }
    }

    // Helper function to print results in the console
    printResultFor(op, id = "") {
        return function printResult(err, res) {
            if (err) {
                // console.log("\nPublishData ::: " + id + " ::  status :: ERROR - " + err.toString() + " :: ", new Date());
            }
            if (res) {
                if (op == 'send') {
                    console.log("\nPublishData ::: " + id + " ::  status :: " + res.constructor.name + " :: ", new Date());
                } else if (op == 'completed') {
                    console.log("\nReceivedData ::: " + id + " ::  status :: " + res.constructor.name + " :: ", new Date());
                }
            }
        };
    }

    /* 
    * Azure TPM SDK
    * @author : MK
    * Get Twin desired property
    * @param: uniqueId, cpId
    */
    getTwinProperty(callback) {
        try {
            var self = this;
            self.azClient.getTwin(function (err, twin) {
                if (err) {
                    callback({
                        status: false,
                        data: err,
                        message: err.message
                    })
                } else {
                    callback({
                        status: true,
                        data: null,
                        message: "Twin message request sent"
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
    * Azure TPM SDK
    * @author : MK
    * Update Twin reported property
    * @param: data {key: value}
    */
    updateTwinProperty(patch, callback) {
        try {
            var self = this;
            var twin = self.twinProperty;
            twin.properties.reported.update(patch, function(err) {
                if (err) 
                {
                    callback({
                        status: false,
                        data: err,
                        message: err.message
                    })
                } else {
                    callback({
                        status: true,
                        data: [],
                        message: "Twin updated successfully"
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
    * Azure TPM SDK
    * @author : MK
    * Disconnect the device
    * @param:
    */
    disconnect(callback) {
        var self = this;
        try {
            console.log("In client => ");
            self.azClient.close(function (err){
                console.log("In client => ", err);
                if(err) {
                    callback({
                        status: false,
                        data: [],
                        message: err.message
                    })
                } else {
                    callback({
                        status: true,
                        data: [],
                        message: "Client disconnected successfully"
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

}

module.exports = AzureClient;