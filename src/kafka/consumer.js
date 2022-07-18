const kafka = require('node-rdkafka');
const async = require('async');
const {KafkaConsumer} = require('node-rdkafka');

function KConsumer(sere, msgHandler, options) {
  this.logger = sere.logger;
  this.paused = false;
  this.options = options;
  this.msgHandler = msgHandler;
  this.consumer = new kafka.KafkaConsumer(options, {});

  this.consumer.commitMessage()
}

KConsumer.prototype.start = function() {

};

KConsumer.prototype.pause = function() {

};

KConsumer.prototype.close = function() {

};

KafkaConsumer.prototype._fetchConsumerHandler = function() {
  return function() {

  }
}

module.exports = KConsumer;