const kafka = require('node-rdkafka');
const {logger} = require('../../lib/ringpop/lib/nulls');

function KConsumer(logger, msgHandler, options) {
  this.logger = logger;
  this.paused = false;
  this.options = options;
  this.msgHandler = msgHandler;
  this.isProcessing = false;
  const self = this;

  this.consumer = new kafka.KafkaConsumer({
    'group.id': options.consumerGroupId,
    'metadata.broker.list': options.brokerList,
    'rebalance_cb': rebalanceCb.bind(self),
    'enable.auto.commit': false,  // forcefully setting false
  }, {});

  this.consumer.on('event.error', function(err) {
    self.logger.error('Error consuming events', err);
  });

  this.consumer.on('ready', () => {
    self.consumer.subscribe(options.topicList);
    self.consumer.consume();
  });

  this.__msgQueue = [];

  this.consumer.on('data', function(data) {
    self.__msgQueue.push(data);
    if (self.__msgQueue.length > self.options.batchSize) {
      self.consumer.pause(self.consumer.assignments());
      self.paused = true;

      if (!self.isProcessing) {
        // handle consumed messages in next tick
        process.nextTick(() => {
          self.__handleMsgs();
        });
      }
    }
  });
}

KConsumer.prototype.start = function() {
  this.consumer.connect();
  const self = this;
  // schedule a periodic processor also
  setInterval(() => {
    if (self.__msgQueue.length > 0)
      self.__handleMsgs();
  }, this.options.batchPeriod);
};

KConsumer.prototype.close = function() {
  this.consumer.disconnect();
};

KConsumer.prototype.__handleMsgs = function() {
  const self = this;
  if (self.isProcessing)
    return logger.warn(
        'Already processing of msgs is running, cant trigger again');

  self.isProcessing = true;
  self.msgHandler(self.__msgQueue, (err) => {
    if (err) {
      self.logger.error('Error consuming events, resuming the consumption',
          err);
    }

    if (self.paused) {
      self.consumer.resume(self.consumer.assignments());
      self.paused = false;
    }

    if (self.isProcessing) {
      // commit all processed messages
      commitProcessedMessages.call(self, self.__msgQueue);

      // commit msgs
      self.__msgQueue = [];
      self.isProcessing = false;
    }
  });
};

function rebalanceCb(err, assignments) {
  const self = this;
  if (err.code === kafka.CODES.ERRORS.ERR__ASSIGN_PARTITIONS) {
    try {
      self.consumer.assign(assignments);
    } catch (e) {
      self.logger.warn(
          'Failed to assign partitions, consumer might be disconnected', e);
    }
  } else if (err.code === kafka.CODES.ERRORS.ERR__REVOKE_PARTITIONS) {
    if (self.paused) {
      self.consumer.resume(assignments);
      self.pasued = false;
    }
    self.consumer.unassign();
  } else {
    self.logger.error('Rebalance error', err);
  }
}

function commitProcessedMessages(msgs = []) {
  this.logger.debug('Committing offsets', msgs.length);
  for (let m of msgs)
    this.consumer.commit(m);
}

module.exports = KConsumer;