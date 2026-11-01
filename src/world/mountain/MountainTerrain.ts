import * as THREE from 'three';
import type { MountainShape } from './MountainShape.js';

/** Земля — квадрат ±HALF м с шагом сетки STEP м. */
export const TERRAIN_HALF = 330;
const HALF = TERRAIN_HALF;
const STEP = 1.5;
const SNOW = new THREE.Color('#cdd6e2');
const ROCK = new THREE.Color('#3d4149');
/** Утоптанная тропа — темнее снега, видна и ночью. */
const TRAIL = new THREE.Color('#6e675f');
const _rock = new THREE.Color();

/**
 * Сетка высот по форме горы: меш (плоские грани, цвета по вершинам) и точная высота поверхности — по тем же
 * треугольникам, что в меше (между вершинами меш линеен, гладкая функция в ямах шла бы выше).
 */
export class MountainTerrain {
	readonly mesh: THREE.Mesh;
	private readonly n = Math.round((HALF * 2) / STEP);
	private readonly heights: Float32Array;

	constructor(shape: MountainShape) {
		const n = this.n;
		const count = (n + 1) * (n + 1);
		this.heights = new Float32Array(count);
		const trail = new Float32Array(count);
		const crest = new Float32Array(count);
		for (let j = 0; j <= n; j++) {
			for (let i = 0; i <= n; i++) {
				const x = -HALF + i * STEP;
				const z = -HALF + j * STEP;
				const k = j * (n + 1) + i;
				this.heights[k] = shape.heightAt(x, z);
				const hit = shape.path.nearest(x, z);
				trail[k] = hit ? 1 - THREE.MathUtils.smoothstep(hit.dist, 1.2, 2.6) : 0;
				crest[k] = THREE.MathUtils.smoothstep(shape.relief(x, z, false), 1.5, 5);
				if (hit && shape.onBridge(hit.s)) trail[k] = 0;
			}
		}

		const positions = new Float32Array(count * 3);
		const colors = new Float32Array(count * 3);
		const c = new THREE.Color();
		for (let j = 0; j <= n; j++) {
			for (let i = 0; i <= n; i++) {
				const k = j * (n + 1) + i;
				positions[k * 3] = -HALF + i * STEP;
				positions[k * 3 + 1] = this.heights[k];
				positions[k * 3 + 2] = -HALF + j * STEP;
				// Крутое и гребни отрогов (снег сдувает ветром) — голая скала; на скале — слои породы полосами по высоте;
				// тропа — утоптана; мелкий разброс, чтобы не было пятном.
				const slope = this._gridSlope(i, j);
				const y = this.heights[k];
				const rock = Math.max(THREE.MathUtils.smoothstep(slope, 1.05, 1.4), crest[k] * 0.85);
				const strata = 0.75 + 0.35 * (Math.sin(y * 0.55 + Math.sin(positions[k * 3] * 0.04) * 2) > 0.3 ? 1 : 0);
				c.copy(SNOW).lerp(_rock.copy(ROCK).multiplyScalar(strata), rock);
				c.lerp(TRAIL, trail[k] * 0.85);
				c.multiplyScalar(0.94 + Math.random() * 0.08);
				colors[k * 3] = c.r;
				colors[k * 3 + 1] = c.g;
				colors[k * 3 + 2] = c.b;
			}
		}
		// Два треугольника на клетку; диагональ — из (i, j+1) в (i+1, j) (см. getHeightAt).
		const index = new Uint32Array(n * n * 6);
		let o = 0;
		for (let j = 0; j < n; j++) {
			for (let i = 0; i < n; i++) {
				const a = j * (n + 1) + i;
				const b = a + 1;
				const cc = a + n + 1;
				const d = cc + 1;
				index.set([a, cc, b, b, cc, d], o);
				o += 6;
			}
		}
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
		geometry.setIndex(new THREE.BufferAttribute(index, 1));
		geometry.computeVertexNormals();
		geometry.computeBoundingSphere();
		this.mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
		this.mesh.receiveShadow = true;
	}

	/** Высота видимой поверхности в точке (по треугольникам меша). */
	getHeightAt(x: number, z: number): number {
		const n = this.n;
		const gx = THREE.MathUtils.clamp((x + HALF) / STEP, 0, n - 1e-4);
		const gz = THREE.MathUtils.clamp((z + HALF) / STEP, 0, n - 1e-4);
		const i = Math.floor(gx);
		const j = Math.floor(gz);
		const fx = gx - i;
		const fz = gz - j;
		const h = this.heights;
		const k = j * (n + 1) + i;
		const h01 = h[k + n + 1];
		const h10 = h[k + 1];
		if (fx + fz <= 1) {
			const h00 = h[k];
			return h00 + (h10 - h00) * fx + (h01 - h00) * fz;
		}
		const h11 = h[k + n + 2];
		return h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
	}

	/** Крутизна (тангенс) по соседним узлам сетки. */
	slopeAt(x: number, z: number): number {
		const e = STEP;
		const dx = this.getHeightAt(x + e, z) - this.getHeightAt(x - e, z);
		const dz = this.getHeightAt(x, z + e) - this.getHeightAt(x, z - e);
		return Math.hypot(dx, dz) / (2 * e);
	}

	private _gridSlope(i: number, j: number): number {
		const n = this.n;
		const h = (a: number, b: number) => this.heights[THREE.MathUtils.clamp(b, 0, n) * (n + 1) + THREE.MathUtils.clamp(a, 0, n)];
		return Math.hypot(h(i + 1, j) - h(i - 1, j), h(i, j + 1) - h(i, j - 1)) / (2 * STEP);
	}
}
