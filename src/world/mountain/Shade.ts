import * as THREE from 'three';

/** Силуэт по высоте: [высота центра клуба, радиус], м — от ног до головы. */
const PROFILE: [number, number][] = [
	[0.15, 0.2],
	[0.4, 0.26],
	[0.65, 0.29],
	[0.9, 0.29],
	[1.1, 0.26],
	[1.26, 0.18],
	[1.45, 0.17],
];
/** Клубов на каждый уровень силуэта. */
const PER_LEVEL = 3;
/** Струйки с головы: сколько, как высоко уходят, м, и как быстро (доля пути в секунду). */
const WISPS = 7;
const WISP_HEIGHT = 1.6;
const WISP_SPEED = 0.18;
const COLOR = '#07080d';

/**
 * Тень у костра: тёмная фигура из полупрозрачных клубов, как сгусток дыма. Клубы медленно колышутся и дышат,
 * с головы тянутся вверх и тают струйки. Свет на неё не действует — она темнее всего вокруг, даже у огня.
 */
export class Shade {
	readonly group = new THREE.Group();
	private readonly puffs: { mesh: THREE.Mesh; base: THREE.Vector3; r: number; phase: number }[] = [];
	private readonly wisps: { mesh: THREE.Mesh; life: number; angle: number }[] = [];

	constructor(x: number, y: number, z: number) {
		this.group.position.set(x, y, z);
		const geo = new THREE.IcosahedronGeometry(1, 1);
		const body = new THREE.MeshBasicMaterial({ color: COLOR, transparent: true, opacity: 0.55, depthWrite: false });
		for (const [h, r] of PROFILE) {
			for (let i = 0; i < PER_LEVEL; i++) {
				const a = (i / PER_LEVEL) * Math.PI * 2 + Math.random();
				const off = r * 0.35;
				const base = new THREE.Vector3(Math.cos(a) * off, h, Math.sin(a) * off * 0.7);
				const mesh = new THREE.Mesh(geo, body);
				mesh.position.copy(base);
				this.puffs.push({ mesh, base, r: r * (0.75 + Math.random() * 0.3), phase: Math.random() * 10 });
				this.group.add(mesh);
			}
		}
		for (let i = 0; i < WISPS; i++) {
			const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: COLOR, transparent: true, opacity: 0, depthWrite: false }));
			this.wisps.push({ mesh, life: i / WISPS, angle: Math.random() * Math.PI * 2 });
			this.group.add(mesh);
		}
	}

	update(time: number, dt: number): void {
		// Клубы плавают вокруг своего места и дышат, каждый в своём ритме.
		for (const p of this.puffs) {
			const t = time * 0.7 + p.phase;
			p.mesh.position.set(p.base.x + Math.sin(t) * 0.04, p.base.y + Math.sin(t * 1.3) * 0.03, p.base.z + Math.cos(t * 0.9) * 0.04);
			p.mesh.scale.setScalar(p.r * (1 + Math.sin(t * 1.7) * 0.08));
		}
		// Струйки: отрываются от головы, поднимаются, разрастаются и тают; долетев — снова с головы.
		for (const w of this.wisps) {
			w.life += dt * WISP_SPEED;
			if (w.life >= 1) {
				w.life -= 1;
				w.angle = Math.random() * Math.PI * 2;
			}
			const l = w.life;
			const drift = l * 0.35;
			w.mesh.position.set(Math.cos(w.angle) * drift + Math.sin(time + w.angle) * 0.05 * l, 1.45 + l * WISP_HEIGHT, Math.sin(w.angle) * drift);
			w.mesh.scale.setScalar(0.12 + l * 0.25);
			(w.mesh.material as THREE.MeshBasicMaterial).opacity = 0.45 * (1 - l) * Math.min(1, l * 6);
		}
	}
}
