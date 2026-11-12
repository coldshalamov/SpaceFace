// Wave G7 — before any lock the contacts list is not in the flight HUD tree.

import test from 'node:test';
import assert from 'node:assert/strict';

import { contactRosterVisible, mountContactRoster } from '../src/ui/hud.js';

test('G7 the list is absent before a lock and present after one', () => {
  assert.equal(contactRosterVisible({ locked: false }), false);
  assert.equal(contactRosterVisible({ locked: true }), true);
  const parent = {
    children: [],
    insertBefore(node, before) {
      if (node.parentNode) node.parentNode.removeChild(node);
      node.parentNode = this;
      const at = this.children.indexOf(before);
      if (at < 0) this.children.push(node);
      else this.children.splice(at, 0, node);
    },
    appendChild(node) {
      if (node.parentNode) node.parentNode.removeChild(node);
      node.parentNode = this;
      this.children.push(node);
    },
    removeChild(node) {
      const i = this.children.indexOf(node);
      if (i >= 0) this.children.splice(i, 1);
      if (node.parentNode === this) node.parentNode = null;
    },
  };
  const roster = { parentNode: parent };
  parent.children.push(roster);
  const radar = { parentNode: null };
  assert.equal(mountContactRoster(parent, roster, radar, false), false);
  assert.equal(roster.parentNode, null, 'before a lock the list is not in the tree');
  assert.equal(mountContactRoster(parent, roster, radar, true), true);
  assert.equal(roster.parentNode, parent, 'after a lock the list is in the tree');
});
