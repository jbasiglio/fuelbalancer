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

var proxies = [];

function nextProxy() {
	if(proxies.length > 0){
		var target = proxies.shift();
		proxies.push(target);
		return target.proxy;
	}
	return null;
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
	nextProxy().web(req, res);
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
	var proxy = nextProxy();
	proxy.web(req, res);
	console.log('Forward HTTP to '+proxy.id);
};

var _wsHandle = function(req, socket, head) {
	var proxy = nextProxy();
	proxy.ws(req, socket, head);
	console.log('Forward WS to '+proxy.id);
};

config.hosts.forEach(function(host){
	var httpServer;
	if (host.ssl) {
		var options = {
			key : fs.readFileSync(host.key),
			cert : fs.readFileSync(host.cert)
		};
		httpServer = https.createServer(options,_httpsHandle);
	}else{
		httpServer = http.createServer(_httpHandle);
	}
	httpServer.on('upgrade', _wsHandle);
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
	console.log("Manager connection open");
	var url = urlParse.parse(ws.upgradeReq.url,true);
	if(auth.verifyURL(url)){
		var obj = {"error":"Auth failed"};
		ws.send(JSON.stringify(obj));
		ws.close();
	}
	ws.id = url.query.id;
	var hosts = url.query.hosts;
	hosts.split(',').forEach(function(host){
		var proxy = new httpProxy.createProxyServer({
			target:{host:host.split(':')[1],port:host.split(':')[2]}
		});
		proxies.push({'id':ws.id,'proxy':proxy});
	});
	ws.on('message', function(msg) {
		console.log("Manager message: "+msg);
	});
	ws.on('error', function(message) {
		console.log("Manager error: "+message);
	});
	ws.on('close', function(code, message) {
		console.log("Manager connection lost");
		var ids = [];
		for(var key in proxies){
			if(proxies[key].id === ws.id){
				ids.push(key);
			}
		}
		ids.forEach(function(id){
			delete proxies[id];
		});
	});
});
managerServer.listen(config.manager.port, config.manager.host);
console.log('Manager listening for HTTP'+(config.manager.ssl?'S':'')+'/WS'+(config.manager.ssl?'S':'')+
		' at IP ' + config.manager.host + ' on port ' + config.manager.port);

