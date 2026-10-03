import assert from 'node:assert/strict';
import { createCorsOriginAllowlist, isAllowedCorsOrigin } from '../utils/corsOrigins.js';

const developmentAllowlist = createCorsOriginAllowlist({
  frontendUrl: 'https://school.example',
  corsAllowedOrigins: 'https://admin.example, https://teacher.example',
  nodeEnv: 'development',
});

assert.equal(isAllowedCorsOrigin('https://admin.example', developmentAllowlist), true);
assert.equal(isAllowedCorsOrigin('https://school.example', developmentAllowlist), false);
assert.equal(isAllowedCorsOrigin('http://localhost:5500', developmentAllowlist), true);
assert.equal(isAllowedCorsOrigin('http://localhost:5502', developmentAllowlist), false);
assert.equal(isAllowedCorsOrigin('https://random-site.netlify.app', developmentAllowlist), false);
assert.equal(isAllowedCorsOrigin('https://random-site.vercel.app', developmentAllowlist), false);
assert.equal(isAllowedCorsOrigin('http://192.168.1.10:5500', developmentAllowlist), false);
assert.equal(isAllowedCorsOrigin(undefined, developmentAllowlist), true);

const productionAllowlist = createCorsOriginAllowlist({
  frontendUrl: 'https://school.example',
  nodeEnv: 'production',
});

assert.equal(isAllowedCorsOrigin('https://school.example', productionAllowlist), true);
assert.equal(isAllowedCorsOrigin('http://localhost:5500', productionAllowlist), false);
assert.equal(isAllowedCorsOrigin('https://preview-school.netlify.app', productionAllowlist), false);

console.log('CORS origin tests passed');