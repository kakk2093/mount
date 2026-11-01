import * as THREE from 'three';
import { Colliders } from '../physics/Colliders.js';
import type { Interactable } from '../core/Interaction.js';
import type { Bounds, Level, LevelHost, Seat } from './Level.js';
import type { MusicMood } from '../audio/Music.js';
import { KitchenMusic } from '../audio/KitchenMusic.js';
import { DrinkSounds } from '../audio/DrinkSounds.js';
import { AmbientMusic } from '../audio/AmbientMusic.js';
import { buildCharacter } from './characters/Character.js';

/** Высота столешницы, м. */
const TABLE_Y = 0.76;
/** Сколько рюмок. */
const SHOTS = 8;
/** После каждой рюмки (индекс — сколько выпито): насыщенность (из чёрно-белого — в яркое) и слой музыки.
 * Первая — ещё ничего: всё начинается со второй. */
const SATURATION = [0, 0, 0.2, 0.4, 0.6, 0.85, 1.1, 1.35, 1.6];
const MUSIC = [0, 0, 1, 2, 3, 3, 4, 4, 5];
/** Грустная: эмбиент звучит сразу (слой 1) и с каждой рюмкой глубже. */
const SAD_MUSIC = [1, 1, 2, 2, 3, 3, 4, 5, 5];
/** Яркость лампы: до первой рюмки и после последней. */
const LAMP_FROM = 5;
const LAMP_TO = 14;
/** Длительность: выпить (поднять, опрокинуть, поставить) и налить, с. */
const DRINK_TIME = 1.3;
const POUR_TIME = 1.4;
/** После последней рюмки — столько секунд в цвете и с музыкой, потом обратно к костру. */
const OUTRO_TIME = 7;
/** Где стоит рюмка и бутылка (на столе), м. */
const GLASS_AT = new THREE.Vector3(0.1, TABLE_Y, -0.12);
const BOTTLE_AT = new THREE.Vector3(0.38, TABLE_Y, -0.42);
/** Куда подносим рюмку — ко рту (чуть ниже глаз). */
const MOUTH = new THREE.Vector3(0.02, 1.05, 0.25);

// Грустная кухня (пятое воспоминание).
/** Яркость картинки: до первой рюмки и после последней; лампа к концу. */
const SAD_BRIGHTNESS_FROM = 0.7;
const SAD_BRIGHTNESS = 0.22;
const SAD_LAMP = 0.8;
/** Встаём: за сколько секунд, на какую высоту глаз и на сколько отходим назад, м. */
const STAND_TIME = 0.45;
const STAND_EYE = 1.65;
const STAND_BACK = 0.35;
/** Бутылка: когда начинает падать (стол дёрнулся), сколько падает; когда течёт и сколько, с. */
const FALL_AT = 0.2;
const FALL_TIME = 0.4;
const SPILL_AT = 0.7;
const SPILL_TIME = 2.6;
/** Сколько стоим над столом, потом обратно к костру, с. */
const STAND_OUTRO = 5;
/** Лужа у горлышка упавшей бутылки (бутылка падает от нас, к стене): центр и наибольший радиус, м. */
const PUDDLE_AT = new THREE.Vector3(BOTTLE_AT.x, TABLE_Y + 0.003, BOTTLE_AT.z - 0.4);
const PUDDLE_RADIUS = 0.17;

// Концовка (после вершины).
/** Где висит человек (у двери, за спиной сидящего): точка на полу под ним и на какой высоте ноги, м. */
const HANGED_AT = new THREE.Vector3(0.75, 0.45, 0.6);
const CEILING_Y = 2.5;
/** Камера: крупный план лужи — откуда смотрим; в конце — откуда видно человека, м. */
const END_CLOSE = new THREE.Vector3(PUDDLE_AT.x - 0.05, TABLE_Y + 0.22, PUDDLE_AT.z + 0.28);
const END_WIDE = new THREE.Vector3(-0.75, 1.45, -0.55);
/** Концовка по времени: держим крупный план, переводим камеру, держим общий план — потом чёрное, с. */
const END_HOLD = 3.5;
const END_MOVE = 8.5;
const END_STAY = 5;

const smooth = (x: number) => THREE.MathUtils.smoothstep(x, 0, 1);

/**
 * Первое воспоминание: кухня. Сидим за красным столом лицом к стене; можно обернуться на 30° — слева окно,
 * справа закрытая дверь. Сначала тишина и всё чёрно-белое. Перед нами рюмка, бутылка водки и селёдка; по ЛКМ —
 * выпить. Со второй рюмки вступает весёлая музыка (слой за слоем), картинка наливается цветом и чуть плывёт.
 * После последней — посидеть немного и обратно к костру.
 *
 * sad — пятое воспоминание: та же кухня и те же рюмки, но всё наоборот: картинка чёрно-белая и с каждой рюмкой
 * всё тусклее, вместо польки нарастает грустный эмбиент. После последней — резко встаём (стул скрипит,
 * камеру дёргает), стол качнулся — бутылка падает на бок, остатки вытекают лужей. Постояли — обратно к костру.
 */
export class KitchenMemory implements Level {
	readonly scene = new THREE.Scene();
	readonly bounds: Bounds = { minX: -1.2, maxX: 1.2, minZ: -1, maxZ: 1 };
	readonly spawnPoint = { x: 0, z: 0.4, yaw: 0, pitch: -0.35 };
	readonly seat: Seat = { eyeY: 1.15, yawRange: THREE.MathUtils.degToRad(30), pitchMin: -0.9, pitchMax: 0.3 };
	readonly colliders = new Colliders();
	readonly interactables: Interactable[] = [];
	private readonly tune: { setLevel(level: number): void; stop(): void; resume?(): void };
	private readonly sounds = new DrinkSounds();
	/** Звуки текущего действия уже прозвучали (сбрасываются со сменой состояния). */
	private poured = false;
	private clinked = false;
	private readonly lamp = new THREE.PointLight('#ffe2b0', LAMP_FROM, 6, 1.5);
	private readonly glass = new THREE.Group();
	private readonly liquid: THREE.Mesh;
	private readonly bottle = new THREE.Group();
	private shots = 0;
	/** Что сейчас: ждём клика, пьём, наливаем или сидим после последней. */
	private state: 'ready' | 'drinking' | 'pouring' | 'outro' | 'standup' = 'ready';
	private stateTime = 0;
	private saturationNow = 0;
	private brightnessNow = 1;

	private time = 0;
	/** Встаём: откуда начали смотреть (взгляд в момент, когда встали) и поза камеры в этом кадре. */
	private standFrom: { yaw: number; pitch: number } | null = null;
	private readonly pose = { position: new THREE.Vector3(), yaw: 0, pitch: 0 };
	private readonly puddle: THREE.Mesh;
	private fell = false;
	/** Концовка: висящий (покачивается) и выдано ли уже «конец игры». */
	private hanged: THREE.Group | null = null;
	private hangedBody: THREE.Group | null = null;
	private ended = false;

	private get sad(): boolean {
		return this.mode === 'sad';
	}

	constructor(
		private readonly host: LevelHost,
		private readonly onDone: () => void,
		/** happy — первое воспоминание, sad — пятое, ending — концовка после вершины. */
		private readonly mode: 'happy' | 'sad' | 'ending' = 'happy'
	) {
		this.tune = mode === 'sad' ? new AmbientMusic() : mode === 'happy' ? new KitchenMusic() : { setLevel: () => {}, stop: () => {} };
		this.puddle = new THREE.Mesh(
			new THREE.CylinderGeometry(1, 1, 0.004, 20),
			new THREE.MeshStandardMaterial({ color: '#dfe8f0', roughness: 0.05, transparent: true, opacity: 0.55 })
		);
		this.puddle.position.copy(PUDDLE_AT);
		this.puddle.visible = false;
		this.scene.add(this.puddle);
		this.scene.background = new THREE.Color('#1a1714');
		this.scene.add(new THREE.HemisphereLight('#fff4e0', '#3a2c22', 0.7));
		this.lamp.position.set(0, 2.1, -0.4);
		this.lamp.castShadow = true;
		this.scene.add(this.lamp);
		// Дневной свет из окна слева.
		const daylight = new THREE.DirectionalLight('#dce8ff', 1.2);
		daylight.position.set(-3, 2.5, -0.3);
		this.scene.add(daylight);

		const mat = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
			new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true, ...extra });
		const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
			const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
			mesh.position.set(x, y, z);
			mesh.castShadow = true;
			mesh.receiveShadow = true;
			this.scene.add(mesh);
			return mesh;
		};

		// Комната: пол-линолеум, стены — снизу крашеные зелёным, сверху побелка; потолок.
		const green = mat('#5f8a6a');
		const white = mat('#e6dfcc');
		box(2.8, 0.02, 2.4, mat('#7a4a32'), 0, -0.01, -0.1);
		box(2.8, 0.02, 2.4, white, 0, 2.5, -0.1);
		box(2.8, 1.3, 0.05, green, 0, 0.65, -1.15);
		box(2.8, 1.2, 0.05, white, 0, 1.9, -1.15);
		box(2.8, 0.05, 0.06, mat('#3e5a46'), 0, 1.3, -1.12);
		for (const side of [-1, 1]) {
			box(0.05, 1.3, 2.4, green, side * 1.3, 0.65, -0.1);
			box(0.05, 1.2, 2.4, white, side * 1.3, 1.9, -0.1);
		}
		// На стене перед нами — отрывной календарь.
		box(0.22, 0.3, 0.01, mat('#f2efe6'), -0.35, 1.65, -1.12);
		box(0.22, 0.08, 0.012, mat('#b02a2a'), -0.35, 1.84, -1.115);

		// Окно слева: светлое стекло, белая рама с переплётом, занавески.
		const sky = new THREE.MeshBasicMaterial({ color: '#cfe2f5' });
		const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.0), sky);
		pane.rotation.y = Math.PI / 2;
		pane.position.set(-1.27, 1.45, -0.45);
		this.scene.add(pane);
		const frame = mat('#f4f1ea');
		box(0.06, 0.06, 1.0, frame, -1.26, 0.95, -0.45);
		box(0.06, 0.06, 1.0, frame, -1.26, 1.95, -0.45);
		box(0.06, 1.06, 0.06, frame, -1.26, 1.45, -0.95);
		box(0.06, 1.06, 0.06, frame, -1.26, 1.45, 0.05);
		box(0.05, 1.0, 0.04, frame, -1.26, 1.45, -0.45);
		box(0.05, 0.04, 0.9, frame, -1.26, 1.65, -0.45);
		box(0.2, 0.04, 1.1, frame, -1.2, 0.93, -0.45);
		const curtain = mat('#d9822b');
		box(0.03, 1.2, 0.25, curtain, -1.22, 1.5, -1.05);
		box(0.03, 1.2, 0.25, curtain, -1.22, 1.5, 0.15);
		// На подоконнике — горшок с цветком.
		box(0.1, 0.1, 0.1, mat('#a0522d'), -1.18, 1.0, -0.2);
		box(0.12, 0.12, 0.12, mat('#3f8a3a'), -1.18, 1.1, -0.2);

		// Дверь справа: закрытая, крашеная, с ручкой и наличником.
		const doorMat = mat('#8a5a3a');
		box(0.05, 2.0, 0.8, doorMat, 1.27, 1.0, -0.45);
		box(0.03, 0.7, 0.6, mat('#7a4c30'), 1.245, 1.45, -0.45);
		box(0.03, 0.6, 0.6, mat('#7a4c30'), 1.245, 0.55, -0.45);
		box(0.06, 2.08, 0.06, frame, 1.26, 1.04, -0.88);
		box(0.06, 2.08, 0.06, frame, 1.26, 1.04, -0.02);
		box(0.06, 0.06, 0.92, frame, 1.26, 2.05, -0.45);
		box(0.06, 0.03, 0.12, mat('#c8b070', { metalness: 0.6, roughness: 0.4 }), 1.22, 1.0, -0.15);

		// Стол: красная столешница, тёмные ножки.
		const red = mat('#c0262a', { roughness: 0.6 });
		box(1.2, 0.04, 0.9, red, 0, TABLE_Y - 0.02, -0.5);
		const legMat = mat('#3a2a22');
		for (const [lx, lz] of [
			[-0.55, -0.9],
			[0.55, -0.9],
			[-0.55, -0.1],
			[0.55, -0.1],
		])
			box(0.05, TABLE_Y - 0.04, 0.05, legMat, lx, (TABLE_Y - 0.04) / 2, lz);

		// Лампа над столом: провод и абажур.
		box(0.01, 0.35, 0.01, legMat, 0, 2.32, -0.4);
		const shade = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.16, 12, 1, true), mat('#e0b040', { side: THREE.DoubleSide, emissive: '#5a3a10' }));
		shade.position.set(0, 2.1, -0.4);
		this.scene.add(shade);

		// Рюмка: стекло и водка внутри.
		const glassMat = new THREE.MeshStandardMaterial({ color: '#e8f0f4', roughness: 0.1, transparent: true, opacity: 0.45 });
		const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.02, 0.075, 10, 1, true), glassMat);
		cup.position.y = 0.0375;
		const bottom = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.012, 10), glassMat);
		bottom.position.y = 0.006;
		this.liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.019, 0.055, 10), new THREE.MeshStandardMaterial({ color: '#f4f8ff', roughness: 0.05, transparent: true, opacity: 0.7 }));
		this.liquid.position.y = 0.04;
		this.glass.add(cup, bottom, this.liquid);
		this.glass.position.copy(GLASS_AT);
		this.scene.add(this.glass);

		// Бутылка: зелёное стекло, белая этикетка, горлышко с крышечкой. Опора — середина (так её удобно наклонять).
		const bottleMat = new THREE.MeshStandardMaterial({ color: '#cfe0d8', roughness: 0.15, transparent: true, opacity: 0.75 });
		const body = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.2, 12), bottleMat);
		body.position.y = -0.05;
		const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.04, 0.05, 12), bottleMat);
		shoulder.position.y = 0.075;
		const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.014, 0.07, 10), bottleMat);
		neck.position.y = 0.135;
		const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.02, 10), mat('#c8b070', { metalness: 0.6, roughness: 0.4 }));
		cap.position.y = 0.175;
		const label = new THREE.Mesh(new THREE.CylinderGeometry(0.041, 0.041, 0.08, 12, 1, true), mat('#f2eee2'));
		label.position.y = -0.05;
		const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.0415, 0.0415, 0.015, 12, 1, true), mat('#b02a2a'));
		stripe.position.y = -0.03;
		this.bottle.add(body, shoulder, neck, cap, label, stripe);
		this.bottle.position.set(BOTTLE_AT.x, BOTTLE_AT.y + 0.15, BOTTLE_AT.z);
		this.scene.add(this.bottle);

		// Селёдка: тарелка, кусочки с тёмной спинкой, кольца лука; рядом — хлеб.
		const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.015, 16), mat('#f4f2ec', { roughness: 0.4 }));
		plate.position.set(-0.22, TABLE_Y + 0.008, -0.25);
		this.scene.add(plate);
		const fish = mat('#b8bcc4', { metalness: 0.3, roughness: 0.4 });
		const back = mat('#3c4250');
		for (let i = 0; i < 5; i++) {
			const piece = new THREE.Group();
			const flesh = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.022, 0.05), fish);
			const skin = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.008, 0.05), back);
			skin.position.y = 0.014;
			piece.add(flesh, skin);
			piece.position.set(-0.22 + (i - 2) * 0.04, TABLE_Y + 0.027, -0.25 + Math.sin(i * 1.7) * 0.015);
			piece.rotation.y = 0.3 + Math.sin(i) * 0.15;
			this.scene.add(piece);
		}
		const onion = new THREE.MeshStandardMaterial({ color: '#f0ecf4', roughness: 0.6 });
		for (let i = 0; i < 4; i++) {
			const ring = new THREE.Mesh(new THREE.TorusGeometry(0.02 + i * 0.003, 0.004, 4, 12), onion);
			ring.rotation.x = Math.PI / 2;
			ring.position.set(-0.24 + Math.cos(i * 2.1) * 0.05, TABLE_Y + 0.045, -0.25 + Math.sin(i * 2.1) * 0.03);
			this.scene.add(ring);
		}
		// Хлеб — слева от селёдки.
		box(0.09, 0.015, 0.07, mat('#3a2a1e'), -0.45, TABLE_Y + 0.008, -0.3).rotation.y = 0.4;
		box(0.09, 0.015, 0.07, mat('#3a2a1e'), -0.47, TABLE_Y + 0.022, -0.32).rotation.y = 0.1;

		// Банка солёных огурцов: стекло, рассол, огурцы стоймя, жестяная крышка.
		const jarAt = new THREE.Vector3(-0.06, TABLE_Y, -0.45);
		const jar = new THREE.Mesh(
			new THREE.CylinderGeometry(0.065, 0.065, 0.2, 14, 1, true),
			new THREE.MeshStandardMaterial({ color: '#e4eee8', roughness: 0.1, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
		);
		jar.position.set(jarAt.x, jarAt.y + 0.1, jarAt.z);
		const brine = new THREE.Mesh(
			new THREE.CylinderGeometry(0.062, 0.062, 0.17, 14),
			new THREE.MeshStandardMaterial({ color: '#c8c890', roughness: 0.3, transparent: true, opacity: 0.35 })
		);
		brine.position.set(jarAt.x, jarAt.y + 0.087, jarAt.z);
		const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 14), mat('#b8b4a8', { metalness: 0.6, roughness: 0.4 }));
		lid.position.set(jarAt.x, jarAt.y + 0.205, jarAt.z);
		this.scene.add(jar, brine, lid);
		const cucumber = mat('#3d6b2a');
		const cucumberGeo = new THREE.CapsuleGeometry(0.017, 0.11, 3, 8);
		for (let i = 0; i < 6; i++) {
			const a = (i / 6) * Math.PI * 2;
			const c = new THREE.Mesh(cucumberGeo, cucumber);
			c.position.set(jarAt.x + Math.cos(a) * 0.035, jarAt.y + 0.085, jarAt.z + Math.sin(a) * 0.035);
			c.rotation.set(Math.sin(a) * 0.15, 0, Math.cos(a) * 0.15);
			this.scene.add(c);
		}
		// Укроп сверху — зонтик веточкой.
		const dill = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.03, 6), mat('#6a8a3a'));
		dill.position.set(jarAt.x + 0.01, jarAt.y + 0.17, jarAt.z);
		dill.rotation.x = Math.PI;
		this.scene.add(dill);
		if (mode === 'ending') this._buildEnding();
	}

	/**
	 * Концовка: на столе — упавшая бутылка и лужа (как в конце грустной кухни), рюмка пустая. Сзади, у двери, —
	 * человек в петле (всё чёрное, лысый, с усами), раскачивается; под ним — опрокинутый табурет.
	 */
	private _buildEnding(): void {
		const angle = Math.PI / 2;
		this.bottle.position.set(BOTTLE_AT.x, TABLE_Y + 0.04 * Math.sin(angle), BOTTLE_AT.z - 0.04 - 0.15 * Math.sin(angle));
		this.bottle.rotation.set(-angle, 0, 0);
		this.puddle.visible = true;
		this.puddle.scale.set(PUDDLE_RADIUS, 1, PUDDLE_RADIUS * 0.8);
		this.liquid.visible = false;

		const mat = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true });
		// Стена за спиной сидящего — в концовке её видно.
		const lower = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.3, 0.05), mat('#5f8a6a'));
		lower.position.set(0, 0.65, 1.15);
		const upper = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.2, 0.05), mat('#e6dfcc'));
		upper.position.set(0, 1.9, 1.15);
		this.scene.add(lower, upper);

		const person = buildCharacter({
			coat: '#1a1a1c',
			pants: '#141416',
			boots: '#0e0e10',
			skin: '#f0c090',
			mustache: '#3a2a20',
			eyes: '#1a1a1a',
		});
		// Всё висит на точке под потолком — так раскачивается маятником.
		const pivot = new THREE.Group();
		pivot.position.set(HANGED_AT.x, CEILING_Y, HANGED_AT.z);
		this.scene.add(pivot);
		person.group.position.set(0, HANGED_AT.y - CEILING_Y, 0);
		person.group.rotation.y = Math.PI;
		person.head.rotation.set(0.25, 0, 0.4);
		pivot.add(person.group);
		this.hanged = pivot;
		this.hangedBody = person.group;
		// Верёвка: от потолка до шеи, на шее — петля.
		const neckY = HANGED_AT.y + 0.95;
		const ropeMat = mat('#b89a64');
		const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, CEILING_Y - neckY, 5), ropeMat);
		rope.position.set(0, (neckY - CEILING_Y) / 2, 0);
		const loop = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.014, 5, 12), ropeMat);
		loop.rotation.x = Math.PI / 2;
		loop.position.set(0, neckY - 0.03 - CEILING_Y, 0);
		pivot.add(rope, loop);
		// Табурет на боку.
		const stool = new THREE.Group();
		const wood = mat('#8a5a3a');
		const seat = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.04, 0.32), wood);
		stool.add(seat);
		for (const [lx, lz] of [
			[-0.13, -0.13],
			[0.13, -0.13],
			[-0.13, 0.13],
			[0.13, 0.13],
		]) {
			const leg = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.42, 0.035), wood);
			leg.position.set(lx, -0.21, lz);
			stool.add(leg);
		}
		stool.rotation.set(0, 0.5, Math.PI / 2);
		stool.position.set(HANGED_AT.x - 0.35, 0.16, HANGED_AT.z - 0.1);
		this.scene.add(stool);
	}

	/** Музыка горы молчит — здесь своя. */
	/** В концовке — та же музыка, что на вершине (финал); в воспоминаниях музыка горы молчит. */
	music(): MusicMood {
		if (this.mode === 'ending') return { volume: 1, brightness: 1, finale: true };
		return { volume: 0, brightness: 0 };
	}

	saturation(): number {
		return this.mode === 'ending' ? 1.6 : this.saturationNow;
	}

	brightness(): number {
		return this.brightnessNow;
	}

	/** Сидя — обычный взгляд; когда встаём — камерой ведём сами: рывком вверх и назад, взгляд — на бутылку. */
	cameraPose(current: { yaw: number; pitch: number }): { position: THREE.Vector3; yaw: number; pitch: number } | null {
		if (this.mode === 'ending') return this._endingPose();
		if (this.state !== 'standup') return null;
		this.standFrom ??= { ...current };
		const t = this.stateTime;
		const rise = smooth(t / STAND_TIME);
		const pos = this.pose.position.set(this.spawnPoint.x, THREE.MathUtils.lerp(1.15, STAND_EYE, rise), this.spawnPoint.z + STAND_BACK * rise);
		// Смотрим на бутылку и лужу.
		const look = new THREE.Vector3(BOTTLE_AT.x, TABLE_Y, BOTTLE_AT.z - 0.15);
		const yaw = Math.atan2(-(look.x - pos.x), -(look.z - pos.z));
		const pitch = Math.atan2(look.y - pos.y, Math.hypot(look.x - pos.x, look.z - pos.z));
		const turn = smooth(t / 0.7);
		// Рывок: дрожь, которая быстро стихает.
		const shake = Math.max(0, 1 - t / 0.6) * 0.03;
		this.pose.yaw = THREE.MathUtils.lerp(this.standFrom.yaw, yaw, turn) + (Math.random() - 0.5) * shake;
		this.pose.pitch = THREE.MathUtils.lerp(this.standFrom.pitch, pitch, turn) + (Math.random() - 0.5) * shake;
		return this.pose;
	}

	/** Концовка: крупный план лужи, потом камера плавно отъезжает и поворачивается — к человеку в петле. */
	private _endingPose(): { position: THREE.Vector3; yaw: number; pitch: number } {
		const t = this.time;
		const m = smooth((t - END_HOLD) / END_MOVE);
		const pos = this.pose.position.lerpVectors(END_CLOSE, END_WIDE, m);
		// На крупном плане — чуть-чуть дрейфуем, чтобы кадр жил.
		pos.x += Math.sin(t * 0.4) * 0.01 * (1 - m);
		const look = PUDDLE_AT.clone().lerp(new THREE.Vector3(HANGED_AT.x, HANGED_AT.y + 0.75, HANGED_AT.z), m);
		this.pose.yaw = Math.atan2(-(look.x - pos.x), -(look.z - pos.z));
		this.pose.pitch = Math.atan2(look.y - pos.y, Math.hypot(look.x - pos.x, look.z - pos.z));
		return this.pose;
	}

	/** Чем больше выпито, тем сильнее плывёт. */
	wave(): number {
		return this.mode === 'ending' ? 0 : this._drunk() * 0.8;
	}

	getHeightAt(): number {
		return 0;
	}

	enter(): void {
		this.host.setObjective(null);
		if (this.sad) {
			this.brightnessNow = SAD_BRIGHTNESS_FROM;
			this.tune.setLevel(SAD_MUSIC[0]);
		}
	}

	leave(): void {
		this.tune.stop();
		this.sounds.close();
	}

	hint(): string | null {
		if (this.mode === 'ending') return null;
		return this.state === 'ready' ? 'Выпить — ЛКМ' : null;
	}

	update(dt: number): void {
		this.time += dt;
		this.stateTime += dt;
		if (this.mode === 'ending') {
			// Еле заметно покачивается; досмотрели — конец игры.
			// Раскачивается маятником и медленно поворачивается на верёвке.
			if (this.hanged && this.hangedBody) {
				const t = this.time;
				this.hanged.rotation.x = Math.sin(t * 1.1) * 0.05;
				this.hanged.rotation.z = Math.sin(t * 0.8 + 1) * 0.035;
				this.hangedBody.rotation.y = Math.PI + Math.sin(t * 0.45) * 0.18;
			}
			if (!this.ended && this.time >= END_HOLD + END_MOVE + END_STAY) {
				this.ended = true;
				this.host.endGame();
			}
			return;
		}
		this.tune.resume?.();
		// Цвет и свет догоняют число выпитых плавно.
		const k = 1 - Math.exp(-dt * 1.2);
		if (this.sad) {
			// Грустная: цвета нет совсем, картинка и лампа тускнеют с каждой рюмкой.
			this.saturationNow = 0;
			// Тусклеет с первой же рюмки.
			const sink = this.shots / SHOTS;
			this.brightnessNow += (THREE.MathUtils.lerp(SAD_BRIGHTNESS_FROM, SAD_BRIGHTNESS, sink) - this.brightnessNow) * k;
			const lampTarget = THREE.MathUtils.lerp(LAMP_FROM, SAD_LAMP, sink);
			this.lamp.intensity += (lampTarget - this.lamp.intensity) * k;
		} else {
			this.saturationNow += (SATURATION[this.shots] - this.saturationNow) * k;
			const lampTarget = THREE.MathUtils.lerp(LAMP_FROM, LAMP_TO, this._drunk());
			this.lamp.intensity += (lampTarget - this.lamp.intensity) * k;
		}

		if (this.state === 'ready') {
			if (this.host.consumeClick()) this._setState('drinking');
		} else if (this.state === 'drinking') {
			this._animateDrink(this.stateTime / DRINK_TIME);
			if (this.stateTime >= DRINK_TIME) {
				if (this.shots < SHOTS) this._setState('pouring');
				else if (this.sad) {
					this._setState('standup');
					this.sounds.scrape();
				} else this._setState('outro');
			}
		} else if (this.state === 'pouring') {
			this._animatePour(this.stateTime / POUR_TIME);
			if (this.stateTime >= POUR_TIME) this._setState('ready');
		} else if (this.state === 'standup') {
			this._animateFall(this.stateTime);
			if (this.stateTime >= STAND_OUTRO) {
				this.state = 'ready';
				this.onDone();
			}
		} else if (this.stateTime >= OUTRO_TIME) {
			this.state = 'ready';
			this.onDone();
		}
	}

	/**
	 * Встали — стол качнулся: бутылка валится на бок от нас (к стене), перекатываясь через нижний край донышка,
	 * чуть подпрыгивает; из горлышка вытекают остатки — лужа растёт.
	 */
	private _animateFall(t: number): void {
		const f = (t - FALL_AT) / FALL_TIME;
		if (f > 0) {
			// Падает с ускорением; упав — подскакивает и ложится.
			let angle = (Math.PI / 2) * Math.min(f, 1) ** 2;
			if (f > 1) angle -= 0.12 * Math.sin(Math.PI * Math.min((f - 1) / 0.6, 1));
			const pivotZ = BOTTLE_AT.z - 0.04;
			this.bottle.position.set(
				BOTTLE_AT.x,
				TABLE_Y + 0.15 * Math.cos(angle) + 0.04 * Math.sin(angle),
				pivotZ + 0.04 * Math.cos(angle) - 0.15 * Math.sin(angle)
			);
			this.bottle.rotation.set(-angle, 0, 0);
			if (f >= 1 && !this.fell) {
				this.fell = true;
				this.sounds.clink();
			}
		}
		const spill = (t - SPILL_AT) / SPILL_TIME;
		if (spill > 0) {
			if (!this.puddle.visible) {
				this.puddle.visible = true;
				this.sounds.pour(SPILL_TIME * 0.8);
			}
			// Растёт быстро вначале, к концу — еле-еле.
			const r = PUDDLE_RADIUS * (1 - (1 - Math.min(spill, 1)) ** 2);
			this.puddle.scale.set(r, 1, r * 0.8);
		}
	}

	/** Насколько всё уже поплыло, 0..1: первая рюмка не в счёт. */
	private _drunk(): number {
		return Math.max(0, this.shots - 1) / (SHOTS - 1);
	}

	private _setState(state: typeof this.state): void {
		this.state = state;
		this.stateTime = 0;
		this.poured = false;
		this.clinked = false;
	}

	/** Рюмку — ко рту, опрокинуть, поставить обратно. Опустела — вступает новый слой музыки. */
	private _animateDrink(t: number): void {
		const lift = smooth(t / 0.35) * (1 - smooth((t - 0.7) / 0.3));
		const tilt = smooth((t - 0.3) / 0.2) * (1 - smooth((t - 0.6) / 0.15));
		this.glass.position.lerpVectors(GLASS_AT, MOUTH, lift);
		this.glass.rotation.x = tilt * 1.9;
		if (t >= 0.45 && this.liquid.visible) {
			this.liquid.visible = false;
			this.shots++;
			this.sounds.gulp();
			this.tune.setLevel((this.sad ? SAD_MUSIC : MUSIC)[this.shots]);
		}
		if (t >= 0.95 && !this.clinked) {
			this.clinked = true;
			this.sounds.clink();
		}
		if (t >= 1) {
			this.glass.position.copy(GLASS_AT);
			this.glass.rotation.x = 0;
		}
	}

	/** Бутылку — к рюмке, наклонить, налить, вернуть на место. */
	private _animatePour(t: number): void {
		const reach = smooth(t / 0.3) * (1 - smooth((t - 0.75) / 0.25));
		const tilt = smooth((t - 0.2) / 0.2) * (1 - smooth((t - 0.7) / 0.15));
		const from = new THREE.Vector3(BOTTLE_AT.x, BOTTLE_AT.y + 0.15, BOTTLE_AT.z);
		const to = new THREE.Vector3(GLASS_AT.x + 0.15, TABLE_Y + 0.25, GLASS_AT.z);
		this.bottle.position.lerpVectors(from, to, reach);
		this.bottle.rotation.z = tilt * 2;
		// Водка в рюмке прибывает, пока бутылка наклонена.
		const fill = THREE.MathUtils.clamp((t - 0.35) / 0.35, 0, 1);
		if (fill > 0 && !this.poured) {
			this.poured = true;
			this.sounds.pour(0.35 * POUR_TIME);
		}
		this.liquid.visible = fill > 0;
		this.liquid.scale.set(1, Math.max(fill, 0.01), 1);
		this.liquid.position.y = 0.0125 + 0.0275 * fill;
	}
}
