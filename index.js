const path = require('path');

const projectRoot = __dirname;
process.chdir(path.join(projectRoot, 'cbc-portal-backend'));

import('./cbc-portal-backend/index.js').catch((error) => {
  console.error('Failed to start the backend from the workspace root.');
  console.error(error);
  process.exit(1);
});
