const { expect } = require('chai');
const pluginOutbox = require('../lib/pluginOutbox');

describe('plugin outbox retry backoff', () => {
  it('uses exponential delays capped at one hour', () => {
    expect(pluginOutbox.retryDelay(1)).to.equal(30);
    expect(pluginOutbox.retryDelay(2)).to.equal(60);
    expect(pluginOutbox.retryDelay(8)).to.equal(3600);
    expect(pluginOutbox.retryDelay(20)).to.equal(3600);
  });
});
