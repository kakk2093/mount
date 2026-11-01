/** Звуки реанимации — процедурные: нажатие на грудь и вдох мешком Амбу. */
export class CprSounds {
	private ctx: AudioContext | null = null;
	private noise: AudioBuffer | null = null;

	/** Нажатие: глухой удар в грудь и короткий шорох одежды. */
	press(): void {
		const ctx = this._context();
		const t = ctx.currentTime;
		const osc = ctx.createOscillator();
		osc.type = 'sine';
		osc.frequency.setValueAtTime(95, t);
		osc.frequency.exponentialRampToValueAtTime(48, t + 0.14);
		const gain = ctx.createGain();
		gain.gain.setValueAtTime(0.0001, t);
		gain.gain.linearRampToValueAtTime(0.6, t + 0.01);
		gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
		osc.connect(gain);
		gain.connect(ctx.destination);
		osc.start(t);
		osc.stop(t + 0.25);
		this._noise(t, 'bandpass', 1400, 0.6, 0, 0.02, 0.1, 0.08);
	}

	/** Вдох: мешок сжимается — шипение воздуха, щелчок клапана; мешок расправляется — тихий вдох обратно. */
	breath(seconds: number): void {
		const ctx = this._context();
		const t = ctx.currentTime;
		this._noise(t, 'bandpass', 900, 0.8, 0.05, seconds * 0.15, seconds * 0.45, 0.12);
		this._noise(t + seconds * 0.5, 'bandpass', 1600, 1, 0.1, seconds * 0.1, seconds * 0.4, 0.05);
		// Клапан: короткий пластиковый щелчок.
		this._noise(t + 0.05, 'highpass', 3000, 0.7, 0, 0.003, 0.03, 0.15);
	}

	close(): void {
		void this.ctx?.close();
		this.ctx = null;
	}

	private _context(): AudioContext {
		if (!this.ctx) {
			this.ctx = new AudioContext();
			this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
			const data = this.noise.getChannelData(0);
			for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
		}
		if (this.ctx.state === 'suspended') void this.ctx.resume();
		return this.ctx;
	}

	/** Шум через фильтр: delay — когда начать, attack — нарастание, length — длина целиком, с. */
	private _noise(t: number, type: BiquadFilterType, freq: number, q: number, delay: number, attack: number, length: number, volume: number): void {
		const ctx = this.ctx!;
		const start = t + delay;
		const src = ctx.createBufferSource();
		src.buffer = this.noise;
		const filter = ctx.createBiquadFilter();
		filter.type = type;
		filter.frequency.value = freq;
		filter.Q.value = q;
		const gain = ctx.createGain();
		gain.gain.setValueAtTime(0.0001, start);
		gain.gain.linearRampToValueAtTime(volume, start + Math.max(attack, 0.002));
		gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
		src.connect(filter);
		filter.connect(gain);
		gain.connect(ctx.destination);
		src.start(start, Math.random() * 0.5);
		src.stop(start + length + 0.05);
	}
}
