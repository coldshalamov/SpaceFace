// Loaded only after the game's first audio gesture. This node observes the master;
// its zero output is connected solely to keep processing alive without doubling it.
class ReplayAudioTap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.recording = false;
    this.port.onmessage = (event) => { this.recording = event.data?.recording === true; };
  }
  process(inputs, outputs) {
    for (const channel of outputs[0] || []) channel.fill(0);
    const input = inputs[0];
    if (this.recording && input?.[0]?.length) {
      const left = input[0].slice(), right = (input[1] || input[0]).slice();
      this.port.postMessage({ frame: currentFrame, left, right }, [left.buffer, right.buffer]);
    }
    return true;
  }
}
registerProcessor('spaceface-replay-audio', ReplayAudioTap);
