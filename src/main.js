const connManager = require('./http/connManager');
const reqHandler = require('./http/requestHandler');
const FastSet = require("collections/fast-set");

function Sere() {
  this.sockUniqId = 0;
  this.wsByClientId = {};
  this.proxyRoutes = {};
  this.webScoketsByKey = {};

  this.wsConnMgr = new connManager.WsConnManager(this);
}

Sere.prototype.isKeyValid = function(key) {
  return key && typeof key == 'string' && key.trim().length > 0;
};

Sere.prototype.getNextSockId = function() {
  return this.sockUniqId++;
};

Sere.prototype.ownupKey = function() {

};

Sere.prototype.handleError = function(resp, errCode, msg) {
  resp.statusCode = 400;
  resp.write(msg);
  resp.end();
};

Sere.prototype.startProxy = function() {

}

Sere.prototype.createHttpProxy = connManager.createHttpProxy;
Sere.prototype.handleWsMessage = reqHandler.onWSMessage;
module.exports = Sere;