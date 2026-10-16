import assert from 'node:assert/strict';
import test from 'node:test';

import { admitOpeningUnitsAcrossSlices } from '../src/render/openingGpuAdmission.js';

function subject(id) {
  return { id, material: { uuid: `m-${id}` }, geometry: { uuid: `g-${id}` } };
}

function serialSubmitter(events) {
  let tail = Promise.resolve();
  let active = 0;
  let maxActive = 0;
  const submit = (work, admission = {}) => {
    const run = tail.then(async () => {
      if (typeof admission.isActive === 'function' && admission.isActive() !== true) {
        return { skipped: true, reason: 'owner-inactive' };
      }
      active += 1;
      maxActive = Math.max(maxActive, active);
      events.push(`enter:${active}`);
      try {
        return await work();
      } finally {
        active -= 1;
        events.push(`leave:${active}`);
      }
    });
    tail = run.catch(() => {});
    return run;
  };
  submit.maxActive = () => maxActive;
  return submit;
}

test('opening admission enrolls compile and exact-target touch work before direct issue', async () => {
  const events = [];
  const submit = serialSubmitter(events);
  let paceCalls = 0;
  const makeBatch = () => ({
    submit,
    // A submit reservation owns the drain; calling this between direct issue calls would defeat
    // the shared queue contract. The admission driver must leave this untouched.
    paceQueue: async () => { paceCalls += 1; },
    async drain() { events.push('readiness-drain'); return { contextLost: false }; },
    close() { events.push('close'); },
  });
  const compileOptions = [];
  const compile = async (item) => {
    compileOptions.push(item.options);
    events.push(`compile:${item.subject.id}`);
    await Promise.resolve();
    return `compiled:${item.subject.id}`;
  };
  const makeAdmission = (prefix) => admitOpeningUnitsAcrossSlices({
    subjects: [subject(`${prefix}-a`), subject(`${prefix}-b`)],
    beginReadinessBatch: makeBatch,
    compileOne: (item, options) => compile({ subject: item, options }),
    touchOne: (item) => { events.push(`touch:${item.id}`); return `touched:${item.id}`; },
    isActive: () => true,
    strict: true,
  });

  const [left, right] = await Promise.all([makeAdmission('left'), makeAdmission('right')]);
  assert.equal(submit.maxActive(), 1, 'concurrent opening producers share one active submission');
  assert.equal(paceCalls, 0, 'the old post-submission pacer is bypassed when submit owns the unit');
  assert.equal(left.issued, 2);
  assert.equal(right.issued, 2);
  assert.equal(left.touched, 2);
  assert.equal(right.touched, 2);
  assert.equal(compileOptions.length, 4);
  assert.ok(compileOptions.every((options) => options && options.skipSharedBatch === true),
    'the compile callback is told not to await its enclosing readiness batch');
  assert.ok(events.includes('readiness-drain'));
  assert.equal(events.filter((entry) => entry === 'close').length, 2);
});

test('strict opening admission fails closed for an inactive shared-submit owner', async () => {
  const submit = serialSubmitter([]);
  await assert.rejects(
    admitOpeningUnitsAcrossSlices({
      subjects: [subject('inactive')],
      beginReadinessBatch: () => ({
        submit,
        async drain() { return { contextLost: false }; },
        close() {},
      }),
      compileOne: () => { throw new Error('compile must not run for an inactive owner'); },
      touchOne: () => { throw new Error('touch must not run for an inactive owner'); },
      isActive: () => false,
      strict: true,
    }),
    /opening GPU admission skipped: owner-inactive/,
  );
});

test('strict opening admission rejects context loss and touch failures after cleanup', async () => {
  const contextLossBatch = () => ({
    async drain() { return { contextLost: true }; },
    close() {},
  });
  await assert.rejects(
    admitOpeningUnitsAcrossSlices({
      subjects: [subject('lost')],
      beginReadinessBatch: contextLossBatch,
      compileOne: () => Promise.resolve('compiled'),
      touchOne: () => 'touched',
      strict: true,
    }),
    /readiness drain did not settle/,
  );

  const touched = [];
  await assert.rejects(
    admitOpeningUnitsAcrossSlices({
      subjects: [subject('a'), subject('b')],
      beginReadinessBatch: () => ({
        async drain() { return { contextLost: false }; },
        close() {},
      }),
      compileOne: (item) => Promise.resolve(`compiled:${item.id}`),
      touchOne: (item) => {
        touched.push(item.id);
        if (item.id === 'a') throw new Error('touch-a-failed');
        return 'touched';
      },
      strict: true,
    }),
    /touch-a-failed/,
  );
  assert.deepEqual(touched, ['a', 'b'], 'strict touch failure still lets the cohort finish its cleanup pass');
});
