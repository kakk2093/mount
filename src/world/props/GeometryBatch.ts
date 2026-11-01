import * as THREE from 'three';
import type { Rng } from '../../utils/random.js';

const _v = new THREE.Vector3();
const _c = new THREE.Color();

/**
 * Склейка многих мелких low-poly деталей в одну геометрию с цветами по вершинам:
 * весь чанк рисуется парой draw call'ов вместо десятков InstancedMesh.
 * Детали должны быть неиндексированными (см. part()).
 */
export class GeometryBatch {
	private readonly positions: number[] = [];
	private readonly colors: number[] = [];

	constructor(private readonly rng: Rng) {}

	get isEmpty(): boolean {
		return this.positions.length === 0;
	}

	/**
	 * @param shade разброс яркости по граням (0 — ровный цвет): грани читаются даже в тени
	 * Отрицательный масштаб в matrix вывернет грани — не использовать.
	 */
	add(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4, color: THREE.Color, shade = 0.12): void {
		const pos = geometry.attributes.position;
		for (let i = 0; i < pos.count; i++) {
			_v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
			this.positions.push(_v.x, _v.y, _v.z);
			if (i % 3 === 0) _c.copy(color).multiplyScalar(1 - shade / 2 + this.rng() * shade);
			this.colors.push(_c.r, _c.g, _c.b);
		}
	}

	build(): THREE.BufferGeometry {
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
		geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
		geometry.computeVertexNormals();
		geometry.computeBoundingSphere();
		return geometry;
	}
}

/** Готовит деталь для склейки: без индексов, со смещением. */
export function part(geometry: THREE.BufferGeometry, x = 0, y = 0, z = 0): THREE.BufferGeometry {
	const flat = geometry.index ? geometry.toNonIndexed() : geometry;
	if (flat !== geometry) geometry.dispose();
	flat.deleteAttribute('uv');
	flat.deleteAttribute('normal');
	flat.translate(x, y, z);
	return flat;
}
