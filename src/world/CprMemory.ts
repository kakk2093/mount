import * as THREE from 'three';
import { Colliders } from '../physics/Colliders.js';
import type { Interactable } from '../core/Interaction.js';
import type { Bounds, Level, LevelHost } from './Level.js';
import type { MusicMood } from '../audio/Music.js';
import { CprSounds } from '../audio/CprSounds.js';
import { CprMusic } from '../audio/CprMusic.js';
import { buildCharacter, type CharacterParts } from './characters/Character.js';

/** Нажатий на грудь за цикл, вдохов за цикл, циклов. */
const COMPRESSIONS = 30;
const BREATHS = 2;
const CYCLES = 3;
const CYCLE = COMPRESSIONS + BREATHS;
const ACTIONS = CYCLE * CYCLES;
/** К началу последнего цикла картинка уже совсем чёрно-белая. */
const GRAY_AT = CYCLE * (CYCLES - 1);
/** Длительность нажатия и вдоха, с. */
const PRESS_TIME = 0.45;
const BREATH_TIME = 1.6;
/** Доли вдоха: до сих пор — тянемся к мешку (если руки ещё не на нём), дальше сжимаем, с этой — отпускаем. */
const BREATH_REACH = 0.3;
const BREATH_BACK = 0.85;
/** Как быстро руки и взгляд переходят между грудью и мешком (1/с). */
const TURN_SPEED = 7;
/** Насыщенность в начале (ярко) — к GRAY_AT уходит в ноль (чёрно-белое). */
const SATURATION_START = 1.6;
/** После последнего вдоха — сразу обратно к костру (только дать мешку расправиться), с. */
const OUTRO_TIME = 0.3;
/** Высота кушетки (верх матраса), м. */
const COT = 0.62;
/** Глаза (стоим у правого бока), грудь лежащего, мешок Амбу (у головы), м. */
const EYE = new THREE.Vector3(0, 1.05 + COT, 0.5);
const CHEST = new THREE.Vector3(0, 0.5 + COT, 0);
const BAG = new THREE.Vector3(-0.4, 0.6 + COT, 0.2);
/** Салон скорой: от кабины до задних дверей (x), от стены до стены (z), высота, м. */
const VAN_FRONT = -1.7;
const VAN_BACK = 1.9;
const VAN_FAR = -0.75;
const VAN_NEAR = 1.1;
const VAN_HEIGHT = 2.05;
/** Насколько кивает камера и проседают руки на нажатии, м. */
const PRESS_DIP = 0.07;
const PRESS_DEPTH = 0.06;
/** Плечи — от глаз (в осях камеры: вбок, вниз, вперёд), м. */
const SHOULDER = new THREE.Vector3(0.2, -0.32, -0.02);

const smooth = (x: number) => THREE.MathUtils.smoothstep(x, 0, 1);

/**
 * Воспоминание у костра в лагере: салон скорой (маячок мигает в стёклах задних дверей), на кушетке на спине
 * лежит человек; мы стоим у его правого бока, над грудью, от первого лица — наши руки идут из камеры.
 * Музыка в ритм нажатиям; к третьему циклу стихает — остаются одни ударные. После первого вдоха руки
 * остаются на мешке до второго. Реанимация 30:2: тридцать нажатий
 * на грудь (ЛКМ, камера кивает вместе с руками), два вдоха мешком Амбу (ЛКМ: поворачиваемся к мешку и сжимаем его),
 * три цикла. Сначала цвета яркие; чем дольше — тем картинка чёрно-белее, к третьему циклу — совсем серая. В конце — обратно к костру.
 */
export class CprMemory implements Level {
	readonly scene = new THREE.Scene();
	readonly bounds: Bounds = { minX: -2, maxX: 2, minZ: -2, maxZ: 2 };
	readonly spawnPoint = { x: EYE.x, z: EYE.z, yaw: 0 };
	readonly colliders = new Colliders();
	readonly interactables: Interactable[] = [];
	private readonly sounds = new CprSounds();
	private readonly patient: CharacterParts;
	private readonly bag = new THREE.Group();
	/** Наши руки: рукав (от плеча до кисти) и кисть, левая и правая. */
	private readonly arms: { sleeve: THREE.Mesh; palm: THREE.Mesh }[] = [];
	private done = 0;
	private state: 'ready' | 'press' | 'breath' | 'outro' = 'ready';
	private stateTime = 0;
	private squeezed = false;
	/** Насколько руки и взгляд у мешка (0 — на груди, 1 — на мешке); догоняет цель плавно. */
	private turn = 0;
	private time = 0;
	private readonly tune = new CprMusic();
	/** Стёкла задних дверей — мигают синим (маячок снаружи). */
	private readonly siren = new THREE.MeshBasicMaterial({ color: '#0a1430' });
	private saturationNow = SATURATION_START;
	// Поза камеры и рук в этом кадре.
	private readonly pose = { position: EYE.clone(), yaw: 0, pitch: 0 };
	private readonly look = new THREE.Vector3();
	private readonly palmAt = [new THREE.Vector3(), new THREE.Vector3()];
	private readonly tmp = new THREE.Vector3();
	private readonly quat = new THREE.Quaternion();
	private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');

	constructor(
		private readonly host: LevelHost,
		private readonly onDone: () => void
	) {
		this.scene.background = new THREE.Color('#10141c');
		this._buildVan();

		// Лежит на спине поперёк взгляда: голова слева (-x), лицо вверх, правый бок — к нам (+z).
		// Обычная одежда: свитер, джинсы, без шапки и варежек.
		this.patient = buildCharacter({
			coat: '#2f8fe0',
			pants: '#24356e',
			boots: '#3a2a1e',
			skin: '#f0c090',
			hair: '#5a3420',
			eyes: '#1a1a1a',
		});
		const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0));
		this.patient.group.setRotationFromMatrix(basis);
		// Грудь (y ≈ 0.7 у стоящего) — ровно под нами; спина (z ≈ -0.25) — на матрасе.
		this.patient.group.position.set(0.7, 0.25 + COT, 0);
		this.scene.add(this.patient.group);

		// Мешок Амбу: прозрачная маска на лице, жёлтый мешок к нам.
		const mask = new THREE.Mesh(
			new THREE.ConeGeometry(0.09, 0.08, 8, 1, true),
			new THREE.MeshStandardMaterial({ color: '#e8f4f8', roughness: 0.3, transparent: true, opacity: 0.75, side: THREE.DoubleSide })
		);
		mask.position.set(BAG.x, 0.53 + COT, 0.04);
		const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.16, 3, 8), new THREE.MeshStandardMaterial({ color: '#f0c020', roughness: 0.5, flatShading: true }));
		body.rotation.x = Math.PI / 2;
		const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.12, 8), new THREE.MeshStandardMaterial({ color: '#d8d8d8', roughness: 0.4 }));
		valve.rotation.x = Math.PI / 2;
		valve.position.z = -0.15;
		this.bag.add(body, valve);
		this.bag.position.copy(BAG);
		this.scene.add(mask, this.bag);

		// Наши руки: рукава — цилиндры от плеча к кисти (тянутся каждый кадр), кисти — гранёные комки.
		const sleeveMat = new THREE.MeshStandardMaterial({ color: '#2aa070', roughness: 1, flatShading: true });
		const skinMat = new THREE.MeshStandardMaterial({ color: '#e8b088', roughness: 1, flatShading: true });
		const sleeveGeo = new THREE.CylinderGeometry(0.05, 0.045, 1, 7);
		sleeveGeo.translate(0, 0.5, 0);
		for (let i = 0; i < 2; i++) {
			const sleeve = new THREE.Mesh(sleeveGeo, sleeveMat);
			const palm = new THREE.Mesh(new THREE.IcosahedronGeometry(0.055, 0), skinMat);
			palm.scale.set(1.1, 0.6, 1.3);
			this.arms.push({ sleeve, palm });
			this.scene.add(sleeve, palm);
		}
		this._pose(0);
	}

	/** Музыка горы молчит — здесь своя. */
	music(): MusicMood {
		return { volume: 0, brightness: 0 };
	}

	saturation(): number {
		return this.saturationNow;
	}

	cameraPose(): { position: THREE.Vector3; yaw: number; pitch: number } {
		return this.pose;
	}

	getHeightAt(): number {
		return 0;
	}

	enter(): void {
		this.host.setObjective(null);
		this.tune.start();
	}

	leave(): void {
		this.sounds.close();
		this.tune.stop();
	}

	hint(): string | null {
		if (this.state !== 'ready') return null;
		const step = this.done % CYCLE;
		if (step < COMPRESSIONS) return `Надавить — ЛКМ   ${step + 1}/${COMPRESSIONS}`;
		return `Вдох — ЛКМ   ${step - COMPRESSIONS + 1}/${BREATHS}`;
	}

	update(dt: number): void {
		this.stateTime += dt;
		// Цвет уходит вслед за сделанным: плавно, к концу — совсем серое.
		const target = SATURATION_START * Math.max(0, 1 - this.done / GRAY_AT);
		this.saturationNow += (target - this.saturationNow) * (1 - Math.exp(-dt * 1.5));
		// Музыка стихает так же — к третьему циклу остаются одни ударные.
		this.tune.setMelodic(Math.max(0, 1 - this.done / GRAY_AT));
		// На третьем цикле стихают и ударные — к последнему вдоху тишина.
		this.tune.setDrums(THREE.MathUtils.clamp(1 - (this.done - GRAY_AT) / CYCLE, 0, 1));
		this.time += dt;
		this.siren.color.set(Math.sin(this.time * 9) > 0.3 ? '#2a5cff' : '#0a1430');

		if (this.state === 'ready') {
			if (this.host.consumeClick()) {
				const breath = this.done % CYCLE >= COMPRESSIONS;
				this.state = breath ? 'breath' : 'press';
				this.stateTime = 0;
				this.squeezed = false;
				if (!breath) this.sounds.press();
			}
		} else if (this.state === 'press') {
			if (this.stateTime >= PRESS_TIME) this._finish();
		} else if (this.state === 'breath') {
			if (!this.squeezed && this.stateTime >= BREATH_TIME * BREATH_REACH) {
				this.squeezed = true;
				this.sounds.breath(BREATH_TIME * (BREATH_BACK - BREATH_REACH));
			}
			if (this.stateTime >= BREATH_TIME) this._finish();
		} else if (this.stateTime >= OUTRO_TIME) {
			this.state = 'ready';
			this.onDone();
		}
		this._pose(dt);
	}

	private _finish(): void {
		this.done++;
		this.state = this.done >= ACTIONS ? 'outro' : 'ready';
		this.stateTime = 0;
	}

	/**
	 * Салон скорой (как в настоящей): белые стены и потолок с круглыми светильниками, жёлтые задние двери
	 * с окнами (в них мигает маячок), вдоль стены за кушеткой — белый стеллаж: сверху шкафчики, ниже открытые
	 * полки с оранжевыми укладками и синими сумками, монитор-дефибриллятор, аппарат ИВЛ; у головы — хромированная
	 * стойка с зелёными инфузоматами, от них свисают трубки. Кушетка — бордовый матрас на оранжевой раме.
	 */
	private _buildVan(): void {
		const mat = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
			new THREE.MeshStandardMaterial({ color, roughness: 0.8, flatShading: true, ...extra });
		const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
			const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
			mesh.position.set(x, y, z);
			mesh.castShadow = true;
			mesh.receiveShadow = true;
			this.scene.add(mesh);
			return mesh;
		};
		const tube = (points: [number, number, number][], radius: number, m: THREE.Material) => {
			const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
			this.scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, radius, 5), m));
		};
		const length = VAN_BACK - VAN_FRONT;
		const midX = (VAN_FRONT + VAN_BACK) / 2;
		const width = VAN_NEAR - VAN_FAR;
		const midZ = (VAN_FAR + VAN_NEAR) / 2;
		const white = mat('#eef0f2');
		const metal = mat('#c8ccd2', { metalness: 0.6, roughness: 0.3 });
		const orange = mat('#e8742a');
		const glow = new THREE.MeshBasicMaterial({ color: '#ffffff' });

		// Свет: холодный общий и круглые светильники на потолке (по центру и над кушеткой).
		this.scene.add(new THREE.HemisphereLight('#f4f8ff', '#8a9098', 1.1));
		for (const x of [-0.9, 0.2, 1.2]) {
			const lamp = new THREE.PointLight('#f0f6ff', 4.5, 4, 1.5);
			lamp.position.set(x, VAN_HEIGHT - 0.15, 0.1);
			this.scene.add(lamp);
			const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.02, 14), glow);
			disc.position.set(x, VAN_HEIGHT - 0.03, 0.1);
			this.scene.add(disc);
			const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.02, 4, 14), mat('#d0d4d8'));
			ring.rotation.x = Math.PI / 2;
			ring.position.set(x, VAN_HEIGHT - 0.03, 0.1);
			this.scene.add(ring);
		}
		// Два чёрных поворотных прожектора у задних дверей.
		for (const z of [0.15, 0.45]) {
			const spot = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 8), mat('#1c1e22', { roughness: 0.4 }));
			spot.position.set(VAN_BACK - 0.35, VAN_HEIGHT - 0.15, z);
			spot.rotation.z = 0.5;
			this.scene.add(spot);
		}

		// Коробка салона: светло-серый пол, белые стены и потолок.
		box(length, 0.04, width, mat('#b8bec4', { roughness: 0.6 }), midX, -0.02, midZ);
		box(length, 0.04, width, white, midX, VAN_HEIGHT, midZ);
		box(length, VAN_HEIGHT, 0.04, white, midX, VAN_HEIGHT / 2, VAN_FAR);
		box(length, VAN_HEIGHT, 0.04, white, midX, VAN_HEIGHT / 2, VAN_NEAR);
		box(0.04, VAN_HEIGHT, width, white, VAN_FRONT, VAN_HEIGHT / 2, midZ);
		box(0.01, 0.3, 0.6, new THREE.MeshBasicMaterial({ color: '#202838' }), VAN_FRONT + 0.025, 1.55, 0.2);

		// Задние двери: жёлтые створки с окнами (маячок), серые петли и ручки; у створки — сложенный оранжевый стул.
		const yellow = mat('#e8d61c', { roughness: 0.5 });
		for (const [z, w] of [
			[(VAN_FAR + 0.15) / 2, 0.9],
			[(0.15 + VAN_NEAR) / 2, 0.95],
		]) {
			box(0.05, VAN_HEIGHT - 0.06, w - 0.02, yellow, VAN_BACK, VAN_HEIGHT / 2, z);
			box(0.01, 0.5, w - 0.3, this.siren, VAN_BACK - 0.03, 1.4, z);
			box(0.03, 0.04, 0.15, mat('#3a3e44'), VAN_BACK - 0.04, 1.05, z + (z < 0.15 ? 0.25 : -0.25));
		}
		box(0.04, 0.4, 0.4, orange, VAN_BACK - 0.08, 1.05, 0.7);
		box(0.04, 0.03, 0.42, metal, VAN_BACK - 0.08, 1.27, 0.7);

		// Стеллаж вдоль дальней стены: стойки, верхние шкафчики, полки.
		const shelfX0 = VAN_FRONT + 0.25;
		const shelfX1 = VAN_BACK - 0.25;
		const shelfLen = shelfX1 - shelfX0;
		const shelfMid = (shelfX0 + shelfX1) / 2;
		const depth = 0.34;
		const sz = VAN_FAR + depth / 2;
		for (let i = 0; i <= 4; i++) box(0.03, 1.25, depth, mat('#d8dce0'), shelfX0 + (shelfLen * i) / 4, 1.27, sz);
		for (let i = 0; i < 4; i++) {
			const x = shelfX0 + (shelfLen * (i + 0.5)) / 4;
			box(shelfLen / 4 - 0.04, 0.32, depth, white, x, 1.74, sz);
			box(0.1, 0.015, 0.02, mat('#8a9098'), x, 1.62, VAN_FAR + depth + 0.01);
		}
		for (const y of [0.66, 1.05, 1.4]) box(shelfLen, 0.025, depth, mat('#e4e8ec'), shelfMid, y, sz);
		// Тёмный кант по краю полок.
		for (const y of [0.66, 1.05, 1.4]) box(shelfLen, 0.03, 0.01, mat('#4a5058'), shelfMid, y, VAN_FAR + depth + 0.005);

		// Укладки на полках: оранжевые ящики с белой полосой, синие сумки, жёлтая коробка.
		const stripe = mat('#f4f4f2');
		for (const [x, y] of [
			[shelfX0 + 0.25, 1.05],
			[shelfX0 + 0.55, 1.05],
			[shelfX0 + 0.25, 1.4],
		]) {
			box(0.26, 0.2, 0.26, orange, x, y + 0.11, sz);
			box(0.265, 0.03, 0.01, stripe, x, y + 0.14, VAN_FAR + 0.3);
		}
		const blue = mat('#1e4aa8', { roughness: 0.6 });
		box(0.36, 0.22, 0.26, blue, shelfX0 + 1.05, 1.18, sz);
		box(0.4, 0.2, 0.28, blue, shelfX0 + 0.4, 0.78, sz);
		box(0.18, 0.12, 0.2, mat('#f0d020'), shelfX0 + 1.45, 1.12, sz);
		// Монитор-дефибриллятор: серый корпус, экран с зелёной линией.
		box(0.34, 0.24, 0.22, mat('#d4d8dc'), shelfX0 + 1.85, 1.18, sz);
		box(0.2, 0.13, 0.01, new THREE.MeshBasicMaterial({ color: '#203a30' }), shelfX0 + 1.82, 1.2, VAN_FAR + 0.29);
		box(0.18, 0.012, 0.012, new THREE.MeshBasicMaterial({ color: '#40f080' }), shelfX0 + 1.82, 1.2, VAN_FAR + 0.296);
		box(0.04, 0.04, 0.012, mat('#e04040'), shelfX0 + 1.98, 1.12, VAN_FAR + 0.29);
		// Аппарат ИВЛ внизу, ближе к дверям, и маленький монитор на нижней полке.
		box(0.42, 0.3, 0.3, mat('#e8eaec'), shelfX1 - 0.3, 0.2, sz);
		box(0.3, 0.12, 0.01, new THREE.MeshBasicMaterial({ color: '#30383c' }), shelfX1 - 0.3, 0.26, VAN_FAR + 0.31);
		box(0.24, 0.18, 0.18, mat('#e0e4e8'), shelfX0 + 1.4, 0.77, sz);
		box(0.12, 0.08, 0.01, new THREE.MeshBasicMaterial({ color: '#2a4a3a' }), shelfX0 + 1.4, 0.79, VAN_FAR + 0.27);

		// Стойка с инфузоматами у головы: хромированный шест, два зелёных насоса.
		const poleX = -0.95;
		const poleZ = VAN_FAR + 0.42;
		const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, VAN_HEIGHT, 8), metal);
		pole.position.set(poleX, VAN_HEIGHT / 2, poleZ);
		this.scene.add(pole);
		const green = mat('#3aa070', { roughness: 0.5 });
		for (const y of [1.45, 1.62]) {
			box(0.2, 0.12, 0.14, green, poleX + 0.02, y, poleZ + 0.06);
			box(0.12, 0.05, 0.01, mat('#f0f0f0'), poleX + 0.02, y + 0.02, poleZ + 0.135);
		}
		// Трубки: белые от насосов вниз к кушетке, голубая — от стены к монитору.
		const hose = mat('#f2f4f6', { roughness: 0.4 });
		tube([[poleX + 0.05, 1.4, poleZ + 0.1], [poleX + 0.2, 1.1, poleZ + 0.15], [poleX + 0.35, 0.95, 0.0], [-0.5, COT + 0.1, -0.15]], 0.008, hose);
		tube([[poleX - 0.02, 1.57, poleZ + 0.1], [poleX - 0.1, 1.2, poleZ + 0.2], [poleX + 0.05, 0.9, 0.1], [poleX + 0.3, 0.8, 0.2]], 0.008, hose);
		tube([[shelfX0 + 1.9, VAN_HEIGHT - 0.05, VAN_FAR + 0.05], [shelfX0 + 2.0, 1.6, VAN_FAR + 0.35], [shelfX0 + 1.95, 1.3, VAN_FAR + 0.3]], 0.008, mat('#3a8ae8'));

		// Кушетка: бордовый матрас с белым ремнём на оранжевой раме, оранжевые поручни, тёмные колёса.
		box(1.9, 0.1, 0.62, mat('#a8443e', { roughness: 0.7 }), 0.1, COT - 0.05, 0);
		box(0.1, 0.105, 0.63, stripe, 0.55, COT - 0.05, 0);
		box(1.95, 0.05, 0.66, orange, 0.1, COT - 0.125, 0);
		box(1.7, 0.05, 0.5, metal, 0.1, 0.3, 0);
		for (const x of [-0.65, 0.85])
			for (const z of [-0.2, 0.2]) {
				box(0.04, 0.3, 0.04, metal, x, 0.16, z);
				box(0.08, 0.07, 0.04, mat('#202020'), x, 0.035, z);
			}
		for (const z of [-0.34, 0.34]) box(1.5, 0.03, 0.03, orange, 0.15, COT + 0.08, z);

		// Сиденье у кабины.
		box(0.45, 0.08, 0.45, mat('#2c4a7a'), VAN_FRONT + 0.3, 0.5, 0.6);
	}

	/** Камера, руки, грудь и мешок — по тому, что сейчас делаем. */
	private _pose(dt: number): void {
		// press — глубина нажатия 0..1; turn — насколько повернулись к мешку 0..1; squeeze — сжатие мешка 0..1.
		let press = 0;
		let squeeze = 0;
		// К мешку — на вдохе и между вдохами (после первого руки остаются на мешке); после последнего — к груди.
		const step = this.done % CYCLE;
		let atBag = step > COMPRESSIONS && this.state !== 'outro';
		if (this.state === 'press') press = Math.sin(Math.PI * Math.min(this.stateTime / PRESS_TIME, 1));
		if (this.state === 'breath') {
			const t = this.stateTime / BREATH_TIME;
			atBag = !(step === CYCLE - 1 && t > BREATH_BACK);
			const s = (t - BREATH_REACH) / (BREATH_BACK - BREATH_REACH);
			squeeze = s > 0 && s < 1 ? Math.sin(Math.PI * s) : 0;
		}
		this.turn += ((atBag ? 1 : 0) - this.turn) * (1 - Math.exp(-dt * TURN_SPEED));
		const turn = smooth(this.turn);

		// Камера: кивает вниз вместе с нажатием; на вдохе — поворачивается к мешку и чуть наклоняется к нему.
		const pos = this.pose.position.copy(EYE);
		pos.y -= press * PRESS_DIP;
		pos.z -= press * 0.03;
		pos.x += turn * -0.12;
		this.look.copy(CHEST);
		this.look.y -= press * PRESS_DEPTH * 1.5;
		this.look.lerp(BAG, turn);
		const dx = this.look.x - pos.x;
		const dy = this.look.y - pos.y;
		const dz = this.look.z - pos.z;
		this.pose.yaw = Math.atan2(-dx, -dz);
		this.pose.pitch = Math.atan2(dy, Math.hypot(dx, dz));

		// Грудь проседает под руками и поднимается от вдоха; мешок сжимается с боков.
		this.patient.body.scale.set(1, 1, 1 - press * 0.15 + smooth(squeeze) * 0.12);
		this.bag.scale.set(1 - squeeze * 0.4, 1 - squeeze * 0.3, 1);

		// Кисти: на груди — одна на другой (проседают с нажатием); на вдохе — по бокам мешка, сжимают его.
		const chestY = CHEST.y + 0.02 - press * PRESS_DEPTH;
		const grip = 0.1 - squeeze * 0.035;
		for (let i = 0; i < 2; i++) {
			const side = i === 0 ? -1 : 1;
			const onChest = this.tmp.set(CHEST.x, chestY + i * 0.035, CHEST.z + 0.02);
			this.palmAt[i].copy(onChest).lerp(new THREE.Vector3(BAG.x + side * grip, BAG.y, BAG.z), turn);
		}
		// Рукава — от плеч (у краёв кадра, снизу) к кистям.
		this.euler.set(this.pose.pitch, this.pose.yaw, 0);
		this.quat.setFromEuler(this.euler);
		for (let i = 0; i < 2; i++) {
			const side = i === 0 ? -1 : 1;
			const { sleeve, palm } = this.arms[i];
			const shoulder = this.tmp.set(SHOULDER.x * side, SHOULDER.y, SHOULDER.z).applyQuaternion(this.quat).add(pos);
			const hand = this.palmAt[i];
			sleeve.position.copy(shoulder);
			const dir = hand.clone().sub(shoulder);
			const length = dir.length();
			sleeve.quaternion.setFromUnitVectors(THREE.Object3D.DEFAULT_UP, dir.divideScalar(length));
			sleeve.scale.set(1, length, 1);
			palm.position.copy(hand);
			palm.quaternion.copy(sleeve.quaternion);
		}
	}
}
