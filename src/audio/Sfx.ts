/** Короткие процедурные звуки — без внешних файлов. */
export class Sfx {
	private ctx: AudioContext | null = null;

	private _context(): AudioContext {
		if (!this.ctx) this.ctx = new AudioContext();
		if (this.ctx.state === 'suspended') void this.ctx.resume();
		return this.ctx;
	}

	/** Писк «голоса» при печати реплики: короткая пила через полосовой фильтр-гласную, pitch — высота голоса, Гц. */
	voice(pitch: number): void {
		const ctx = this._context();
		const t = ctx.currentTime + 0.005;
		const duration = 0.065;
		const osc = ctx.createOscillator();
		osc.type = 'sawtooth';
		const f = pitch * (0.88 + Math.random() * 0.3);
		osc.frequency.setValueAtTime(f, t);
		osc.frequency.linearRampToValueAtTime(f * (0.92 + Math.random() * 0.12), t + duration);
		const vowel = ctx.createBiquadFilter();
		vowel.type = 'bandpass';
		vowel.frequency.value = 700 + Math.random() * 900;
		vowel.Q.value = 2.5;
		const gain = ctx.createGain();
		gain.gain.setValueAtTime(0.0001, t);
		gain.gain.linearRampToValueAtTime(0.09, t + 0.008);
		gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
		osc.connect(vowel);
		vowel.connect(gain);
		gain.connect(ctx.destination);
		osc.start(t);
		osc.stop(t + duration + 0.02);
	}

	/** Цифровой сбой: рваные куски грубого шума и писка случайной высоты с провалами тишины, duration — длина, с. */
	glitch(duration = 0.4): void {
		const ctx = this._context();
		let t = ctx.currentTime + 0.01;
		const end = t + duration;
		while (t < end) {
			const piece = 0.015 + Math.random() * 0.035;
			const gain = ctx.createGain();
			gain.gain.setValueAtTime((0.18 + Math.random() * 0.2) / 4.5, t);
			gain.gain.setValueAtTime(0, t + piece);
			gain.connect(ctx.destination);
			if (Math.random() < 0.55) {
				const length = Math.max(1, Math.floor(ctx.sampleRate * piece));
				const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
				const data = buffer.getChannelData(0);
				const hold = 6 + Math.floor(Math.random() * 40);
				let value = 0;
				for (let i = 0; i < length; i++) {
					if (i % hold === 0) value = Math.random() < 0.5 ? -1 : 1;
					data[i] = value;
				}
				const crunch = ctx.createBufferSource();
				crunch.buffer = buffer;
				crunch.connect(gain);
				crunch.start(t);
			} else {
				const osc = ctx.createOscillator();
				osc.type = 'square';
				osc.frequency.setValueAtTime(80 + Math.random() * 1900, t);
				osc.connect(gain);
				osc.start(t);
				osc.stop(t + piece);
			}
			// Иногда — провал тишины между кусками.
			t += piece + (Math.random() < 0.25 ? 0.02 + Math.random() * 0.03 : 0);
		}
	}

	/** Громкий удар (дверь с ноги, падение): глухой низкий «бум» и короткий треск. loud — громкость, 1 — обычный. */
	bang(loud = 1): void {
		const ctx = this._context();
		const t = ctx.currentTime + 0.005;
		const boom = ctx.createOscillator();
		boom.frequency.setValueAtTime(90, t);
		boom.frequency.exponentialRampToValueAtTime(35, t + 0.3);
		const boomGain = ctx.createGain();
		boomGain.gain.setValueAtTime(0.7 * loud, t);
		boomGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
		boom.connect(boomGain);
		boomGain.connect(ctx.destination);
		boom.start(t);
		boom.stop(t + 0.55);
		const length = Math.floor(ctx.sampleRate * 0.25);
		const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
		const data = buffer.getChannelData(0);
		for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
		const crack = ctx.createBufferSource();
		crack.buffer = buffer;
		const filter = ctx.createBiquadFilter();
		filter.type = 'lowpass';
		filter.frequency.value = 2500;
		const crackGain = ctx.createGain();
		crackGain.gain.value = 0.5 * loud;
		crack.connect(filter);
		filter.connect(crackGain);
		crackGain.connect(ctx.destination);
		crack.start(t);
	}

	/** Щелчок (кнопка, выключатель, взять предмет). */
	click(): void {
		const ctx = this._context();
		const t = ctx.currentTime + 0.005;
		const osc = ctx.createOscillator();
		osc.type = 'square';
		osc.frequency.value = 1800;
		const gain = ctx.createGain();
		gain.gain.setValueAtTime(0.08, t);
		gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
		osc.connect(gain);
		gain.connect(ctx.destination);
		osc.start(t);
		osc.stop(t + 0.03);
	}
}
