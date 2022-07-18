const TypedError = require('error/typed');

const NoWsAvailableToSend = TypedError({
  type: 'wsserver.no-socket-found',
  message: 'No socket found for the key to send',
  forClient: null,
});

module.exports = {
  broadcast: function(message, key) {
    //a function to broacase the message to all sockets in the key
    //take the list open ws
    let wsForThisKey = this.webScoketsByKey[key];
    if (!wsForThisKey) {
      /* logger.error(
        "broadcast messge sent for key %s , but no socket found",
        key
      );*/
      return;
    }
    Object.values(wsForThisKey).forEach(s => s.send(message));
  },
  publish: function(message, clientId, cb) {
    let ws = this.wsByClientId[clientId];
    if (ws) {
      ws.send(message, cb);
    } else {
      logger.warn('No ws is available for %s ', clientId);
      if (typeof cb === 'function')
        return cb(NoWsAvailableToSend({forClient: clientId}));
    }
  },
};
