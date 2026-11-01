import * as THREE from 'three';

const LOG = new THREE.MeshStandardMaterial({ color: '#3b2a1e', roughness: 1, flatShading: true });
/** Обугленные концы поленьев и угли — тлеют сами (не зависят от света). */
const CHAR = new THREE.MeshStandardMaterial({ color: '#1a1210', emissive: '#ff4a10', emissiveIntensity: 0.6, roughness: 1, flatShading: true });
const EMBERS = new THREE.MeshBasicMaterial({ color: '#ff6a1e', fog: false });
const STONE = new THREE.MeshStandardMaterial({ color: '#4a4d55', roughness: 1, flatShading: true });
const SNOW = new THREE.MeshStandardMaterial({ color: '#cdd6e2', roughness: 1, flatShading: true });
/** Языки пламени: снаружи — рыжий, внутри — жёлтый, в сердцевине — почти белый. Светятся сами, туман их не гасит. */
const FLAMES: { color: string; radius: number; height: number; count: number; spread: number }[] = [
	{ color: '#e8521c', radius: 0.2, height: 0.75, count: 4, spread: 0.16 },
	{ color: '#ff9a2e', radius: 0.15, height: 0.6, count: 3, spread: 0.1 },
	{ color: '#ffe08a', radius: 0.09, height: 0.4, count: 2, spread: 0.04 },
];
/** Свет: яркость, дальность, м. */
const INTENSITY = 16;
const DISTANCE = 22;
/** Искры: сколько, как быстро взлетают (м/с) и на какую высоту, м. */
const SPARKS = 24;
const SPARK_SPEED = 1.1;
const SPARK_HEIGHT = 2.6;
/** Дым: сколько клубов, как высоко поднимаются, м. */
const SMOKE = 6;
const SMOKE_HEIGHT = 4;

/**
 * Костёр: кольцо камней с шапками снега, шалаш из поленьев с тлеющими концами, угли, несколько языков пламени
 * (подрагивают, у каждого свой ритм), искры вверх, лёгкий дым и тёплый мерцающий свет.
 */
export class Campfire {
	readonly group = new THREE.Group();
	readonly light = new THREE.PointLight('#ff8a35', INTENSITY, DISTANCE, 1.4);
	/** Центр пламени — цель маркера и точка разговора; от него же — звук. */
	readonly flame = new THREE.Vector3();
	private readonly flames: THREE.Mesh[] = [];
	private readonly sparks: THREE.Points;
	/** Высота и фаза каждой искры. */
	private readonly sparkLife = new Float32Array(SPARKS);
	private readonly smoke: THREE.Mesh[] = [];
	private readonly phase = Math.random() * 100;

	constructor(x: number, y: number, z: number) {
		this.group.position.set(x, y, z);
		this.flame.set(x, y + 0.5, z);

		// Камни — разного размера, кое-где со снегом сверху.
		const stoneGeo = new THREE.DodecahedronGeometry(1, 0);
		for (let i = 0; i < 11; i++) {
			const a = (i / 11) * Math.PI * 2 + Math.random() * 0.2;
			const s = 0.13 + Math.random() * 0.09;
			const stone = new THREE.Mesh(stoneGeo, STONE);
			stone.scale.set(s * 1.2, s * 0.8, s);
			stone.position.set(Math.cos(a) * 0.62, s * 0.4, Math.sin(a) * 0.62);
			stone.rotation.set(Math.random() * 3, Math.random() * 3, 0);
			stone.receiveShadow = true;
			this.group.add(stone);
			if (Math.random() < 0.5) {
				const cap = new THREE.Mesh(stoneGeo, SNOW);
				cap.scale.set(s * 0.9, s * 0.25, s * 0.75);
				cap.position.set(stone.position.x, s * 0.4 + s * 0.6, stone.position.z);
				this.group.add(cap);
			}
		}
		// Угли — тлеющий круг под шалашом.
		const embers = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.45, 0.06, 9), EMBERS);
		embers.position.y = 0.03;
		this.group.add(embers);
		// Шалаш: поленья сходятся к середине, нижний конец обуглен; пара поленьев лежит рядом.
		const logGeo = new THREE.CylinderGeometry(0.055, 0.075, 0.9, 6);
		const charGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.18, 6);
		for (let i = 0; i < 6; i++) {
			const a = (i / 6) * Math.PI * 2 + Math.random() * 0.3;
			const tilt = 0.55 + Math.random() * 0.15;
			const log = new THREE.Group();
			const wood = new THREE.Mesh(logGeo, LOG);
			const charred = new THREE.Mesh(charGeo, CHAR);
			charred.position.y = -0.36;
			log.add(wood, charred);
			log.position.set(Math.cos(a) * 0.2, 0.36, Math.sin(a) * 0.2);
			// Верхушкой к центру: наклон в сторону оси.
			log.rotation.set(0, -a, 0);
			log.rotateZ(tilt);
			wood.castShadow = true;
			this.group.add(log);
		}
		for (const [px, pz, yaw] of [
			[0.95, 0.35, 0.3],
			[-0.85, 0.55, 1.9],
		]) {
			const spare = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.9, 6), LOG);
			spare.position.set(px, 0.09, pz);
			spare.rotation.set(0, yaw, Math.PI / 2);
			spare.castShadow = true;
			this.group.add(spare);
		}

		// Пламя: несколько конусов-«языков» в каждом слое, чуть врозь.
		for (const layer of FLAMES) {
			const mat = new THREE.MeshBasicMaterial({ color: layer.color, fog: false });
			for (let i = 0; i < layer.count; i++) {
				const flame = new THREE.Mesh(new THREE.ConeGeometry(layer.radius, layer.height, 5), mat);
				const a = (i / layer.count) * Math.PI * 2 + Math.random();
				flame.position.set(Math.cos(a) * layer.spread, 0, Math.sin(a) * layer.spread);
				flame.userData = { h: layer.height * (0.8 + Math.random() * 0.4), speed: 8 + Math.random() * 8, phase: Math.random() * 10 };
				this.flames.push(flame);
				this.group.add(flame);
			}
		}

		// Искры: точки, взлетают и гаснут, начинаются снова снизу.
		const positions = new Float32Array(SPARKS * 3);
		for (let i = 0; i < SPARKS; i++) this.sparkLife[i] = Math.random();
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		this.sparks = new THREE.Points(geometry, new THREE.PointsMaterial({ color: '#ffb25a', size: 0.05, fog: false }));
		this.sparks.frustumCulled = false;
		this.group.add(this.sparks);

		// Дым: серые полупрозрачные клубы поднимаются, раздуваются и тают.
		const smokeGeo = new THREE.IcosahedronGeometry(0.3, 0);
		for (let i = 0; i < SMOKE; i++) {
			const puff = new THREE.Mesh(smokeGeo, new THREE.MeshBasicMaterial({ color: '#5a5c66', transparent: true, opacity: 0, depthWrite: false }));
			puff.userData.life = i / SMOKE;
			this.smoke.push(puff);
			this.group.add(puff);
		}

		this.light.position.set(0, 1, 0);
		this.group.add(this.light);
	}

	update(time: number, dt: number): void {
		const t = time + this.phase;
		this.light.intensity = INTENSITY + Math.sin(t * 13) * 2.2 + Math.sin(t * 7.3) * 1.6;
		// Языки подрагивают по высоте и ширине, каждый в своём ритме, и чуть крутятся.
		for (const flame of this.flames) {
			const { h, speed, phase } = flame.userData as { h: number; speed: number; phase: number };
			const k = 1 + Math.sin(t * speed + phase) * 0.18 + Math.sin(t * speed * 1.9 + phase * 2) * 0.08;
			flame.scale.set(1 - (k - 1) * 0.5, k, 1 - (k - 1) * 0.5);
			flame.position.y = 0.12 + (h * k) / 2;
			flame.rotation.y = t * 0.8 + phase;
		}
		// Искры: каждая летит вверх с покачиванием; долетев — снова снизу.
		const pos = this.sparks.geometry.attributes.position as THREE.BufferAttribute;
		for (let i = 0; i < SPARKS; i++) {
			let life = this.sparkLife[i] + (dt * SPARK_SPEED) / SPARK_HEIGHT;
			if (life >= 1) life -= 1;
			this.sparkLife[i] = life;
			const swirl = i * 2.4 + life * 6;
			const r = 0.08 + life * 0.35;
			pos.setXYZ(i, Math.cos(swirl) * r, 0.3 + life * SPARK_HEIGHT, Math.sin(swirl) * r);
		}
		pos.needsUpdate = true;
		// Дым: поднимается, раздувается, сначала проявляется, потом тает.
		for (const puff of this.smoke) {
			let life = puff.userData.life + dt * 0.12;
			if (life >= 1) life -= 1;
			puff.userData.life = life;
			puff.position.set(Math.sin(life * 5 + t * 0.3) * 0.3 * life, 0.9 + life * SMOKE_HEIGHT, Math.cos(life * 4) * 0.2 * life);
			puff.scale.setScalar(0.5 + life * 2.5);
			(puff.material as THREE.MeshBasicMaterial).opacity = 0.35 * Math.sin(Math.PI * life);
		}
	}
}
