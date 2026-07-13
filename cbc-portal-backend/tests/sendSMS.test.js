import test from 'node:test';
import assert from 'node:assert/strict';

import { sanitizeRecipients, classifySmsProviderResponse } from '../utils/sendSMS.js';

test('sanitizeRecipients normalizes Kenyan numbers and removes duplicates', () => {
  const recipients = sanitizeRecipients(['0712345678', ' 0712345678 ', '+254712345678', '0201234567']);

  assert.deepEqual(recipients, ['+254712345678', '+254201234567']);
});

test('classifySmsProviderResponse treats successful Talksasa payloads as sent', () => {
  const status = classifySmsProviderResponse({
    status: 'success',
    data: {
      message_id: 'abc123',
      recipient: '254712345678'
    }
  });

  assert.equal(status, 'Sent');
});
