import * as THREE from 'three';
import { GeometryBatch, part } from '../props/GeometryBatch.js';
import { createRng } from '../../utils/random.js';
import type { MountainPath } from './MountainShape.js';

/** Полуширина настила, м: по нему и ходим. */
export const DECK_HALF_WIDTH = 0.85;
/** Насколько провисает середина моста, м. */
const SAG = 0.9;
/** Шаг досок, м, и высота поручней над настилом. */
const PLANK_STEP = 0.38;
const RAIL_HEIGHT = 1.0;
const HANGER_STEP = 1.2;
const PLANK = new THREE.Color('#6b4a32');
const ROPE = new THREE.Color('#8f7d5c');
const POST = new THREE.Color('#4d3626');

const G = {
	plank: part(new THREE.BoxGeometry(DECK_HALF_WIDTH * 2 + 0.1, 0.06, PLANK_STEP * 0.8)),
	/** Палка длиной 1 вдоль Y (основание в 0) — растягивается между двумя точками. */
	rope: part(new THREE.CylinderGeometry(0.025, 0.025, 1, 4), 0, 0.5),
	post: part(new THREE.CylinderGeometry(0.09, 0.11, 1.6, 6), 0, 0.5),
};

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _d = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Подвесной мост над ущельем по участку тропы [start, end]: настил провисает, по бокам — верёвочные поручни. */
export class Bridge {
	readonly mesh: THREE.Mesh;
	private readonly ya: number;
	private readonly yb: number;

	constructor(
		private readonly path: MountainPath,
		readonly start: number,
		readonly end: number
	) {
		const p = new THREE.Vector3();
		this.ya = path.pointAt(start, p).y;
		this.yb = path.pointAt(end, p).y;
		const batch = new GeometryBatch(createRng(11));
		const dir = new THREE.Vector3();
		const side = new THREE.Vector3();
		const rail = (s: number, k: number, out: THREE.Vector3) => {
			path.pointAt(s, out, dir);
			side.set(-dir.z, 0, dir.x);
			out.addScaledVector(side, k * (DECK_HALF_WIDTH + 0.05));
			out.y = this.deckY(s) + RAIL_HEIGHT;
			return out;
		};

		// Доски поперёк, чуть вразнобой.
		for (let s = start; s <= end; s += PLANK_STEP) {
			path.pointAt(s, p, dir);
			p.y = this.deckY(s) - 0.03;
			_q.setFromAxisAngle(UP, Math.atan2(dir.x, dir.z) + (Math.random() - 0.5) * 0.06);
			batch.add(G.plank, _m.compose(p, _q, _s.set(1, 1, 1)), PLANK, 0.25);
		}
		// Поручни и подвесы: верёвка по каждой стороне, от неё вниз к краю настила.
		const a = new THREE.Vector3();
		const b = new THREE.Vector3();
		for (const k of [-1, 1]) {
			for (let s = start; s < end; s += HANGER_STEP) {
				const s2 = Math.min(end, s + HANGER_STEP);
				this._stick(batch, rail(s, k, a), rail(s2, k, b), ROPE);
				b.copy(a);
				b.y = this.deckY(s);
				this._stick(batch, a, b, ROPE);
			}
			// Столбы на обоих концах.
			for (const s of [start, end]) {
				rail(s, k, a);
				a.y = this.deckY(s) - 0.5;
				batch.add(G.post, _m.makeTranslation(a.x, a.y, a.z), POST, 0.2);
			}
		}
		this.mesh = new THREE.Mesh(batch.build(), new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
		this.mesh.castShadow = true;
		this.mesh.receiveShadow = true;
	}

	/** Высота настила на участке тропы s: прямая между концами минус провис. */
	deckY(s: number): number {
		const u = THREE.MathUtils.clamp((s - this.start) / (this.end - this.start), 0, 1);
		return THREE.MathUtils.lerp(this.ya, this.yb, u) - SAG * Math.sin(Math.PI * u);
	}

	/** Высота настила под точкой (x, z); null — точка не на мосту. */
	heightAt(x: number, z: number): number | null {
		const hit = this.path.nearest(x, z, DECK_HALF_WIDTH);
		if (!hit || hit.s < this.start || hit.s > this.end) return null;
		return this.deckY(hit.s);
	}

	/** Тонкая палка из a в b. */
	private _stick(batch: GeometryBatch, a: THREE.Vector3, b: THREE.Vector3, color: THREE.Color): void {
		_d.subVectors(b, a);
		const len = _d.length();
		if (len < 1e-4) return;
		_q.setFromUnitVectors(UP, _d.divideScalar(len));
		batch.add(G.rope, _m.compose(a, _q, _s.set(1, len, 1)), color, 0.1);
	}
}
