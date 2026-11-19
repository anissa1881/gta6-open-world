// Sunport City radio: three synthesised stations, WebAudio oscillators only, no
// audio files, no network. A 16-step sequencer (bass + lead) runs on a lookahead
// timer; R switches station, N mutes everything. Guarded throughout, so a
// browser with no audio simply plays nothing instead of throwing.
const STATIONS = [
  {
    name: 'SUNSET FM',
    track: 'Palm Dusk — The Marinas',
    bpm: 76, wave: 'sine', bassWave: 'triangle',
    root: 57, // A3
    bass: [0, null, 0, null, -4, null, -4, null, -2, null, -2, null, 5, null, 3, null],
    lead: [12, null, 15, null, 19, null, 15, 12, null, 15, null, 19, 24, null, 19, null],
  },
  {
    name: 'STRIP FM',
    track: 'Neon Avenue — Drive Nights',
    bpm: 104, wave: 'triangle', bassWave: 'square',
    root: 52, // E3
    bass: [0, 0, 7, 0, 0, 0, 7, 0, 5, 5, 7, 5, 3, 3, 7, 3],
    lead: [12, null, 12, 15, null, 19, null, 15, 12, null, 15, null, 17, 19, null, null],
  },
  {
    name: 'CHASE FM',
    track: 'Heatwave — Sirens After Dark',
    bpm: 132, wave: 'sawtooth', bassWave: 'sawtooth',
    root: 50, // D3
    bass: [0, null, 0, 3, null, 0, null, 5, null, 0, null, 3, 6, null, 5, null],
    lead: [12, 12, null, 13, null, 15, null, 12, 10, null, 12, null, 15, 17, null, 15],
  },
];

function midiFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function createRadio() {
  let context = null;
  let muted = false;
  let index = 1; // STRIP FM is the default: the city's drive station.
  let step = 0;
  let nextTime = 0;
  let timer = null;
  let started = false;

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

  function note(freq, at, dur, type, vol) {
    try {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.linearRampToValueAtTime(vol, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      osc.connect(gain);
      gain.connect(context.destination);
      osc.start(at);
      osc.stop(at + dur + 0.02);
    } catch {
      // Sound is garnish: never let it break the game.
    }
  }

  function schedule() {
    const ctx = context;
    if (!ctx || muted) return;
    const station = STATIONS[index];
    const stepDur = 60 / station.bpm / 4;
    while (nextTime < ctx.currentTime + 0.35) {
      const bassNote = station.bass[step];
      const leadNote = station.lead[step];
      if (bassNote !== null && bassNote !== undefined) {
        note(midiFreq(station.root + bassNote - 12), nextTime, stepDur * 1.8, station.bassWave, 0.045);
      }
      if (leadNote !== null && leadNote !== undefined) {
        note(midiFreq(station.root + leadNote), nextTime, stepDur * 1.6, station.wave, 0.03);
      }
      step = (step + 1) % 16;
      nextTime += stepDur;
    }
  }

  return {
    ensure,
    /** Start the sequencer (call after a user gesture, so audio is allowed). */
    start() {
      if (started) return;
      if (!ensure()) return;
      started = true;
      nextTime = context.currentTime + 0.1;
      timer = setInterval(schedule, 120);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
      started = false;
    },
    setMuted(value) { muted = value; },
    isMuted() { return muted; },
    /** Switch to the next station; returns its name for the toast. */
    next() {
      index = (index + 1) % STATIONS.length;
      step = 0;
      if (context) nextTime = Math.max(nextTime, context.currentTime + 0.05);
      return STATIONS[index].name;
    },
    station() { return STATIONS[index]; },
    stationName() { return STATIONS[index].name; },
    trackName() { return STATIONS[index].track; },
  };
}
