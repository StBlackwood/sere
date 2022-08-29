const url = require('url');
const stringify = require('json-stringify');
const bodyParser = require('body-parser');
const PARSER = {
  'application/json': bodyParser.json(),
  'text/plain': bodyParser.text(),
  DEFAULT: bodyParser.json(),
};

const doAcceptSocket = function(key, socket, req, head) {
  let _self = this;
  let logger = _self.logger;
  //create a callback function
  let clientXtraCallback = function(clientXtras) {
    if (!clientXtras) {
      logger.error('returned client xtra not valid');
      socket.destroy();
      return;
    }
    let wsAcceptCall = function() {
      _self.wss.handleUpgrade(req, socket, head, ws => {
        //before emitting stick the key to ws
        ws.key = key;
        ws.clientXtras = clientXtras;
        clientXtras.key = key; //override the key
        _self.wss.emit('connection', ws, req);
      });
    };
    let keyOwnCall = () => {
      _self.ownupKey(key, err => {
        if (err) {
          logger.error(
              'Error while owning up key during WS upgrade key=%s',
              key,
          );
          socket.destroy();
        } else {
          logger.info('Accepted key while WS accept');
          wsAcceptCall();
        }
      });
    };
    if (_self.keysOwned.has(key)) {
      logger.info('calling only WSAccept() as key is already with me ');
      wsAcceptCall();
    } else {
      logger.info('calling _self.own while accepting WS');
      keyOwnCall();
    }
  };

  _self.options.clientDetailsResolver(req, clientXtraCallback);
};

module.exports = {
  onNewConnection: function(key, clientDetails, cb) {
    if (this.options.initialConnHandler) {
      logger.info('calling ext new conn handler');
      this.options.initialConnHandler(key, clientDetails, cb);
    }
  },
  wsUpgrade: function(req, socket, head) {
    let path = url.parse(req.url).pathname;
    //check ws path validity
    let self = this;
    let logger = self.logger;

    if (self.options.wsPathValidator) {
      if (!self.options.wsPathValidator(path)) {
        logger.error('ws upgrade req on wrong path %s ', path);
        socket.destroy();
        return;
      }
    } else if (path !== self.options.wsPath) {
      logger.error('ws upgrade req on wrong path %s ', path);
      socket.destroy();
      return;
    }

    let key = self.options.keyResolver(req);
    if (!self.isKeyValid(key)) {
      logger.error('requested key %s is invalid , closing connection ', key);
      socket.destroy();
      return;
    }

    let dest = self.ring.lookup(key);
    logger.info('ws upgrade for key %s will be handled by %s', key, dest);
    if (dest === self.ring.whoami()) {
      logger.info(
          'ws upgrade request for key %s will boe handled locally',
          key,
      );
      return doAcceptSocket.call(self, key, socket, req, head);
    }
    //handle through proxy
    logger.info(
        'ws upgrade request for key %s will be proxied to %s',
        key,
        dest,
    );
    let proxyRoute = self.proxyRoutes[dest];
    if (!proxyRoute) {
      logger.error(
          'No proxy route for host %s, will refuse the connection, client should retry',
          dest,
      );
      socket.close();
      return;
    }
    logger.info('ws upgrade request forwarded');
    //forward to the correct node
    proxyRoute.ws(req, socket, head);
  },
  wsConnEstablished: function(ws) {
    // we have got a new connection
    //register it in the list
    let self = this;
    let logger = self.logger;
    let key = ws.key;
    let clientId = ws.clientXtras.clientId;
    ws.uniqId = self.getNextSockId();

    let existingSocket = self.wsByClientId[clientId];
    if (existingSocket) {
      existingSocket.close();
    }
    this.wsByClientId[clientId] = ws;
    let connectionsForTheKey = self.webScoketsByKey[key];
    if (!connectionsForTheKey) {
      connectionsForTheKey = {};
      self.webScoketsByKey[key] = connectionsForTheKey;
    }
    connectionsForTheKey[ws.uniqId] = ws;
    let wsCleanUp = () => {
      //deref from perkey list
      logger.debug('WS cleanup called');
      let older = self.wsByClientId[clientId];
      if (older && older.uniqId === ws.uniqId) {
        delete self.wsByClientId[clientId];
      }
      delete connectionsForTheKey[ws.uniqId];
      if (Object.keys(connectionsForTheKey).length === 0) {
        //if the array is empty remove from map as well
        delete self.webScoketsByKey[key];
      }
      logger.debug('removed ws from per key list', key);
    };
    //register with the connmanager
    self.wsConnMgr.register(ws, wsCleanUp);
    //create the on message handler
    ws.on('message', message => {
      ws.live = true;
      self.handleWsMessage(message, ws.clientXtras);
    });
    //call to get initial connection message
    self.onNewConnection(key, ws.clientXtras, err => {
      if (err) {
        logger.error({err: err});
        logger.error('closing connection as new-connhandler returned error');
        ws.close();
      }
    });
  },
  onWSMessage: function(message, clientXtra) {
    this.options.handleWSMessage(message, clientXtra, this);
  },
  onHttpRequest: function(req, res) {
    let path = url.parse(req.url).pathname;
    let self = this;
    let logger = self.logger;
    //check if it's a health check url
    if ('/health' === path) {
      //health check send OK
      res.write('OK');
      res.end();
      return;
    }

    let key = self.options.keyResolver(req);

    if (!self.isKeyValid(key)) {
      self.handleError(res, 400, 'No valid key found in ' + req.url);
      return;
    }

    let dest = self.ring.lookup(key);
    logger.debug('key: %s will be handled by %s', key, dest);

    if (dest === self.ring.whoami()) {
      logger.debug('request will be handled locally ');
      //pin the game to self
      let keyOwnCall = function() {
        self.ownupKey(key, err => {
          if (err) {
            logger.error('Error in accepting game %', err);
            //no point in calling the handler as we have failed
            res.statusCode = 500;
            res.write('Failed to accept game request :: %s', stringify(err));
            res.end();
          } else {
            self.options.handler(req, res, self.ring.whoami());
          }
        });
      };
      let reqEndCallback = (err) => {
        if (err) {
          logger.error('Error parsing json for the body', err);
          res.statusCode = 400;
          res.write('Failed to parse body');
          res.end();
          return;
        }
        logger.info('No external resume handler, will simply add the games');
        keyOwnCall();
      };
      let contentType = req.headers['content-type'];
      let parser = PARSER[contentType] || PARSER.DEFAULT;
      parser(req, res, reqEndCallback);
    } else {
      //get the proxy route
      let route = self.proxyRoutes[dest];
      if (route) {
        route.web(req, res);
        logger.debug('proxied the request to %s ', dest);
      } else {
        logger.error('No route found for % , denying the request', dest);
      }
    }
  },
};
