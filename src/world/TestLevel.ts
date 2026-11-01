import * as THREE from 'three';
import { Colliders } from '../physics/Colliders.js';
import { PLAYER_NAME, type Dialogue, type Interactable } from '../core/Interaction.js';
import type { Bounds, Level } from './Level.js';

/** Сторона квадрата земли, м, и число клеток сетки по стороне. */
const SIZE = 120;
const SEGMENTS = 96;
/** Гора: центр, высота и «ширина» (сигма гауссианы), м. */
const PEAK = new THREE.Vector3(0, 0, -35);
const PEAK_HEIGHT = 22;
const PEAK_WIDTH = 14;
const SKY_COLOR = '#9fb4c7';
const TREE_COUNT = 70;

/** Высота земли: пологие холмы и гора. */
function heightAt(x: number, z: number): number {
	const d2 = (x - PEAK.x) ** 2 + (z - PEAK.z) ** 2;
	const mountain = PEAK_HEIGHT * Math.exp(-d2 / (2 * PEAK_WIDTH * PEAK_WIDTH));
	const hills = Math.sin(x * 0.11) * Math.cos(z * 0.09) * 0.8 + Math.sin(x * 0.27 + z * 0.19) * 0.25;
	return mountain + hills;
}

/** Повторяемый «рандом» — расстановка деревьев одна и та же при каждом запуске. */
function seeded(seed: number): () => number {
	let s = seed;
	return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

/**
 * Пробный уровень: холмы, гора, деревья, домик, путник у костра. Показывает, как устроен уровень:
 * коллайдеры, интерактивные точки, разговор, задачи и маркер цели.
 */
export class TestLevel implements Level {
	readonly scene = new THREE.Scene();
	readonly bounds: Bounds = { minX: -SIZE / 2, maxX: SIZE / 2, minZ: -SIZE / 2, maxZ: SIZE / 2 };
	readonly spawnPoint = { x: 0, z: 22, yaw: 0 };
	readonly colliders = new Colliders();
	readonly interactables: Interactable[] = [];
	/** Вершина — цель второй задачи. */
	readonly peakTop = new THREE.Vector3(PEAK.x, PEAK_HEIGHT + 1.5, PEAK.z);
	private readonly npcHead = new THREE.Vector3();
	private readonly fire = new THREE.PointLight('#ff9a3c', 6, 8, 1.5);
	private time = 0;
	/** Этап: 0 — поговорить с путником, 1 — на вершину, 2 — всё. */
	private stage = 0;

	constructor(
		/** Game даёт уровню: задать задачу, начать разговор (сам уровень о HUD не знает). */
		private readonly hooks: { setObjective(text: string | null): void; startDialogue(dialogue: Dialogue): void }
	) {
		this.scene.background = new THREE.Color(SKY_COLOR);
		this.scene.fog = new THREE.Fog(SKY_COLOR, 25, 90);
		this.scene.add(new THREE.HemisphereLight('#dfe9f5', '#4a4636', 1.2));
		const sun = new THREE.DirectionalLight('#fff1d8', 2.2);
		sun.position.set(30, 40, 20);
		sun.castShadow = true;
		sun.shadow.mapSize.set(1024, 1024);
		Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, far: 120 });
		this.scene.add(sun);

		this._buildTerrain();
		this._buildTrees();
		this._buildHut(-8, 12);
		this._buildCamp(5, 10);
	}

	getHeightAt(x: number, z: number): number {
		return heightAt(x, z);
	}

	enter(): void {
		this.hooks.setObjective(this.stage === 0 ? 'Поговори с путником' : this.stage === 1 ? 'Поднимись на вершину' : null);
	}

	update(dt: number, player: THREE.Vector3): void {
		this.time += dt;
		// Костёр мерцает.
		this.fire.intensity = 5 + Math.sin(this.time * 13) * 0.8 + Math.sin(this.time * 7.3) * 0.6;
		this._checkPeak(player);
	}

	objectiveTarget(): THREE.Vector3 | null {
		return this.stage === 0 ? this.npcHead : this.stage === 1 ? this.peakTop : null;
	}

	/** Дошёл до вершины — мысли героя, задачи больше нет. */
	private _checkPeak(pos: THREE.Vector3): void {
		if (this.stage !== 1 || Math.hypot(pos.x - PEAK.x, pos.z - PEAK.z) > 3) return;
		this.stage = 2;
		this.hooks.setObjective(null);
		this.hooks.startDialogue({
			lines: [
				{ speaker: PLAYER_NAME, voice: 'player', text: 'Отсюда видно всё.' },
				{ speaker: PLAYER_NAME, voice: 'player', text: 'И ничего не изменилось.' },
			],
		});
	}

	private _buildTerrain(): void {
		const geometry = new THREE.PlaneGeometry(SIZE, SIZE, SEGMENTS, SEGMENTS);
		geometry.rotateX(-Math.PI / 2);
		const pos = geometry.attributes.position;
		const colors: number[] = [];
		const grass = new THREE.Color('#5f7a3a');
		const rock = new THREE.Color('#7a7064');
		const snow = new THREE.Color('#eef2f5');
		const c = new THREE.Color();
		for (let i = 0; i < pos.count; i++) {
			const y = heightAt(pos.getX(i), pos.getZ(i));
			pos.setY(i, y);
			// Цвет по высоте: трава → камень → снег.
			c.copy(grass).lerp(rock, THREE.MathUtils.smoothstep(y, 5, 11));
			c.lerp(snow, THREE.MathUtils.smoothstep(y, 16, 19));
			colors.push(c.r, c.g, c.b);
		}
		geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
		geometry.computeVertexNormals();
		const ground = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
		ground.receiveShadow = true;
		this.scene.add(ground);
	}

	private _buildTrees(): void {
		const rand = seeded(7);
		const trunkMat = new THREE.MeshStandardMaterial({ color: '#5a3f2a', roughness: 1 });
		const leafMat = new THREE.MeshStandardMaterial({ color: '#2f5a2e', roughness: 1, flatShading: true });
		const trunkGeo = new THREE.CylinderGeometry(0.15, 0.2, 1.4, 6);
		const leafGeo = new THREE.ConeGeometry(1.1, 3, 7);
		for (let placed = 0, tries = 0; placed < TREE_COUNT && tries < 1000; tries++) {
			const x = (rand() - 0.5) * (SIZE - 10);
			const z = (rand() - 0.5) * (SIZE - 10);
			const y = heightAt(x, z);
			// Не выше границы леса, не на старте и не у лагеря.
			if (y > 9 || Math.hypot(x, z - 16) < 10 || this.colliders.overlaps(x, z, 1.5)) continue;
			const s = 0.8 + rand() * 0.6;
			const tree = new THREE.Group();
			const trunk = new THREE.Mesh(trunkGeo, trunkMat);
			trunk.position.y = 0.7;
			const leaves = new THREE.Mesh(leafGeo, leafMat);
			leaves.position.y = 2.6;
			for (const m of [trunk, leaves]) m.castShadow = true;
			tree.add(trunk, leaves);
			tree.position.set(x, y - 0.05, z);
			tree.scale.setScalar(s);
			tree.rotation.y = rand() * Math.PI * 2;
			this.scene.add(tree);
			this.colliders.add(x, z, 0.3 * s);
			placed++;
		}
	}

	/** Домик-коробка с дверью: дверь пока закрыта — подсказка без действия. */
	private _buildHut(x: number, z: number): void {
		const y = heightAt(x, z);
		const w = 4;
		const d = 3.5;
		const hut = new THREE.Group();
		const walls = new THREE.Mesh(new THREE.BoxGeometry(w, 2.6, d), new THREE.MeshStandardMaterial({ color: '#8a6a4a', roughness: 1 }));
		walls.position.y = 1.3;
		// Ниже уровня земли — чтобы на склоне не висел в воздухе.
		const base = new THREE.Mesh(new THREE.BoxGeometry(w, 1, d), walls.material);
		base.position.y = -0.5;
		const roof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 1.6, 4), new THREE.MeshStandardMaterial({ color: '#5b2f26', roughness: 1, flatShading: true }));
		roof.position.y = 3.4;
		roof.rotation.y = Math.PI / 4;
		const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.9, 0.08), new THREE.MeshStandardMaterial({ color: '#3d2a1c', roughness: 1 }));
		door.position.set(0, 0.95, d / 2 + 0.04);
		for (const m of [walls, base, roof, door]) {
			m.castShadow = true;
			m.receiveShadow = true;
		}
		hut.add(walls, base, roof, door);
		hut.position.set(x, y, z);
		this.scene.add(hut);
		this.colliders.addBox(x, z, w, d);
		this.interactables.push({ position: new THREE.Vector3(x, y + 1, z + d / 2), reach: 2, text: 'Заперто' });
	}

	/** Костёр и путник у него — с ним разговор, после него — задача «на вершину». */
	private _buildCamp(x: number, z: number): void {
		const y = heightAt(x, z);
		const logs = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.25, 8), new THREE.MeshStandardMaterial({ color: '#3b2a1e', roughness: 1 }));
		logs.position.set(x, y + 0.12, z);
		const flame = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7, 6), new THREE.MeshBasicMaterial({ color: '#ffb347' }));
		flame.position.set(x, y + 0.6, z);
		this.fire.position.set(x, y + 1, z);
		this.scene.add(logs, flame, this.fire);
		this.colliders.add(x, z, 0.6);

		// Путник — простая фигура: тело-капсула и голова, сидит лицом к костру.
		const nx = x + 1.6;
		const nz = z;
		const ny = heightAt(nx, nz);
		const npc = new THREE.Group();
		const coat = new THREE.MeshStandardMaterial({ color: '#4b5a6e', roughness: 1 });
		const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.7, 4, 8), coat);
		body.position.y = 0.75;
		const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshStandardMaterial({ color: '#d7b08a', roughness: 1 }));
		head.position.y = 1.45;
		for (const m of [body, head]) m.castShadow = true;
		npc.add(body, head);
		npc.position.set(nx, ny, nz);
		npc.lookAt(x, ny, z);
		this.scene.add(npc);
		this.colliders.add(nx, nz, 0.4);
		this.npcHead.set(nx, ny + 1.45, nz);

		this.interactables.push({
			position: this.npcHead,
			reach: 2.5,
			text: 'поговорить',
			dialogue: () => (this.stage === 0 ? this._firstTalk() : this._repeatTalk()),
		});
	}

	private _firstTalk(): Dialogue {
		return {
			lines: [
				{ speaker: 'Путник', voice: 'low', text: 'Не спится?' },
				{ speaker: PLAYER_NAME, voice: 'player', text: 'Где я?' },
				{ speaker: 'Путник', voice: 'low', text: 'У подножия. Все, кто сюда приходит, идут наверх.' },
				{ speaker: 'Путник', voice: 'low', text: 'Иди и ты.' },
			],
			onEnd: () => {
				this.stage = 1;
				this.hooks.setObjective('Поднимись на вершину');
			},
		};
	}

	private _repeatTalk(): Dialogue {
		return { lines: [{ speaker: 'Путник', voice: 'low', text: this.stage === 1 ? 'Наверх. Не заставляй её ждать.' : '...' }] };
	}
}
