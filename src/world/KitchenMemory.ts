import * as THREE from 'three';
import { Colliders } from '../physics/Colliders.js';
import type { Interactable } from '../core/Interaction.js';
import type { Bounds, Level, LevelHost, Seat } from './Level.js';
import type { MusicMood } from '../audio/Music.js';
import { KitchenMusic } from '../audio/KitchenMusic.js';
import { DrinkSounds } from '../audio/DrinkSounds.js';

/** Высота столешницы, м. */
const TABLE_Y = 0.76;
/** Сколько рюмок. */
const SHOTS = 7;
/** После каждой рюмки (индекс — сколько выпито): насыщенность (из чёрно-белого — в яркое) и слой музыки.
 * Первая — ещё ничего: всё начинается со второй. */
const SATURATION = [0, 0, 0.25, 0.45, 0.7, 0.95, 1.25, 1.6];
const MUSIC = [0, 0, 1, 2, 3, 4, 4, 5];
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

const smooth = (x: number) => THREE.MathUtils.smoothstep(x, 0, 1);

/**
 * Первое воспоминание: кухня. Сидим за красным столом лицом к стене; можно обернуться на 30° — слева окно,
 * справа закрытая дверь. Сначала тишина и всё чёрно-белое. Перед нами рюмка, бутылка водки и селёдка; по ЛКМ —
 * выпить. Со второй рюмки вступает весёлая музыка (слой за слоем), картинка наливается цветом и чуть плывёт.
 * После последней — посидеть немного и обратно к костру.
 */
export class KitchenMemory implements Level {
	readonly scene = new THREE.Scene();
	readonly bounds: Bounds = { minX: -1.2, maxX: 1.2, minZ: -1, maxZ: 1 };
	readonly spawnPoint = { x: 0, z: 0.4, yaw: 0, pitch: -0.35 };
	readonly seat: Seat = { eyeY: 1.15, yawRange: THREE.MathUtils.degToRad(30), pitchMin: -0.9, pitchMax: 0.3 };
	readonly colliders = new Colliders();
	readonly interactables: Interactable[] = [];
	private readonly tune = new KitchenMusic();
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
	private state: 'ready' | 'drinking' | 'pouring' | 'outro' = 'ready';
	private stateTime = 0;
	private saturationNow = 0;
	private time = 0;

	constructor(
		private readonly host: LevelHost,
		private readonly onDone: () => void
	) {
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
	}

	/** Музыка горы молчит — здесь своя. */
	music(): MusicMood {
		return { volume: 0, brightness: 0 };
	}

	saturation(): number {
		return this.saturationNow;
	}

	/** Чем больше выпито, тем сильнее плывёт. */
	wave(): number {
		return this._drunk() * 0.8;
	}

	getHeightAt(): number {
		return 0;
	}

	enter(): void {
		this.host.setObjective(null);
	}

	leave(): void {
		this.tune.stop();
		this.sounds.close();
	}

	hint(): string | null {
		return this.state === 'ready' ? 'Выпить — ЛКМ' : null;
	}

	update(dt: number): void {
		this.time += dt;
		this.stateTime += dt;
		// Цвет и свет догоняют число выпитых плавно.
		const k = 1 - Math.exp(-dt * 1.2);
		this.saturationNow += (SATURATION[this.shots] - this.saturationNow) * k;
		const lampTarget = THREE.MathUtils.lerp(LAMP_FROM, LAMP_TO, this._drunk());
		this.lamp.intensity += (lampTarget - this.lamp.intensity) * k;

		if (this.state === 'ready') {
			if (this.host.consumeClick()) this._setState('drinking');
		} else if (this.state === 'drinking') {
			this._animateDrink(this.stateTime / DRINK_TIME);
			if (this.stateTime >= DRINK_TIME) {
				if (this.shots < SHOTS) this._setState('pouring');
				else this._setState('outro');
			}
		} else if (this.state === 'pouring') {
			this._animatePour(this.stateTime / POUR_TIME);
			if (this.stateTime >= POUR_TIME) this._setState('ready');
		} else if (this.stateTime >= OUTRO_TIME) {
			this.state = 'ready';
			this.onDone();
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
			this.tune.setLevel(MUSIC[this.shots]);
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
