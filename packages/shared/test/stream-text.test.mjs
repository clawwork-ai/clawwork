import test from 'node:test';
import assert from 'node:assert/strict';

import { mergeGatewayStreamText } from '../dist/constants.js';

test('mergeGatewayStreamText upgrades a partial snapshot to the longer snapshot', () => {
  assert.equal(mergeGatewayStreamText('[[main] 嗯，在线。', '[[main] 嗯，在线。你这是测试我死没死。'), '[[main] 嗯，在线。你这是测试我死没死。');
});

test('mergeGatewayStreamText ignores identical snapshots', () => {
  assert.equal(mergeGatewayStreamText('same reply', 'same reply'), 'same reply');
});

test('mergeGatewayStreamText appends genuine incremental chunks', () => {
  assert.equal(mergeGatewayStreamText('hello', ' world'), 'hello world');
});

test('mergeGatewayStreamText ignores an older snapshot replayed after a newer one', () => {
  assert.equal(mergeGatewayStreamText('newer reply', 'newer'), 'newer reply');
});
