/**
 * New node file
 */
var http = require('http');
var https = require('https');
var httpProxy = require('http-proxy');
var WebSocketServer = require('ws').Server;
var config = require('../conf/config.json');
var fs = require('fs');
var urlParse = require('url');
var auth = require('./auth.js');
//var os = require('os');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
	
var _proxy = httpProxy.createProxy();

var _proxies = [];
var _proxiesSSL = [];


function nextProxy(ssl) {
	var proxies = ssl ? _proxiesSSL : _proxies;
	if(proxies.length > 0){
		var target = proxies.shift();
		proxies.push(target);
		return target;
	}
	return null;
}

function addProxy(host,port,id,ssl){
	ssl = (ssl === "true");
	var proxies = ssl ? _proxiesSSL : _proxies;
	proxies.push({'id':id,'host':host,'port':port});
}

function delProxy(id){
	for(var key in _proxies){
		if(_proxies[key].id === id){
			delete _proxies[key];
		}
	}
	for(var key in _proxiesSSL){
		if(_proxiesSSL[key].id === id){
			delete _proxiesSSL[key];
		}
	}
}

var _httpHandle = function(req, res) {
	if(req.method === "GET" && (req.url === "" || req.url === "/")){
		var api = fs.readFileSync("../api/fueldb.js",'utf8');
		api = api.replace("xxxxxxxx:xxxx",req.headers.host);
		api = api.replace("\"yyyy\"","false");
		res.writeHead(200, {"Content-Type": "text/javascript"});
		res.write(api);
		res.end();
		return;
	}
	var target = nextProxy();
	if(!target){
		console.log("No server available");
		//TODO return error
		return;
	}
	_proxy.web(req, res,{target:'http://'+target.host+':'+target.port+'/'});
	console.log('Forward HTTP to server '+target.id);
};

var _httpsHandle = function(req, res) {
	if(req.method === "GET" && (req.url === "" || req.url === "/")){
		var api = fs.readFileSync("../api/fueldb.js",'utf8');
		api = api.replace("xxxxxxxx:xxxx",req.headers.host);
		api = api.replace("\"yyyy\"","true");
		res.writeHead(200, {"Content-Type": "text/javascript"});
		res.write(api);
		res.end();
		return;
	}
	var target = nextProxy(true);
	if(!target){
		console.log("No server available");
		//TODO return error
		return;
	}
	_proxy.web(req, res,{target:'https://'+target.host+':'+target.port+'/'});
	console.log('Forward HTTPS to server '+target.id);
};

var _wsHandle = function(req, socket, head) {
	var target = nextProxy();
	if(!target){
		console.log("No server available");
		//TODO return error
		socket.destroy();
		return;
	}
	_proxy.ws(req, socket, head,{target:'ws://'+target.host+':'+target.port+'/'});
	console.log('Forward WS to server '+target.id);
};

var _wssHandle = function(req, socket, head) {
	var target = nextProxy(true);
	if(!target){
		console.log("No server available");
		//TODO return error
		socket.destroy();
		return;
	}
	//target.proxy.ws(req, socket, head);
	_proxy.ws(req, socket, head,{target:'wss://'+target.host+':'+target.port+'/'});
	console.log('Forward WSS to server '+target.id);
};

config.hosts.forEach(function(host){
	var httpServer;
	if (host.ssl) {
		var options = {
			key : fs.readFileSync(host.key),
			cert : fs.readFileSync(host.cert)
		};
		httpServer = https.createServer(options,_httpsHandle);
		httpServer.on('upgrade', _wssHandle);
	}else{
		httpServer = http.createServer(_httpHandle);
		httpServer.on('upgrade', _wsHandle);
	}
	httpServer.listen(host.port, host.host);
	console.log('Listening for HTTP'+(host.ssl?'S':'')+'/WS'+(host.ssl?'S':'')+' at IP ' + host.host + ' on port ' + host.port);
});

var managerServer;
if (config.manager.ssl) {
	var options = {
		key : fs.readFileSync(config.manager.key),
		cert : fs.readFileSync(config.manager.cert)
	};
	managerServer = https.createServer(options);
}else{
	managerServer = http.createServer();
}
var wsServer = new WebSocketServer({
	server : managerServer
});
wsServer.on('connection', function(ws) {
	var url = urlParse.parse(ws.upgradeReq.url,true);
	if(auth.verifyURL(url)){
		var obj = {"error":"Auth failed"};
		ws.send(JSON.stringify(obj));
		ws.close();
	}
	ws.id = url.query.id;
	console.log("Manager connection open with server "+ws.id);
	var hosts = url.query.hosts;
	hosts.split(',').forEach(function(host){
		addProxy(host.split(':')[1],host.split(':')[2],ws.id,host.split(':')[0]);
	});
	ws.on('message', function(msg) {
		console.log("Manager message: "+msg);
	});
	ws.on('error', function(message) {
		console.log("Manager error: "+message);
	});
	ws.on('close', function(code, message) {
		console.log("Manager connection lost with server "+ws.id);
		delProxy(ws.id);
	});
});
managerServer.listen(config.manager.port, config.manager.host);
console.log('Manager listening for HTTP'+(config.manager.ssl?'S':'')+'/WS'+(config.manager.ssl?'S':'')+
		' at IP ' + config.manager.host + ' on port ' + config.manager.port);

