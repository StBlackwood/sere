const async = require('async');

function getMsgHandler(options) {
  return function(messages, callback) {
    const self = this;

    self.logger.debug('Processing messages in msgHandler for invokeId',
        options.invokeId, 'messages length', messages.length);
    let waitBacks = [];
    for (let msg of messages) {
      let key = msg.key.toString();
      waitBacks.push(function(cb) {
        self.channel.send(options.invokeId, key, msg.value, cb);
      });
    }
    async.parallelLimit(waitBacks, options.limit, function(err) {
      if (err)
        self.logger.error('Error sending msgs through tchannel');
      callback(err);
    });
  };
}

module.exports = getMsgHandler;