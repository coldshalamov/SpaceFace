// Fixture: a branching conversation. Must trip no-dialogue-trees.
export const CONVERSATION = {
  id: 'talk_to_the_dockmaster',
  nodes: [
    { id: 'a', line: 'Well?', choices: [{ text: 'Pay', nextNodeId: 'b' }, { text: 'Refuse', nextNodeId: 'c' }] },
  ],
};
