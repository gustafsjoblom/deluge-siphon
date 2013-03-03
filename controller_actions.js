//these should hang around for the life of the controller,
//but shouldn't get put into local storage.
var DELUGE_CONFIG = null;
var DAEMON_INFO = {
			host_id: null,
			version: null,
			connected: false
		};
var SERVER_URL = localStorage['server_url'];

function delugeConnection(url, silent){
	this.torrent_url = url;
	this.torrent_file = '';	
	this.state = '';
	this.silent = silent;
	
	//invalidate cached config info on server change
	if (SERVER_URL != localStorage['server_url']) {
		DELUGE_CONFIG = null;
		DAEMON_INFO = {
			host_id: null,
			version: null,
			connected: false
		};
		SERVER_URL = localStorage['server_url'];		
	}
	
	if (! this.silent)
		notify('DelugeSiphon', 'Requesting link...');//post back to FE
	this._getSession(); /* 	right now getSession cascades through and ultimately downloads 
							(or until it hits a breakpoint, e.g. without a torrent_url it will never download...)
							this is to ensure we always have a fresh session with the server before we make any DL attempts. */
};
delugeConnection.prototype._getSession = function(){
	var url = SERVER_URL+'/json';
	var params = JSON.stringify({
              'method': 'auth.check_session',
			  'params':[],
			  'id':'-16990'
	});
	this.state = 'getsession';
	var connection = this;
	ajax('POST',url,params,function(http){ connection.handle_readystatechange(http, connection._getSession__callback) },'application/json');
};
delugeConnection.prototype._getSession__callback = function(http, payload){
	if ( payload.result ) {
		this._checkDaemonConnection();			
	} else {
		this._doLogin();					
	}
};
/* start point */
delugeConnection.prototype._doLogin = function(){
	var SERVER_PASS = localStorage['server_pass'];
	var url = SERVER_URL+'/json';
	var params = JSON.stringify({
              'method': 'auth.login',
			  'params':[SERVER_PASS],
			  'id':'-17000'
	});
	this.state = 'dologin';
	var connection = this;
	ajax('POST',url,params,function(http){ connection.handle_readystatechange(http, connection._doLogin__callback) },'application/json');
};
delugeConnection.prototype._doLogin__callback = function(http, payload){
	if ( payload.result ) {
		this._checkDaemonConnection();			
	} else {
		if (! this.silent)
			notify('DelugeSiphon', 'Error: Login failed');
	}	
};
/* join point */
delugeConnection.prototype._checkDaemonConnection = function() {
	var url = SERVER_URL+'/json';
	var params = JSON.stringify({
              'method': 'web.connected',
			  'params':[],
			  'id':'-16991'
	});
	this.state = 'checkdaemonconnection';
	var connection = this;
	ajax('POST',url,params,function(http){ connection.handle_readystatechange(http, connection._checkDaemonConnection__callback) },'application/json');
};
delugeConnection.prototype._checkDaemonConnection__callback = function(http, payload) {
	//console.log(payload.result, DAEMON_INFO['host_id']);
	if ( payload.result && DAEMON_INFO['host_id']) {
		this._getCurrentConfig();
	} else {
		if (! this.silent)
			notify('DelugeSiphon', 'Reconnecting');
		this._getDaemons();					
	}
};
delugeConnection.prototype._getDaemons = function() {
	var url = SERVER_URL+'/json';
	var params = JSON.stringify({
              'method': 'web.get_hosts',
			  'params':[],
			  'id':'-16992'
	});
	this.state = 'getdaemons';
	var connection = this;
	ajax('POST',url,params,function(http){ connection.handle_readystatechange(http, connection._getDaemons__callback) },'application/json');
};
delugeConnection.prototype._getDaemons__callback = function(http, payload) {
	if ( payload.result ) {
		var url = SERVER_URL+'/json';
		var connection = this;
		
		for (var i = 0; i < payload.result.length; i++){
			var host = payload.result[i];
			var params = JSON.stringify({
              'method': 'web.get_host_status',
			  'params':[host[0]],
			  'id':'-16992.'+i
			});
			
			//make synchronous calls back about each till we find one connected or exhaust the list
			ajax('POST', url, params, function(http){ connection.handle_readystatechange(http, function(http, payload){
						//["c6099253ba83ea059adb7f6db27cd80228572721", "127.0.0.1", 52039, "Connected", "1.3.5"] 
						if (payload.result) {
							DAEMON_INFO['host_id'] = payload.result[0];
							DAEMON_INFO['connected'] = (payload.result[3] == 'Connected');
							DAEMON_INFO['version'] = payload.result[4];
						} else {
							if (! connection.silent)
								notify('DelugeSiphon', 'Error: cannot connect to deluge server');						
						}
					})}, 'application/json', false);
			// we're already connected
			if (DAEMON_INFO['connected']) break;
		}
		// if none connected use the last one we looked at and hope for the best,
		// otherwise carry on.
		if (DAEMON_INFO['connected']) 
			this._getCurrentConfig();
		else
			this._connectDaemon();
		
	} else {
		if (! this.silent)
			notify('DelugeSiphon', 'Error: cannot connect to deluge server');
	}				
};
delugeConnection.prototype._connectDaemon = function() {
	var url = SERVER_URL+'/json';
	var params = JSON.stringify({
              'method': 'web.connect',
			  'params':[DAEMON_INFO['host_id']],
			  'id':'-16993'
	});
	this.state = 'connectdaemon';
	var connection = this;
	ajax('POST',url,params,function(http){ connection.handle_readystatechange(http, connection._connectDaemon__callback) },'application/json');
};
delugeConnection.prototype._connectDaemon__callback = function(http, payload) {
	//pretty cool, deluge returns the names of all available webui methods in result onconnect
	if ( payload.result ) {
		//get config and carry on with execution...
		//console.log('connectdaemon', payload.error  + ' :: ' + http.responseText);
		if (! this.silent)
			notify('DelugeSiphon', 'Reconnected to server');
		this._getCurrentConfig();
	} else {
		if (! this.silent)
			notify('DelugeSiphon', 'Error: cannot connect to deluge server');
	}								
};
/* join point */
delugeConnection.prototype._getCurrentConfig = function(){
	//console.log(DELUGE_CONFIG);
	if ( DELUGE_CONFIG ) { // already cached
		this._addTorrent();
	} else {
		var url = SERVER_URL+'/json';
		var params = JSON.stringify({
				  'method': 'core.get_config_values',
				  'params': [['download_location']],
				  'id': '-17001'
			});
		this.state = 'getconfig';
		var connection = this;
		ajax('POST',url,params,function(http){ connection.handle_readystatechange(http, connection._getCurrentConfig__callback) },'application/json');
	}
};
delugeConnection.prototype._getCurrentConfig__callback = function(http, payload){
	//console.log(payload.result);
	DELUGE_CONFIG = JSON.stringify(payload.result);
	//if we have a torrent url, then next, we autodownload it.  
	//if not this is as far as we can cascade down the automatic chain...
	if ( this.torrent_url )
		this._addTorrent();
};
/* join point */
delugeConnection.prototype._addTorrent = function() {
	if (this.torrent_url.substr(0,7) == 'magnet:') {
		if (DAEMON_INFO['version'] < "1.3.3") 
			notify('DelugeSiphon', 'Your version of Deluge [' + DAEMON_INFO['version'] + '] does not support magnet links. Consider upgrading.', -1)  //this ends the cascade.
		else
			this._addRemoteTorrent();
	} else {
		this._downloadTorrent(); // which will download and then cascade to adding a local torrent
	}
};
delugeConnection.prototype._downloadTorrent = function() {
	var cookie = localStorage['client_cookie'];
	var TORRENT_URL = this.torrent_url;
	var params = JSON.stringify({	
					"method":"web.download_torrent_from_url",
					"params":[TORRENT_URL, cookie],
					"id":"-17002"
				});
	var url = SERVER_URL+'/json';
	this.state = 'downloadlink';
	var connection = this;
	ajax('POST',url,params,function(http){ connection.handle_readystatechange(http, connection._downloadTorrent__callback) },'application/json');
};
delugeConnection.prototype._downloadTorrent__callback = function(http, payload) {
	localStorage['tmp_download_file'] = payload.result;
	this._addLocalTorrent();
};
delugeConnection.prototype._addLocalTorrent = function() {
	var torrent_file = localStorage['tmp_download_file'];
	var options = JSON.parse(DELUGE_CONFIG);
	var params = JSON.stringify({	
					"method":"web.add_torrents",
					"params":[[{'path': torrent_file, 'options': options}]],
					"id":"-17003"
				});
	var url = SERVER_URL+'/json';
	this.state = 'addtorrent';
	var connection = this;
	ajax('POST',url,params,function(http){ connection.handle_readystatechange(http, connection._addLocalTorrent__callback) },'application/json');
};
delugeConnection.prototype._addLocalTorrent__callback = function(http, payload) {
	if (! this.silent)
		notify('DelugeSiphon', 'Torrent added successfully');
};
delugeConnection.prototype._addRemoteTorrent = function() {
	var torrent_file = this.torrent_url;
	var options = JSON.parse(DELUGE_CONFIG);
	var params = JSON.stringify({	
					"method":"web.add_torrents",
					"params":[[{'path': torrent_file, 'options': options}]],
					"id":"-17003"
				});
	var url = SERVER_URL+'/json';
	this.state = 'addtorrent';
	var connection = this;
	ajax('POST',url,params,function(http){ connection.handle_readystatechange(http, connection._addLocalTorrent__callback) },'application/json');
};
delugeConnection.prototype._addRemoteTorrent__callback = function(http, payload) {
	if (! this.silent)
		notify('DelugeSiphon', 'Torrent added successfully');
};
delugeConnection.prototype.handle_readystatechange = function(http, callback){  // this dispatches all the communication...
	if (xmlHttpTimeout) {
		clearTimeout(xmlHttpTimeout)
		xmlHttpTimeout = null;
	}
	if((http.readyState == 4 && http.status == 200)) {
		var payload = JSON.parse(http.responseText||'{}');
		if ( payload.error ) {
			if (! this.silent)
				notify('DelugeSiphon', 'Error: ' + (payload.error.message || this.state), 10000);
		} else {
			callback.apply(this, [http, payload]);
		}
	} else if(http.readyState == 4) { //deluge-web error, or a deluged error that causes a web error
		if (this.state == 'downloadlink') { //trying to download something that isn't a torrent file can cause this
			if (! this.silent)
				notify('DelugeSiphon', 'Are you sure this is a torrent file? ' + this.torrent_url);
		} else {
			if (! this.silent)
				notify('DelugeSiphon', 'Error: ' + this.state);
		}
	} 
	return;
}

function handleContentRequests(request, sender, sendResponse){
	//field connections from the content-handler via Chrome's secure pipeline hooey
    if (request.method.substring(0,8) == "storage-") { //storage type request
	  var bits = request.method.split('-');
	  var method = bits[1]; //get or set?
	  var key = bits[2];
	  
	  if (method == 'set') localStorage[key] = request['value'];
	  
	  //always return the current value as a response..
      sendResponse({'value': localStorage[key]});
	  
	} /* This just does not work right and seems to really piss the deluge webui off
	else if (request.method.substring(0,6) == "login-" ) { // poll for login
	  var bits = request.method.split('-');
	  var addtype = bits[1];
	  var silent = request['silent'];	  
	  if ( ! localStorage['server_url'] ) {
			notify('DelugeSiphon', 'Please configure extension');
			return;
	  }
	  new delugeConnection('', 'checkdaemonconnection', silent);
	  
	} */ 
	else if (request.method.substring(0,8) == "addlink-" ) { //add to server request
	  var url_match = false;
	  var bits = request.method.split('-');
	  var addtype = bits[1];
	  var url = request['url'];
	  var silent = request['silent'];
	  
	  if ( ! localStorage['server_url'] ) {
			notify('DelugeSiphon', 'Please configure extension options', -1);
			return;
	  }
	  if (!url) {
			notify('DelugeSiphon', 'Error: Empty URL detected');
			return;
	  }

	  url_match = url.match(/^(magnet\:)|((file|(ht|f)tp(s?))\:\/\/).+/) ;
	  if (!url_match) {
			notify('DelugeSiphon', 'Error: Invalid URL ['+url+']');
			return;
	  }
	  new delugeConnection(url, null, silent);
	  
    } else {
      sendResponse({}); // snub them.	
	}
}
function notify(title, message, decay) {
	if (!decay)
		decay = 3000;
	if (localStorage['inpage_notification']) {
		var notification = webkitNotifications.createNotification(
			  chrome.extension.getURL('/images/notify.png'),
			title,
			message
			); 
		notification.show();
		//negative decay means the user will have to close the window.
		if (decay != -1)
			setTimeout(function(){ notification.cancel() }, decay);
	}
}

/* Setup */
communicator.connectToContentScript();
/* process all requests */
communicator.observeRequest(handleContentRequests);
/* setup right-click handler */
chrome.contextMenus.create({
		'title': 'Send to deluge',
		'contexts': ['link'],
		'onclick':function (info, tab) { new delugeConnection(info.linkUrl); }
	});