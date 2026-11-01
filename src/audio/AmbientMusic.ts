/**
 * Грустный эмбиент для кухни (пятое воспоминание) — без файлов. Медленные аккорды Am — F — Dm — Em по 8 секунд,
 * всё в длинной реверберации. setLevel(1..5) — слой за слоем: 1 — низкий гул, 2 — тянущиеся аккорды,
 * 3 — редкие ноты фортепиано, 4 — высокое мерцание, 5 — всё громче и глубже.
 */

const CHORD_TIME = 8;
const TICK_MS = 100;
const LOOKAHEAD = 0.5;
const REVERB_SECONDS = 6;
/** Громкость: на первом слое и прибавка за каждый следующий. */
const VOLUME_BASE = 0.22;
const VOLUME_STEP = 0.05;
export const AMBIENT_LEVELS = 5;

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/** Корень (для гула) и ноты аккорда (MIDI). */
const CHORDS: { root: number; notes: number[] }[] = [
	{ root: 33, notes: [57, 60, 64, 71] },
	{ root: 29, notes: [57, 60, 64, 65] },
	{ root: 26, notes: [57, 60, 62, 65] },
	{ root: 28, notes: [55, 59, 62, 64] },
];

export class AmbientMusic {
	private ctx: AudioContext | null = null;
	private master: GainNode | null = null;
	private timer: number | null = null;
	/** Когда следующий аккорд и какой по счёту; когда следующая нота фортепиано. */
	private nextChord = 0;
	private chordIndex = 0;
	private nextNote = 0;
	private level = 0;

	/** Сколько слоёв звучит (0 — тишина). */
	setLevel(level: number): void {
		const previous = this.level;
		this.level = Math.min(level, AMBIENT_LEVELS);
		if (this.level <= 0) return;
		const ctx = this._context();
		// Новые слои вступают сразу — доигрывают текущий аккорд, не ждут следующего.
		if (this.timer !== null) {
			const left = this.nextChord - ctx.currentTime;
			const chord = CHORDS[Math.max(0, this.chordIndex - 1) % CHORDS.length];
			for (let layer = previous + 1; layer <= this.level; layer++) this._playLayer(layer, chord, ctx.currentTime, left + 3);
		}
		if (ctx.state === 'suspended') void ctx.resume();
		this.master!.gain.setTargetAtTime(VOLUME_BASE + VOLUME_STEP * (this.level - 1), ctx.currentTime, 1.5);
		if (this.timer === null) {
			this.nextChord = ctx.currentTime + 0.1;
			this.nextNote = ctx.currentTime + 2;
			this.timer = window.setInterval(() => this._schedule(), TICK_MS);
		}
	}

	/** Звук мог остаться на паузе (запуск до первого клика) — снять, когда можно. */
	resume(): void {
		if (this.ctx?.state === 'suspended') void this.ctx.resume();
	}

	stop(seconds = 2.5): void {
		if (!this.ctx) return;
		const ctx = this.ctx;
		this.master!.gain.setTargetAtTime(0, ctx.currentTime, seconds / 4);
		const timer = this.timer;
		this.timer = null;
		window.setTimeout(() => {
			if (timer !== null) window.clearInterval(timer);
			void ctx.close();
		}, seconds * 1000 + 200);
		this.ctx = null;
	}

	private _context(): AudioContext {
		if (this.ctx) return this.ctx;
		const ctx = (this.ctx = new AudioContext());
		this.master = ctx.createGain();
		this.master.gain.value = 0;
		const lowpass = ctx.createBiquadFilter();
		lowpass.type = 'lowpass';
		lowpass.frequency.value = 2200;
		this.master.connect(lowpass);
		// Почти всё — в реверберацию: звук «издалека», тянется и тает.
		const reverb = ctx.createConvolver();
		const length = Math.floor(ctx.sampleRate * REVERB_SECONDS);
		const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
		for (let ch = 0; ch < 2; ch++) {
			const data = impulse.getChannelData(ch);
			for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
		}
		reverb.buffer = impulse;
		const dry = ctx.createGain();
		dry.gain.value = 0.4;
		const wet = ctx.createGain();
		wet.gain.value = 0.9;
		lowpass.connect(dry);
		lowpass.connect(reverb);
		reverb.connect(wet);
		dry.connect(ctx.destination);
		wet.connect(ctx.destination);
		return ctx;
	}

	private _schedule(): void {
		const ctx = this.ctx;
		if (!ctx) return;
		const horizon = ctx.currentTime + LOOKAHEAD;
		while (this.nextChord < horizon) {
			this._playChord(CHORDS[this.chordIndex % CHORDS.length], this.nextChord);
			this.chordIndex++;
			this.nextChord += CHORD_TIME;
		}
		// Фортепиано: редкие ноты из текущего аккорда, иногда октавой выше.
		while (this.nextNote < horizon) {
			if (this.level >= 3) {
				const chord = CHORDS[Math.max(0, this.chordIndex - 1) % CHORDS.length];
				const note = chord.notes[Math.floor(Math.random() * chord.notes.length)] + (Math.random() < 0.4 ? 12 : 0);
				this._piano(hz(note), this.nextNote, 0.06);
			}
			this.nextNote += 1.8 + Math.random() * 2.5;
		}
	}

	private _playChord(chord: { root: number; notes: number[] }, t: number): void {
		for (let layer = 1; layer <= this.level; layer++) this._playLayer(layer, chord, t, CHORD_TIME + 3);
	}

	/** Один слой аккорда (3 — фортепиано — играет планировщик отдельно). */
	private _playLayer(layer: number, chord: { root: number; notes: number[] }, t: number, length: number): void {
		// 1: низкий гул — корень и квинта, медленно нарастает.
		if (layer === 1) {
			this._pad(hz(chord.root + 12), t, length, 0.09, 'sine', 0);
			this._pad(hz(chord.root + 19), t, length, 0.05, 'sine', 0);
		}
		// 2: аккорд — мягкие расстроенные треугольники.
		if (layer === 2) for (const note of chord.notes) this._pad(hz(note), t, length, 0.025, 'triangle', 8);
		// 4: высокое мерцание — те же ноты на две октавы выше, совсем тихо.
		if (layer === 4) for (const note of chord.notes.slice(0, 3)) this._pad(hz(note + 24), t, length, 0.008, 'sine', 4);
		// 5: гул ещё октавой ниже.
		if (layer === 5) this._pad(hz(chord.root), t, length, 0.08, 'sine', 0);
	}

	/** Тянущийся звук: медленная атака и спад, два голоса с расстройкой ±detune центов. */
	private _pad(freq: number, t: number, length: number, level: number, type: OscillatorType, detune: number): void {
		const ctx = this.ctx!;
		const gain = ctx.createGain();
		gain.gain.setValueAtTime(0.0001, t);
		gain.gain.linearRampToValueAtTime(level, t + length * 0.4);
		gain.gain.linearRampToValueAtTime(0.0001, t + length);
		gain.connect(this.master!);
		for (const d of detune ? [-detune, detune] : [0]) {
			const osc = ctx.createOscillator();
			osc.type = type;
			osc.frequency.value = freq;
			osc.detune.value = d;
			osc.connect(gain);
			osc.start(t);
			osc.stop(t + length + 0.1);
		}
	}

	/** Нота фортепиано: синус с обертоном, мягкий удар, долгий хвост. */
	private _piano(freq: number, t: number, level: number): void {
		const ctx = this.ctx!;
		const out = ctx.createGain();
		out.gain.setValueAtTime(0.0001, t);
		out.gain.linearRampToValueAtTime(level, t + 0.01);
		out.gain.exponentialRampToValueAtTime(0.0001, t + 4);
		out.connect(this.master!);
		for (const [mult, mix] of [
			[1, 1],
			[2, 0.25],
			[3, 0.08],
		]) {
			const osc = ctx.createOscillator();
			osc.type = 'sine';
			osc.frequency.value = freq * mult;
			const g = ctx.createGain();
			g.gain.value = mix;
			osc.connect(g);
			g.connect(out);
			osc.start(t);
			osc.stop(t + 4.1);
		}
	}
}
