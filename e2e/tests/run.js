'use strict';

const { createContext } = require('./support/context');

const specs = [
  require('./endpoints/health'),
  require('./endpoints/cameras'),
  require('./endpoints/analyse-path'),
  require('./endpoints/analyse-upload'),
  require('./endpoints/frames'),
  require('./endpoints/search'),
  require('./endpoints/timeline'),
  require('./endpoints/observations'),
  require('./endpoints/scene-sequence'),
  require('./endpoints/analyse-errors'),
  require('./endpoints/errors')
];

const main = async () => {
  const context = createContext();

  if (context.verbose) {
    console.log('e2e verbose output enabled');
  }

  for (const spec of specs) {
    if (context.verbose) {
      console.log('e2e ' + spec.name + ' ...');
    } else {
      process.stdout.write('e2e ' + spec.name + ' ... ');
    }

    await spec.run(context);

    if (context.verbose) {
      console.log('e2e ' + spec.name + ' ok');
    } else {
      process.stdout.write('ok\n');
    }
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
