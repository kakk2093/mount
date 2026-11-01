/**
 * Лоу-фай хип-хоп для офиса: спокойный, мажорный, 80 уд/мин — без файлов. Электропиано (мягкие синусы
 * с тремоло) аккордами Fmaj7 — Em7 — Dm7 — Cmaj7, тёплый бас, ленивые барабаны со свингом (бочка, мягкий
 * малый на 2 и 4, хэты), редкая мелодия по пентатонике и тихий треск пластинки. Всё приглушено срезом верхов.
 * setDecay(0..1) — распад: слои стихают по очереди (мелодия, аккорды, бас, барабаны), пластинка «плывёт»
 * по высоте и замедляется; scratch() — обрыв иглой и тишина.
 */

const BPM = 80;
const BEAT = 60 / BPM;
/** Свинг: вторая восьмая в доле сдвинута позже на эту долю восьмой. */
const SWING = 0.18;
const TICK_MS = 25;
const LOOKAHEAD = 0.25;
const VOLUME = 0.32;

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/** По такту на аккорд: бас и ноты (MIDI). */
const CHORDS: { bass: number; notes: number[] }[] = [
	{ bass: 41, notes: [57, 60, 64, 65] },
	{ bass: 40, notes: [55, 59, 62, 64] },
	{ bass: 38, notes: [57, 60, 62, 65] },
	{ bass: 36, notes: [55, 59, 60, 64] },
];
/** Мелодия — до-мажорная пентатоника повыше. */
const SCALE = [72, 74, 76, 79, 81, 84];
/** Распад: на сколько замедляется темп и на сколько центов «плывёт» высота при decay = 1. */
const DECAY_SLOWDOWN = 0.3;
const DECAY_WOBBLE = 45;

const fade = (x: number, from: number, to: number) => {
	const k = Math.min(1, Math.max(0, (x - from) / (to - from)));
	return 1 - k * k * (3 - 2 * k);
};

export class LofiMusic {
	private ctx: AudioContext | null = null;
	private out: GainNode | null = null;
	private noise: AudioBuffer | null = null;
	private timer: number | null = null;
	private nextTime = 0;
	/** Номер восьмой с начала. */
	private step = 0;
	private melodyIndex = 2;
	private decay = 0;

	start(): void {
		if (this.timer !== null) return;
		const ctx = this._context();
		if (ctx.state === 'suspended') void ctx.resume();
		this.out!.gain.setValueAtTime(0, ctx.currentTime);
		this.out!.gain.linearRampToValueAtTime(VOLUME, ctx.currentTime + 2);
		this.nextTime = ctx.currentTime + 0.1;
		this.step = 0;
		this.timer = window.setInterval(() => this._schedule(), TICK_MS);
		// Треск пластинки: шум с редкими щелчками, тихо и по кругу.
		const src = ctx.createBufferSource();
		src.buffer = this._crackleBuffer(ctx);
		src.loop = true;
		const gain = ctx.createGain();
		gain.gain.value = 0.05;
		src.connect(gain);
		gain.connect(this.out!);
		src.start();
	}

	/** Распад 0..1 (можно звать каждый кадр). */
	setDecay(amount: number): void {
		this.decay = amount;
	}

	/** Игла соскакивает: короткий скрежет — и тишина. */
	scratch(): void {
		if (!this.ctx) return;
		const ctx = this.ctx;
		const t = ctx.currentTime;
		const src = ctx.createBufferSource();
		src.buffer = this.noise;
		const filter = ctx.createBiquadFilter();
		filter.type = 'bandpass';
		filter.frequency.setValueAtTime(2400, t);
		filter.frequency.exponentialRampToValueAtTime(500, t + 0.25);
		filter.Q.value = 2;
		const gain = ctx.createGain();
		gain.gain.setValueAtTime(0.5, t);
		gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
		src.connect(filter);
		filter.connect(gain);
		gain.connect(ctx.destination);
		src.start(t);
		src.stop(t + 0.35);
		this.out!.gain.cancelScheduledValues(t);
		this.out!.gain.setValueAtTime(this.out!.gain.value, t);
		this.out!.gain.linearRampToValueAtTime(0, t + 0.06);
		this.stop(0.5);
	}

	/** Звук мог остаться на паузе (запуск до первого клика) — снять, когда можно. */
	resume(): void {
		if (this.ctx?.state === 'suspended') void this.ctx.resume();
	}

	stop(seconds = 1.5): void {
		if (!this.ctx) return;
		const ctx = this.ctx;
		this.out!.gain.setTargetAtTime(0, ctx.currentTime, seconds / 4);
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
		// Всё — через мягкий срез верхов: «старая кассета».
		const lowpass = ctx.createBiquadFilter();
		lowpass.type = 'lowpass';
		lowpass.frequency.value = 3200;
		lowpass.Q.value = 0.3;
		this.out = ctx.createGain();
		this.out.gain.value = 0;
		this.out.connect(lowpass);
		lowpass.connect(ctx.destination);
		this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
		const data = this.noise.getChannelData(0);
		for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
		return ctx;
	}

	private _crackleBuffer(ctx: AudioContext): AudioBuffer {
		const buffer = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
		const data = buffer.getChannelData(0);
		for (let i = 0; i < data.length; i++) {
			data[i] = (Math.random() * 2 - 1) * 0.08;
			if (Math.random() < 0.0004) data[i] = (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.5);
		}
		return buffer;
	}

	private _schedule(): void {
		const ctx = this.ctx;
		if (!ctx) return;
		while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
			// Свинг: нечётные восьмые чуть позже.
			const swing = this.step % 2 === 1 ? SWING * (BEAT / 2) : 0;
			this._playStep(this.step, this.nextTime + swing);
			this.nextTime += (BEAT / 2) * (1 + this.decay * DECAY_SLOWDOWN);
			this.step++;
		}
	}

	/** Одна восьмая: step — номер с начала, 8 восьмых в такте, аккорд — на такт. */
	private _playStep(step: number, t: number): void {
		const eighth = step % 8;
		const bar = Math.floor(step / 8);
		const chord = CHORDS[bar % CHORDS.length];
		// Распад: слои стихают по очереди; что совсем стихло — не играем.
		const d = this.decay;
		const melody = fade(d, 0, 0.25);
		const keys = fade(d, 0.15, 0.5);
		const bass = fade(d, 0.35, 0.7);
		const drums = fade(d, 0.55, 0.9);
		// Аккорд — на первую восьмую, чуть «раскатом»; на «и» третьей доли — тише повтор.
		if (eighth === 0 && keys > 0.01) chord.notes.forEach((note, i) => this._keys(hz(note), t + i * 0.012, 0.05 * keys, BEAT * 3.5));
		if (eighth === 5 && keys > 0.01) chord.notes.slice(1).forEach((note) => this._keys(hz(note), t, 0.025 * keys, BEAT * 1.5));
		// Бас — корень на 1 и на «и» второй доли.
		if (eighth === 0 && bass > 0.01) this._bass(hz(chord.bass), t, BEAT * 1.4, bass);
		if (eighth === 3 && bass > 0.01) this._bass(hz(chord.bass + 7), t, BEAT * 0.8, bass);
		// Барабаны: бочка на 1 и на «и» третьей, малый на 2 и 4, хэты восьмыми.
		if (drums > 0.01) {
			if (eighth === 0 || eighth === 5) this._kick(t, drums);
			if (eighth === 2 || eighth === 6) this._noiseHit(t, 'bandpass', 1800, 0.6, 0.18, 0.18 * drums);
			this._noiseHit(t, 'highpass', 7500, 0.7, 0.04, (eighth % 2 === 0 ? 0.05 : 0.03) * drums);
		}
		// Мелодия: редко, по пентатонике шагами.
		if (eighth % 2 === 0 && melody > 0.01 && Math.random() < 0.28) {
			this.melodyIndex = Math.min(SCALE.length - 1, Math.max(0, this.melodyIndex + (Math.random() < 0.5 ? -1 : 1)));
			this._keys(hz(SCALE[this.melodyIndex]), t, 0.045 * melody, BEAT * 1.5);
		}
	}

	/** Электропиано: синус с октавой, быстрая атака, долгое затухание, лёгкое тремоло. */
	private _keys(freq: number, t: number, level: number, length: number): void {
		const ctx = this.ctx!;
		const out = ctx.createGain();
		out.gain.setValueAtTime(0.0001, t);
		out.gain.linearRampToValueAtTime(level, t + 0.01);
		out.gain.exponentialRampToValueAtTime(0.0001, t + length);
		const trem = ctx.createOscillator();
		trem.frequency.value = 4.5;
		const tremDepth = ctx.createGain();
		tremDepth.gain.value = level * 0.25;
		trem.connect(tremDepth);
		tremDepth.connect(out.gain);
		out.connect(this.out!);
		for (const [mult, mix] of [
			[1, 1],
			[2, 0.2],
		]) {
			const osc = ctx.createOscillator();
			osc.type = 'sine';
			osc.frequency.value = freq * mult;
			osc.detune.value = this._wobble(t);
			const g = ctx.createGain();
			g.gain.value = mix;
			osc.connect(g);
			g.connect(out);
			osc.start(t);
			osc.stop(t + length + 0.05);
		}
		trem.start(t);
		trem.stop(t + length + 0.05);
	}

	/** «Плывущая» пластинка: отклонение высоты в центах в момент t — растёт с распадом. */
	private _wobble(t: number): number {
		return Math.sin(t * Math.PI * 2 * 0.35) * this.decay * DECAY_WOBBLE;
	}

	private _bass(freq: number, t: number, length: number, level = 1): void {
		const ctx = this.ctx!;
		const gain = ctx.createGain();
		gain.gain.setValueAtTime(0.0001, t);
		gain.gain.linearRampToValueAtTime(0.22 * level, t + 0.02);
		gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
		gain.connect(this.out!);
		const osc = ctx.createOscillator();
		osc.type = 'sine';
		osc.frequency.value = freq;
		osc.detune.value = this._wobble(t);
		osc.connect(gain);
		osc.start(t);
		osc.stop(t + length + 0.05);
	}

	private _kick(t: number, level = 1): void {
		const ctx = this.ctx!;
		const osc = ctx.createOscillator();
		osc.frequency.setValueAtTime(100, t);
		osc.frequency.exponentialRampToValueAtTime(40, t + 0.12);
		const gain = ctx.createGain();
		gain.gain.setValueAtTime(0.5 * level, t);
		gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
		osc.connect(gain);
		gain.connect(this.out!);
		osc.start(t);
		osc.stop(t + 0.45);
	}

	private _noiseHit(t: number, type: BiquadFilterType, freq: number, q: number, length: number, volume: number): void {
		const ctx = this.ctx!;
		const src = ctx.createBufferSource();
		src.buffer = this.noise;
		src.loop = true;
		const filter = ctx.createBiquadFilter();
		filter.type = type;
		filter.frequency.value = freq;
		filter.Q.value = q;
		const gain = ctx.createGain();
		gain.gain.setValueAtTime(volume, t);
		gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
		src.connect(filter);
		filter.connect(gain);
		gain.connect(this.out!);
		src.start(t, Math.random() * 0.8);
		src.stop(t + length + 0.05);
	}
}
