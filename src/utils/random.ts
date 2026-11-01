/** Детерминированный ГСЧ (mulberry32): один seed — один и тот же мир. */
export type Rng = () => number;
export type Noise2D = (x: number, y: number, octaves?: number) => number;

export function createRng(seed: number): Rng {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = s;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Value-noise с fbm. Возвращает значения примерно в диапазоне 0..1. */
export function createNoise2D(rng: Rng): Noise2D {
	const SIZE = 256;
	const MASK = SIZE - 1;
	const perm = new Uint8Array(SIZE * 2);
	const values = new Float32Array(SIZE);
	for (let i = 0; i < SIZE; i++) {
		perm[i] = i;
		values[i] = rng();
	}
	for (let i = SIZE - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[perm[i], perm[j]] = [perm[j], perm[i]];
	}
	for (let i = 0; i < SIZE; i++) perm[i + SIZE] = perm[i];

	const lattice = (x: number, y: number): number => values[perm[perm[x & MASK] + (y & MASK)]];
	const smooth = (t: number): number => t * t * (3 - 2 * t);

	const noise = (x: number, y: number): number => {
		const xi = Math.floor(x);
		const yi = Math.floor(y);
		const u = smooth(x - xi);
		const v = smooth(y - yi);
		const a = lattice(xi, yi);
		const b = lattice(xi + 1, yi);
		const c = lattice(xi, yi + 1);
		const d = lattice(xi + 1, yi + 1);
		return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
	};

	return (x, y, octaves = 4) => {
		let sum = 0;
		let amp = 0.5;
		let freq = 1;
		let norm = 0;
		for (let i = 0; i < octaves; i++) {
			sum += noise(x * freq, y * freq) * amp;
			norm += amp;
			amp *= 0.5;
			freq *= 2;
		}
		return sum / norm;
	};
}

/** Детерминированный seed из набора целых (например, координат чанка). */
export function hashSeed(...values: number[]): number {
	let h = 0x811c9dc5;
	for (const v of values) {
		h = Math.imul(h ^ (v | 0), 0x01000193);
		h ^= h >>> 13;
	}
	return h >>> 0;
}
