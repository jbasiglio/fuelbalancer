/**
 * fueldb: a realtime database
 * Copyright(c) 2014 Joris Basiglio <joris.basiglio@wonderfuel.io>
 * MIT Licensed
 */

var config = require('../conf/config.json');
var crypto = require('crypto');
var users = require('../conf/users.json');

exports.verifyURL = function(url){
	try{
		var user = url.query.user;
		var signature = url.query.signature;
		var check = url.href.split("&signature=")[0];
		var hash = crypto.createHmac('sha256',users[user]).update(check).digest('hex');
		return hash !== signature;
	}catch(e){
		console.log(e);
		return true;
	}
};