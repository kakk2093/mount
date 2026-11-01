import * as THREE from 'three';
import { Colliders } from '../physics/Colliders.js';
import type { Interactable } from '../core/Interaction.js';
import type { Bounds, Level, LevelHost, Seat } from './Level.js';
import type { MusicMood } from '../audio/Music.js';
import { LofiMusic } from '../audio/LofiMusic.js';
import { OfficeSounds } from '../audio/OfficeSounds.js';
import { DrinkSounds } from '../audio/DrinkSounds.js';
import {
	createDesk,
	createChair,
	createWindow,
	createAcUnit,
	createMuralTexture,
	createDoor,
	createFirstAidCabinet,
	createWhiteboard,
	createWallShelves,
	createCeilingTileTexture,
} from './office/Furniture.js';
import {
	createMonitor,
	createLaptop,
	createKeyboard,
	createMouse,
	createMousePad,
	createMug,
	createPaperCup,
	createPaperStack,
	createNotebook,
	createStickyPad,
	createStickyNote,
	createDeskPlant,
	createHeadphones,
	createWaterBottle,
	createPhone,
	createCan,
	createDeskLamp,
	createScreenTexture,
	type ScreenKind,
} from './office/DeskItems.js';

// Комната — как в ../office (Room.ts): те же размеры, окна, столы и мебель.
const WIDTH = 10;
const DEPTH = 9;
const NORTH_Z = -6;
const SOUTH_Z = NORTH_Z + DEPTH;
const CENTER_Z = (NORTH_Z + SOUTH_Z) / 2;
const HEIGHT = 3;
const WALL_THICKNESS = 0.2;
const CEILING_TILE = 0.6;
const WINDOW_WIDTH = 1.8;
const WINDOW_HEIGHT = 1.4;
const WINDOW_X = -WIDTH / 2 + WALL_THICKNESS / 2 + 0.01;
const WINDOW_Y = 1.6;
const WINDOW_VIEW_Z = 1;
const WINDOW_CLOSED_Z = -3;
const LAMP_X = [-2.1, 2.1];
const LAMP_Z = [-4.5, -2.7, -0.9, 0.9, 2.1];
const LIGHT_Z = [-4.5, -0.9, 2.1];
const DESK_SURFACE_Y = 0.76;
const SEATS_PER_ROW = 3;
const DESK_LENGTH = 1.8;
const ROW_CENTER_Z = NORTH_Z + WALL_THICKNESS / 2 + (SEATS_PER_ROW * DESK_LENGTH) / 2;
const DESK_HALF_WIDTH = 0.35;
const SCREEN_KINDS: ScreenKind[] = ['code', 'game', 'art', 'desktop'];
const MUG_COLORS = ['#c94f3d', '#2c5aa0', '#f2f2ee', '#3fa35a', '#f4d94a', '#26282b', '#e27a9a'];
const STICKY_COLORS = ['#f4e04a', '#f29ab8', '#8fd3f0', '#a8e07a'];
const DOOR_WIDTH = 1.0;
const DOOR_HEIGHT = 2.1;
const DOOR_Z = SOUTH_Z - 1.7;

/** Наше место: блок у окон, ряд со стульями к окну, крайний стол справа (если сидеть лицом к монитору). */
const MY_DESK_X = -1.9 - DESK_HALF_WIDTH;
const MY_DESK_Z = ROW_CENTER_Z + SEATS_PER_ROW * DESK_LENGTH / 2 - DESK_LENGTH / 2;
/** Глаза: на стуле, чуть подавшись к столу; смотрим на восток (+X) — на монитор. */
const EYE = new THREE.Vector3(MY_DESK_X - 0.6, 1.15, MY_DESK_Z);
/** Сколько раз поработать до готовой игры и как часто (после скольких «поработать») тянет выпить кофе. */
const WORK_TOTAL = 18;
const COFFEE_EVERY = 6;
/** Длительность: поработать (стук клавиш), выпить кофе, с. */
const WORK_TIME = 0.7;
const COFFEE_TIME = 1.6;
/** После «в прод» — столько секунд, потом обратно к костру. */
const OUTRO_TIME = 5;
/** Где кружка (слева от клавиатуры) и куда её подносим — ко рту. */
const MUG_AT = new THREE.Vector3(MY_DESK_X - 0.12, DESK_SURFACE_Y, MY_DESK_Z - 0.45);
const MOUTH = new THREE.Vector3(EYE.x + 0.17, 1.03, EYE.z - 0.03);
/** Экран монитора: размер холста (пиксели) и сколько стадий у игры на нём. */
const SCREEN_W = 160;
const SCREEN_H = 96;
const GAME_STAGES = 8;
/** Картинка яркая. */
const SATURATION = 1.35;

// Распад (четвёртое воспоминание).
/** Сколько раз поработать, пока не останется ничего. */
const DECAY_TOTAL = 20;
/** Сколько секунд кусок улетает в пустоту (всплывает, крутится, уменьшается); разброс старта после клика, с. */
const FLOAT_TIME = 4;
const FLOAT_DELAY = 1.4;
/** Цвет пустоты и как далеко видно: в начале и к концу, м. */
const VOID_COLOR = '#808084';
const FOG_FAR_START = 40;
const FOG_FAR_END = 2.5;
/** Стены, пол — кусками такого размера, м. */
const CHUNK = 1;
/** После последнего клика — тишина в пустоте, потом обратно к костру, с. */
const DECAY_OUTRO = 6;

/** Кусок офиса, который улетит: на каком клике, когда стартовал, куда летит и как крутится. */
interface Piece {
	obj: THREE.Object3D;
	click: number;
	startAt: number | null;
	velocity: THREE.Vector3;
	spin: THREE.Vector3;
	scale: THREE.Vector3;
}

const smooth = (x: number) => THREE.MathUtils.smoothstep(x, 0, 1);

/**
 * Третье воспоминание: офис (из ../office). Сидим за крайним столом у окна, поворот ±30°. ЛКМ — поработать:
 * стук клавиш, на мониторе пишется код и по кусочку собирается игра (небо, облака, земля, платформы, герой,
 * монетки, враг, счёт). Время от времени — выпить кофе (тоже ЛКМ). Когда игра готова — «Хуяк в продакшн»:
 * экран празднует, через 5 секунд — обратно к костру. Всё время играет спокойный лоу-фай; цвета яркие.
 *
 * decay — четвёртое воспоминание: тот же офис и та же работа, но с каждым кликом всё уходит. Музыка стихает
 * слоями и «плывёт», картинка выцветает в серое, офис разваливается на куски — от дальних к нам: куски всплывают,
 * крутятся и тают в подступающей серой пустоте. Игра на мониторе разбирается обратно, код стирается, подсказка
 * бледнеет до «…». Последним гаснет и улетает монитор; игла соскакивает — тишина, потом обратно к костру.
 */
export class OfficeMemory implements Level {
	readonly scene = new THREE.Scene();
	readonly bounds: Bounds = { minX: -WIDTH / 2, maxX: WIDTH / 2, minZ: NORTH_Z, maxZ: SOUTH_Z };
	readonly spawnPoint = { x: EYE.x, z: EYE.z, yaw: -Math.PI / 2, pitch: -0.12 };
	readonly seat: Seat = { eyeY: EYE.y, yawRange: THREE.MathUtils.degToRad(30), pitchMin: -0.9, pitchMax: 0.3 };
	readonly colliders = new Colliders();
	readonly interactables: Interactable[] = [];
	private readonly tune = new LofiMusic();
	private readonly sounds = new OfficeSounds();
	private readonly drink = new DrinkSounds();
	private readonly screen = document.createElement('canvas');
	private readonly screenCtx: CanvasRenderingContext2D;
	private readonly screenTex: THREE.CanvasTexture;
	/** Кружка на опоре: опору поднимаем и наклоняем, кружка внутри — повёрнута ручкой к нам. */
	private readonly mug = new THREE.Group();
	private work = 0;
	private coffees = 0;
	private state: 'ready' | 'work' | 'coffee' | 'deployed' | 'end' = 'ready';
	private stateTime = 0;
	private time = 0;
	private sipped = false;
	private clinked = false;
	private seatIndex = 0;
	// Распад.
	private readonly pieces: Piece[] = [];
	private readonly lights: THREE.PointLight[] = [];
	/** Свой стол и вещи на нём — разлетаются под конец; монитор — последним. */
	private readonly myStuff: THREE.Object3D[] = [];
	private myMonitor: THREE.Object3D | null = null;
	/** Кофе в кружке (после первой чашки в распаде — пусто). */
	private coffeeSurface: THREE.Object3D | null = null;
	private saturationNow = SATURATION;
	private readonly fog = new THREE.Fog(VOID_COLOR, FOG_FAR_START * 0.3, FOG_FAR_START);

	constructor(
		private readonly host: LevelHost,
		private readonly onDone: () => void,
		private readonly decay = false
	) {
		this.screen.width = SCREEN_W;
		this.screen.height = SCREEN_H;
		this.screenCtx = this.screen.getContext('2d')!;
		this.screenTex = new THREE.CanvasTexture(this.screen);
		this.screenTex.magFilter = THREE.NearestFilter;
		this.screenTex.minFilter = THREE.NearestFilter;
		this.screenTex.colorSpace = THREE.SRGBColorSpace;

		this.scene.background = new THREE.Color('#9fd4ff');
		this.scene.add(new THREE.AmbientLight('#ffffff', 0.8));
		// Солнечный день: тёплый свет из окон.
		const sun = new THREE.DirectionalLight('#fff0d0', 1.1);
		sun.position.set(-6, 6, 2);
		sun.castShadow = true;
		this.scene.add(sun);

		this._buildShell();
		this._buildWindows();
		const ac = createAcUnit();
		ac.position.set(-3, HEIGHT - 0.35, NORTH_Z + WALL_THICKNESS / 2 + 0.12);
		this.scene.add(ac);
		this._buildSouthWallDecor();
		const door = createDoor(DOOR_WIDTH, DOOR_HEIGHT);
		door.position.set(WIDTH / 2 - WALL_THICKNESS / 2 - 0.01, 0, DOOR_Z - DOOR_WIDTH / 2);
		door.rotation.y = -Math.PI / 2;
		this.scene.add(door);
		this._buildCeilingLights();
		this._buildDeskBlock(-1.9);
		this._buildDeskBlock(1.9);
		if (this.decay) {
			this.scene.background = new THREE.Color(VOID_COLOR);
			this.scene.fog = this.fog;
			this._collectPieces();
		}
		this._drawScreen();
	}

	private get total(): number {
		return this.decay ? DECAY_TOTAL : WORK_TOTAL;
	}

	/** Насколько всё ушло 0..1 (в распаде; с учётом идущего клика). */
	private get progress(): number {
		const typing = this.state === 'work' ? Math.min(this.stateTime / WORK_TIME, 1) : 0;
		return Math.min(1, (this.work + typing) / DECAY_TOTAL);
	}

	/**
	 * Распад: всё, что в сцене (кроме света и своего места), — куски; от дальних к ближним делим по кликам.
	 * Свои вещи — под конец, монитор — на самый последний клик.
	 */
	private _collectPieces(): void {
		const general: { obj: THREE.Object3D; d: number }[] = [];
		for (const obj of this.scene.children) {
			if (obj instanceof THREE.PointLight) {
				this.lights.push(obj);
				continue;
			}
			if (obj instanceof THREE.Light || obj === this.myMonitor || this.myStuff.includes(obj)) continue;
			// Чуть вразнобой, чтобы уходило не ровным кольцом.
			const d = Math.hypot(obj.position.x - EYE.x, obj.position.z - EYE.z) + Math.random() * 1.5;
			general.push({ obj, d });
		}
		general.sort((a, b) => b.d - a.d);
		const last = DECAY_TOTAL - 4;
		general.forEach(({ obj }, i) => this._addPiece(obj, 1 + Math.floor((i / general.length) * last)));
		this.myStuff.forEach((obj, i) => this._addPiece(obj, i < this.myStuff.length / 2 ? DECAY_TOTAL - 3 : DECAY_TOTAL - 2));
		if (this.myMonitor) this._addPiece(this.myMonitor, DECAY_TOTAL);
	}

	private _addPiece(obj: THREE.Object3D, click: number): void {
		// Летит вверх и прочь от нас, крутится медленно.
		const away = new THREE.Vector3(obj.position.x - EYE.x, 0, obj.position.z - EYE.z);
		if (away.lengthSq() < 1e-4) away.set(1, 0, 0);
		away.normalize().multiplyScalar(0.15 + Math.random() * 0.25);
		this.pieces.push({
			obj,
			click,
			startAt: null,
			velocity: away.setY(0.25 + Math.random() * 0.45),
			spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(1.2),
			scale: obj.scale.clone(),
		});
	}

	/** Куски, чья очередь пришла, — в полёт; улетевшие — прячем. */
	private _updatePieces(dt: number): void {
		for (const p of this.pieces) {
			if (p.startAt === null || this.time < p.startAt || !p.obj.visible) continue;
			const age = this.time - p.startAt;
			if (age >= FLOAT_TIME) {
				p.obj.visible = false;
				continue;
			}
			// Сначала еле трогается, потом быстрее.
			const k = Math.min(1, age / 1.2);
			p.obj.position.addScaledVector(p.velocity, dt * k);
			p.obj.rotation.x += p.spin.x * dt * k;
			p.obj.rotation.y += p.spin.y * dt * k;
			p.obj.rotation.z += p.spin.z * dt * k;
			p.obj.scale.copy(p.scale).multiplyScalar(1 - smooth(age / FLOAT_TIME));
		}
	}

	/** Клик номер click сделан — его куски уходят (каждый со своей задержкой). */
	private _releasePieces(click: number): void {
		for (const p of this.pieces) if (p.click === click) p.startAt = this.time + Math.random() * (p.obj === this.myMonitor ? 0.3 : FLOAT_DELAY);
	}

	music(): MusicMood {
		return { volume: 0, brightness: 0 };
	}

	saturation(): number {
		return this.saturationNow;
	}

	getHeightAt(): number {
		return 0;
	}

	enter(): void {
		this.host.setObjective(null);
		this.tune.start();
	}

	leave(): void {
		this.tune.stop();
		this.sounds.close();
		this.drink.close();
	}

	hint(): string | null {
		if (this.state !== 'ready') return null;
		if (this._needsCoffee()) return 'Выпить кофе — ЛКМ';
		// Распад: подсказка бледнеет вместе со всем.
		if (this.decay) {
			const p = this.work / DECAY_TOTAL;
			return p < 0.5 ? 'Работать — ЛКМ' : p < 0.8 ? 'Работать…' : '…';
		}
		if (this.work < WORK_TOTAL) return 'Работать — ЛКМ';
		return 'Хуяк в продакшн — ЛКМ';
	}

	update(dt: number): void {
		this.time += dt;
		this.stateTime += dt;
		this.tune.resume();
		if (this.decay) {
			const p = this.progress;
			this.tune.setDecay(p);
			// Цвет уходит, свет тускнеет, пустота подступает.
			this.saturationNow += (SATURATION * (1 - p) - this.saturationNow) * (1 - Math.exp(-dt * 1.5));
			for (const light of this.lights) light.intensity = 9 * (1 - 0.6 * p);
			this.fog.far = THREE.MathUtils.lerp(FOG_FAR_START, FOG_FAR_END, smooth(p));
			this.fog.near = this.fog.far * 0.3;
			this._updatePieces(dt);
		}

		if (this.state === 'ready') {
			if (this.host.consumeClick()) {
				if (this._needsCoffee()) this._setState('coffee');
				else if (this.work < this.total) {
					this._setState('work');
					this.sounds.typing(WORK_TIME, this.decay ? Math.max(0.1, 1 - this.progress) : 1);
				} else {
					this._setState('deployed');
					this.sounds.deploy();
				}
			}
		} else if (this.state === 'work') {
			if (this.stateTime >= WORK_TIME) {
				this.work++;
				this._setState('ready');
				if (this.decay) {
					this._releasePieces(this.work);
					// Последний клик: монитор гаснет и уходит, игла соскакивает — тишина.
					if (this.work >= DECAY_TOTAL) {
						this._setState('end');
						this.tune.scratch();
					}
				}
			}
		} else if (this.state === 'coffee') {
			this._animateCoffee(this.stateTime / COFFEE_TIME);
			if (this.stateTime >= COFFEE_TIME) {
				this.coffees++;
				// В распаде кофе кончается после первой чашки.
				if (this.decay && this.coffeeSurface) this.coffeeSurface.visible = false;
				this._setState('ready');
			}
		} else if (this.stateTime >= (this.state === 'end' ? DECAY_OUTRO : OUTRO_TIME)) {
			this.state = 'ready';
			this.onDone();
		}
		this._drawScreen();
	}

	/** Пора выпить кофе: каждые COFFEE_EVERY «поработать» (пока игра не готова). */
	private _needsCoffee(): boolean {
		return this.work < this.total && this.coffees < Math.floor(this.work / COFFEE_EVERY);
	}

	private _setState(state: typeof this.state): void {
		this.state = state;
		this.stateTime = 0;
		this.sipped = false;
		this.clinked = false;
	}

	/** Кружку — ко рту, отхлебнуть, поставить обратно. */
	private _animateCoffee(t: number): void {
		const lift = smooth(t / 0.3) * (1 - smooth((t - 0.7) / 0.3));
		const tilt = smooth((t - 0.25) / 0.2) * (1 - smooth((t - 0.6) / 0.15));
		this.mug.position.lerpVectors(MUG_AT, MOUTH, lift);
		// Наклон к себе (к -X): верх кружки уходит к нам.
		this.mug.rotation.z = tilt * 1.1;
		if (t >= 0.42 && !this.sipped) {
			this.sipped = true;
			// Пустая кружка — поднял, а глотка нет.
			if (this.coffeeSurface?.visible !== false) this.drink.gulp();
		}
		if (t >= 0.95 && !this.clinked) {
			this.clinked = true;
			this.drink.clink();
		}
		if (t >= 1) {
			this.mug.position.copy(MUG_AT);
			this.mug.rotation.z = 0;
		}
	}

	// ---------- Экран ----------

	/** Монитор: слева редактор с кодом (растёт с работой), справа окно игры, которое собирается по стадиям;
	 * готово — игра на весь экран и кнопка DEPLOY; после — праздник. */
	private _drawScreen(): void {
		const ctx = this.screenCtx;
		const w = SCREEN_W;
		const h = SCREEN_H;
		const t = this.time;
		if (this.decay) {
			this._drawDecayScreen(t);
			this.screenTex.needsUpdate = true;
			return;
		}
		if (this.state === 'deployed') {
			ctx.fillStyle = '#1fa860';
			ctx.fillRect(0, 0, w, h);
			// Конфетти сыплется сверху.
			const colors = ['#ffd23f', '#ff5d8f', '#3fc1ff', '#ffffff', '#a0ff5a'];
			for (let i = 0; i < 40; i++) {
				const x = (i * 37.3 + Math.sin(t * 2 + i) * 6) % w;
				const y = ((i * 23.7 + t * (20 + (i % 5) * 6)) % (h + 10)) - 5;
				ctx.fillStyle = colors[i % colors.length];
				ctx.fillRect(Math.floor(x), Math.floor(y), 3, 2);
			}
			ctx.fillStyle = '#ffffff';
			ctx.font = 'bold 22px monospace';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText('В ПРОДЕ!', w / 2, h / 2 - 6);
			ctx.font = 'bold 11px monospace';
			ctx.fillText('v1.0 ✓', w / 2, h / 2 + 16);
		} else if (this.work >= WORK_TOTAL) {
			this._drawGame(0, 0, w, h, GAME_STAGES, t);
			// Кнопка DEPLOY — мигает, зовёт.
			const glow = Math.sin(t * 5) > 0 ? '#ff3b30' : '#d0281f';
			ctx.fillStyle = glow;
			ctx.fillRect(w / 2 - 38, h - 30, 76, 22);
			ctx.fillStyle = '#ffffff';
			ctx.font = 'bold 13px monospace';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText('DEPLOY', w / 2, h - 19);
		} else {
			this._drawEditor(0, 0, 78, h, t);
			ctx.fillStyle = '#2a2f38';
			ctx.fillRect(78, 0, w - 78, h);
			// Окно игры с заголовком.
			ctx.fillStyle = '#4a5260';
			ctx.fillRect(82, 6, w - 86, 6);
			const stage = Math.floor((this.work / WORK_TOTAL) * GAME_STAGES);
			this._drawGame(82, 12, w - 86, h - 18, stage, t);
		}
		this.screenTex.needsUpdate = true;
	}

	/** Распад: та же работа, но всё наоборот — код стирается, игра разбирается; к концу экран гаснет. */
	private _drawDecayScreen(t: number): void {
		const ctx = this.screenCtx;
		const w = SCREEN_W;
		const h = SCREEN_H;
		const p = this.progress;
		if (this.state === 'end') {
			ctx.fillStyle = '#000000';
			ctx.fillRect(0, 0, w, h);
			return;
		}
		this._drawEditor(0, 0, 78, h, t, true);
		ctx.fillStyle = '#2a2f38';
		ctx.fillRect(78, 0, w - 78, h);
		ctx.fillStyle = '#4a5260';
		ctx.fillRect(82, 6, w - 86, 6);
		const stage = Math.max(0, GAME_STAGES - Math.floor(p * (GAME_STAGES + 1)));
		this._drawGame(82, 12, w - 86, h - 18, stage, t);
		// К концу экран гаснет.
		const dark = smooth((p - 0.7) / 0.3);
		if (dark > 0) {
			ctx.fillStyle = `rgba(0,0,0,${dark})`;
			ctx.fillRect(0, 0, w, h);
		}
	}

	/** Редактор: номера строк, цветные «слова»; строк столько, сколько наработано; печатаемая — растёт.
	 * erase — наоборот: строк всё меньше, последняя по ходу клика стирается. */
	private _drawEditor(x: number, y: number, w: number, h: number, t: number, erase = false): void {
		const ctx = this.screenCtx;
		ctx.fillStyle = '#1e222a';
		ctx.fillRect(x, y, w, h);
		ctx.fillStyle = '#2a2f38';
		ctx.fillRect(x, y, 8, h);
		const colors = ['#c678dd', '#61afef', '#98c379', '#e5c07b', '#abb2bf', '#e06c75'];
		let typing = this.state === 'work' ? this.stateTime / WORK_TIME : 0;
		let lines = this.work * 2 + Math.floor(typing * 2);
		if (erase) {
			lines = Math.max(0, (DECAY_TOTAL - this.work) * 2 - Math.floor(typing * 2));
			typing = 1 - typing;
		}
		const rows = Math.floor((h - 4) / 4);
		const first = Math.max(0, lines - rows + 1);
		for (let i = first; i <= lines; i++) {
			const row = i - first;
			const ly = y + 2 + row * 4;
			let seed = i * 7919 + 13;
			const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
			const indent = Math.floor(rand() * 3) * 4;
			// Последняя строка — та, что печатается сейчас: обрезаем по ходу набора.
			const limit = i === lines ? (typing % 0.5) * 2 * (w - 12) : Infinity;
			let lx = x + 10 + indent;
			while (lx < x + w - 4 && lx - (x + 10) < limit) {
				const word = 3 + Math.floor(rand() * 9);
				ctx.fillStyle = colors[Math.floor(rand() * colors.length)];
				ctx.fillRect(lx, ly, Math.min(word, x + w - 4 - lx), 2);
				lx += word + 2;
				if (rand() < 0.25) break;
			}
			if (i === lines && Math.sin(t * 8) > 0) {
				ctx.fillStyle = '#ffffff';
				ctx.fillRect(Math.min(lx, x + w - 3), ly - 1, 1, 4);
			}
		}
	}

	/** Маленький платформер — чем больше stage, тем больше в нём готово. */
	private _drawGame(x: number, y: number, w: number, h: number, stage: number, t: number): void {
		const ctx = this.screenCtx;
		ctx.save();
		ctx.beginPath();
		ctx.rect(x, y, w, h);
		ctx.clip();
		// 0 — пустое серое окно; 1 — небо.
		if (stage < 1) {
			ctx.fillStyle = '#3a3f48';
			ctx.fillRect(x, y, w, h);
		} else {
			const sky = ctx.createLinearGradient(0, y, 0, y + h);
			sky.addColorStop(0, '#3fa0ff');
			sky.addColorStop(1, '#c4ecff');
			ctx.fillStyle = sky;
			ctx.fillRect(x, y, w, h);
		}
		const groundY = y + h - Math.floor(h * 0.2);
		// 2 — облака плывут.
		if (stage >= 2) {
			ctx.fillStyle = '#ffffff';
			for (let i = 0; i < 3; i++) {
				const cx = x + ((i * 50 + t * 6) % (w + 30)) - 15;
				const cy = y + 6 + i * 7;
				ctx.fillRect(cx, cy, 16, 4);
				ctx.fillRect(cx + 4, cy - 3, 8, 3);
			}
		}
		// 3 — земля: трава и почва.
		if (stage >= 3) {
			ctx.fillStyle = '#8d5a2b';
			ctx.fillRect(x, groundY, w, y + h - groundY);
			ctx.fillStyle = '#4caf50';
			ctx.fillRect(x, groundY, w, 3);
		}
		// 4 — платформы из кирпичей.
		const platforms: [number, number, number][] = [
			[0.15, 0.55, 18],
			[0.55, 0.4, 22],
		];
		if (stage >= 4) {
			for (const [px, py, pw] of platforms) {
				ctx.fillStyle = '#c8783a';
				ctx.fillRect(x + px * w, y + py * h, pw, 5);
				ctx.fillStyle = '#7a4420';
				for (let bx = 0; bx < pw; bx += 6) ctx.fillRect(x + px * w + bx, y + py * h + 2, 1, 3);
			}
		}
		// 5 — герой бегает и прыгает.
		if (stage >= 5) {
			const run = (t * 0.25) % 1;
			const hx = x + 6 + run * (w - 18);
			const hop = Math.abs(Math.sin(t * 4)) * 10;
			const hy = groundY - 8 - hop;
			ctx.fillStyle = '#e53935';
			ctx.fillRect(hx, hy, 6, 8);
			ctx.fillStyle = '#ffd7b0';
			ctx.fillRect(hx + 1, hy + 1, 4, 3);
			ctx.fillStyle = '#1a1a1a';
			ctx.fillRect(hx + 3, hy + 2, 1, 1);
		}
		// 6 — монетки мигают над платформами.
		if (stage >= 6) {
			ctx.fillStyle = Math.sin(t * 6) > 0 ? '#ffd23f' : '#ffb300';
			for (const [px, py, pw] of platforms) {
				for (let i = 0; i < 3; i++) ctx.fillRect(x + px * w + 3 + i * (pw / 3), y + py * h - 6 + Math.sin(t * 3 + i) * 1, 3, 4);
			}
		}
		// 7 — враг ходит туда-сюда.
		if (stage >= 7) {
			const ex = x + w * 0.6 + Math.sin(t * 1.5) * w * 0.25;
			ctx.fillStyle = '#7b3fbf';
			ctx.fillRect(ex, groundY - 6, 7, 6);
			ctx.fillStyle = '#ffffff';
			ctx.fillRect(ex + 1, groundY - 5, 2, 2);
			ctx.fillRect(ex + 4, groundY - 5, 2, 2);
		}
		// 8 — счёт.
		if (stage >= 8) {
			ctx.fillStyle = '#ffffff';
			ctx.font = 'bold 8px monospace';
			ctx.textAlign = 'left';
			ctx.textBaseline = 'top';
			ctx.fillText(`SCORE ${String(Math.floor(t * 7) % 1000).padStart(3, '0')}`, x + 3, y + 2);
		}
		ctx.restore();
	}

	// ---------- Комната (как Room.ts в ../office) ----------

	private _buildShell(): void {
		if (this.decay) {
			this._buildShellInChunks();
			return;
		}
		const floor = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH, DEPTH), new THREE.MeshStandardMaterial({ color: '#2b2c2e' }));
		floor.rotation.x = -Math.PI / 2;
		floor.position.z = CENTER_Z;
		floor.receiveShadow = true;
		this.scene.add(floor);

		const ceilingTex = createCeilingTileTexture(WIDTH / CEILING_TILE, DEPTH / CEILING_TILE);
		ceilingTex.offset.set(-((WIDTH / 2) % CEILING_TILE) / CEILING_TILE, -((-NORTH_Z) % CEILING_TILE) / CEILING_TILE);
		const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH, DEPTH), new THREE.MeshStandardMaterial({ map: ceilingTex }));
		ceiling.rotation.x = Math.PI / 2;
		ceiling.position.set(0, HEIGHT, CENTER_Z);
		this.scene.add(ceiling);

		const wallMat = new THREE.MeshStandardMaterial({ color: '#eae7df' });
		const muralMat = new THREE.MeshStandardMaterial({ map: createMuralTexture() });
		const walls: [THREE.Material, number, number, number, number, number][] = [
			[muralMat, WIDTH, WALL_THICKNESS, 0, NORTH_Z, 0],
			[wallMat, WIDTH, WALL_THICKNESS, 0, SOUTH_Z, 0],
			[wallMat, WALL_THICKNESS, DEPTH, -WIDTH / 2, CENTER_Z, 0],
			[wallMat, WALL_THICKNESS, DEPTH, WIDTH / 2, CENTER_Z, 0],
		];
		for (const [m, w, d, x, z] of walls) {
			const wall = new THREE.Mesh(new THREE.BoxGeometry(w, HEIGHT, d), m);
			wall.position.set(x, HEIGHT / 2, z);
			wall.receiveShadow = true;
			this.scene.add(wall);
		}
	}

	/**
	 * Распад: пол, потолок и стены — из отдельных кусков (каждый улетит сам): пол и стены — квадратами CHUNK,
	 * потолок — по плите. На стене с росписью у каждого куска — свой кусок картинки.
	 */
	private _buildShellInChunks(): void {
		const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
			const mesh = new THREE.Mesh(geo, m);
			mesh.position.set(x, y, z);
			mesh.receiveShadow = true;
			this.scene.add(mesh);
		};
		const floorMat = new THREE.MeshStandardMaterial({ color: '#2b2c2e' });
		const floorGeo = new THREE.BoxGeometry(CHUNK, 0.04, CHUNK);
		for (let x = -WIDTH / 2 + CHUNK / 2; x < WIDTH / 2; x += CHUNK)
			for (let z = NORTH_Z + CHUNK / 2; z < SOUTH_Z; z += CHUNK) add(floorGeo, floorMat, x, -0.02, z);

		const tileTex = createCeilingTileTexture(1, 1);
		const tileMat = new THREE.MeshStandardMaterial({ map: tileTex });
		const tileGeo = new THREE.BoxGeometry(CEILING_TILE, 0.02, CEILING_TILE);
		for (let x = -WIDTH / 2 + CEILING_TILE / 2; x < WIDTH / 2; x += CEILING_TILE)
			for (let z = NORTH_Z + CEILING_TILE / 2; z < SOUTH_Z; z += CEILING_TILE) add(tileGeo, tileMat, x, HEIGHT + 0.01, z);

		const wallMat = new THREE.MeshStandardMaterial({ color: '#eae7df' });
		const mural = createMuralTexture();
		const cols = Math.round(WIDTH / CHUNK);
		const rows = Math.round(HEIGHT / CHUNK);
		for (let i = 0; i < cols; i++) {
			const x = -WIDTH / 2 + (i + 0.5) * CHUNK;
			for (let j = 0; j < rows; j++) {
				const y = (j + 0.5) * CHUNK;
				// Роспись: каждому куску — свой участок картинки.
				const tex = mural.clone();
				tex.repeat.set(1 / cols, 1 / rows);
				tex.offset.set(i / cols, j / rows);
				tex.needsUpdate = true;
				add(new THREE.BoxGeometry(CHUNK, CHUNK, WALL_THICKNESS), new THREE.MeshStandardMaterial({ map: tex }), x, y, NORTH_Z);
				add(new THREE.BoxGeometry(CHUNK, CHUNK, WALL_THICKNESS), wallMat, x, y, SOUTH_Z);
			}
		}
		const sideGeo = new THREE.BoxGeometry(WALL_THICKNESS, CHUNK, CHUNK);
		for (let z = NORTH_Z + CHUNK / 2; z < SOUTH_Z; z += CHUNK)
			for (let j = 0; j < rows; j++) {
				add(sideGeo, wallMat, -WIDTH / 2, (j + 0.5) * CHUNK, z);
				add(sideGeo, wallMat, WIDTH / 2, (j + 0.5) * CHUNK, z);
			}
	}

	/** Окна в западной стене: одно с солнечным видом и цветком (в распаде — серая пустота), другое — за жалюзи. */
	private _buildWindows(): void {
		for (const [z, options] of [
			[WINDOW_CLOSED_Z, { blinds: 1, blindsTilt: 0.6 }],
			[WINDOW_VIEW_Z, { plant: true, view: this.decay ? createVoidView() : createSunnyView() }],
		] as const) {
			const win = createWindow(WINDOW_WIDTH, WINDOW_HEIGHT, options);
			win.position.set(WINDOW_X, WINDOW_Y, z);
			win.rotation.y = Math.PI / 2;
			this.scene.add(win);
		}
	}

	private _buildSouthWallDecor(): void {
		const wallZ = SOUTH_Z - WALL_THICKNESS / 2;
		for (const [item, x, y] of [
			[createFirstAidCabinet(), WIDTH / 2 - 0.9, 1.5],
			[createWhiteboard(3.2, 1.5), 0.8, 1.6],
			[createWallShelves(), -3.0, 1.2],
		] as const) {
			item.position.set(x, y, wallZ);
			item.rotation.y = Math.PI;
			this.scene.add(item);
		}
	}

	private _buildCeilingLights(): void {
		for (const x of LAMP_X) {
			for (const z of LAMP_Z) {
				const frame = new THREE.Mesh(
					new THREE.BoxGeometry(CEILING_TILE - 0.02, 0.02, CEILING_TILE - 0.02),
					new THREE.MeshStandardMaterial({ color: '#e4e3de' })
				);
				frame.position.set(x, HEIGHT - 0.01, z);
				const diffuser = new THREE.Mesh(
					new THREE.BoxGeometry(CEILING_TILE - 0.1, 0.01, CEILING_TILE - 0.1),
					new THREE.MeshStandardMaterial({ color: '#fff8e6', emissive: '#fff8e6', emissiveIntensity: 1.4 })
				);
				diffuser.position.set(x, HEIGHT - 0.022, z);
				this.scene.add(frame, diffuser);
			}
			for (const z of LIGHT_Z) {
				const light = new THREE.PointLight('#fff3d8', 9, 8, 2);
				light.position.set(x, HEIGHT - 0.25, z);
				this.scene.add(light);
			}
		}
	}

	private _buildDeskBlock(centerX: number): void {
		const seatZ = Array.from({ length: SEATS_PER_ROW }, (_, i) => ROW_CENTER_Z + (i - (SEATS_PER_ROW - 1) / 2) * DESK_LENGTH);
		this._buildDeskRow(centerX - DESK_HALF_WIDTH, seatZ, -1);
		this._buildDeskRow(centerX + DESK_HALF_WIDTH, seatZ, 1);
	}

	private _buildDeskRow(x: number, seatZ: number[], chairSide: -1 | 1): void {
		for (const z of seatZ) {
			const desk = createDesk(DESK_LENGTH);
			desk.position.set(x, 0, z);
			this.scene.add(desk);
			const mine = Math.abs(x - MY_DESK_X) < 0.01 && Math.abs(z - MY_DESK_Z) < 0.01;
			if (mine) {
				// Наш стул — под нами (не виден), стол — свой.
				this.seatIndex++;
				this._buildMyWorkstation(x, z, desk);
				continue;
			}
			this._buildWorkstation(x, z, chairSide);
			const chair = createChair();
			chair.position.set(x + chairSide * 0.85, 0, z);
			chair.rotation.y = chairSide > 0 ? -Math.PI / 2 : Math.PI / 2;
			this.scene.add(chair);
		}
	}

	/** Наш стол: монитор с живым экраном, клавиатура, мышь, кружка кофе, блокнот и цветок. Сидим лицом к +X. */
	private _buildMyWorkstation(x: number, z: number, desk: THREE.Object3D): void {
		const yaw = -Math.PI / 2;
		const put = (obj: THREE.Object3D, d: number, l: number, rot = 0) => {
			obj.position.set(x + d, DESK_SURFACE_Y, z + l);
			obj.rotation.y = yaw + rot;
			this.scene.add(obj);
		};
		const monitor = createMonitor(this.screenTex);
		const note = createStickyNote('#f4e04a');
		note.position.set(0.25, 0.47, -0.053);
		note.rotation.z = 0.15;
		monitor.add(note);
		put(monitor, 0.2, -0.05);
		this.myMonitor = monitor;
		// Свои вещи — в порядке ухода при распаде: сначала мелочь, потом клавиатура, кружка и сам стол.
		const notebook = createNotebook('#8a2f2a');
		put(notebook, 0.1, 0.7, 0.3);
		const plant = createDeskPlant();
		put(plant, 0.22, -0.65);
		const pad = createMousePad('#2f3f5a');
		put(pad, -0.1, 0.3, 0.1);
		const mouse = createMouse('#d8d8d4');
		put(mouse, -0.1, 0.3, -0.1);
		mouse.position.y += 0.004;
		const keyboard = createKeyboard();
		put(keyboard, -0.12, -0.05);
		// Кружка — ручкой вправо от нас, на опоре (её и двигаем).
		const cup = createMug('#f4d94a');
		cup.rotation.y = yaw;
		this.coffeeSurface = cup.children[2] ?? null;
		this.mug.add(cup);
		this.mug.position.copy(MUG_AT);
		this.scene.add(this.mug);
		this.myStuff.push(notebook, plant, pad, mouse, keyboard, this.mug, desk);
	}

	/** Чужие рабочие места — как в ../office: техника, мышь, кружка и мелочёвка в случайных свободных местах. */
	private _buildWorkstation(x: number, z: number, s: -1 | 1): void {
		const index = this.seatIndex++;
		let seed = index * 9301 + 49297;
		const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
		const pick = <T,>(list: readonly T[]): T => list[Math.floor(rand() * list.length)];
		const yaw = (s * Math.PI) / 2;
		const put = (obj: THREE.Object3D, d: number, l: number, rot = 0) => {
			obj.position.set(x - s * d, DESK_SURFACE_Y, z - s * l);
			obj.rotation.y = yaw + rot;
			this.scene.add(obj);
		};
		const screen = () => createScreenTexture(pick(SCREEN_KINDS), index * 3 + Math.floor(rand() * 3));
		const monitorWithNotes = () => {
			const monitor = createMonitor(screen());
			if (rand() < 0.45) {
				const count = 1 + Math.floor(rand() * 2);
				for (let i = 0; i < count; i++) {
					const note = createStickyNote(pick(STICKY_COLORS));
					note.position.set(0.25 - i * 0.07, 0.47 - i * 0.02, -0.053);
					note.rotation.z = (rand() - 0.5) * 0.4;
					monitor.add(note);
				}
			}
			return monitor;
		};

		let slots: [number, number][] = [
			[-0.1, -0.52],
			[0.12, -0.7],
			[-0.2, -0.78],
			[0.22, -0.58],
			[-0.15, 0.62],
			[0.1, 0.74],
			[0.22, 0.52],
			[-0.22, 0.8],
		];
		const setup = index % 3;
		if (setup === 1) {
			put(monitorWithNotes(), 0.2, -0.33, 0.25);
			put(monitorWithNotes(), 0.2, 0.3, -0.25);
			slots = slots.filter(([d, l]) => !(d > 0.12 && Math.abs(l) < 0.65));
		} else {
			put(monitorWithNotes(), 0.2, -0.05, (rand() - 0.5) * 0.1);
			if (setup === 2) {
				put(createLaptop(screen()), 0.0, -0.6, 0.35);
				slots = slots.filter(([, l]) => l > 0);
			}
		}

		put(createKeyboard(), -0.12, -0.05, (rand() - 0.5) * 0.08);
		const leftHanded = index === 4;
		const padL = leftHanded ? -0.42 : 0.3;
		put(createMousePad(pick(['#23262b', '#2f3f5a', '#4a2f3a'])), -0.1, padL, (rand() - 0.5) * 0.2);
		const mouse = createMouse(pick(['#2a2a2c', '#d8d8d4']));
		put(mouse, -0.1 + (rand() - 0.5) * 0.04, padL + (rand() - 0.5) * 0.06, (rand() - 0.5) * 0.3);
		mouse.position.y += 0.004;
		if (leftHanded) slots = slots.filter(([, l]) => !(l < 0 && l > -0.6));

		for (let i = slots.length - 1; i > 0; i--) {
			const j = Math.floor(rand() * (i + 1));
			[slots[i], slots[j]] = [slots[j], slots[i]];
		}
		const items: (() => THREE.Object3D)[] = [];
		const drink = rand();
		if (drink < 0.65) items.push(() => createMug(pick(MUG_COLORS)));
		else if (drink < 0.85) items.push(() => createPaperCup());
		const pool: (() => THREE.Object3D)[] = [
			() => createPaperStack(3 + Math.floor(rand() * 4)),
			() => createNotebook(pick(['#2f4f7a', '#8a2f2a', '#3f6b45', '#26282b'])),
			() => createStickyPad(pick(STICKY_COLORS)),
			() => createDeskPlant(),
			() => createHeadphones(pick(['#2a2b2e', '#e8e6e0', '#c42d22'])),
			() => createWaterBottle(),
			() => createPhone(),
			() => createCan(pick(['#2c8a4a', '#c42d22', '#2c5aa0', '#e8e6e0'])),
			() => createDeskLamp(pick(['#2a2b2e', '#f2f2ee', '#c9a23a'])),
		];
		const extras = 2 + Math.floor(rand() * 3);
		for (let i = 0; i < extras; i++) items.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
		items.forEach((make, i) => {
			if (i >= slots.length) return;
			const [d, l] = slots[i];
			put(make(), d, l, (rand() - 0.5) * 1.2);
		});
	}
}

/** Вид из окна в распаде: серая пустота, чуть светлее к середине. */
function createVoidView(): THREE.CanvasTexture {
	const canvas = document.createElement('canvas');
	canvas.width = 8;
	canvas.height = 8;
	const ctx = canvas.getContext('2d')!;
	const g = ctx.createRadialGradient(4, 4, 0, 4, 4, 6);
	g.addColorStop(0, '#9a9a9e');
	g.addColorStop(1, VOID_COLOR);
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, 8, 8);
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	return texture;
}

/** Вид из окна в солнечный день: голубое небо с облаками, дома напротив, зелень внизу. */
function createSunnyView(): THREE.CanvasTexture {
	const w = 96;
	const h = 72;
	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d')!;
	const sky = ctx.createLinearGradient(0, 0, 0, h);
	sky.addColorStop(0, '#3f9cff');
	sky.addColorStop(1, '#bfe6ff');
	ctx.fillStyle = sky;
	ctx.fillRect(0, 0, w, h);
	ctx.fillStyle = '#ffffff';
	for (const [x, y, cw] of [
		[10, 10, 22],
		[52, 6, 28],
		[70, 20, 16],
	])
		ctx.fillRect(x, y, cw, 5);
	const houses: [number, number, string][] = [
		[0, 30, '#e8b86a'],
		[20, 22, '#d97a5a'],
		[44, 34, '#9fb8d0'],
		[64, 26, '#e8d8b0'],
		[82, 36, '#c86a6a'],
	];
	for (const [x, top, color] of houses) {
		ctx.fillStyle = color;
		ctx.fillRect(x, top, 20, h - top);
		ctx.fillStyle = '#5a7a9a';
		for (let wy = top + 4; wy < h - 14; wy += 7) for (let wx = x + 3; wx < x + 18; wx += 6) ctx.fillRect(wx, wy, 3, 4);
	}
	ctx.fillStyle = '#4caf50';
	ctx.fillRect(0, h - 12, w, 12);
	ctx.fillStyle = '#2e8b3e';
	for (let x = 2; x < w; x += 11) ctx.fillRect(x, h - 18, 8, 8);
	const texture = new THREE.CanvasTexture(canvas);
	texture.magFilter = THREE.NearestFilter;
	texture.colorSpace = THREE.SRGBColorSpace;
	return texture;
}
