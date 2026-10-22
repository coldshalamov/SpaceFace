import test from 'node:test';
import assert from 'node:assert/strict';
import { isFirstLightPrompt, installFirstLightPromptHandler } from '../scripts/player-truth/routes.mjs';

test('the public settings actor only accepts First light / Keep my settings', () => {
  assert.equal(isFirstLightPrompt('First light','Keep my settings'),true);
  assert.equal(isFirstLightPrompt(' First light ','KEEP MY SETTINGS\n'),true);
  assert.equal(isFirstLightPrompt('First light','Keep my settingsESC'),true);
  assert.equal(isFirstLightPrompt('First light','Keep my settings ESC'),true);
  assert.equal(isFirstLightPrompt('Abandon the ship?','Keep my settings'),false);
  assert.equal(isFirstLightPrompt('First light','Confirm purchase'),false);
});

test('late First light uses the real cancel control once, and leaves unrelated dialogs alone', async () => {
  let handler, registrations=0, clicks=0, title='First light',label='Keep my settings';
  const cancel={first(){return this;},async waitFor(){},async textContent(){return label;},async click(){clicks++;}};
  const titleLocator={first(){return this;},filter(){return this;},async textContent(){return title;}};
  const page={locator(selector){return selector.includes('__cancel')?cancel:titleLocator;},async addLocatorHandler(_locator,callback){registrations++;handler=callback;}};
  const events=[];
  await installFirstLightPromptHandler(page,(...row)=>events.push(row));
  await installFirstLightPromptHandler(page,(...row)=>events.push(row));
  assert.equal(registrations,1);
  await handler();assert.equal(clicks,1);assert.match(events[0][2],/First light/);
  title='Confirm purchase';await handler();assert.equal(clicks,1);
  title='First light';label='Confirm';await handler();assert.equal(clicks,1);
});
