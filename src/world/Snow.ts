import * as THREE from 'three';

/** Снегопад: хлопья-точки в кубе вокруг камеры. */
const COUNT = 2500;
/** Сторона куба по X/Z и его высота, м: хлопья за границей переносятся на противоположную сторону. */
const AREA = 60;
const HEIGHT = 30;
/** Низ куба относительно камеры, м. */
const BELOW = 8;
/** Скорость падения, м/с (с разбросом) — медленно, в отличие от дождя. */
const FALL_SPEED = 1.3;
/** Ветер, м/с, и размах покачивания хлопьев из стороны в сторону. */
const WIND_X = 0.8;
const WIND_Z = -0.3;
const SWAY = 0.35;
/** Размер хлопка, м (с перспективой: вдали — точка в один пиксель). */
const FLAKE_SIZE = 0.14;

/** Перенос координаты в отрезок [center − size/2, center + size/2). */
const wrap = (v: number, center: number, size: number) => center + THREE.MathUtils.euclideanModulo(v - center + size / 2, size) - size / 2;

/**
 * Хлопья падают, покачиваются и сносятся ветром. Куб не «едет» за камерой целиком: каждый хлопок, вышедший
 * за его границу, переносится на другую сторону — поэтому и на скорости снег вокруг есть всегда.
 */
export class Snow {
	readonly points: THREE.Points;
	private readonly positions: Float32Array;
	/** Фаза покачивания и множитель скорости падения каждого хлопка. */
	private readonly phase: Float32Array;
	private readonly speed: Float32Array;
	private time = 0;

	constructor(center: THREE.Vector3) {
		this.positions = new Float32Array(COUNT * 3);
		this.phase = new Float32Array(COUNT);
		this.speed = new Float32Array(COUNT);
		for (let i = 0; i < COUNT; i++) {
			this.positions[i * 3] = center.x + (Math.random() - 0.5) * AREA;
			this.positions[i * 3 + 1] = center.y - BELOW + Math.random() * HEIGHT;
			this.positions[i * 3 + 2] = center.z + (Math.random() - 0.5) * AREA;
			this.phase[i] = Math.random() * Math.PI * 2;
			this.speed[i] = 0.7 + Math.random() * 0.6;
		}
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));

		const material = new THREE.PointsMaterial({ color: 0xf4f8ff, size: FLAKE_SIZE, sizeAttenuation: true, transparent: true, opacity: 0.9 });
		this.points = new THREE.Points(geometry, material);
		this.points.name = 'snow';
		// Хлопья всегда вокруг камеры — не даём рендереру срезать их по boundingSphere.
		this.points.frustumCulled = false;
	}

	/** 0..1 — какая доля хлопьев идёт (снегопад слабее/сильнее). */
	setDensity(k: number): void {
		this.points.geometry.setDrawRange(0, Math.round(COUNT * THREE.MathUtils.clamp(k, 0, 1)));
		this.points.visible = k > 0.001;
	}

	/** Цвет хлопьев (ночью темнее — иначе светятся в темноте). */
	setColor(color: THREE.Color): void {
		(this.points.material as THREE.PointsMaterial).color.copy(color);
	}

	/** wind — множитель ветра (наверху горы — метель: сносит сильнее и быстрее). */
	update(dt: number, center: THREE.Vector3, wind = 1): void {
		this.time += dt;
		const p = this.positions;
		const midY = center.y - BELOW + HEIGHT / 2;
		for (let i = 0; i < COUNT; i++) {
			const o = i * 3;
			const sway = Math.sin(this.time * 1.3 + this.phase[i]) * SWAY;
			p[o] = wrap(p[o] + (WIND_X * wind + sway) * dt, center.x, AREA);
			p[o + 1] = wrap(p[o + 1] - FALL_SPEED * this.speed[i] * dt, midY, HEIGHT);
			p[o + 2] = wrap(p[o + 2] + (WIND_Z * wind + sway * 0.5) * dt, center.z, AREA);
		}
		(this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
	}
}
