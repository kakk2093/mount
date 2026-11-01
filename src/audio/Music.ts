/**
 * Музыка: лёгкое меланхоличное фортепиано на 66 уд/мин — без файлов. Подложка из тянущихся аккордов, тихое
 * арпеджио, редкая мелодия по минорной пентатонике, мягкий бас; всё в «комнате» (реверберация) и с эхом.
 * Настроение (setMood): brightness — светлее звук и живее мелодия, ближе к концу вступают мягкие ударные;
 * volume — громкость (в воспоминаниях тише); finale — с ближайшего такта финал: тот же минор, но светлее —
 * круг с мажорными аккордами, полная мелодия октавами, барабаны и тарелки: грустно, но с надеждой.
 */

const BPM = 66;
const BEAT = 60 / BPM;
const EIGHTHS_PER_BAR = 8;
/** Сколько тактов длится аккорд (в финале — по такту). */
const BARS_PER_CHORD = 2;
/** Планировщик: как часто заглядывать вперёд и на сколько секунд расписывать ноты заранее. */
const TICK_MS = 25;
const LOOKAHEAD = 0.2;
const MASTER_VOLUME = 0.3;
/** В финале — громче во столько раз. */
const FINALE_GAIN = 1.2;
/** Срез верхов: внизу горы глуше, к вершине — открытее, в финале — почти открыт, Гц. */
const CUTOFF_DARK = 1300;
const CUTOFF_BRIGHT = 4200;
const CUTOFF_FINALE = 10000;
/** Ударные вступают, когда яркость между этими значениями (тише → в полную силу «мягкого» хода). */
const DRUMS_FROM = 0.55;
const DRUMS_FULL = 0.9;
/** Реверберация: длина «хвоста», с, и доля в звуке. */
const REVERB_SECONDS = 3.5;
const REVERB_WET = 0.45;
/** Эхо мелодии: задержка (пунктирная восьмая), повторы и доля. */
const DELAY_TIME = BEAT * 0.75;
const DELAY_FEEDBACK = 0.35;
const DELAY_WET = 0.25;

/** Нота по номеру MIDI → Гц. */
const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

interface Chord {
	/** Бас (MIDI) и ноты подложки (MIDI). */
	bass: number;
	notes: number[];
	/** Финал: мелодия по восьмым такта (MIDI, 0 — пауза). */
	melody?: number[];
}

/** Am9 — Fmaj7 — Cadd9 — Em7 — Am9 — Fmaj7 — Dm9 — Esus4: по два такта, по кругу (~58 с). */
const CHORDS: Chord[] = [
	{ bass: 45, notes: [57, 60, 64, 71] },
	{ bass: 41, notes: [57, 60, 64, 65] },
	{ bass: 48, notes: [55, 60, 62, 64] },
	{ bass: 40, notes: [55, 59, 62, 64] },
	{ bass: 45, notes: [57, 60, 64, 71] },
	{ bass: 41, notes: [57, 60, 64, 65] },
	{ bass: 38, notes: [57, 60, 62, 65] },
	{ bass: 40, notes: [57, 59, 62, 64] },
];
/**
 * Финал: Am — F — C — G (i — VI — III — VII) — по такту. Остаётся грустным (минор), но каждая фраза уходит
 * в мажорные C и G — светлеет. Мелодия — долгие ноты, мягкие спуски; во второй половине круга — выше,
 * с большой септимой над C. Восемь тактов по кругу.
 */
const FINALE: Chord[] = [
	{ bass: 45, notes: [57, 60, 64, 71], melody: [76, 0, 0, 0, 74, 0, 72, 0] },
	{ bass: 41, notes: [57, 60, 64, 65], melody: [72, 0, 0, 74, 76, 0, 0, 0] },
	{ bass: 48, notes: [55, 60, 62, 64], melody: [79, 0, 0, 0, 76, 0, 74, 0] },
	{ bass: 43, notes: [55, 59, 62, 67], melody: [74, 0, 0, 0, 71, 0, 74, 0] },
	{ bass: 45, notes: [57, 60, 64, 71], melody: [76, 0, 0, 0, 81, 0, 79, 76] },
	{ bass: 41, notes: [57, 60, 64, 65], melody: [77, 0, 76, 0, 72, 0, 0, 0] },
	{ bass: 48, notes: [55, 60, 62, 64], melody: [79, 0, 0, 0, 84, 0, 83, 79] },
	{ bass: 43, notes: [55, 59, 62, 67], melody: [83, 0, 0, 0, 79, 0, 0, 0] },
];
/** Мелодия — ля-минорная пентатоника в двух октавах (A4..A5 с запасом). */
const SCALE = [69, 72, 74, 76, 79, 81, 84, 86];

export interface MusicMood {
	/** 0..1 — громкость (поверх общей). */
	volume: number;
	/** 0..1 — светлее и живее; ближе к 1 — с ударными. */
	brightness: number;
	/** Финал (один раз и до конца). */
	finale?: boolean;
}

export class Music {
	private ctx: AudioContext | null = null;
	/** Сюда — всё; дальше: срез верхов → громкость настроения → выход (сухой звук и через реверберацию). */
	private master: GainNode | null = null;
	private lowpass: BiquadFilterNode | null = null;
	private moodGain: GainNode | null = null;
	/** Вход эха (мелодия). */
	private delayIn: GainNode | null = null;
	private noise: AudioBuffer | null = null;
	private timer: number | null = null;
	private nextTime = 0;
	private step = 0;
	private brightness = 0;
	/** Где мелодия сейчас (индекс в SCALE). */
	private melodyIndex = 2;
	/** Финал попросили — начнётся с ближайшего такта; с какой восьмой начался (null — ещё нет). */
	private finaleRequested = false;
	private finaleStep: number | null = null;

	/** Запустить (только из жеста пользователя — иначе браузер не даст звук). Громкость нарастает плавно. */
	start(): void {
		if (this.timer !== null) return;
		const ctx = this._context();
		if (ctx.state === 'suspended') void ctx.resume();
		const gain = this.master!.gain;
		gain.setValueAtTime(0, ctx.currentTime);
		gain.linearRampToValueAtTime(MASTER_VOLUME, ctx.currentTime + 4);
		this.nextTime = ctx.currentTime + 0.2;
		this.step = 0;
		this.timer = window.setInterval(() => this._schedule(), TICK_MS);
	}

	/** Настроение: меняется плавно, можно звать каждый кадр. */
	setMood({ volume, brightness, finale }: MusicMood): void {
		this.brightness = brightness;
		if (finale) this.finaleRequested = true;
		if (!this.ctx) return;
		const t = this.ctx.currentTime;
		this.moodGain!.gain.setTargetAtTime(volume, t, 0.5);
		if (this.finaleStep === null) this.lowpass!.frequency.setTargetAtTime(CUTOFF_DARK + (CUTOFF_BRIGHT - CUTOFF_DARK) * brightness, t, 0.8);
	}

	private _context(): AudioContext {
		if (this.ctx) return this.ctx;
		const ctx = (this.ctx = new AudioContext());
		this.master = ctx.createGain();
		this.master.gain.value = 0;
		this.lowpass = ctx.createBiquadFilter();
		this.lowpass.type = 'lowpass';
		this.lowpass.frequency.value = CUTOFF_DARK;
		this.lowpass.Q.value = 0.4;
		this.moodGain = ctx.createGain();
		this.master.connect(this.lowpass);
		this.lowpass.connect(this.moodGain);
		this.moodGain.connect(ctx.destination);

		const reverb = ctx.createConvolver();
		reverb.buffer = this._impulse(ctx);
		const wet = ctx.createGain();
		wet.gain.value = REVERB_WET;
		this.moodGain.connect(reverb);
		reverb.connect(wet);
		wet.connect(ctx.destination);

		// Эхо: вход → задержка ⟲ (затухающая петля) → в общий звук.
		this.delayIn = ctx.createGain();
		this.delayIn.gain.value = DELAY_WET;
		const delay = ctx.createDelay(2);
		delay.delayTime.value = DELAY_TIME;
		const feedback = ctx.createGain();
		feedback.gain.value = DELAY_FEEDBACK;
		this.delayIn.connect(delay);
		delay.connect(feedback);
		feedback.connect(delay);
		delay.connect(this.master);

		// Шум для ударных.
		this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
		const data = this.noise.getChannelData(0);
		for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
		return ctx;
	}

	/** «Комната» для реверберации: стерео-шум, затухающий за REVERB_SECONDS. */
	private _impulse(ctx: AudioContext): AudioBuffer {
		const length = Math.floor(ctx.sampleRate * REVERB_SECONDS);
		const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
		for (let ch = 0; ch < 2; ch++) {
			const data = buffer.getChannelData(ch);
			for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.5);
		}
		return buffer;
	}

	private _schedule(): void {
		const ctx = this.ctx!;
		while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
			this._playStep(this.step, this.nextTime);
			this.nextTime += BEAT / 2;
			this.step++;
		}
	}

	/** Одна восьмая: step — номер с начала, t — когда играть. */
	private _playStep(step: number, t: number): void {
		const eighth = step % EIGHTHS_PER_BAR;
		// Финал — с начала такта: громче, открыт верх, удар тарелкой.
		if (this.finaleRequested && this.finaleStep === null && eighth === 0) {
			this.finaleStep = step;
			const gain = this.master!.gain;
			gain.cancelScheduledValues(t);
			gain.setValueAtTime(gain.value, t);
			gain.linearRampToValueAtTime(MASTER_VOLUME * FINALE_GAIN, t + 2);
			this.lowpass!.frequency.cancelScheduledValues(t);
			this.lowpass!.frequency.setTargetAtTime(CUTOFF_FINALE, t, 1);
		}
		if (this.finaleStep !== null) {
			this._playFinaleStep(step - this.finaleStep, t);
			return;
		}
		const bar = Math.floor(step / EIGHTHS_PER_BAR);
		const chord = CHORDS[Math.floor(bar / BARS_PER_CHORD) % CHORDS.length];
		const chordStart = bar % BARS_PER_CHORD === 0 && eighth === 0;
		const length = BEAT * 4 * BARS_PER_CHORD;

		// Подложка и бас — на смену аккорда, тянутся до следующего.
		if (chordStart) {
			for (const note of chord.notes) this._pad(hz(note), t, length, 0.018);
			this._bass(hz(chord.bass), t, length, 0.12);
		}
		// Арпеджио — тихие восьмые по нотам аккорда (вверх и обратно), кое-где пропуск; к вершине — на октаву выше.
		const arpOrder = [0, 1, 2, 3, 2, 1, 2, 3];
		if (Math.random() < 0.8) {
			const octave = this.brightness > 0.6 && bar % 2 === 1 ? 12 : 0;
			this._piano(hz(chord.notes[arpOrder[eighth]] + octave), t, 0.035 * (eighth === 0 ? 1.4 : 1), 1.8);
		}
		// Мелодия: на чётные восьмые, редко внизу и чаще наверху; шагом по пентатонике, иногда — прыжок.
		const density = 0.18 + 0.35 * this.brightness;
		if (eighth % 2 === 0 && Math.random() < density) {
			const move = Math.random() < 0.75 ? (Math.random() < 0.5 ? -1 : 1) : Math.random() < 0.5 ? -2 : 2;
			this.melodyIndex = Math.min(SCALE.length - 1, Math.max(0, this.melodyIndex + move));
			this._piano(hz(SCALE[this.melodyIndex]), t, 0.07, 3, true);
		}
		// Ближе к концу — мягкие ударные: бочка на 1 и 3, щётка на 2 и 4, тихий шейкер восьмыми.
		const drums = smoothstep(this.brightness, DRUMS_FROM, DRUMS_FULL);
		if (drums > 0.01) {
			if (eighth === 0 || eighth === 4) this._kick(t, 0.35 * drums);
			if (eighth === 2 || eighth === 6) this._snare(t, 0.12 * drums, 0.18);
			this._hat(t, 0.02 * drums * (eighth % 2 === 0 ? 1 : 0.6));
		}
	}

	/** Финал: step — восьмая от начала финала. По такту на аккорд, всё в полную силу. */
	private _playFinaleStep(step: number, t: number): void {
		const eighth = step % EIGHTHS_PER_BAR;
		const bar = Math.floor(step / EIGHTHS_PER_BAR);
		const chord = FINALE[bar % FINALE.length];
		const sixteenth = BEAT / 4;
		if (eighth === 0) {
			// Аккорд: подложка громче и на две октавы (снизу и сверху), бас с октавой, удар тарелки в начале фраз.
			for (const note of chord.notes) {
				this._pad(hz(note), t, BEAT * 4, 0.03);
				this._pad(hz(note + 12), t, BEAT * 4, 0.014);
			}
			this._bass(hz(chord.bass), t, BEAT * 4, 0.2);
			this._bass(hz(chord.bass + 12), t, BEAT * 4, 0.07);
			if (bar % 4 === 0) this._crash(t, 0.22);
		}
		// Арпеджио восьмыми — по аккорду на октаву выше, вверх и обратно.
		const arpOrder = [0, 1, 2, 3, 2, 1, 2, 3];
		this._piano(hz(chord.notes[arpOrder[eighth]] + 12), t, 0.03, 1.8);
		// Мелодия — октавами, с долгим звуком и эхом.
		const note = chord.melody![eighth];
		if (note > 0) {
			this._piano(hz(note), t, 0.1, 4.5, true);
			this._piano(hz(note - 12), t, 0.05, 4);
		}
		// Барабаны — неспешно: бочка на 1 и 3 (и тихо на «и» второй), малый с хвостом на 2 и 4, хэты восьмыми;
		// в конце круга — короткая дробь.
		const fill = bar % FINALE.length === FINALE.length - 1 && eighth >= 6;
		if (eighth === 0 || eighth === 4) this._kick(t, 0.5);
		if (eighth === 3) this._kick(t, 0.25);
		if (fill) {
			this._snare(t, 0.22, 0.12);
			this._snare(t + sixteenth, 0.28, 0.12);
		} else if (eighth === 2 || eighth === 6) this._snare(t, 0.3, 0.35);
		this._hat(t, eighth % 2 === 0 ? 0.035 : 0.022);
	}

	/** Фортепиано: синус с обертонами, быстрый удар и долгое затухание (верхние гармоники гаснут раньше). */
	private _piano(freq: number, t: number, level: number, decay: number, echo = false): void {
		const ctx = this.ctx!;
		const out = ctx.createGain();
		out.gain.setValueAtTime(0.0001, t);
		out.gain.linearRampToValueAtTime(level, t + 0.008);
		out.gain.exponentialRampToValueAtTime(0.0001, t + decay);
		out.connect(this.master!);
		if (echo) out.connect(this.delayIn!);
		for (const [mult, mix, fade] of [
			[1, 1, 1],
			[2, 0.35, 0.5],
			[3, 0.12, 0.3],
		] as const) {
			const osc = ctx.createOscillator();
			osc.type = 'sine';
			osc.frequency.value = freq * mult;
			const g = ctx.createGain();
			g.gain.setValueAtTime(mix, t);
			g.gain.exponentialRampToValueAtTime(0.0001, t + decay * fade);
			osc.connect(g);
			g.connect(out);
			osc.start(t);
			osc.stop(t + decay + 0.05);
		}
	}

	/** Подложка: два чуть расстроенных треугольника, медленно вступают и медленно гаснут. */
	private _pad(freq: number, t: number, length: number, level: number): void {
		const ctx = this.ctx!;
		const gain = ctx.createGain();
		gain.gain.setValueAtTime(0.0001, t);
		gain.gain.linearRampToValueAtTime(level, t + Math.min(length * 0.3, 1.5));
		gain.gain.linearRampToValueAtTime(level * 0.7, t + length * 0.8);
		gain.gain.linearRampToValueAtTime(0.0001, t + length + 0.8);
		gain.connect(this.master!);
		for (const detune of [-7, 7]) {
			const osc = ctx.createOscillator();
			osc.type = 'triangle';
			osc.frequency.value = freq;
			osc.detune.value = detune;
			osc.connect(gain);
			osc.start(t);
			osc.stop(t + length + 0.9);
		}
	}

	/** Бас: мягкий синус, тянется весь аккорд. */
	private _bass(freq: number, t: number, length: number, level: number): void {
		const ctx = this.ctx!;
		const gain = ctx.createGain();
		gain.gain.setValueAtTime(0.0001, t);
		gain.gain.linearRampToValueAtTime(level, t + 0.3);
		gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
		gain.connect(this.master!);
		const osc = ctx.createOscillator();
		osc.type = 'sine';
		osc.frequency.value = freq;
		osc.connect(gain);
		osc.start(t);
		osc.stop(t + length + 0.05);
	}

	/** Бочка: синус, быстро падающий по высоте. */
	private _kick(t: number, level: number): void {
		const ctx = this.ctx!;
		const osc = ctx.createOscillator();
		osc.frequency.setValueAtTime(110, t);
		osc.frequency.exponentialRampToValueAtTime(42, t + 0.14);
		const gain = ctx.createGain();
		gain.gain.setValueAtTime(level, t);
		gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
		osc.connect(gain);
		gain.connect(this.master!);
		osc.start(t);
		osc.stop(t + 0.5);
	}

	/** Малый (щётка): шум через полосовой фильтр; length — длина хвоста, с. */
	private _snare(t: number, level: number, length: number): void {
		this._noiseHit(t, 'bandpass', 1800, 0.7, length, level);
	}

	private _hat(t: number, level: number): void {
		this._noiseHit(t, 'highpass', 7000, 0.7, 0.05, level * (0.8 + Math.random() * 0.4));
	}

	/** Тарелка: долгий шипящий шум сверху. */
	private _crash(t: number, level: number): void {
		this._noiseHit(t, 'highpass', 5000, 0.5, 2.2, level);
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
		gain.connect(this.master!);
		// Каждый удар — с разного места буфера, чтобы шум не повторялся.
		src.start(t, Math.random() * 0.8);
		src.stop(t + length + 0.05);
	}
}

function smoothstep(x: number, min: number, max: number): number {
	const k = Math.min(1, Math.max(0, (x - min) / (max - min)));
	return k * k * (3 - 2 * k);
}
