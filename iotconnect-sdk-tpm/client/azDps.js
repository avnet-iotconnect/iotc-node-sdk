
var config = require('../config/config');
var ProvisioningTransport = require('azure-iot-provisioning-device-http').Http;
var Protocol = require('azure-iot-device-mqtt').Mqtt;
var Client = require('azure-iot-device').Client;
var Message = require('azure-iot-device').Message;
var tpmSecurity = require('azure-iot-security-tpm');
var ProvisioningDeviceClient = require('azure-iot-provisioning-device').ProvisioningDeviceClient;
var tssJs = require("tss.js");

class AzureClient {
    
    constructor(registrationId, isSimulatedTPM){
        if(isSimulatedTPM) {
            // For Simulator
            this.securityClient = new tpmSecurity.TpmSecurityClient(registrationId, new tssJs.Tpm(true)); 
        } else {
            // For Production if using non-simulated device, replace the above line with following:
            this.securityClient = new tpmSecurity.TpmSecurityClient(); // Production
        }
        this.clientConnectionConfiguration = ""; 
        this.clientConnection = ""; 
        this.clientConnectionStatus = false;
        this.twinProperty = "";
        this.registrationId = registrationId;
        this.isSimulatedTPM = isSimulatedTPM;
    }

    /* 
    * Azure TPM SDK
    * @author : MK
    * Enroll the device from DPS to IoThub
    * @param: 
    */
    deviceEnrollment(cpId, uniqueId, scopeId, callback){
        try {
            var self = this;
            var provisioningHost = config.dpsHostUrl;
            var idScope = scopeId;
            var deviceRegId = cpId+"-"+uniqueId;
            
            try {
                var provisioningClient = ProvisioningDeviceClient.create(provisioningHost, idScope, new ProvisioningTransport(), self.securityClient);
                if(!self.isSimulatedTPM) {
                    provisioningClient._securityClient._registrationId = self.registrationId;
                }
                provisioningClient.register(function(err, result) {
                    if (err) {
                        callback({
                            status: false,
                            data: null,
                            message: "Device enrollment failed : "+ err.message
                        })
                    } else {
                        callback({
                            status: true,
                            data: null,
                            message: config.infoLog.INFO_IN16
                        })
                    }
                });
            } catch (error) {
                callback({
                    status: false,
                    data: null,
                    message: error.message
                })
            }
        } catch (error) {
            callback({
                status: false,
                data: null,
                message: error.message
            })
        }
    }

    /* 
    * Azure TPM SDK
    * @author : MK
    * Create client connection
    * @param: 
    */
    azClientConnection(iotHubHost, deviceRegId, callback) {
        var self = this;
        try {
            var tpmAuthenticationProvider = tpmSecurity.TpmAuthenticationProvider.fromTpmSecurityClient(deviceRegId, iotHubHost, self.securityClient);
            var clientAbc = Client.fromAuthenticationProvider(tpmAuthenticationProvider, Protocol);
            self.clientConnection = clientAbc;
            callback({
                status: true,
                data: clientAbc,
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
    azSubscribeData(uniqueId, cpId, callback) {
        try {
            var self = this;
            let twinCountCall = 0; 
            if (self.clientConnection) {
                self.clientConnection.on('connect', function (err) {
                    var deviceCommandAck = {
                        cmdType: config.commandType.DEVICE_CONNECTION_STATUS,
                        data: {
                            cpid: cpId,
                            guid: '',
                            uniqueId: uniqueId,
                            command: true,
                            ack: false,
                            ackId: '',
                            cmdType: config.commandType.DEVICE_CONNECTION_STATUS
                        }
                    }
                    callback(deviceCommandAck);
                });
                self.clientConnection.on('disconnect', function () {
                    self.clientConnection.removeAllListeners();
                    var deviceCommandAck = {
                        cmdType: config.commandType.DEVICE_CONNECTION_STATUS,
                        data: {
                            cpid: cpId,
                            guid: '',
                            uniqueId: uniqueId,
                            command: false,
                            ack: false,
                            ackId: '',
                            cmdType: config.commandType.DEVICE_CONNECTION_STATUS
                        }
                    }
                    callback(deviceCommandAck);
                });
                self.clientConnection.open(function (err) {
                    if (err) {
                        callback({
                            status: false,
                            data: null,
                            message: err.message
                        })
                    } else {
                        
                        self.clientConnection.on('message', function (msg) {
                            callback(JSON.parse(msg.data));
                        });
                        // self.clientConnection.on('error', function (err) {
                        //     console.error(err.message);
                        // });
                        self.clientConnection.getTwin(function (err, twin) {
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
                                    twinData["uniqueId"] = uniqueId;
                                    if(twinCountCall == 0){
                                        twinCountCall++;
                                    } else {
                                        GLOBAL_CALLBACK_TWIN(twinData);
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
    azMessagePublish(sensorData, uniqueId, cpId, callback) {
        try {
            var self = this;
            var message = new Message(JSON.stringify(sensorData));
            // console.log('Sending message: ' + message.getData());
            self.clientConnection.sendEvent(message, self.printResultFor('send', cpId + "_" + uniqueId));
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

    // Helper function to print results in the console
    printResultFor(op, id = "") {
        return function printResult(err, res) {
            if (err) {
                // console.log("\nPublishData ::: " + id + " ::  status :: ERROR - " + err.toString() + " :: ", new Date());
            }
            if (res) {
                if (op == 'send') {
                    // console.log("\nPublishData ::: " + id + " ::  status :: " + res.constructor.name + " :: ", new Date());
                } else if (op == 'completed') {
                    // console.log("\nReceivedData ::: " + id + " ::  status :: " + res.constructor.name + " :: ", new Date());
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
    azGetTwinProperty(uniqueId, cpId, callback) {
        try {
            var self = this;
            self.clientConnection.getTwin(function (err, twin) {
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
    azUpdateTwinProperty(patch, callback) {
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
    azDisconnect(callback) {
        try {
            var self = this;
            self.clientConnection.close(function (err){
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