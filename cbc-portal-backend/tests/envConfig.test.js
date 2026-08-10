import assert from 'node:assert/strict';
import { loadEnvironmentFiles, resolveEnvironmentSettings } from '../utils/envConfig.js';

const explicitOverrideSettings = resolveEnvironmentSettings({
  env: 'development',
  envVars: {
    NODE_ENV: 'production',
    DB_SOURCE: 'auto',
  },
});

assert.equal(explicitOverrideSettings.nodeEnv, 'development');
assert.equal(explicitOverrideSettings.dbSource, 'auto');

const loadedSettings = loadEnvironmentFiles({ env: 'development' });
assert.equal(loadedSettings.nodeEnv, 'development');
console.log('envConfig tests passed');
