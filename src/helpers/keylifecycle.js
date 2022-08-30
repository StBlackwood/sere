const stringify = require('json-stringify');

const onKeyOwnRequest = function(keys, callback) {
  let logger = this.logger;
  logger.info('owning up keys %s', stringify(keys));
  if (keys === undefined) {
    if (callback === undefined) {
      logger.error('Both keys and callback undefined !!!!');
      return;
    } else {
      callback('keys undefined');
      return;
    }
  }
  if (!Array.isArray(keys)) {
    let keysArr = [];
    keysArr.push(keys);
    keys = keysArr;
  }
  let self = this;

  keys = keys.filter(k => {
    return !self.keysOwned.has(k);
  });
  if (keys.length === 0) {
    //we already own these keys , nothing to do
    logger.info('All keys are owned by me , nothing to do');
    callback();
    return;
  }
  logger.info('registering key %s with me ', stringify(keys));
  keys.forEach(k => {
    self.keysOwned.add(k);
  });
  callback();
};

/**
 *This function releases kyes locally or globally
 *
 **/
const relinquishKeys = function(keys) {
  logger.info('relinquishing %s keys  ', keys.length);
  let _self = this;
  keys = keys.filter(k => {
    return _self.keysOwned.has(k);
  });
  if (keys.length === 0) {
    logger.info(
        'No keys is actually owned by me, coming from startup eager pull',
    );
    return;
  }
  keys.forEach(k => {
    _self.keysOwned.delete(k);
    logger.info('closing websockets attached to key %s', k);
    let websocketsForThisKey = _self.webScoketsByKey[k];
    if (websocketsForThisKey) {
      Object.values(websocketsForThisKey).forEach(w => {
        w.close();
      });
      delete _self.webScoketsByKey[k];
    }
    logger.info('closed ws for key %s', k);
  });
  //call the client provided callback if any
  let keyRemovalCallback = _self.options.onKeysRemoved;
  if (keyRemovalCallback) {
    if (typeof keyRemovalCallback === 'function') {
      keyRemovalCallback(keys);
    } else {
      logger.warn('keyRemovalCallback is not a function');
    }
  }
  logger.info('%s keys removed from redis and clened up', stringify(keys));
};

module.exports = {
  onKeyOwnRequest,
  relinquishKeys
};
