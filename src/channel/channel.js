const async = require('async');
const TypedError = require('error/typed');
const ChannelDestroyedError = TypedError({
  type: 'ringpop.request-proxy.channel-destroyed',
  message: 'Channel was destroyed before forwarding attempt',
});

const MaxRetriesExceeded = TypedError({
  type: 'ringpop.request-proxy.max-retries-exceeded',
  message: 'Max number of retries exceeded. {maxRetries} were attempted',
  maxRetries: null,
});

const RETRY_SCHEDULE = [0, 1, 3.5];
const MAX_RETRY_TIMEOUT = RETRY_SCHEDULE[RETRY_SCHEDULE.length - 1] * 1000;

function Channel(ringpop, options = {}) {
  this._ringpop = ringpop;
  this._channel = ringpop.channel;
  this._serviceName = 'ringpop';
  this._options = options;
  this._handlers = {};
  this._logger = options.logger || ringpop.logger;
}

Channel.prototype.getHandlers = function(invokeId) {
  return this._handlers[invokeId] || [];
};

Channel.prototype.send = function send(invokeId, key, arg3, callback) {
  const self = this;
  const logger = self._logger;
  let dest = this._ringpop.lookup(key);
  if (dest === this._ringpop.whoami()) {
    handleLocally();
    return;
  }

  function handleLocally() {
    // handling locally
    logger.info('Handling locally', key);
    let handlers = self.getHandlers(invokeId);
    let aWaitbacks = [];
    for (let h of handlers) {
      aWaitbacks.push(function(callback) {
        h(key, arg3, callback);
      });
    }
    async.parallel(aWaitbacks, function(err) {
      callback(err);
    });
  }

  // not handling locally, find destination and forward it
  let opts = {
    errors: [],
    numRetries: 0,
  };
  let cb = function(...args) {
    callback(...args);
    clearTimeout(opts.timeout);
  };

  let handler = self._options.maxRetries === 0 ? onSendNoRetries : onSend;

  function send() {
    if (self._channel.destoryed) {
      process.nextTick(function onTick() {
        cb(ChannelDestroyedError());
      });
    }

    logger.info('Waiting for identifier');
    self._channel.waitForIdentified({
      host: dest,
    }, function onRequest(err) {
      if (err) {
        return cb(err);
      }

      logger.info('Identifier found, attempting to send', dest);

      self._channel.request({
        serviceName: self._serviceName,
        hasNoParent: true,
        retryLimit: self._ringpop.config.get('tchannelRetryLimit'),
        timeout: self._options.timeout,
        headers: self._options.headers,
        host: dest,
      }).send(invokeId, key, arg3, handler);
    });
  }

  function onSend(err, res, arg2, arg3) {
    if (!err && !res.ok) {
      err = new Error(String(arg3));
    }

    if (self._options.maxRetries === 0) {
      if (err) {
        cb(err, null, null);
      } else {
        cb(null, arg2, arg3);
      }
      return;
    }

    if (!err) {
      cb(null, arg2, arg3);
      return;
    }

    logger.error('Unable to send', err);
    opts.errors.push(err);

    if (opts.numRetries >= self._options.maxRetries) {
      cb(MaxRetriesExceeded({
        maxRetries: opts.numRetries,
      }));
      return;
    }

    // schedule retry
    // TODO: modularise this later
    if (opts.numRetries === 0) {
      opts.retryStartTime = Date.now();
    }

    let scheduleDelay = RETRY_SCHEDULE[opts.numRetries] * 1000;
    scheduleDelay = isNaN(scheduleDelay) ? MAX_RETRY_TIMEOUT : scheduleDelay;
    self._ringpop.setTimeout(function() {
      opts.numRetries++;
      let newDest = self._ringpop.lookup(key);
      if (newDest !== dest) {
        logger.warn('Ringpop channel request re-routed oldDest', dest,
            'to newDest', newDest);
        dest = newDest;
        if (newDest === self._ringpop.whoami()) {
          handleLocally();
          return;
        }
      }
      send();
    }, scheduleDelay);
  }

  function onSendNoRetries(err, res, arg2, arg3) {
    process.nextTick(function onTick() {
      if (!err && !res.ok) {
        err = new Error(String(arg3));
      }

      cb(err, arg2, arg3);
    });
  }

  // now send
  send();
};

// handlers are function
// handlers must have callback in end
Channel.prototype.register = function(invokeId, handler) {
  let handlers = this._handlers[invokeId] = this._handlers[invokeId] || [];
  handlers.push(handler);

  if (handlers.length === 1) {
    this._channel.register(invokeId, (req, res, arg2, arg3) => {
      handler(arg2, arg3, (err) => {
        res.headers.as = 'raw';
        if (err) {
          res.sendNotOk(arg2, arg3);
        } else {
          res.sendOk(arg2, arg3);
        }
      });

    });
  }
};

module.exports = Channel;