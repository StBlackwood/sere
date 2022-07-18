const httpProxy = require('../../lib/http-proxy');
const stringify = require('json-stringify');
const WsConnManager = function(sere) {
  this.allConn = {};
  this.started = false;
  this.logger = sere.logger;
};

const onWSClose = function(res, sock) {
  this.logger.info('peer of WS %s is closed closing this as well',
      stringify(sock.clientXtra));
};

const createHttpProxy = function(host, port) {
  let proxyTarget = {host: host, port: port};

  let proxyRoute = httpProxy.createProxyServer({
    target: proxyTarget,
    ws: true,
  });
  this.logger.info('Created http proxy server on host %s, port %s', host, port);
  proxyRoute.on('close', (...args) => onWSClose.call(this, ...args));
  proxyRoute.on('error', function(err, req, res) {
    res.statusCode = 500;
    res.write('Error on proxying the request');
    res.end();
    this._logger.error({err: err});
  });
  return proxyRoute;
};

WsConnManager.prototype.register = function(ws, close) {
  this.logger.info('registering new ws for monitoring');
  this.allConn[ws.uniqId] = ws;
  let _self = this;
  ws.live = true;
  ws.on('close', () => {
    close(); //now delist from self
    delete _self.allConn[ws.uniqId];
    this.logger.debug('removed ws from monitored list ');
  });
  ws.on('pong', () => {
    ws.live = true;
  });
  ws.on('ping', () => {
    ws.live = true;
  });
};

WsConnManager.prototype.start = function(wsIdleTimeout) {
  const self = this;
  if (self.started) return;

  wsIdleTimeout = wsIdleTimeout || 3000;
  self.logger.info(
      'starting the WS conn manager with sock idle timeout %s',
      wsIdleTimeout,
  );
  setInterval(() => {
    Object.keys(self.allConn).forEach(c => {
      let sock = self.allConn[c];
      if (sock && !sock.live) {
        self.logger.debug('closing ws due to inactivity');
        return sock.terminate();
      }
      sock.live = false;
      sock.ping();
    });
  }, wsIdleTimeout);
  self.started = true;
};
module.exports = {
  createHttpProxy,
  WsConnManager,
};
