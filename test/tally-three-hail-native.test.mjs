import test from 'node:test';
import {inspectTallyHailAdvice} from './fixtures/tally-three-hail-native.mjs';
test('stock original Tally native hail shows effective class warning across both realms',{timeout:120000},inspectTallyHailAdvice);
