const http = require('http');
const WebSocket = require('ws');

module.exports = function(sere) {
  let httpServer = http.createServer((req, resp) => {
    sere.httpHandler(req, resp);
  });
  httpServer.on('upgrade', sere.wsUpgradeHandler);
  //create a websocet server attached to it
  //attch the handler;
  httpServer.listen(port);
  let wsServer = new WebSocket.Server({noServer: true});
  wsServer.on('connection', ws => sere.handleWSConn(ws));
  return {http: httpServer, ws: wsServer};
};
