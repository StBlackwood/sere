const TypedError = require('error/typed');

const NoWsAvailableToSend = TypedError({
  type: 'wsserver.no-socket-found',
  message: 'No socket found for the key to send',
  forClient: null,
});

const sender = function(message, key) {
  //a function to sender the message to all sockets in the key
  //take the list open ws
  let wsForThisKey = this.webScoketsByKey[key];
  if (!wsForThisKey) {
    return;
  }
  Object.values(wsForThisKey).forEach(s => s.send(message));
};

const publish = function(message, clientId, cb) {
  let ws = this.wsByClientId[clientId];
  if (ws) {
    ws.send(message, cb);
  } else {
    logger.warn('No ws is available for %s ', clientId);
    if (typeof cb === 'function')
      return cb(NoWsAvailableToSend({forClient: clientId}));
  }
};

module.exports = {
  broadcast: sender,
  publish,
};
