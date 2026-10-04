import assert from 'node:assert/strict';
import test from 'node:test';
import { validateReceipt, pendingId } from '../ajo-kulut.js';

const receipt = (type, bytes, size = bytes.length) => ({ type, size });

test('accepts original JPEG, PNG and WebP bytes', () => {
  const cases = [
    ['image/jpeg', [255, 216, 255, 224], 'jpg'],
    ['image/png', [137, 80, 78, 71, 13, 10, 26, 10, 0], 'png'],
    ['image/webp', [82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80, 0], 'webp'],
  ];
  for (const [type, bytes, ext] of cases) {
    assert.deepEqual(validateReceipt(receipt(type, bytes), bytes), { mime: type, ext });
  }
});

test('rejects wrong MIME, empty and oversized receipts', () => {
  const jpg = [255, 216, 255, 224];
  assert.throws(() => validateReceipt(receipt('text/plain', jpg), jpg));
  assert.throws(() => validateReceipt(receipt('image/jpeg', jpg, 0), jpg));
  assert.throws(() => validateReceipt(receipt('image/jpeg', jpg, 5 * 1024 * 1024 + 1), jpg));
});

test('retry keeps the UUID only for the same form fingerprint', () => {
  const values = new Map();
  globalThis.sessionStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const first = pendingId('expense', 'same-image-and-fields');
  assert.equal(pendingId('expense', 'same-image-and-fields'), first);
  assert.notEqual(pendingId('expense', 'changed-fields'), first);
  values.set('expense', '{broken');
  assert.ok(pendingId('expense', 'changed-fields'));
});
