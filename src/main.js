const TChannel = require('tchannel');
const Ringpop = require('../lib/ringpop');
const buynan = require('bunyan');

const connManager = require('./http/connManager');
const requestHandler = require('./http/requestHandler');
const wsSender = require('./http/sender');
const FastSet = require('collections/fast-set');
const keyLifecycle = require('./helpers/keylifecycle');
const defaults = require('./helpers/defaults');
const kafkaMsgHandler = require('./kafka/msgHandler');
const KConsumer = require('./kafka/consumer');

function Sere(options) {
  this.sockUniqId = 0;
  this.wsByClientId = {};
  this.proxyRoutes = {};
  this.webScoketsByKey = {};

  this.options = defaults(options);

  this.wsConnMgr = new connManager.WsConnManager(this);
  this.keysOwned = new FastSet();

  this.logger = createLogger.call(this);

  startRingpop.call(this);
  startConsumers.call(this);
}

function startRingpop() {
  let topChannel = new TChannel();
  let logger = this.logger;
  const options = this.options;
  let ringpopConfig = {
    app: options.appName,
    hostPort: options.bindIp + ':' + options.port,
    channel: topChannel.makeSubChannel({
      serviceName: 'ringpop',
      trace: false,
    }),
    maxJoinDuration: options.maxJoinDuration,
    logger: logger,
    useLatestHash32: true,
    stateTimeouts: options.stateTimeouts,
  };

  topChannel.listen(options.port, options.bindIp, () => {
    logger.info('Listening on topchannel');
  });

  const ring = this.ring = new Ringpop(ringpopConfig);
  ring.setupChannel();

  if (options.bootstrapNodes) {
    ring.bootstrap()
  } else if (typeof options.bootstrapFunc === 'function') {

  }
}

function createLogger() {
  return buynan.createLogger({
    name: this.options.appName,
    src: false,
    level: this.options.logLevel,
  });
}

function startConsumers() {

}

Sere.prototype.isKeyValid = function(key) {
  return key && typeof key == 'string' && key.trim().length > 0;
};

Sere.prototype.getNextSockId = function() {
  return this.sockUniqId++;
};

Sere.prototype.handleError = function(resp, errCode, msg) {
  resp.statusCode = 400;
  resp.write(msg);
  resp.end();
};

Sere.prototype.startProxy = function() {

};

Sere.prototype.ownupKey = keyLifecycle.onKeyOwnRequest;
Sere.prototype.publish = wsSender.publish;
Sere.prototype.broadcast = wsSender.broadcast;
Sere.prototype.createHttpProxy = connManager.createHttpProxy;
Sere.prototype.handleWsMessage = requestHandler.onWSMessage;
Sere.prototype.relinquishKeys = keyLifecycle.relinquishKeys;
module.exports = Sere;