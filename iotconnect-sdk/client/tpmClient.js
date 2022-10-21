
var config = require('../config/config');
var ProvisioningTransport = require('azure-iot-provisioning-device-http').Http;
var Protocol = require('azure-iot-device-mqtt').Mqtt;
var Client = require('azure-iot-device').Client;
var Message = require('azure-iot-device').Message;
var tpmSecurity = require('azure-iot-security-tpm');
var ProvisioningDeviceClient = require('azure-iot-provisioning-device').ProvisioningDeviceClient;
var provisioningServiceClient = require('azure-iot-provisioning-service').ProvisioningServiceClient;
var tssJs = require("tss.js");

class TpmClient {

    constructor(sId, uniqueId, sdkOption){
        this.SID = sId;
        this.UNIQUEID = uniqueId;
		// console.log("sdk Options tpm client => ", sdkOption);
        this.CONNECTION_STRING = sdkOption.CONNECTION_STRING;
        this.REGISTARTION_ID = sdkOption.TPM.TPM_DEVICE_REGISTRATION_ID;
        this.IS_SIMULATED_TPM_DEVICE = sdkOption.TPM.IS_SIMULATED_TPM_DEVICE;
        this.DPS_PROVISIONING_HOST_URL = sdkOption.TPM.DPS_PROVISIONING_HOST_URL;
		this.DEVICE_REGISTRATION_ID = sdkOption.TPM.DEVICE_REGISTRATION_ID;
		this.TPM_INITIAL_TWIN_SID = sdkOption.TPM.TPM_INITIAL_TWIN_SID;
		this.SID_TPM_VERSION = sdkOption.TPM.SID_TPM_VERSION;
		this.AZURE_IOT_EDGE_DEVICE = sdkOption.TPM.AZURE_IOT_EDGE_DEVICE;
        this.SCOPE_ID = sdkOption.TPM.SCOPE_ID;
		this.DPS_CONNECTION_STRING = sdkOption.TPM.DPS_CONNECTION_STRING;
		this.ENDORCEMENT_KEY = sdkOption.TPM.ENDORCEMENT_KEY;
		this.IOTHUB_HOST_NAME = sdkOption.TPM.IOTHUB_HOST_NAME;
        this.IOT_HUB_HOST = "";
		if(this.IS_SIMULATED_TPM_DEVICE) { // For Simulator device
            this.SECURITY_CLIENT = new tpmSecurity.TpmSecurityClient(this.REGISTARTION_ID, new tssJs.Tpm(true)); 
        } else { // For Production if using non-simulated device, replace the above line with following:
            this.SECURITY_CLIENT = new tpmSecurity.TpmSecurityClient(); // Production
        }
        this.tpmClient = ""; 
        this.TWIN_PROPERTY = "";
    }

	/* 
	* Azure TPM SDK
	* @author : MK
	* Enroll the device into the DPS account
	* @param: 
	*/
	deviceEnrollment(callback){
		try {
			var self = this;
			// console.log("dpsConnectionsString => ", dpsConnectionsString);
			// console.log("endorcementKey => ", endorcementKey);
			// console.log("reg ID => ", self.REGISTARTION_ID);
			var serviceClient = provisioningServiceClient.fromConnectionString(self.DPS_CONNECTION_STRING);

			serviceClient.getIndividualEnrollment(self.REGISTARTION_ID, function (err, deviceEnrollmentStatus) {
				// console.log("deviceEnrollment Status => ", err.response.statusCode);
				// console.log("deviceEnrollment Status => ", deviceEnrollmentStatus);

				if(err && err.response.statusCode == 404) {
					
					var enrollment = {
						registrationId: self.REGISTARTION_ID,
						initialTwin: {
							tags: null,
							properties: {
								desired: {'sid': self.TPM_INITIAL_TWIN_SID,'idScope': self.SCOPE_ID,'version': self.SID_TPM_VERSION}
							}
						},
						capabilities: {
							iotEdge: self.AZURE_IOT_EDGE_DEVICE
						},
						attestation: {
							type: 'tpm',
							tpm: {
								endorsementKey: self.ENDORCEMENT_KEY
							}
						}
					};
					// console.log(" enrollment => ", enrollment);
					serviceClient.createOrUpdateIndividualEnrollment(enrollment, function (err, enrollmentResponse) {
						// console.log("get enrollmentResponse => ", enrollmentResponse);
						if (err) {
							callback({
								status: false,
								data: null,
								message: "Device enrollment failed : "+ err.message
							})
						} else {
							callback({
								status: true,
								data: enrollmentResponse,
								message: config.infoLog.INFO_IN16
							})
						}
					});

				} else {
					// console.log("deviceEnrollmentStatus => else => ", deviceEnrollmentStatus);
					
					if(deviceEnrollmentStatus) {
						callback({
							status: true,
							data: deviceEnrollmentStatus,
							message: config.infoLog.INFO_IN18
						})
					}
				}
			});
		} catch (error) {
			callback({
				status: false,
				data: null,
				message: "Get Device enrollment detail failed : "+ error.message
			})
		}
	}

    /* 
    * Azure TPM SDK
    * @author : MK
    * Enroll the device from DPS to IoThub
    * @param: 
    */
    deviceDPSProvisioning(callback){
        try {
			// console.log("1.0.2")
            var self = this;
            var provisioningHost = config.dpsHostUrl;
            var idScope = self.SCOPE_ID;
			// console.log("provisioningHost => ", provisioningHost);
			// console.log("idScope => ", idScope);
			// console.log("client sdkOptions => ", self.REGISTARTION_ID);
			// console.log("self.DEVICE_REGISTRATION_ID ==> ", self.DEVICE_REGISTRATION_ID)
			var provisioningClient = ProvisioningDeviceClient.create(provisioningHost, idScope, new ProvisioningTransport(), self.SECURITY_CLIENT);
			
			if(!self.IS_SIMULATED_TPM_DEVICE) {
				provisioningClient._securityClient._registrationId = self.DEVICE_REGISTRATION_ID;
			} else {
				provisioningClient._securityClient._registrationId = self.DEVICE_REGISTRATION_ID;
			}
			// console.log("1.0.3 => ");
			provisioningClient.register(function(err, result) {
				if (err) {
					// console.error("error registering device: " + err.message);
					callback({
						status: false,
						data: null,
						message: "Device provisioning failed : "+err.message
					})
				} else {
					self.IOT_HUB_HOST = result.registrationState.assignedHub;
					// console.log('registration succeeded');
					callback({
						status: true,
						data: null,
						message: config.infoLog.INFO_IN17
					})
				}
			});
        } catch (error) {
            callback({
                status: false,
                data: null,
                message: "Device provisioning failed : "+error.message
            })
        }
    }

    /* 
    * Azure TPM SDK
    * @author : MK
    * Create client connection
    * @param: 
    */
    clientConnection(callback) {
        var self = this;
        try {
            var tpmAuthenticationProvider = tpmSecurity.TpmAuthenticationProvider.fromTpmSecurityClient(self.DEVICE_REGISTRATION_ID, self.IOT_HUB_HOST, self.SECURITY_CLIENT);
            self.tpmClient = Client.fromAuthenticationProvider(tpmAuthenticationProvider, Protocol);
			self.tpmClient._maxOperationTimeout = 30000; 

			callback({
                status: true,
                data: self.tpmClient,
                message: "Device Connected success fully"
            })
        } catch (error) {
			// console.log("connection error => ", error);
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
            if (self.tpmClient) {
                // console.log("self.tpmClient => ", self.tpmClient._maxOperationTimeout);
                // self.tpmClient._maxOperationTimeout = 10000;
                // console.log("self.tpmClient => ", self.tpmClient);
                self.tpmClient.on('connect', function (err) {
                    console.log("Device connected => ", new Date());
                    var deviceCommandAck = {
                        cmdType: config.commandType.DEVICE_CONNECTION_STATUS,
                        data: {
                            cpid: self.SID,
                            guid: '',
                            uniqueId: self.UNIQUEID,
                            command: true,
                            ack: false,
                            ackId: '',
                            cmdType: config.commandType.DEVICE_CONNECTION_STATUS
                        }
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
                self.tpmClient.on('disconnect', function () {
                    // self.tpmClient.removeAllListeners();
                    console.log("Device disconnected => ", new Date());
                    var deviceCommandAck = {
                        cmdType: config.commandType.DEVICE_CONNECTION_STATUS,
                        data: {
                            cpid: self.SID,
                            guid: '',
                            uniqueId: self.UNIQUEID,
                            command: false,
                            ack: false,
                            ackId: '',
                            cmdType: config.commandType.DEVICE_CONNECTION_STATUS
                        }
                    }
                    callback({
                        status: true,
                        data: {
                            "cmdReceiveType"  : "cmd",
                            "data" : deviceCommandAck
                        },
                        message: "Device disconnected"
                    })
                });
                self.tpmClient.open(function (err) {
                    if (err) {
                        callback({
                            status: false,
                            data: null,
                            message: err.message
                        })
                    } else {
                        
                        self.tpmClient.on('message', function (msg) {
                            console.log('Id: ' + msg.messageId + ' Body: ' , JSON.parse(msg.data));
                            // callback(JSON.parse(msg.data));
                            callback({
                                status: true,
                                data: {
                                    "cmdReceiveType"  : "cmd",
                                    "data" : JSON.parse(msg.data)
                                },
                                message: "Device command"
                            })
                        });
                        // self.tpmClient.on('error', function (err) {
                        //     console.error(err.message);
                        // });
                        self.tpmClient.getTwin(function (err, twin) {
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
        try {
            var self = this;
            if(sensorData){
                if(sensorData.mt || sensorData.mt == 0){
                    var message = new Message(JSON.stringify(sensorData));
                } else {
                    if("sid" in sensorData)
                        delete sensorData.sid; // Temp Data
                    var message = new Message(JSON.stringify(sensorData));
                }
            }
            console.log('Sending message: ', message);
            try {
				self.tpmClient.sendEvent(message, self.printResultFor('send', self.SID + "_" + self.UNIQUEID));
				// self.tpmClient.sendEvent(message, self.printResultFor('send', cpId + "_" + uniqueId));
				
			} catch (error) {
				console.log("error -> ", error );				
			}
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
    getTwinProperty(callback) {
        try {
            var self = this;
            self.tpmClient.getTwin(function (err, twin) {
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
            self.tpmClient.close(function (err){
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

module.exports = TpmClient;