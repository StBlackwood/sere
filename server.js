const config = require('./config')();
const args = process.argv.splice(2);
const buynan = require('bunyan');
const logger = buynan.createLogger({name: 'test_' + args[0], src: true});

const Ringpop = require('./lib/ringpop');
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

ring.lookupN()

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

bootstrap();


setInterval(printMembers, 3000)
