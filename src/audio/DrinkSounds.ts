/** Звуки застолья — процедурные, без файлов: глоток, водка льётся из бутылки, рюмку ставят на стол. */
export class DrinkSounds {
	private ctx: AudioContext | null = null;
	private noise: AudioBuffer | null = null;

	/** Выпить залпом: пара глухих глотков. */
	gulp(): void {
		const ctx = this._context();
		const t = ctx.currentTime;
		for (const [delay, level] of [
			[0, 0.5],
			[0.22, 0.35],
		]) {
			// Глоток: низкий тон, быстро уходящий вниз, и немного глухого шума.
			const osc = ctx.createOscillator();
			osc.type = 'sine';
			osc.frequency.setValueAtTime(260, t + delay);
			osc.frequency.exponentialRampToValueAtTime(90, t + delay + 0.12);
			const gain = ctx.createGain();
			gain.gain.setValueAtTime(0.0001, t + delay);
			gain.gain.linearRampToValueAtTime(level, t + delay + 0.015);
			gain.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.16);
			osc.connect(gain);
			gain.connect(ctx.destination);
			osc.start(t + delay);
			osc.stop(t + delay + 0.2);
			this._noise(t + delay, 'lowpass', 500, 0.14, level * 0.4);
		}
	}

	/** Налить: тихое шипение струи и булькающие пузырьки, seconds — сколько льётся. */
	pour(seconds: number): void {
		const ctx = this._context();
		const t = ctx.currentTime;
		// Струя: полосовой шум, плавно вступает и стихает.
		const src = ctx.createBufferSource();
		src.buffer = this.noise;
		src.loop = true;
		const filter = ctx.createBiquadFilter();
		filter.type = 'bandpass';
		filter.frequency.value = 1800;
		filter.Q.value = 1.2;
		const gain = ctx.createGain();
		gain.gain.setValueAtTime(0.0001, t);
		gain.gain.linearRampToValueAtTime(0.06, t + 0.08);
		gain.gain.setValueAtTime(0.06, t + seconds - 0.1);
		gain.gain.linearRampToValueAtTime(0.0001, t + seconds);
		src.connect(filter);
		filter.connect(gain);
		gain.connect(ctx.destination);
		src.start(t, Math.random() * 0.5);
		src.stop(t + seconds + 0.05);
		// «Буль»: короткие тоны, высота растёт — рюмка наполняется.
		for (let at = 0; at < seconds - 0.05; at += 0.045 + Math.random() * 0.04) {
			const fill = at / seconds;
			const freq = (500 + fill * 700) * (0.85 + Math.random() * 0.3);
			const osc = ctx.createOscillator();
			osc.type = 'sine';
			osc.frequency.setValueAtTime(freq, t + at);
			osc.frequency.exponentialRampToValueAtTime(freq * 1.5, t + at + 0.03);
			const g = ctx.createGain();
			g.gain.setValueAtTime(0.0001, t + at);
			g.gain.linearRampToValueAtTime(0.06, t + at + 0.005);
			g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.05);
			osc.connect(g);
			g.connect(ctx.destination);
			osc.start(t + at);
			osc.stop(t + at + 0.06);
		}
	}

	/** Рюмку ставят на стол: глухой стук и тонкий стеклянный звон. */
	clink(): void {
		const ctx = this._context();
		const t = ctx.currentTime;
		this._noise(t, 'lowpass', 900, 0.05, 0.3);
		for (const [freq, level] of [
			[3100, 0.05],
			[4700, 0.025],
		]) {
			const osc = ctx.createOscillator();
			osc.type = 'sine';
			osc.frequency.value = freq;
			const g = ctx.createGain();
			g.gain.setValueAtTime(level, t);
			g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
			osc.connect(g);
			g.connect(ctx.destination);
			osc.start(t);
			osc.stop(t + 0.4);
		}
	}

	close(): void {
		void this.ctx?.close();
		this.ctx = null;
	}

	private _context(): AudioContext {
		if (!this.ctx) {
			this.ctx = new AudioContext();
			this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
			const data = this.noise.getChannelData(0);
			for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
		}
		if (this.ctx.state === 'suspended') void this.ctx.resume();
		return this.ctx;
	}

	private _noise(t: number, type: BiquadFilterType, freq: number, length: number, volume: number): void {
		const ctx = this.ctx!;
		const src = ctx.createBufferSource();
		src.buffer = this.noise;
		const filter = ctx.createBiquadFilter();
		filter.type = type;
		filter.frequency.value = freq;
		const gain = ctx.createGain();
		gain.gain.setValueAtTime(volume, t);
		gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
		src.connect(filter);
		filter.connect(gain);
		gain.connect(ctx.destination);
		src.start(t, Math.random() * 0.5);
		src.stop(t + length + 0.05);
	}
}
