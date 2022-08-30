const args = process.argv.splice(2);
const buynan = require('bunyan');
const logger = buynan.createLogger(
    {name: 'test_' + args[0], src: true, level: 'trace'});

const Ringpop = require('../lib/ringpop');
const TChannel = require('tchannel');

const topChannel = new TChannel();

const ring = new Ringpop({
  app: 'sere_ringpop',
  hostPort: '127.0.0.1:' + args[0],
  channel: topChannel.makeSubChannel({
    serviceName: 'ringpop',
    trace: true,
  }),
  maxJoinDuration: 5000,
  logger: logger,
  useLatestHash32: true,
  stateTimeouts: {

    suspect: 5 * 1000, // 5s
    faulty: 60 * 60 * 1000, // 1hr
    tombstone: 60 * 1000, // 60s

  },
});

topChannel.listen(parseInt(args[0]), '127.0.0.1', () => {
  logger.info('Listening on tchannel');
});

function printMembers() {
  let currentAllMembers = [];
  ring.membership.members.forEach(m => {
    if (m.id === ring.whoami()) return;
    currentAllMembers.push({
      id: m.id,
      alive: ring.membership.isPingable(m),
    });
  });
  logger.info('Current Members', JSON.stringify(currentAllMembers));
}

ring.on('ringChanged', printMembers);

ring.setupChannel();

let bootstrapNodes = [];
bootstrapNodes.push('127.0.0.1:3000', '127.0.0.1:3002', '127.0.0.1:3001');

function bootstrap() {
  ring.bootstrap(bootstrapNodes, err => {

    if (err) {
      logger.warn('error in bootstrapping nodes');

      bootstrap();
    }

  });
}

ring.channel.register('func1', (req, res, arg1, arg2) => {
  logger.info('Received func1 call by', args[0], arg1.toString(),
      arg2.toString());
  res.headers.as = 'raw';
  res.sendOk('result', 'indeed it did');
});

bootstrap();

setInterval(printMembers, 30000);

const Channel = require('./channel/channel');

let ch = new Channel(ring, {
  maxRetries: 3,
  timeout: 3000,
  headers: {'as': 'raw', 'cn': 'example-client'},
  logger,
});

ch.register('kafka', function handler(key, arg3, cb) {
  logger.info('received msg for ', key.toString(), arg3.toString());
  cb(null);
});

const generateRandomString = (myLength) => {
  const chars =
      'AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890';
  const randomArray = Array.from(
      {length: myLength},
      (v, k) => chars[Math.floor(Math.random() * chars.length)],
  );

  return randomArray.join('');
};

function sendMsg() {
  let key = generateRandomString(5);
  logger.info('Sending msg', key, 'from', parseInt(args[0]));
  ch.send('kafka', key, Date.now().toString(), function callback(err) {
    if (err)
      logger.error('Error sending msg', err);
  });
}

let sere = {
  logger: logger,
  ring: ring,
  channel: ch,
};

const kafkaMsgHandler = require('./kafka/msgHandler');
let msgHandler = kafkaMsgHandler({invokeId: 'kafka', limit: 10}).bind(sere);
const KConsumer = require('./kafka/consumer');

let kconsumer = new KConsumer(logger, msgHandler, {
  consumerGroupId: 'teseret.3r3',
  brokerList: ['b-2.gamezy-playship.y7j0ae.c2.kafka.ap-south-1.amazonaws.com:9092'],
  topicList: ['contest-lobbyWsV2'],
  batchSize: 2,
  batchPeriod: 3000,
});

logger.trace('Checking trace');

kconsumer.start();