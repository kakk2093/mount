import * as THREE from 'three';

const LOG = new THREE.MeshStandardMaterial({ color: '#3b2a1e', roughness: 1, flatShading: true });
const STONE = new THREE.MeshStandardMaterial({ color: '#4a4d55', roughness: 1, flatShading: true });
/** Пламя светится само и туманом не гасится — костёр видно издалека, он ведёт к себе. */
const FLAME_OUTER = new THREE.MeshBasicMaterial({ color: '#ff8a35', fog: false });
const FLAME_INNER = new THREE.MeshBasicMaterial({ color: '#ffd27a', fog: false });
/** Свет: яркость, дальность, м. */
const INTENSITY = 16;
const DISTANCE = 22;

/** Костёр: кольцо камней, поленья шалашиком, пламя и тёплый мерцающий свет. */
export class Campfire {
	readonly group = new THREE.Group();
	readonly light = new THREE.PointLight('#ff8a35', INTENSITY, DISTANCE, 1.4);
	/** Центр пламени — цель маркера и точка разговора. */
	readonly flame = new THREE.Vector3();
	private readonly flames: THREE.Mesh[] = [];
	private readonly phase = Math.random() * 100;

	constructor(x: number, y: number, z: number) {
		this.group.position.set(x, y, z);
		this.flame.set(x, y + 0.5, z);
		const stoneGeo = new THREE.DodecahedronGeometry(0.16, 0);
		for (let i = 0; i < 9; i++) {
			const a = (i / 9) * Math.PI * 2;
			const stone = new THREE.Mesh(stoneGeo, STONE);
			stone.position.set(Math.cos(a) * 0.6, 0.05, Math.sin(a) * 0.6);
			stone.rotation.set(Math.random() * 3, Math.random() * 3, 0);
			stone.receiveShadow = true;
			this.group.add(stone);
		}
		const logGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.8, 5);
		for (let i = 0; i < 4; i++) {
			const log = new THREE.Mesh(logGeo, LOG);
			const a = (i / 4) * Math.PI * 2;
			log.position.set(Math.cos(a) * 0.18, 0.25, Math.sin(a) * 0.18);
			log.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
			this.group.add(log);
		}
		for (const [mat, r, h] of [
			[FLAME_OUTER, 0.28, 0.8],
			[FLAME_INNER, 0.15, 0.5],
		] as const) {
			const flame = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), mat);
			flame.position.y = 0.2 + h / 2;
			flame.userData.h = h;
			this.flames.push(flame);
			this.group.add(flame);
		}
		this.light.position.set(0, 1, 0);
		this.group.add(this.light);
	}

	update(time: number): void {
		const t = time + this.phase;
		this.light.intensity = INTENSITY + Math.sin(t * 13) * 2.2 + Math.sin(t * 7.3) * 1.6;
		// Языки пламени подрагивают по высоте и чуть крутятся.
		for (const [i, flame] of this.flames.entries()) {
			const k = 1 + Math.sin(t * (9 + i * 4)) * 0.12 + Math.sin(t * 17 + i) * 0.06;
			flame.scale.set(1, k, 1);
			flame.position.y = 0.2 + (flame.userData.h * k) / 2;
			flame.rotation.y = t * (1 + i);
		}
	}
}
