// Synthesised sound only: WebAudio oscillators, no audio files, no network.
// Everything is guarded, so a browser with no audio (or a muted tab) simply plays
// nothing instead of throwing. The context is created on the first user gesture.

export function createAudio() {
  let context = null;
  let muted = false;
  let sirenNodes = null;
  let engineNodes = null;
  let rainNodes = null;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume().catch(() => {});
      return context;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      context = new AC();
    } catch {
      return null;
    }
    return context;
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (muted) return;
    const ctx = ensure();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), ctx.currentTime + dur);
      gain.gain.setValueAtTime(vol || 0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur + 0.02);
    } catch {
      // Sound is garnish: never let it break the game.
    }
  }

  return {
    ensure,
    setMuted(value) {
      muted = value;
      if (muted) this.siren(false);
      if (muted && rainNodes) {
        try { rainNodes.gain.gain.setTargetAtTime(0, context.currentTime, 0.1); } catch { /* ignore */ }
      }
    },
    isMuted() { return muted; },
    click() { tone(660, 0.06, 'square', 0.05); },
    pickup() { tone(880, 0.09, 'sine', 0.09); tone(1320, 0.12, 'sine', 0.07); },
    cash() { tone(1046, 0.1, 'triangle', 0.09); tone(1568, 0.16, 'triangle', 0.08); },
    punch() { tone(160, 0.08, 'sawtooth', 0.1, 70); },
    gunshot() { tone(220, 0.1, 'sawtooth', 0.12, 55); tone(1200, 0.04, 'square', 0.05); },
    crash() { tone(90, 0.25, 'sawtooth', 0.14, 40); },
    missionSting() {
      tone(523, 0.12, 'triangle', 0.09);
      setTimeout(() => tone(659, 0.12, 'triangle', 0.09), 110);
      setTimeout(() => tone(784, 0.22, 'triangle', 0.1), 220);
    },
    wantedUp() { tone(392, 0.14, 'square', 0.08); tone(311, 0.2, 'square', 0.08); },
    busted() { tone(220, 0.4, 'sawtooth', 0.1, 110); },
    /** The two-tone police siren, on or off. */
    siren(on) {
      const ctx = ensure();
      if (!ctx) return;
      if (!on) {
        if (sirenNodes) {
          try { sirenNodes.osc.stop(); sirenNodes.gain.disconnect(); } catch { /* already stopped */ }
          sirenNodes = null;
        }
        return;
      }
      if (sirenNodes || muted) return;
      try {
        const osc = ctx.createOscillator();
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = 850;
        lfo.type = 'square';
        lfo.frequency.value = 0.9;
        lfoGain.gain.value = 220;
        gain.gain.value = 0.028;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        lfo.start();
        sirenNodes = { osc, lfo, gain };
      } catch {
        sirenNodes = null;
      }
    },
    /** A low engine hum whose pitch follows speed (0..1). Call with 0 to quiet it. */
    engine(speed01) {
      const ctx = ensure();
      if (!ctx) return;
      if (muted || speed01 <= 0.02) {
        if (engineNodes) {
          try { engineNodes.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.1); } catch { /* ignore */ }
        }
        return;
      }
      try {
        if (!engineNodes) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.value = 70;
          gain.gain.value = 0;
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          engineNodes = { osc, gain };
        }
        engineNodes.osc.frequency.setTargetAtTime(55 + speed01 * 130, ctx.currentTime, 0.08);
        engineNodes.gain.gain.setTargetAtTime(0.03 + speed01 * 0.03, ctx.currentTime, 0.1);
      } catch {
        // ignore
      }
    },
    /** Soft rain noise (a looped, low-passed noise buffer), on or off. */
    rain(on) {
      const ctx = ensure();
      if (!ctx) return;
      try {
        if (!rainNodes) {
          const len = ctx.sampleRate * 2;
          const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
          const data = buffer.getChannelData(0);
          for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
          const src = ctx.createBufferSource();
          src.buffer = buffer;
          src.loop = true;
          const filter = ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.value = 900;
          const gain = ctx.createGain();
          gain.gain.value = 0;
          src.connect(filter);
          filter.connect(gain);
          gain.connect(ctx.destination);
          src.start();
          rainNodes = { gain };
        }
        const target = on && !muted ? 0.035 : 0;
        rainNodes.gain.gain.setTargetAtTime(target, ctx.currentTime, 0.4);
      } catch {
        // ignore
      }
    },
  };
}
