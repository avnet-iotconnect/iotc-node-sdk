'use strict';

var SDKClient = require('iotconnect-sdk-tpm');
var iotConnectSDK = "";
var readline = require('readline');
var async = require('async');
var fs = require('fs-extra');
var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
var childDeviceLimit = 3;
var env = process.argv[2];
var sdkOptions = {
    "offlineStorage": {
        "disabled": false, //default value = false, "false" = store data, "true" = not store data 
		"availSpaceInMb": 1, //in MB Default value = unlimted
		"fileCount": 5 // Default value = 1
    }
}
var deviceUniqueId = "";
var isDeviceConnected = false;
var scopeId = ""; // TPM device DPS scopeID
async.series([
    function(cb_series) {
        rl.question('Enter device serial number : ', function (uniqueId) {
            deviceUniqueId = uniqueId
            rl.question('Enter CPID : ', function (cpId) {
                if(!isDeviceConnected) {
                    iotConnectSDK = new SDKClient(cpId, uniqueId, scopeId, deviceCallback, twinUpdateCallback, sdkOptions, env);
                } else {
                    console.log("Device is already connected");
                }
            });
        });
    }
], function(err, response) { })

var getAttributest = function getAttributest(){
    iotConnectSDK.getAttributes(function(response){
        try {
            SendData(response.data);
        } catch (error) {
            console.log("Error while getting attributes :: ",error);            
        }
    })
}

var deviceCallback = function deviceCallback(data){
        
    if(data != null && data != undefined && data.ack != undefined && data.cmdType != null)
    {
        if(data.cmdType == '0x01') {
            console.log("\n"+"--- Device Command Received ---");
            console.log(data);
            var obj = {
                "ackId": data.ackId,
                "st": 6,
                "msg": "",
                "childId": ""
            }
            var msgType = 5;
            if(data.ackId != null)
                iotConnectSDK.sendAck(obj, msgType)
        } else if(data.cmdType == '0x02') {
            console.log("\n"+"--- OTA Command Received ---");
            console.log(data);
            if(data.urls) {
                async.forEachSeries(data.urls, function (cmddetail, cbota) {
                    if("uniqueId" in cmddetail) {
                        var childId = cmddetail.uniqueId;
                    } else {
                        var childId = null;
                    }
                    var obj = {
                        "ackId": data.ackId,
                        "st": 7,
                        "msg": "",
                        "childId": childId
                    }
                    var msgType = 11;
                    if(data.ackId != null)
                    {
                        /*
                        Type    : Public Method "sendAck()"
                        Usage   : Send firmware command received acknowledgement to cloud
                        - status Type
                            st = 7; // firmware
                        - Message Type
                            msgType = 11; // for "0x02" Firmware command
                        */
                        iotConnectSDK.sendAck(obj, msgType)
                    }
                    cbota();
                }, function () { });
            }
        } else if(data.cmdType == '0x16') {
            console.log("\n"+"--- Device connection status ---");
            console.log(data);
            try {
                if(data.command)
                {
                    isDeviceConnected = true;
                    setTimeout(() => {
                        getAttributest();
                    }, 1000);
                    console.log("\nDeviceId ::: [" + data.uniqueId + "] :: Device Connected :: ", new Date());
                } else {
                    isDeviceConnected = false;
                    console.log("\nDeviceId ::: [" + data.uniqueId + "] :: Device Disconnected :: ", new Date());
                }
            } catch (error) {
                console.log("Error while getting attributes :: ",error.message);
            }
        }
    }
    else
    {
        // console.log(data);
    }
}

var twinUpdateCallback = function twinUpdateCallback(data){
    console.log("\n"+"--- Twin desired message received ---");
    console.log(data);
    if(data.desired) {
        async.forEachSeries(Object.keys(data.desired) , function (key, callbackatt) {
            if(key == "$version"){
                callbackatt();
            } else {
                var value = data.desired[key];
                iotConnectSDK.updateTwin(key, value)
                callbackatt();
            }
        }, function () { })
    }
}

var setReadline = function setReadline (attr, type, callback){
    if(type == 1)
        var space = "  ";
    else
        var space = "";
    rl.question(space+'Enter '+attr+' : ', function (value) {
        var obj = {};
        obj[attr] = value;
        callback(obj);
    });
} 

var callAgain = function callAgain (attributes){
    rl.question('\nWould you like to send data again ? (Y/N) : ', function (status) {
        if(status == "Y" || status == "y")
        {
            try {
             
                getAttributest();
            } catch (error) {
                console.log("Error while getting attributes :: ",error.message);
            }
        }
        else
            process.exit();
    });
}

var SendData = function SendData(sensordata){
    var sendTeledataData = [];
    var allAttributes = sensordata;
    var cnt = 0;
    var text = "";

    async.forEachSeries(sensordata, function(inputdata, data_cb) {
        if(sensordata.length > 1)
        {
            if(cnt == 0) {
                console.log("Note :: It includes the single device from each tag.");
                text = "(Gateway Device) ";
            } else {
                text = "";
            }
        }
        if(cnt > childDeviceLimit)
        {
            cnt++;
            data_cb();
        }
        else
        {
            cnt++;
            if(inputdata.device.tg)
                console.log("\n## TAG :: "+inputdata.device.tg+" [Device "+text+":: "+inputdata.device.id+"]");
            else
                console.log("\n## Device "+text+":: "+inputdata.device.id);
            var sendordataObj = {
                "uniqueId": inputdata.device.id,
                "time" : new Date(),
                "data": {}
            }
            async.forEachSeries(inputdata.attributes, function(attr, attrdata_cb) {
                if(attr.d)
                {
                    console.log("Enter "+attr.ln+" : ");
                    sendordataObj.data[attr.ln] = {};
                    async.forEachSeries(attr.d, function(attrChild, attrdataChild_cb) {
                        setReadline(attr.ln+'.'+attrChild.ln, 1, function(resultdata){
                            sendordataObj.data[attr.ln][attrChild.ln] = resultdata[attr.ln+'.'+attrChild.ln];
                            attrdataChild_cb()
                        });
                    },function(){
                        attrdata_cb()    
                    });
                }
                else
                {
                    setReadline(attr.ln, 0, function(resultdata){
                        sendordataObj.data[attr.ln] = resultdata[attr.ln];
                        attrdata_cb();
                    });
                }
            },function(){
                sendTeledataData.push(sendordataObj);
                data_cb();
            }); 
        }
        
    },function(){
        // console.log(JSON.stringify(sendTeledataData))
        var data = sendTeledataData;
        iotConnectSDK.sendData(data);
        setTimeout(function() {
            callAgain(allAttributes);
        }, 1000);
    });
}

function disconnectDevice(){
    console.log("Hello dispose");
    if(isDeviceConnected) {
        iotConnectSDK.dispose();
    } else {
        console.log("Device is already disconnected");
    }
}

// setTimeout(() => {
//     disconnectDevice();
// }, 30000);