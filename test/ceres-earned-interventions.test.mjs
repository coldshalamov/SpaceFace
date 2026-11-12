import test from 'node:test';
import {earnLastShiftArchive} from './fixtures/ceres-earned-interventions-native.mjs';
test('ordinary native Ceres scan and main FILE action earn one Last Shift archive', {timeout:120000}, async()=>{await earnLastShiftArchive();});
