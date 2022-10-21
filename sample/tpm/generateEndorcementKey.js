'use strict';

var tpmSecurity = require('azure-iot-security-tpm');
var tssJs = require("tss.js");
var readline = require('readline');
var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

try {
	rl.question('Enter device registration ID : ', function (regstrationId) {
		var myTpm = new tpmSecurity.TpmSecurityClient(regstrationId, new tssJs.Tpm(true));
		myTpm.getEndorsementKey(function(err, endorsementKey) {
			if (err) {
			  console.log('The error returned from get key is: ' + err);
			  process.exit();
			} else {
			  console.log('the endorsement key is: ' + endorsementKey.toString('base64'));
			  process.exit();
			}
		});
	});
} catch (error) {
	console.log("Error : ", error.message);	
}


//https://docs.microsoft.com/en-us/azure/iot-dps/quick-create-simulated-device-tpm-node